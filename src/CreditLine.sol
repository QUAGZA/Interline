// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BorrowerVault} from "./BorrowerVault.sol";
import {ICreditLine} from "./interfaces/ICreditLine.sol";

/// @title CreditLine
/// @notice Bilateral facility: public cap/drawn, hashed cap proposals, panic + recall clock.
/// @dev No proxies. Drawn USDC is transferred only to BorrowerVault.
contract CreditLine is ReentrancyGuard, ICreditLine {
    using SafeERC20 for IERC20;

    error NotLender();
    error NotBorrower();
    error NotParty();
    error NotVault();
    error Paused();
    error InRecall();
    error CapExceeded();
    error InsufficientPot();
    error ZeroAmount();
    error HashMismatch();
    error NotApproved();
    error CapBelowDrawn();
    error Expired();
    error AlreadyOpen();
    error ZeroAddress();
    error ExcessRepay();
    error InvalidParties();

    event LineOpened(address indexed lender, address indexed borrower, address asset, uint256 cap);
    event Deposited(uint256 amount);
    event Drawn(uint256 amount, uint256 drawnAfter);
    event Repaid(uint256 amount, uint256 drawnAfter);
    event PausedDraws(bool paused);
    event Panicked(address indexed by, uint256 recallDeadline);
    event VenuePausedSet(address indexed target, bool paused);
    event CapProposed(bytes32 indexed hash, address indexed by);
    event CapApproved(bytes32 indexed hash, address indexed by);
    event CapChanged(uint256 oldCap, uint256 newCap);
    event RecallStarted(uint256 deadline);
    event RecallCleared();

    address public immutable override lender;
    address public immutable override borrower;
    IERC20 public immutable override asset;
    BorrowerVault public vault;
    uint256 public cap;
    uint256 public drawn;
    uint16 public immutable rateBps;
    uint64 public immutable expiry;
    bool public drawsPaused;
    uint64 public override recallDeadline;
    bytes32 public proposalHash;
    bool public lenderApproved;
    bool public borrowerApproved;
    mapping(address => bool) public override venuePaused;
    uint32 public immutable recallWindow;

    modifier onlyLender() {
        if (msg.sender != lender) revert NotLender();
        _;
    }

    modifier onlyBorrower() {
        if (msg.sender != borrower) revert NotBorrower();
        _;
    }

    modifier onlyParty() {
        if (msg.sender != lender && msg.sender != borrower) revert NotParty();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != address(vault)) revert NotVault();
        _;
    }

    /// @param allowedTokens Allowlisted swap outputs; configured on the vault via `setLine` after deploy.
    /// @param allowedTargets Allowlisted venues; configured on the vault via `setLine` after deploy.
    constructor(
        address _lender,
        address _borrower,
        address _asset,
        uint256 _cap,
        uint16 _rateBps,
        uint64 _expiry,
        uint32 _recallWindow,
        address[] memory allowedTokens,
        address[] memory allowedTargets,
        address _vault
    ) {
        if (_lender == address(0) || _borrower == address(0) || _asset == address(0) || _vault == address(0)) {
            revert ZeroAddress();
        }
        if (_lender == _borrower) revert InvalidParties();
        if (_cap == 0 || _recallWindow == 0) revert ZeroAmount();
        if (_expiry <= block.timestamp) revert Expired();
        if (allowedTokens.length == 0 || allowedTargets.length == 0) revert ZeroAmount();

        lender = _lender;
        borrower = _borrower;
        asset = IERC20(_asset);
        cap = _cap;
        rateBps = _rateBps;
        expiry = _expiry;
        recallWindow = _recallWindow;
        vault = BorrowerVault(_vault);

        emit LineOpened(_lender, _borrower, _asset, _cap);
    }

    /// @notice Lender funds the line pot. USDC stays on this contract until drawn.
    function deposit(uint256 amount) external onlyLender nonReentrant {
        if (amount == 0) revert ZeroAmount();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(amount);
    }

    /// @notice Borrower draws USDC from the pot into the vault. Never to an EOA.
    function draw(uint256 amount) external onlyBorrower nonReentrant {
        if (block.timestamp > expiry) revert Expired();
        if (drawsPaused || recallActive()) revert Paused();
        if (amount == 0) revert ZeroAmount();
        if (drawn + amount > cap) revert CapExceeded();
        if (asset.balanceOf(address(this)) < amount) revert InsufficientPot();
        drawn += amount;
        asset.safeTransfer(address(vault), amount);
        emit Drawn(amount, drawn);
    }

    /// @notice Vault-only hook after USDC has been transferred back to the pot.
    function onRepay(uint256 amount) external override onlyVault nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > drawn) revert ExcessRepay();
        drawn -= amount;
        emit Repaid(amount, drawn);
    }

    /// @notice Freeze new draws. Does not block repay.
    function pauseDraws() external onlyLender {
        drawsPaused = true;
        emit PausedDraws(true);
    }

    /// @notice Clear an expired (or unset) recall clock. Required before unpausing.
    function clearRecall() external onlyLender {
        if (recallDeadline != 0 && block.timestamp < recallDeadline) revert InRecall();
        recallDeadline = 0;
        emit RecallCleared();
    }

    /// @notice Unpause draws. Forbidden while a recall deadline is still set.
    function unpauseDraws() external onlyLender {
        if (recallDeadline != 0) revert InRecall();
        drawsPaused = false;
        emit PausedDraws(false);
    }

    /// @notice Immediate draw freeze + recall countdown.
    function panic() external onlyLender {
        _startRecall();
        emit Panicked(msg.sender, recallDeadline);
    }

    /// @notice Demo stand-in for "Morpho market paused". `true` also starts recall.
    function setVenuePaused(address target, bool paused) external onlyLender {
        venuePaused[target] = paused;
        emit VenuePausedSet(target, paused);
        if (paused) {
            _startRecall();
        }
    }

    /// @notice Store a hash only. Does not store or emit `newCap`.
    function proposeCap(bytes32 hash) external onlyParty {
        if (hash == bytes32(0)) revert HashMismatch();
        proposalHash = hash;
        lenderApproved = false;
        borrowerApproved = false;
        emit CapProposed(hash, msg.sender);
    }

    /// @notice One side signs the currently stored hash.
    function approveCap(bytes32 hash) external onlyParty {
        if (hash == bytes32(0) || hash != proposalHash) revert HashMismatch();
        if (msg.sender == lender) {
            lenderApproved = true;
        } else {
            borrowerApproved = true;
        }
        emit CapApproved(hash, msg.sender);
    }

    /// @notice Reveal `newCap`. Requires both approvals, matching hash, and `newCap >= drawn`.
    function executeCap(uint256 newCap, uint256 nonce, bytes32 salt) external onlyParty nonReentrant {
        bytes32 computed = keccak256(abi.encode(newCap, nonce, salt));
        if (computed != proposalHash) revert HashMismatch();
        if (!lenderApproved || !borrowerApproved) revert NotApproved();
        if (newCap < drawn) revert CapBelowDrawn();
        uint256 oldCap = cap;
        cap = newCap;
        proposalHash = bytes32(0);
        lenderApproved = false;
        borrowerApproved = false;
        emit CapChanged(oldCap, newCap);
    }

    function utilizationBps() external view returns (uint256) {
        if (cap == 0) return 0;
        return (drawn * 10_000) / cap;
    }

    /// @notice True once panic / venue-pause has started a recall, including after the deadline.
    function recallActive() public view override returns (bool) {
        return recallDeadline != 0;
    }

    function potBalance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function _startRecall() internal {
        drawsPaused = true;
        emit PausedDraws(true);
        if (recallDeadline == 0) {
            recallDeadline = uint64(block.timestamp + uint64(recallWindow));
            emit RecallStarted(recallDeadline);
        }
    }
}
