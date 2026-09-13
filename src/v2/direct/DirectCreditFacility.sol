// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICreditController} from "../interfaces/ICreditController.sol";
import {IMarketOracle} from "../interfaces/IMarketOracle.sol";
import {IBorrowerVaultFactory} from "../interfaces/IRestrictedVault.sol";
import {IDirectCreditFacility} from "./interfaces/IDirectCreditFacility.sol";
import {BorrowerVaultV2} from "../BorrowerVaultV2.sol";
import {InterestMath} from "../libraries/InterestMath.sol";
import {PriceMath} from "../libraries/PriceMath.sol";
import {ShareMath} from "../libraries/ShareMath.sol";

/// @title DirectCreditFacility
/// @notice Bilateral overcollateralized credit: one lender, one borrower, lender-owned cash, restricted vault.
/// @dev Not a pool. No supply shares, utilization APR, or write-off. After public recovery, posted
///      collateral settles remaining debt at the accepted oracle (100% of remaining debt, no bonus).
contract DirectCreditFacility is ReentrancyGuard, ICreditController, IDirectCreditFacility {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error SameParty();
    error WrongParty();
    error InvalidTerms();
    error NotPending();
    error AlreadyDecided();
    error RequestExpired();
    error NotBothAccepted();
    error NotActive();
    error NoLenderCash();
    error LimitExceeded();
    error BorrowingExpired();
    error LenderPaused();
    error ActiveRecall();
    error RecallInactive();
    error AlreadyRecalled();
    error OutstandingDebt();
    error OutstandingCash();
    error OutstandingExposure();
    error Ended();
    error ZeroAmount();
    error Slippage();
    error FeeOnTransfer();
    error CapNotProposed();
    error CapNotApproved();
    error CapBelowDebt();
    error Expired();
    error InsufficientCollateral();
    error OracleInvalid();
    error SettlementClosed();

    event TermsAccepted(address indexed party, bytes32 indexed termsHash);
    event RequestDeclined(address indexed party);
    event RequestCancelled(address indexed party);
    event Activated(uint64 activatedAt, uint64 borrowExpiry, uint64 repaymentDueAt);
    event Funded(address indexed lender, uint256 assets, uint256 cashAfter);
    event CashWithdrawn(address indexed lender, uint256 assets, uint256 cashAfter);
    event Borrowed(address indexed borrower, uint256 assets, uint256 shares, uint256 debtAfter);
    event Repaid(
        address indexed borrower,
        address indexed payer,
        uint256 assets,
        uint256 sharesBurned,
        uint256 principalPaid,
        uint256 interestPaid,
        uint256 roundingSurplus
    );
    event BorrowingPaused();
    event BorrowingResumed();
    event RecallRequested(bytes32 indexed reasonHash, uint64 deadline, uint8 reasonCode);
    event RecallCleared();
    event CapProposed(bytes32 indexed digest, address indexed proposer, uint256 nonce, uint64 validUntil);
    event CapApproved(bytes32 indexed digest, address indexed party);
    event CapCancelled(bytes32 indexed digest, address indexed party);
    event CapExecuted(uint256 newCap, uint256 nonce);
    event AgreementEnded();
    event Accrued(uint256 indexRay, uint64 timestamp);
    event CollateralAdded(address indexed from, uint256 amount, uint256 collateralAfter);
    event CollateralRemoved(address indexed to, uint256 amount, uint256 collateralAfter);
    event CollateralSettled(
        address indexed caller,
        uint256 collateralToLender,
        uint256 residualToBorrower,
        uint256 debtCredited,
        uint256 debtAfter
    );

    address public immutable lender;
    address public immutable borrower;
    IERC20 public immutable loanToken;
    uint256 public immutable aprRay;
    uint32 public immutable borrowPeriod;
    uint32 public immutable recallWindow;
    address public immutable vault;
    address public immutable venue;
    address public immutable swapRouter;
    address public immutable otherToken;
    IMarketOracle public immutable oracle;
    bytes32 public immutable termsHash;
    uint16 public constant MAX_LTV_BPS = 8000;
    /// @dev Accepted settlement: seize collateral whose oracle loan-value equals remaining debt. No bonus.
    uint16 public constant SETTLEMENT_VALUE_BPS = 10_000;
    uint256 internal constant _PRICE_SCALE = 1e36;

    uint256 public creditLimit;
    uint256 public accountedCash;
    uint256 public collateralPosted;
    uint256 public debtShares;
    uint256 public principalOutstanding;
    uint256 public epochIndexRay;
    uint64 public epochTimestamp;

    bool public lenderAccepted;
    bool public borrowerAccepted;
    bool public declined;
    bool public cancelled;
    bool public ended;
    bool public borrowingPaused;
    bool internal _recallStarted;

    uint64 public acceptanceDeadline;
    uint64 public activatedAt;
    uint64 public borrowExpiry;
    uint64 public repaymentDueAt;
    uint64 internal _recallDeadlineStored;
    bytes32 public recallReasonHash;

    uint256 public capNonce;
    bytes32 public pendingCapDigest;
    uint64 public pendingCapValidUntil;
    uint256 public pendingCapNonce;
    mapping(bytes32 => bool) public lenderCapApproved;
    mapping(bytes32 => bool) public borrowerCapApproved;

    bytes32 private constant _CAP_TYPEHASH = keccak256(
        "CapProposal(address facility,address lender,address borrower,uint256 newCap,uint256 nonce,uint256 validUntil,bytes32 salt)"
    );

    modifier onlyLender() {
        if (msg.sender != lender) revert WrongParty();
        _;
    }

    modifier onlyBorrower() {
        if (msg.sender != borrower) revert WrongParty();
        _;
    }

    modifier notEnded() {
        if (ended) revert Ended();
        _;
    }

    constructor(Terms memory t, address creator, address oracle_, address vaultFactory_) {
        if (t.lender == address(0) || t.borrower == address(0) || t.loanToken == address(0)) revert ZeroAddress();
        if (t.venue == address(0) || t.swapRouter == address(0) || t.otherToken == address(0)) revert ZeroAddress();
        if (oracle_ == address(0) || vaultFactory_ == address(0)) revert ZeroAddress();
        if (t.lender == t.borrower) revert SameParty();
        if (creator != t.lender && creator != t.borrower) revert WrongParty();
        if (t.aprRay > InterestMath.RAY) revert InvalidTerms();
        if (t.creditLimit == 0) revert InvalidTerms();

        lender = t.lender;
        borrower = t.borrower;
        loanToken = IERC20(t.loanToken);
        aprRay = t.aprRay;
        borrowPeriod = t.borrowPeriod;
        recallWindow = t.recallWindow;
        venue = t.venue;
        swapRouter = t.swapRouter;
        otherToken = t.otherToken;
        oracle = IMarketOracle(oracle_);
        creditLimit = t.creditLimit;
        acceptanceDeadline = uint64(block.timestamp + t.acceptanceLifetime);
        epochIndexRay = InterestMath.RAY;
        epochTimestamp = uint64(block.timestamp);
        termsHash = keccak256(
            abi.encode(
                t.lender,
                t.borrower,
                t.loanToken,
                t.creditLimit,
                t.aprRay,
                t.borrowPeriod,
                t.recallWindow,
                t.venue,
                t.swapRouter,
                t.otherToken,
                oracle_,
                uint16(MAX_LTV_BPS),
                uint16(SETTLEMENT_VALUE_BPS)
            )
        );

        if (creator == t.lender) lenderAccepted = true;
        else borrowerAccepted = true;

        vault = IBorrowerVaultFactory(vaultFactory_).deployDirectVault(t.borrower, address(this), t.loanToken);
        emit TermsAccepted(creator, termsHash);
    }

    function liveDebt(address owner) public view returns (uint256) {
        if (owner != borrower) return 0;
        return ShareMath.debtFromShares(debtShares, indexNow());
    }

    function collectRepayment(address owner, uint256 maxAssets) external {
        if (owner != borrower) revert WrongParty();
        _repay(maxAssets, false);
    }

    function recoveryObligation(address) public pure returns (uint256) {
        return 0;
    }

    function recoverySink() public pure returns (address) {
        return address(0);
    }

    function isDefaulted(address) public pure returns (bool) {
        return false;
    }

    function recallActive() public view returns (bool) {
        if (_recallStarted) return true;
        return _expiryWithDebt();
    }

    /// @notice Authoritative public-recovery timestamp. Vault, lens, and settlement all use this.
    /// @dev `min(maturity, recall)` when both exist. Public recovery and settlement open at `timestamp > due`.
    function recallDeadline() public view returns (uint64) {
        return _effectiveDue();
    }

    function publicRecoveryDeadline() public view returns (uint64) {
        return _effectiveDue();
    }

    function settlementPolicy() public view returns (address oracle_, uint16 maxLtvBps, uint16 settlementValueBps) {
        return (address(oracle), MAX_LTV_BPS, SETTLEMENT_VALUE_BPS);
    }

    function entryBlocked() public view returns (bool) {
        return _recallStarted || _expiryWithDebt();
    }

    function indexNow() public view returns (uint256) {
        return InterestMath.projectIndex(epochIndexRay, aprRay, epochTimestamp, block.timestamp);
    }

    function currentDebt() public view returns (uint256) {
        return ShareMath.debtFromShares(debtShares, indexNow());
    }

    function availableToBorrow() public view returns (uint256) {
        if (!_bothAccepted() || ended || borrowingPaused || _riskBlocksBorrow()) return 0;
        uint256 debt = currentDebt();
        if (debt >= creditLimit) return 0;
        uint256 headroom = creditLimit - debt;
        uint256 byCash = accountedCash < headroom ? accountedCash : headroom;
        uint256 ltvCap = _collateralBorrowCapacity();
        if (debt >= ltvCap) return 0;
        uint256 byLtv = ltvCap - debt;
        return byCash < byLtv ? byCash : byLtv;
    }

    function acceptTerms(bytes32 hash) external notEnded {
        if (declined || cancelled) revert AlreadyDecided();
        if (block.timestamp > acceptanceDeadline) revert RequestExpired();
        if (hash != termsHash) revert InvalidTerms();
        if (_bothAccepted()) revert NotPending();
        if (msg.sender == lender) {
            if (lenderAccepted) revert AlreadyDecided();
            lenderAccepted = true;
        } else if (msg.sender == borrower) {
            if (borrowerAccepted) revert AlreadyDecided();
            borrowerAccepted = true;
        } else {
            revert WrongParty();
        }
        emit TermsAccepted(msg.sender, hash);
        if (_bothAccepted()) _activate();
    }

    function decline() external notEnded {
        if (_bothAccepted()) revert NotPending();
        if (declined || cancelled) revert AlreadyDecided();
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        if (msg.sender == lender && lenderAccepted) revert WrongParty();
        if (msg.sender == borrower && borrowerAccepted) revert WrongParty();
        declined = true;
        emit RequestDeclined(msg.sender);
    }

    function cancelPending() external notEnded {
        if (_bothAccepted()) revert NotPending();
        if (declined || cancelled) revert AlreadyDecided();
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        cancelled = true;
        emit RequestCancelled(msg.sender);
    }

    function fund(uint256 assets) external onlyLender notEnded nonReentrant {
        if (!_bothAccepted()) revert NotBothAccepted();
        if (assets == 0) revert ZeroAmount();
        _accrue();
        _pull(loanToken, msg.sender, assets);
        accountedCash += assets;
        emit Funded(msg.sender, assets, accountedCash);
    }

    function withdrawCash(uint256 assets) external onlyLender notEnded nonReentrant {
        if (!_bothAccepted()) revert NotBothAccepted();
        if (assets == 0) revert ZeroAmount();
        _accrue();
        if (assets > accountedCash) revert NoLenderCash();
        accountedCash -= assets;
        _push(loanToken, lender, assets);
        emit CashWithdrawn(lender, assets, accountedCash);
    }

    function addCollateral(uint256 amount) external notEnded nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pull(IERC20(otherToken), msg.sender, amount);
        collateralPosted += amount;
        emit CollateralAdded(msg.sender, amount, collateralPosted);
    }

    function removeCollateral(uint256 amount) external onlyBorrower notEnded nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > collateralPosted) revert InsufficientCollateral();
        _accrue();
        collateralPosted -= amount;
        if (currentDebt() != 0) _requireDebtWithinLtv(currentDebt());
        _push(IERC20(otherToken), borrower, amount);
        emit CollateralRemoved(borrower, amount, collateralPosted);
    }

    function borrow(uint256 assets, uint256 maxDebtAfter, uint256 deadline) external onlyBorrower notEnded nonReentrant {
        if (deadline < block.timestamp) revert Expired();
        if (!_bothAccepted()) revert NotBothAccepted();
        if (activatedAt == 0) revert NotActive();
        if (block.timestamp >= borrowExpiry) revert BorrowingExpired();
        if (borrowingPaused) revert LenderPaused();
        if (_recallStarted || _expiryWithDebt()) revert ActiveRecall();
        if (assets == 0) revert ZeroAmount();
        _accrue();
        if (assets > accountedCash) revert NoLenderCash();
        uint256 index = epochIndexRay;
        uint256 newShares = ShareMath.borrowDebtShares(assets, index);
        uint256 newDebt = ShareMath.debtFromShares(debtShares + newShares, index);
        if (newDebt > maxDebtAfter) revert Slippage();
        if (newDebt > creditLimit) revert LimitExceeded();
        _requireDebtWithinLtv(newDebt);
        debtShares += newShares;
        principalOutstanding += assets;
        accountedCash -= assets;
        _push(loanToken, vault, assets);
        emit Borrowed(borrower, assets, newShares, newDebt);
    }

    function repayAssets(uint256 maxAssets) external notEnded nonReentrant {
        _repay(maxAssets, false);
    }

    function repayAll(uint256 maxAssets) external notEnded nonReentrant {
        _repay(maxAssets, true);
    }

    function repayFromVault(uint256 maxAssets) external notEnded {
        if (msg.sender != borrower && !_publicRecoveryOpen()) revert WrongParty();
        // Vault callbacks into collectRepayment; must not hold the facility reentrancy lock.
        BorrowerVaultV2(vault).repayFromIdle(maxAssets);
    }

    function pauseNewBorrowing() external onlyLender notEnded {
        if (!_bothAccepted()) revert NotBothAccepted();
        borrowingPaused = true;
        emit BorrowingPaused();
    }

    function resumeNewBorrowing() external onlyLender notEnded {
        if (_recallStarted) revert ActiveRecall();
        if (activatedAt != 0 && block.timestamp >= borrowExpiry) revert BorrowingExpired();
        borrowingPaused = false;
        emit BorrowingResumed();
    }

    function requestRepayment(uint8 reasonCode) external onlyLender notEnded {
        if (!_bothAccepted()) revert NotBothAccepted();
        if (_recallStarted) revert AlreadyRecalled();
        _accrue();
        _recallStarted = true;
        _recallDeadlineStored = uint64(block.timestamp + uint256(recallWindow));
        recallReasonHash = keccak256(abi.encodePacked(reasonCode));
        emit RecallRequested(recallReasonHash, _recallDeadlineStored, reasonCode);
    }

    function triggerRecallFromVenue(uint256) external notEnded {
        if (!_bothAccepted()) revert NotBothAccepted();
        if (_recallStarted) revert AlreadyRecalled();
        (bool ok, bytes memory data) = venue.staticcall(abi.encodeWithSignature("paused()"));
        bool isPaused = ok && data.length == 32 && abi.decode(data, (bool));
        if (!isPaused) revert NotPending();
        _recallStarted = true;
        _recallDeadlineStored = uint64(block.timestamp + uint256(recallWindow));
        recallReasonHash = keccak256("venue");
        emit RecallRequested(recallReasonHash, _recallDeadlineStored, 255);
    }

    function recoverVenue(uint256 assets, uint256 maxShares) external notEnded {
        if (msg.sender != borrower && !_publicRecoveryOpen()) revert WrongParty();
        BorrowerVaultV2(vault).publicExitAndRepay(assets, maxShares);
    }

    function recoverSwap(uint256 amountIn, uint256 minOut, uint256 deadline) external notEnded {
        if (msg.sender != borrower && !_publicRecoveryOpen()) revert WrongParty();
        BorrowerVaultV2(vault).publicUnwindSwap(amountIn, minOut, deadline);
    }

    function previewSettlement()
        public
        view
        returns (uint256 collateralToLender, uint256 residualToBorrower, uint256 debtCredit)
    {
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) return (0, collateralPosted, 0);
        return _quoteSettlement(currentDebt(), collateralPosted, q.quoteScale36);
    }

    /// @notice After public recovery opens, convert posted collateral at the accepted oracle to cover remaining debt.
    /// @dev Residual collateral returns to the borrower. Remaining debt stays if collateral is insufficient. No write-off.
    function settleDefault() external notEnded nonReentrant {
        if (!_publicRecoveryOpen()) revert SettlementClosed();
        _accrue();
        uint256 debt = currentDebt();
        if (debt == 0) revert ZeroAmount();
        uint256 posted = collateralPosted;
        if (posted == 0) revert InsufficientCollateral();
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) revert OracleInvalid();
        (uint256 seize, uint256 residual, uint256 credit) = _quoteSettlement(debt, posted, q.quoteScale36);
        if (seize == 0 || credit == 0) revert ZeroAmount();
        collateralPosted = 0;
        _push(IERC20(otherToken), lender, seize);
        if (residual != 0) {
            _push(IERC20(otherToken), borrower, residual);
            emit CollateralRemoved(borrower, residual, 0);
        }
        if (credit >= debt) {
            _applyDebtReduction(type(uint256).max, true);
        } else {
            _applyDebtReduction(credit, false);
        }
        emit CollateralSettled(msg.sender, seize, residual, credit, currentDebt());
    }

    function clearRecall() external onlyLender notEnded {
        if (!_recallStarted) revert RecallInactive();
        _accrue();
        if (currentDebt() != 0) revert OutstandingDebt();
        _recallStarted = false;
        _recallDeadlineStored = 0;
        recallReasonHash = bytes32(0);
        emit RecallCleared();
    }

    function hashCapProposal(uint256 newCap, uint256 nonce, uint256 validUntil, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(_CAP_TYPEHASH, address(this), lender, borrower, newCap, nonce, validUntil, salt));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function proposeCap(bytes32 digest, uint256 nonce, uint256 validUntil) external notEnded {
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        if (!_bothAccepted()) revert NotBothAccepted();
        if (validUntil < block.timestamp) revert Expired();
        if (nonce != capNonce) revert CapNotProposed();
        pendingCapDigest = digest;
        pendingCapValidUntil = uint64(validUntil);
        pendingCapNonce = nonce;
        lenderCapApproved[digest] = false;
        borrowerCapApproved[digest] = false;
        emit CapProposed(digest, msg.sender, nonce, uint64(validUntil));
    }

    function approveCap(bytes32 digest) external notEnded {
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        if (digest == bytes32(0) || digest != pendingCapDigest) revert CapNotProposed();
        if (block.timestamp > pendingCapValidUntil) revert Expired();
        if (msg.sender == lender) lenderCapApproved[digest] = true;
        else borrowerCapApproved[digest] = true;
        emit CapApproved(digest, msg.sender);
    }

    function cancelCap(bytes32 digest) external notEnded {
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        if (digest != pendingCapDigest) revert CapNotProposed();
        pendingCapDigest = bytes32(0);
        capNonce += 1;
        emit CapCancelled(digest, msg.sender);
    }

    function executeCap(uint256 newCap, uint256 nonce, uint256 validUntil, bytes32 salt) external notEnded {
        if (msg.sender != lender && msg.sender != borrower) revert WrongParty();
        if (validUntil < block.timestamp) revert Expired();
        bytes32 digest = hashCapProposal(newCap, nonce, validUntil, salt);
        if (digest != pendingCapDigest) revert CapNotProposed();
        if (!lenderCapApproved[digest] || !borrowerCapApproved[digest]) revert CapNotApproved();
        if (nonce != capNonce || nonce != pendingCapNonce) revert CapNotProposed();
        _accrue();
        if (newCap < currentDebt()) revert CapBelowDebt();
        if (newCap == 0) revert InvalidTerms();
        creditLimit = newCap;
        capNonce += 1;
        pendingCapDigest = bytes32(0);
        emit CapExecuted(newCap, nonce);
    }

    function releaseVaultSurplus(address token, uint256 amount) external onlyBorrower notEnded nonReentrant {
        BorrowerVaultV2(vault).releaseSurplus(token, amount);
    }

    function endAgreement() external onlyLender notEnded nonReentrant {
        _accrue();
        if (currentDebt() != 0) revert OutstandingDebt();
        if (accountedCash != 0) revert OutstandingCash();
        BorrowerVaultV2 v = BorrowerVaultV2(vault);
        if (v.idleLoan() != 0 || v.venueShares() != 0) revert OutstandingExposure();
        if (IERC20(otherToken).balanceOf(vault) != 0) revert OutstandingExposure();
        uint256 posted = collateralPosted;
        if (posted != 0) {
            collateralPosted = 0;
            _push(IERC20(otherToken), borrower, posted);
            emit CollateralRemoved(borrower, posted, 0);
        }
        ended = true;
        emit AgreementEnded();
    }

    function accrue() external {
        _accrue();
    }

    function _activate() internal {
        activatedAt = uint64(block.timestamp);
        borrowExpiry = uint64(uint256(activatedAt) + uint256(borrowPeriod));
        repaymentDueAt = borrowExpiry;
        emit Activated(activatedAt, borrowExpiry, repaymentDueAt);
    }

    function _bothAccepted() internal view returns (bool) {
        return lenderAccepted && borrowerAccepted && !declined && !cancelled;
    }

    function _expiryWithDebt() internal view returns (bool) {
        return activatedAt != 0 && block.timestamp >= borrowExpiry && currentDebt() > 0;
    }

    function _riskBlocksBorrow() internal view returns (bool) {
        return _recallStarted || (activatedAt != 0 && block.timestamp >= borrowExpiry);
    }

    function _collateralBorrowCapacity() internal view returns (uint256) {
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) return 0;
        return PriceMath.borrowCapacity(PriceMath.collateralValueLoan(collateralPosted, q.quoteScale36), MAX_LTV_BPS);
    }

    function _requireDebtWithinLtv(uint256 newDebt) internal view {
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) revert OracleInvalid();
        uint256 cap =
            PriceMath.borrowCapacity(PriceMath.collateralValueLoan(collateralPosted, q.quoteScale36), MAX_LTV_BPS);
        if (newDebt > cap) revert InsufficientCollateral();
    }

    function _publicRecoveryOpen() internal view returns (bool) {
        uint64 due = _effectiveDue();
        return due != 0 && block.timestamp > due;
    }

    function _effectiveDue() internal view returns (uint64) {
        if (_recallStarted && _recallDeadlineStored != 0) {
            if (repaymentDueAt == 0 || _recallDeadlineStored < repaymentDueAt) return _recallDeadlineStored;
        }
        if (activatedAt != 0 && currentDebt() > 0) return repaymentDueAt;
        return _recallDeadlineStored;
    }

    function _accrue() internal {
        uint256 next = indexNow();
        if (next != epochIndexRay) {
            epochIndexRay = next;
            epochTimestamp = uint64(block.timestamp);
            emit Accrued(epochIndexRay, epochTimestamp);
        } else {
            epochTimestamp = uint64(block.timestamp);
        }
    }

    function _quoteSettlement(uint256 debt, uint256 posted, uint256 scale36)
        internal
        pure
        returns (uint256 seize, uint256 residual, uint256 credit)
    {
        if (debt == 0 || posted == 0 || scale36 == 0) return (0, posted, 0);
        uint256 target = Math.mulDiv(debt, SETTLEMENT_VALUE_BPS, 10_000);
        uint256 postedValue = PriceMath.collateralValueLoan(posted, scale36);
        if (postedValue == 0) return (0, posted, 0);
        if (postedValue <= target) {
            return (posted, 0, postedValue);
        }
        seize = Math.mulDiv(target, _PRICE_SCALE, scale36, Math.Rounding.Ceil);
        if (seize > posted) seize = posted;
        credit = PriceMath.collateralValueLoan(seize, scale36);
        if (credit > debt) credit = debt;
        residual = posted - seize;
    }

    function _quoteRepay(uint256 maxAssets, bool all) internal view returns (uint256 sharesBurn, uint256 paid) {
        uint256 qOwner = debtShares;
        if (qOwner == 0) revert ZeroAmount();
        uint256 index = epochIndexRay;
        if (all) {
            sharesBurn = qOwner;
            paid = ShareMath.repayAssetsPaid(sharesBurn, index);
            if (paid > maxAssets) revert Slippage();
        } else {
            sharesBurn = ShareMath.repaySharesBurn(maxAssets, qOwner, index);
            if (sharesBurn == 0) revert ZeroAmount();
            paid = ShareMath.repayAssetsPaid(sharesBurn, index);
            while (sharesBurn > 0 && paid > maxAssets) {
                unchecked {
                    sharesBurn--;
                }
                paid = ShareMath.repayAssetsPaid(sharesBurn, index);
            }
            if (sharesBurn == 0) revert ZeroAmount();
        }
    }

    function _commitShareBurn(uint256 sharesBurn, uint256 paid)
        internal
        returns (uint256 principalPaid, uint256 interestPaid, uint256 rounding)
    {
        uint256 qOwner = debtShares;
        uint256 index = epochIndexRay;
        uint256 debtBefore = ShareMath.debtFromShares(qOwner, index);
        debtShares -= sharesBurn;
        uint256 debtAfter = ShareMath.debtFromShares(debtShares, index);
        uint256 reduction = debtBefore - debtAfter;
        uint256 principalBefore = principalOutstanding;
        uint256 interest = debtBefore > principalBefore ? debtBefore - principalBefore : 0;
        interestPaid = reduction > interest ? interest : reduction;
        principalPaid = reduction - interestPaid;
        if (principalPaid > principalBefore) principalPaid = principalBefore;
        principalOutstanding = principalBefore - principalPaid;
        rounding = paid > reduction ? paid - reduction : 0;
    }

    function _applyDebtReduction(uint256 maxAssets, bool all) internal {
        (uint256 sharesBurn, uint256 paid) = _quoteRepay(maxAssets, all);
        _commitShareBurn(sharesBurn, paid);
    }

    function _repay(uint256 maxAssets, bool all) internal {
        if (!_bothAccepted()) revert NotBothAccepted();
        if (maxAssets == 0) revert ZeroAmount();
        _accrue();
        (uint256 sharesBurn, uint256 paid) = _quoteRepay(maxAssets, all);
        _pull(loanToken, msg.sender, paid);
        accountedCash += paid;
        (uint256 principalPaid, uint256 interestPaid, uint256 rounding) = _commitShareBurn(sharesBurn, paid);
        emit Repaid(borrower, msg.sender, paid, sharesBurn, principalPaid, interestPaid, rounding);
    }

    function _pull(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert FeeOnTransfer();
    }

    function _push(IERC20 token, address to, uint256 amount) internal {
        uint256 before = token.balanceOf(to);
        token.safeTransfer(to, amount);
        if (token.balanceOf(to) - before != amount) revert FeeOnTransfer();
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("InterlineDirectFacility")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }
}
