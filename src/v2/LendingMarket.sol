// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {ICreditController} from "./interfaces/ICreditController.sol";
import {IMarketOracle} from "./interfaces/IMarketOracle.sol";
import {IBorrowerVaultFactory} from "./interfaces/IRestrictedVault.sol";
import {IMarketRecoveryEscrow} from "./interfaces/IMarketRecoveryEscrow.sol";
import {InterestMath} from "./libraries/InterestMath.sol";
import {ShareMath} from "./libraries/ShareMath.sol";
import {PriceMath} from "./libraries/PriceMath.sol";
import {LiquidationMath} from "./libraries/LiquidationMath.sol";
import {SupplyShareSnapshots} from "./libraries/SupplyShareSnapshots.sol";

/// @title LendingMarket
/// @notice Isolated one-loan / one-collateral pool. Internal shares, not ERC-20 / ERC-4626.
contract LendingMarket is ReentrancyGuard, ILendingMarket, ICreditController {
    using SafeERC20 for IERC20;
    using SupplyShareSnapshots for SupplyShareSnapshots.Store;

    uint256 internal constant BPS = 10_000;

    error ZeroAddress();
    error InvalidConfig();
    error SameAsset();
    error ZeroAmount();
    error Frozen();
    error TerminalMarket();
    error OracleInvalid();
    error SupplyCapExceeded();
    error BorrowCapExceeded();
    error PositionCapExceeded();
    error InsufficientCash();
    error InsufficientShares();
    error InsufficientCollateral();
    error Slippage();
    error MinAmount();
    error DustDebt();
    error LastShareWithDebt();
    error Healthy();
    error Defaulted();
    error NotCurator();
    error NotGuardian();
    error NotRestricted();
    error RecallInactive();
    error RecallPending();
    error AlreadyRecalled();
    error FeeOnTransfer();
    error NotPending();
    error CapNotProposed();
    error CapNotApproved();
    error CapBelowDebt();
    error Expired();
    error WalletMode();
    error NotEscrow();
    error ExcessRecovery();

    event Supplied(address indexed supplier, uint256 assets, uint256 shares, uint256 cashAfter, uint256 assetsAfter);
    event Withdrawn(address indexed supplier, uint256 assets, uint256 shares, uint256 cashAfter);
    event Redeemed(address indexed supplier, uint256 shares, uint256 assets, uint256 cashAfter);
    event CollateralAdded(address indexed owner, address indexed from, uint256 amount);
    event CollateralRemoved(address indexed owner, uint256 amount);
    event Borrowed(address indexed owner, uint256 assets, uint256 shares, address destination, uint256 debtAfter);
    event Repaid(
        address indexed owner,
        address indexed payer,
        uint256 assets,
        uint256 sharesBurned,
        uint256 principalPaid,
        uint256 interestPaid,
        uint256 roundingSurplus
    );
    event Liquidated(
        address indexed owner,
        address indexed liquidator,
        uint256 debtShares,
        uint256 loanAssetsIn,
        uint256 collateralOut,
        bool writtenOff
    );
    event WrittenOff(address indexed owner, uint256 snapshotId, uint256 debtWritten, uint256 principalArchived);
    event RecoveryApplied(address indexed owner, uint256 assets, uint256 remaining);
    event Accrued(uint256 indexRay, uint256 aprRay, uint64 timestamp, uint256 utilizationRay);
    event RateEpoch(uint256 indexRay, uint256 aprRay, uint64 timestamp);
    event SupplyFreezeSet(bool frozen);
    event BorrowFreezeSet(bool frozen);
    event RecallStarted(bytes32 indexed reasonHash, uint64 deadline, uint64 clearableAt, string reason);
    event RecallCleared();
    event CuratorTransferStarted(address indexed pending);
    event CuratorAccepted(address indexed curator, uint256 epoch);
    event GuardianTransferStarted(address indexed pending);
    event GuardianAccepted(address indexed guardian);
    event CapProposed(bytes32 indexed digest, address indexed owner);
    event CapApproved(bytes32 indexed digest);
    event CapCancelled(bytes32 indexed digest, address indexed owner);
    event PositionCapSet(address indexed owner, uint256 newCap);

    IERC20 public immutable loanToken;
    IERC20 public immutable collateralToken;
    uint8 public immutable loanDecimals;
    uint8 public immutable collateralDecimals;
    IMarketOracle public immutable oracle;
    uint16 public immutable maxLtvBps;
    uint16 public immutable liquidationThresholdBps;
    uint16 public immutable liquidationBonusBps;
    uint256 public immutable supplyCap;
    uint256 public immutable borrowCap;
    DeliveryMode public immutable deliveryMode;
    uint256 public immutable defaultPositionCap;
    uint32 public immutable recallWindow;
    uint32 public immutable recoveryDelay;
    uint256 public immutable minBorrow;
    uint256 public immutable minSupply;

    address public curator;
    address public pendingCurator;
    uint256 public curatorEpoch;
    address public guardian;
    address public pendingGuardian;
    IBorrowerVaultFactory public vaultFactory;
    IMarketRecoveryEscrow public recoveryEscrow;

    uint256 public accountedCash;
    uint256 public totalDebtShares;
    uint256 public epochIndexRay;
    uint64 public epochTimestamp;
    uint256 public epochAprRay;
    uint256 public totalSupplyShares;

    mapping(address => uint256) public supplySharesOf;
    mapping(address => uint256) public debtSharesOf;
    mapping(address => uint256) public collateralOf;
    mapping(address => uint256) public principalOutstanding;
    mapping(address => uint256) public customPositionCap;
    mapping(address => bool) public defaulted;
    mapping(address => uint256) public writtenOffLiability;
    mapping(address => uint256) public recoveredLiability;
    mapping(address => uint256) public writtenOffPrincipal;

    bool public supplyFrozen;
    bool public borrowFrozen;
    bool public marketTerminal;
    bool public recallActive;
    uint64 public recallDeadline;
    uint64 public recallClearableAt;
    bytes32 public recallReasonHash;

    mapping(address => uint256) public capNonce;
    mapping(address => bytes32) public pendingCapDigest;
    mapping(address => uint256) public pendingCapExpiry;
    mapping(address => uint256) public pendingCapNonce;
    mapping(bytes32 => bool) public borrowerCapApproved;
    mapping(bytes32 => bool) public curatorCapApproved;

    SupplyShareSnapshots.Store internal _snapshots;

    bytes32 private constant _CAP_TYPEHASH = keccak256(
        "CapProposal(address market,address owner,address curator,uint256 curatorEpoch,uint256 newCap,uint256 nonce,uint256 expiry,bytes32 salt)"
    );

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    constructor(Init memory p) {
        if (p.loanToken == address(0) || p.collateralToken == address(0) || p.oracle == address(0)) revert ZeroAddress();
        if (p.curator == address(0) || p.guardian == address(0)) revert ZeroAddress();
        if (p.loanToken == p.collateralToken) revert SameAsset();
        if (p.maxLtvBps == 0 || p.maxLtvBps >= p.liquidationThresholdBps || p.liquidationThresholdBps > BPS) {
            revert InvalidConfig();
        }
        if (p.liquidationBonusBps == 0 || p.liquidationBonusBps > 2_000) revert InvalidConfig();
        if (p.supplyCap == 0 || p.borrowCap == 0 || p.borrowCap > p.supplyCap) revert InvalidConfig();
        if (p.defaultPositionCap == 0 || p.recallWindow == 0 || p.minBorrow == 0 || p.minSupply == 0) {
            revert InvalidConfig();
        }
        loanDecimals = IERC20Metadata(p.loanToken).decimals();
        collateralDecimals = IERC20Metadata(p.collateralToken).decimals();
        if (loanDecimals < 6 || loanDecimals > 18 || collateralDecimals < 6 || collateralDecimals > 18) {
            revert InvalidConfig();
        }
        if (p.deliveryMode == DeliveryMode.Restricted && p.vaultFactory == address(0)) revert InvalidConfig();

        loanToken = IERC20(p.loanToken);
        collateralToken = IERC20(p.collateralToken);
        oracle = IMarketOracle(p.oracle);
        maxLtvBps = p.maxLtvBps;
        liquidationThresholdBps = p.liquidationThresholdBps;
        liquidationBonusBps = p.liquidationBonusBps;
        supplyCap = p.supplyCap;
        borrowCap = p.borrowCap;
        deliveryMode = p.deliveryMode;
        defaultPositionCap = p.defaultPositionCap;
        recallWindow = p.recallWindow;
        recoveryDelay = p.recoveryDelay;
        minBorrow = p.minBorrow;
        minSupply = p.minSupply;
        curator = p.curator;
        guardian = p.guardian;
        vaultFactory = IBorrowerVaultFactory(p.vaultFactory);
        recoveryEscrow = IMarketRecoveryEscrow(p.recoveryEscrow);

        epochIndexRay = InterestMath.RAY;
        epochTimestamp = uint64(block.timestamp);
        epochAprRay = InterestMath.BASE_APR_RAY;
    }

    function snapshotId() external view returns (uint256) {
        return _snapshots.currentId();
    }

    function unaccountedSurplus() public view returns (uint256) {
        uint256 bal = loanToken.balanceOf(address(this));
        return bal > accountedCash ? bal - accountedCash : 0;
    }

    function indexNow() public view returns (uint256) {
        return InterestMath.projectIndex(epochIndexRay, epochAprRay, epochTimestamp, block.timestamp);
    }

    function aggregateDebt() public view returns (uint256) {
        return ShareMath.debtFromShares(totalDebtShares, indexNow());
    }

    function supplierAssets() public view returns (uint256) {
        return accountedCash + aggregateDebt();
    }

    function currentUtilizationRay() public view returns (uint256) {
        return InterestMath.utilizationRay(accountedCash, aggregateDebt());
    }

    function currentBorrowAprRay() public view returns (uint256) {
        return epochAprRay;
    }

    function projectedBorrowAprRay() public view returns (uint256) {
        return InterestMath.borrowAprRay(currentUtilizationRay());
    }

    function positionDebt(address owner) public view returns (uint256) {
        return ShareMath.debtFromShares(debtSharesOf[owner], indexNow());
    }

    function liveDebt(address owner) public view returns (uint256) {
        return positionDebt(owner);
    }

    function collectRepayment(address owner, uint256 maxAssets) external nonReentrant {
        _repay(owner, maxAssets, false);
    }

    function recoveryObligation(address owner) public view returns (uint256) {
        uint256 written = writtenOffLiability[owner];
        uint256 recovered = recoveredLiability[owner];
        return written > recovered ? written - recovered : 0;
    }

    /// @notice Escrow-only settlement of recovered loan tokens against remaining write-off liability.
    function applyRecovery(address owner, uint256 assets) external nonReentrant {
        if (msg.sender != address(recoveryEscrow)) revert NotEscrow();
        if (owner == address(0)) revert ZeroAddress();
        if (assets == 0) revert ZeroAmount();
        uint256 remaining = recoveryObligation(owner);
        if (assets > remaining) revert ExcessRecovery();
        recoveredLiability[owner] += assets;
        emit RecoveryApplied(owner, assets, remaining - assets);
    }

    function recoverySink() public view returns (address) {
        return address(recoveryEscrow);
    }

    function isDefaulted(address owner) public view returns (bool) {
        return defaulted[owner];
    }

    function entryBlocked() public view returns (bool) {
        return recallActive;
    }

    function positionCapOf(address owner) public view returns (uint256) {
        uint256 custom = customPositionCap[owner];
        if (custom != 0) return custom;
        return defaultPositionCap;
    }

    function accrue() external {
        uint256 index = indexNow();
        uint256 util = InterestMath.utilizationRay(accountedCash, ShareMath.debtFromShares(totalDebtShares, index));
        emit Accrued(index, epochAprRay, uint64(block.timestamp), util);
    }

    function supply(uint256 assets, uint256 minSharesOut) external nonReentrant {
        if (assets < minSupply) revert MinAmount();
        _requireLive();
        if (supplyFrozen || recallActive) revert Frozen();
        _requireOracle();
        uint256 index = indexNow();
        uint256 aBefore = accountedCash + ShareMath.debtFromShares(totalDebtShares, index);
        if (aBefore + assets > supplyCap) revert SupplyCapExceeded();
        _writeShareSnapshots(msg.sender);
        uint256 shares = ShareMath.mintSupplyShares(assets, totalSupplyShares, aBefore);
        if (shares < minSharesOut) revert Slippage();
        _pull(loanToken, msg.sender, assets);
        accountedCash += assets;
        supplySharesOf[msg.sender] += shares;
        totalSupplyShares += shares;
        _afterCashDebt(index);
        emit Supplied(msg.sender, assets, shares, accountedCash, accountedCash + ShareMath.debtFromShares(totalDebtShares, index));
    }

    function withdraw(uint256 assets, uint256 maxSharesBurn) external nonReentrant {
        if (assets == 0) revert ZeroAmount();
        uint256 index = indexNow();
        uint256 debt = ShareMath.debtFromShares(totalDebtShares, index);
        uint256 aBefore = accountedCash + debt;
        if (assets > accountedCash) revert InsufficientCash();
        uint256 burn = ShareMath.withdrawSharesBurn(assets, totalSupplyShares, aBefore);
        if (burn > supplySharesOf[msg.sender]) revert InsufficientShares();
        if (burn > maxSharesBurn) revert Slippage();
        if (burn == totalSupplyShares && debt > 0) revert LastShareWithDebt();
        _writeShareSnapshots(msg.sender);
        supplySharesOf[msg.sender] -= burn;
        totalSupplyShares -= burn;
        accountedCash -= assets;
        _push(loanToken, msg.sender, assets);
        _afterCashDebt(index);
        emit Withdrawn(msg.sender, assets, burn, accountedCash);
    }

    function redeem(uint256 shares, uint256 minAssetsOut) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (shares > supplySharesOf[msg.sender]) revert InsufficientShares();
        uint256 index = indexNow();
        uint256 debt = ShareMath.debtFromShares(totalDebtShares, index);
        uint256 aBefore = accountedCash + debt;
        if (aBefore == 0) {
            _redeemZeroAssets(shares, minAssetsOut);
            return;
        }
        uint256 assets = ShareMath.redeemAssetsOut(shares, totalSupplyShares, aBefore);
        if (assets < minAssetsOut) revert Slippage();
        if (assets > accountedCash) revert InsufficientCash();
        if (shares == totalSupplyShares && debt > 0) revert LastShareWithDebt();
        _writeShareSnapshots(msg.sender);
        supplySharesOf[msg.sender] -= shares;
        totalSupplyShares -= shares;
        accountedCash -= assets;
        _push(loanToken, msg.sender, assets);
        _afterCashDebt(index);
        emit Redeemed(msg.sender, shares, assets, accountedCash);
    }

    function addCollateral(address owner, uint256 amount) external nonReentrant {
        if (owner == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _pull(collateralToken, msg.sender, amount);
        collateralOf[owner] += amount;
        emit CollateralAdded(owner, msg.sender, amount);
    }

    function removeCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > collateralOf[msg.sender]) revert InsufficientCollateral();
        if (defaulted[msg.sender]) revert Defaulted();
        uint256 index = indexNow();
        uint256 debt = ShareMath.debtFromShares(debtSharesOf[msg.sender], index);
        if (debt > 0) {
            IMarketOracle.Quote memory q = _oracleQuote();
            uint256 left = collateralOf[msg.sender] - amount;
            uint256 value = PriceMath.collateralValueLoan(left, q.quoteScale36);
            uint256 cap_ = PriceMath.borrowCapacity(value, maxLtvBps);
            if (debt > cap_) revert InsufficientCollateral();
        }
        collateralOf[msg.sender] -= amount;
        _push(collateralToken, msg.sender, amount);
        emit CollateralRemoved(msg.sender, amount);
    }

    function borrow(uint256 assets, uint256 maxDebtShares) external nonReentrant {
        if (assets < minBorrow) revert MinAmount();
        _requireLive();
        if (borrowFrozen || recallActive) revert Frozen();
        if (defaulted[msg.sender]) revert Defaulted();
        IMarketOracle.Quote memory q = _oracleQuote();
        uint256 index = indexNow();
        if (assets > accountedCash) revert InsufficientCash();
        uint256 newShares = ShareMath.borrowDebtShares(assets, index);
        if (newShares > maxDebtShares) revert Slippage();
        uint256 newOwnerDebt = ShareMath.debtFromShares(debtSharesOf[msg.sender] + newShares, index);
        uint256 newAgg = ShareMath.debtFromShares(totalDebtShares + newShares, index);
        if (newAgg > borrowCap) revert BorrowCapExceeded();
        if (newOwnerDebt > positionCapOf(msg.sender)) revert PositionCapExceeded();
        uint256 value = PriceMath.collateralValueLoan(collateralOf[msg.sender], q.quoteScale36);
        if (newOwnerDebt > PriceMath.borrowCapacity(value, maxLtvBps)) revert InsufficientCollateral();
        debtSharesOf[msg.sender] += newShares;
        totalDebtShares += newShares;
        principalOutstanding[msg.sender] += assets;
        accountedCash -= assets;
        address dest = _borrowDestination(msg.sender);
        _push(loanToken, dest, assets);
        _afterCashDebt(index);
        emit Borrowed(msg.sender, assets, newShares, dest, newOwnerDebt);
    }

    function repay(address owner, uint256 maxAssets) external nonReentrant {
        _repay(owner, maxAssets, false);
    }

    function repayAll(address owner, uint256 maxAssets) external nonReentrant {
        _repay(owner, maxAssets, true);
    }

    function liquidate(
        address owner,
        uint256 exactDebtShares,
        uint256 exactCollateral,
        uint256 maxLoanAssetsIn,
        uint256 minCollateralOut
    ) external nonReentrant {
        uint256 index = indexNow();
        _requireLiquidatable(owner, index);
        LiquidationMath.Quote memory lq = _liqQuote(owner, exactDebtShares, exactCollateral, index);
        if (lq.loanAssetsIn > maxLoanAssetsIn || lq.collateralOut < minCollateralOut) revert Slippage();
        _executeLiquidation(owner, lq, index);
    }

    function setSupplyFrozen(bool frozen) external onlyGuardian {
        supplyFrozen = frozen;
        emit SupplyFreezeSet(frozen);
    }

    function setBorrowFrozen(bool frozen) external onlyGuardian {
        borrowFrozen = frozen;
        emit BorrowFreezeSet(frozen);
    }

    function startRecall(string calldata reason) external onlyGuardian {
        if (deliveryMode != DeliveryMode.Restricted) revert NotRestricted();
        if (recallActive) revert AlreadyRecalled();
        recallActive = true;
        recallDeadline = uint64(block.timestamp + recallWindow);
        recallClearableAt = uint64(uint256(recallDeadline) + uint256(recoveryDelay));
        recallReasonHash = keccak256(bytes(reason));
        emit RecallStarted(recallReasonHash, recallDeadline, recallClearableAt, reason);
    }

    function clearRecall() external onlyGuardian {
        if (!recallActive) revert RecallInactive();
        if (block.timestamp < recallClearableAt) revert RecallPending();
        recallActive = false;
        recallDeadline = 0;
        recallClearableAt = 0;
        recallReasonHash = bytes32(0);
        emit RecallCleared();
    }

    function transferCurator(address next) external onlyCurator {
        if (next == address(0)) revert ZeroAddress();
        pendingCurator = next;
        emit CuratorTransferStarted(next);
    }

    function acceptCurator() external {
        if (msg.sender != pendingCurator) revert NotPending();
        curator = msg.sender;
        pendingCurator = address(0);
        unchecked {
            curatorEpoch++;
        }
        emit CuratorAccepted(curator, curatorEpoch);
    }

    function transferGuardian(address next) external onlyGuardian {
        if (next == address(0)) revert ZeroAddress();
        pendingGuardian = next;
        emit GuardianTransferStarted(next);
    }

    function acceptGuardian() external {
        if (msg.sender != pendingGuardian) revert NotPending();
        guardian = msg.sender;
        pendingGuardian = address(0);
        emit GuardianAccepted(guardian);
    }

    function hashCapProposal(address owner, uint256 newCap, uint256 nonce, uint256 expiry, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(_CAP_TYPEHASH, address(this), owner, curator, curatorEpoch, newCap, nonce, expiry, salt)
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @notice Commit-reveal: stores digest + public metadata only. Does not take or emit newCap/salt.
    ///         One pending proposal per owner; a later propose at the current nonce replaces it.
    function proposeCap(address owner, bytes32 digest, uint256 nonce, uint256 expiry) external {
        _requireRestrictedCapParty(owner);
        if (digest == bytes32(0)) revert InvalidConfig();
        if (expiry <= block.timestamp) revert Expired();
        if (nonce != capNonce[owner]) revert InvalidConfig();
        _clearPendingCap(owner);
        pendingCapDigest[owner] = digest;
        pendingCapExpiry[owner] = expiry;
        pendingCapNonce[owner] = nonce;
        emit CapProposed(digest, owner);
    }

    function approveCap(address owner, bytes32 digest) external {
        _requireRestrictedCapParty(owner);
        if (digest == bytes32(0) || digest != pendingCapDigest[owner]) revert CapNotProposed();
        if (pendingCapNonce[owner] != capNonce[owner]) revert CapNotProposed();
        if (pendingCapExpiry[owner] <= block.timestamp) revert Expired();
        if (msg.sender == owner) borrowerCapApproved[digest] = true;
        if (msg.sender == curator) curatorCapApproved[digest] = true;
        emit CapApproved(digest);
    }

    /// @notice Either party invalidates the current nonce and clears the pending commitment.
    function cancelCap(address owner, bytes32 digest) external {
        _requireRestrictedCapParty(owner);
        if (digest == bytes32(0) || digest != pendingCapDigest[owner]) revert CapNotProposed();
        _clearPendingCap(owner);
        unchecked {
            capNonce[owner]++;
        }
        emit CapCancelled(digest, owner);
    }

    /// @notice Reveal terms. Requires current nonce, matching commitment, and both parties.
    ///         Unilateral borrowing freezes use `setBorrowFrozen`, not a negotiated cap.
    function executeCap(address owner, uint256 newCap, uint256 nonce, uint256 expiry, bytes32 salt) external {
        _requireRestrictedCapParty(owner);
        if (expiry <= block.timestamp) revert Expired();
        if (nonce != capNonce[owner] || nonce != pendingCapNonce[owner]) revert CapNotProposed();
        bytes32 digest = hashCapProposal(owner, newCap, nonce, expiry, salt);
        if (digest == bytes32(0) || digest != pendingCapDigest[owner]) revert CapNotProposed();
        if (!borrowerCapApproved[digest] || !curatorCapApproved[digest]) revert CapNotApproved();
        if (newCap == 0 || newCap > borrowCap) revert InvalidConfig();
        if (newCap < positionDebt(owner)) revert CapBelowDebt();
        _clearPendingCap(owner);
        unchecked {
            capNonce[owner]++;
        }
        customPositionCap[owner] = newCap;
        emit PositionCapSet(owner, newCap);
    }

    function maxWithdraw(address owner) public view returns (uint256) {
        uint256 index = indexNow();
        uint256 debt = ShareMath.debtFromShares(totalDebtShares, index);
        return ShareMath.maxWithdrawAssets(
            supplySharesOf[owner], totalSupplyShares, accountedCash + debt, accountedCash, debt
        );
    }

    function maxRedeem(address owner) public view returns (uint256) {
        uint256 index = indexNow();
        uint256 debt = ShareMath.debtFromShares(totalDebtShares, index);
        uint256 assets = accountedCash + debt;
        if (assets == 0) return supplySharesOf[owner];
        return ShareMath.maxRedeemShares(
            supplySharesOf[owner], totalSupplyShares, assets, accountedCash, debt
        );
    }

    function maxBorrow(address owner) public view returns (uint256) {
        if (marketTerminal || borrowFrozen || recallActive || defaulted[owner]) return 0;
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) return 0;
        return _maxBorrowSearch(owner, q.quoteScale36);
    }

    function healthOf(address owner)
        public
        view
        returns (
            PriceMath.HealthCode code,
            uint256 hfWad,
            uint256 debt,
            uint256 liqCapacity,
            uint256 borrowCapacity_,
            bool liquidatable
        )
    {
        debt = positionDebt(owner);
        if (debt == 0) return (PriceMath.HealthCode.NO_DEBT, 0, 0, 0, 0, false);
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) {
            return (PriceMath.HealthCode.UNAVAILABLE, 0, debt, 0, 0, false);
        }
        uint256 value = PriceMath.collateralValueLoan(collateralOf[owner], q.quoteScale36);
        liqCapacity = PriceMath.liquidationCapacity(value, liquidationThresholdBps);
        borrowCapacity_ = PriceMath.borrowCapacity(value, maxLtvBps);
        liquidatable = PriceMath.isLiquidatable(debt, liqCapacity);
        hfWad = PriceMath.healthFactorWad(liqCapacity, debt);
        return (PriceMath.HealthCode.OK, hfWad, debt, liqCapacity, borrowCapacity_, liquidatable);
    }

    function previewLiquidation(address owner, uint256 exactDebtShares, uint256 exactCollateral)
        external
        view
        returns (LiquidationMath.Quote memory)
    {
        IMarketOracle.Quote memory oq = oracle.quote();
        return LiquidationMath.quoteLiquidation(
            exactDebtShares,
            exactCollateral,
            debtSharesOf[owner],
            collateralOf[owner],
            indexNow(),
            oq.quoteScale36,
            liquidationBonusBps
        );
    }

    function sharesAtSnapshot(address account, uint256 id) external view returns (uint256) {
        return _snapshots.sharesAt(account, id, supplySharesOf[account]);
    }

    function totalSharesAtSnapshot(uint256 id) external view returns (uint256) {
        return _snapshots.totalAt(id, totalSupplyShares);
    }

    function _requireLiquidatable(address owner, uint256 index) internal view {
        IMarketOracle.Quote memory oq = _oracleQuote();
        uint256 debt = ShareMath.debtFromShares(debtSharesOf[owner], index);
        uint256 value = PriceMath.collateralValueLoan(collateralOf[owner], oq.quoteScale36);
        uint256 liqCap = PriceMath.liquidationCapacity(value, liquidationThresholdBps);
        if (!PriceMath.isLiquidatable(debt, liqCap)) revert Healthy();
    }

    function _liqQuote(address owner, uint256 exactDebtShares, uint256 exactCollateral, uint256 index)
        internal
        view
        returns (LiquidationMath.Quote memory)
    {
        IMarketOracle.Quote memory oq = _oracleQuote();
        return LiquidationMath.quoteLiquidation(
            exactDebtShares,
            exactCollateral,
            debtSharesOf[owner],
            collateralOf[owner],
            index,
            oq.quoteScale36,
            liquidationBonusBps
        );
    }

    function _executeLiquidation(address owner, LiquidationMath.Quote memory lq, uint256 index) internal {
        _pull(loanToken, msg.sender, lq.loanAssetsIn);
        accountedCash += lq.loanAssetsIn;
        _applyDebtReduction(owner, lq.debtSharesBurned, lq.loanAssetsIn, index, true);
        collateralOf[owner] -= lq.collateralOut;
        _push(collateralToken, msg.sender, lq.collateralOut);
        bool wrote = lq.writesOff || (collateralOf[owner] == 0 && debtSharesOf[owner] > 0);
        if (wrote) _writeOff(owner, index);
        _afterCashDebt(index);
        emit Liquidated(owner, msg.sender, lq.debtSharesBurned, lq.loanAssetsIn, lq.collateralOut, wrote);
    }

    function _repay(address owner, uint256 maxAssets, bool all) internal {
        if (owner == address(0)) revert ZeroAddress();
        if (maxAssets == 0) revert ZeroAmount();
        uint256 index = indexNow();
        uint256 qOwner = debtSharesOf[owner];
        if (qOwner == 0) revert ZeroAmount();
        uint256 sharesBurn;
        uint256 paid;
        if (all) {
            sharesBurn = qOwner;
            paid = qOwner == totalDebtShares
                ? ShareMath.debtFromShares(totalDebtShares, index)
                : ShareMath.repayAssetsPaid(sharesBurn, index);
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
        uint256 leftoverShares = qOwner - sharesBurn;
        uint256 leftoverDebt = ShareMath.debtFromShares(leftoverShares, index);
        if (!all && leftoverDebt > 0 && leftoverDebt < minBorrow) {
            if (!recallActive && !defaulted[owner]) revert DustDebt();
        }
        _pull(loanToken, msg.sender, paid);
        accountedCash += paid;
        (uint256 principalPaid, uint256 interestPaid, uint256 rounding) =
            _applyDebtReduction(owner, sharesBurn, paid, index, false);
        _afterCashDebt(index);
        emit Repaid(owner, msg.sender, paid, sharesBurn, principalPaid, interestPaid, rounding);
    }

    function _applyDebtReduction(address owner, uint256 sharesBurn, uint256 paid, uint256 index, bool skipDust)
        internal
        returns (uint256 principalPaid, uint256 interestPaid, uint256 rounding)
    {
        skipDust;
        uint256 debtBefore = ShareMath.debtFromShares(debtSharesOf[owner], index);
        debtSharesOf[owner] -= sharesBurn;
        totalDebtShares -= sharesBurn;
        uint256 debtAfter = ShareMath.debtFromShares(debtSharesOf[owner], index);
        uint256 reduction = debtBefore - debtAfter;
        uint256 principalBefore = principalOutstanding[owner];
        uint256 interest = debtBefore > principalBefore ? debtBefore - principalBefore : 0;
        interestPaid = reduction > interest ? interest : reduction;
        principalPaid = reduction - interestPaid;
        if (principalPaid > principalBefore) principalPaid = principalBefore;
        principalOutstanding[owner] = principalBefore - principalPaid;
        rounding = paid > reduction ? paid - reduction : 0;
    }

    function _writeOff(address owner, uint256 index) internal {
        uint256 shares = debtSharesOf[owner];
        if (shares == 0) return;
        uint256 debt = ShareMath.debtFromShares(shares, index);
        uint256 snapId = _snapshots.snapshot();
        _snapshots.writeTotal(totalSupplyShares);
        uint256 principal = principalOutstanding[owner];
        writtenOffLiability[owner] += debt;
        writtenOffPrincipal[owner] += principal;
        defaulted[owner] = true;
        totalDebtShares -= shares;
        debtSharesOf[owner] = 0;
        principalOutstanding[owner] = 0;
        if (address(recoveryEscrow) != address(0)) {
            recoveryEscrow.notifyWriteOff(address(this), owner, snapId, totalSupplyShares, debt);
        }
        uint256 aAfter = accountedCash + ShareMath.debtFromShares(totalDebtShares, index);
        if (aAfter == 0) marketTerminal = true;
        emit WrittenOff(owner, snapId, debt, principal);
    }

    function _writeShareSnapshots(address account) internal {
        _snapshots.writeAccount(account, supplySharesOf[account]);
        _snapshots.writeTotal(totalSupplyShares);
    }

    function _afterCashDebt(uint256 indexNow_) internal {
        uint256 B = ShareMath.debtFromShares(totalDebtShares, indexNow_);
        uint256 util = InterestMath.utilizationRay(accountedCash, B);
        uint256 newApr = InterestMath.borrowAprRay(util);
        if (newApr != epochAprRay) {
            epochIndexRay = indexNow_;
            epochTimestamp = uint64(block.timestamp);
            epochAprRay = newApr;
            emit RateEpoch(indexNow_, newApr, epochTimestamp);
        }
    }

    function _redeemZeroAssets(uint256 shares, uint256 minAssetsOut) internal {
        if (minAssetsOut > 0) revert Slippage();
        _writeShareSnapshots(msg.sender);
        supplySharesOf[msg.sender] -= shares;
        totalSupplyShares -= shares;
        emit Redeemed(msg.sender, shares, 0, accountedCash);
    }

    function _maxBorrowSearch(address owner, uint256 scale36) internal view returns (uint256 best) {
        uint256 index = indexNow();
        uint256 B = ShareMath.debtFromShares(totalDebtShares, index);
        uint256 D = ShareMath.debtFromShares(debtSharesOf[owner], index);
        uint256 ltv = PriceMath.borrowCapacity(
            PriceMath.collateralValueLoan(collateralOf[owner], scale36), maxLtvBps
        );
        uint256 posCap = positionCapOf(owner);
        uint256 hi = accountedCash;
        hi = _minHeadroom(hi, borrowCap, B);
        hi = _minHeadroom(hi, posCap, D);
        hi = _minHeadroom(hi, ltv, D);
        if (hi < minBorrow) return 0;
        uint256 lo = minBorrow;
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            if (_borrowOk(owner, mid, index, ltv, posCap)) {
                best = mid;
                if (mid == hi) break;
                lo = mid + 1;
            } else {
                if (mid <= minBorrow) break;
                hi = mid - 1;
            }
        }
    }

    function _minHeadroom(uint256 hi, uint256 cap_, uint256 used) internal pure returns (uint256) {
        if (cap_ <= used) return 0;
        uint256 h = cap_ - used;
        return h < hi ? h : hi;
    }

    function _borrowOk(address owner, uint256 assets, uint256 index, uint256 ltv, uint256 posCap)
        internal
        view
        returns (bool)
    {
        if (assets > accountedCash) return false;
        uint256 newShares = ShareMath.borrowDebtShares(assets, index);
        uint256 newOwnerDebt = ShareMath.debtFromShares(debtSharesOf[owner] + newShares, index);
        uint256 newAgg = ShareMath.debtFromShares(totalDebtShares + newShares, index);
        if (newAgg > borrowCap) return false;
        if (newOwnerDebt > posCap || newOwnerDebt > ltv) return false;
        return true;
    }

    function _borrowDestination(address owner) internal returns (address) {
        if (deliveryMode == DeliveryMode.Wallet) return owner;
        address existing = vaultFactory.vaultOf(address(this), owner);
        if (existing != address(0)) return existing;
        return vaultFactory.createVault(address(this), owner);
    }

    function _requireLive() internal view {
        if (marketTerminal) revert TerminalMarket();
    }

    function _requireOracle() internal view {
        IMarketOracle.Quote memory q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) revert OracleInvalid();
    }

    function _oracleQuote() internal view returns (IMarketOracle.Quote memory q) {
        q = oracle.quote();
        if (q.status != IMarketOracle.Status.OK || q.quoteScale36 == 0) revert OracleInvalid();
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

    function _requireRestrictedCapParty(address owner) internal view {
        if (deliveryMode != DeliveryMode.Restricted) revert WalletMode();
        if (owner == address(0)) revert ZeroAddress();
        if (msg.sender != owner && msg.sender != curator) revert NotCurator();
    }

    function _clearPendingCap(address owner) internal {
        bytes32 digest = pendingCapDigest[owner];
        if (digest != bytes32(0)) {
            borrowerCapApproved[digest] = false;
            curatorCapApproved[digest] = false;
        }
        pendingCapDigest[owner] = bytes32(0);
        pendingCapExpiry[owner] = 0;
        pendingCapNonce[owner] = 0;
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("InterlineLendingMarket")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }
}
