// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICreditController} from "./interfaces/ICreditController.sol";
import {ERC4626VenueAdapter} from "./adapters/ERC4626VenueAdapter.sol";
import {IVenueAdapter} from "./interfaces/IVenueAdapter.sol";
import {ITypedSwapRouter} from "./interfaces/ITypedSwapRouter.sol";
import {IMarketRecoveryEscrow} from "./interfaces/IMarketRecoveryEscrow.sol";

/// @title BorrowerVaultV2
/// @notice Constructor-bound owner + market. Restricted-mode destination for borrowed mUSDC.
/// @dev No `setLine`, no arbitrary `call`, no sweep to the owner while live debt or write-off remains.
contract BorrowerVaultV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    ICreditController public immutable market;
    IERC20 public immutable loanToken;
    IERC20 public immutable otherToken;
    address public immutable adapter;
    address public immutable swapRouter;

    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error RecallBlocksEntry();
    error ObligationBlocksEntry();
    error RecallWindowOpen();
    error LiabilityOutstanding();
    error NotDefaulted();
    error UntypedPair();
    error UntypedToken();
    error SameAsset();
    error WrongVenueAsset();
    error WrongLoanToken();
    error NoArbitraryCall();

    event RepaidFromVault(uint256 amount);
    event EnteredVenue(uint256 assets, uint256 shares);
    event ExitedVenue(uint256 assets, uint256 shares);
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event SurplusReleased(address indexed token, address indexed to, uint256 amount);
    event RecoveredToEscrow(uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address owner_,
        address market_,
        address venue_,
        address swapRouter_,
        address otherToken_,
        IERC20 loanToken_
    ) {
        if (
            owner_ == address(0) || market_ == address(0) || venue_ == address(0) || swapRouter_ == address(0)
                || otherToken_ == address(0) || address(loanToken_) == address(0)
        ) {
            revert ZeroAddress();
        }
        owner = owner_;
        market = ICreditController(market_);
        loanToken = loanToken_;
        // External calls back into a controller that is still constructing return empty code.
        if (market_.code.length != 0 && address(market.loanToken()) != address(loanToken_)) revert WrongLoanToken();
        if (otherToken_ == address(loanToken)) revert SameAsset();
        if (IERC4626(venue_).asset() != address(loanToken)) revert WrongVenueAsset();
        otherToken = IERC20(otherToken_);
        swapRouter = swapRouter_;
        adapter = address(new ERC4626VenueAdapter(address(this), venue_, address(loanToken)));
    }

    function idleLoan() public view returns (uint256) {
        return loanToken.balanceOf(address(this));
    }

    function venueShares() public view returns (uint256) {
        return IERC20(IVenueAdapter(adapter).venue()).balanceOf(address(this));
    }

    function repay(uint256 amount) external onlyOwner nonReentrant {
        _repay(amount);
    }

    /// @notice Borrower, controller, or public recovery caller may repay idle loan tokens from the vault.
    function repayFromIdle(uint256 amount) external nonReentrant {
        if (msg.sender != owner && msg.sender != address(market)) {
            _requirePublicDeRisk();
        }
        _repay(amount);
    }

    function enterVenue(uint256 assets, uint256 minShares) external onlyOwner nonReentrant {
        if (assets == 0) revert ZeroAmount();
        _requireRiskEntryAllowed();
        loanToken.forceApprove(adapter, assets);
        uint256 shares = IVenueAdapter(adapter).deposit(assets, minShares);
        loanToken.forceApprove(adapter, 0);
        emit EnteredVenue(assets, shares);
    }

    function exitVenue(uint256 assets, uint256 maxShares) external onlyOwner nonReentrant {
        _exitVenue(assets, maxShares);
    }

    function redeemVenue(uint256 shares, uint256 minAssets) external onlyOwner nonReentrant {
        if (shares == 0) revert ZeroAmount();
        IERC20 shareToken = IERC20(IVenueAdapter(adapter).venue());
        shareToken.forceApprove(adapter, shares);
        uint256 assets = IVenueAdapter(adapter).redeem(shares, minAssets);
        shareToken.forceApprove(adapter, 0);
        emit ExitedVenue(assets, shares);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        onlyOwner
        nonReentrant
        returns (uint256 amountOut)
    {
        _requireTypedPair(tokenIn, tokenOut);
        if (amountIn == 0) revert ZeroAmount();
        // Reverse unwind to the loan token stays enabled during recall/default; new risk (loan -> other) does not.
        if (tokenOut != address(loanToken)) _requireRiskEntryAllowed();
        amountOut = _swap(tokenIn, tokenOut, amountIn, minOut, deadline);
    }

    /// @notice After the recall window, anyone may unwind venue assets into the vault and repay or recover.
    function publicExitAndRepay(uint256 assets, uint256 maxShares) external nonReentrant {
        _requirePublicDeRisk();
        _exitVenue(assets, maxShares);
        _repayOrRecoverIdle();
    }

    /// @notice After the recall window or a write-off, anyone may reverse-swap into the loan token.
    function publicUnwindSwap(uint256 amountIn, uint256 minOut, uint256 deadline) external nonReentrant {
        _requirePublicDeRisk();
        if (amountIn == 0) revert ZeroAmount();
        _swap(address(otherToken), address(loanToken), amountIn, minOut, deadline);
        _repayOrRecoverIdle();
    }

    function releaseSurplus(address token, uint256 amount) external nonReentrant {
        if (msg.sender != owner && msg.sender != address(market)) revert NotOwner();
        if (amount == 0) revert ZeroAmount();
        if (token != address(loanToken) && token != address(otherToken)) revert UntypedToken();
        if (_liabilityOutstanding()) revert LiabilityOutstanding();
        IERC20(token).safeTransfer(owner, amount);
        emit SurplusReleased(token, owner, amount);
    }

    function recoverIdleToEscrow() external nonReentrant {
        if (!_recoveryOpen()) revert NotDefaulted();
        _recoverToEscrow();
    }

    function _exitVenue(uint256 assets, uint256 maxShares) internal {
        if (assets == 0) revert ZeroAmount();
        IERC20 shareToken = IERC20(IVenueAdapter(adapter).venue());
        shareToken.forceApprove(adapter, maxShares);
        uint256 shares = IVenueAdapter(adapter).withdraw(assets, maxShares);
        shareToken.forceApprove(adapter, 0);
        emit ExitedVenue(assets, shares);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        internal
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);
        amountOut = ITypedSwapRouter(swapRouter).swap(tokenIn, tokenOut, amountIn, minOut, deadline);
        IERC20(tokenIn).forceApprove(swapRouter, 0);
        emit Swapped(tokenIn, tokenOut, amountIn, amountOut);
    }

    function _repayOrRecoverIdle() internal {
        uint256 idle = idleLoan();
        if (idle == 0) return;
        if (market.liveDebt(owner) > 0) {
            _repay(idle);
        } else if (_recoveryOpen()) {
            _recoverToEscrow();
        }
    }

    function _repay(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 idle = idleLoan();
        if (amount > idle) amount = idle;
        if (amount == 0) revert ZeroAmount();
        loanToken.forceApprove(address(market), amount);
        market.collectRepayment(owner, amount);
        loanToken.forceApprove(address(market), 0);
        emit RepaidFromVault(amount);
    }

    function _recoverToEscrow() internal {
        address escrow = market.recoverySink();
        if (escrow == address(0)) revert ZeroAddress();
        uint256 remaining = market.recoveryObligation(owner);
        if (remaining == 0) revert NotDefaulted();
        uint256 idle = idleLoan();
        if (idle == 0) revert ZeroAmount();
        uint256 amount = idle < remaining ? idle : remaining;
        loanToken.forceApprove(escrow, amount);
        uint256 taken = IMarketRecoveryEscrow(escrow).notifyRecovery(address(market), owner, amount);
        loanToken.forceApprove(escrow, 0);
        emit RecoveredToEscrow(taken);
    }

    function _requireTypedPair(address tokenIn, address tokenOut) internal view {
        bool forward = tokenIn == address(loanToken) && tokenOut == address(otherToken);
        bool reverse = tokenIn == address(otherToken) && tokenOut == address(loanToken);
        if (!forward && !reverse) revert UntypedPair();
    }

    function _requireRiskEntryAllowed() internal view {
        if (market.entryBlocked()) revert RecallBlocksEntry();
        if (_recoveryOpen()) revert ObligationBlocksEntry();
    }

    function _requirePublicDeRisk() internal view {
        if (_recoveryOpen() || market.isDefaulted(owner)) return;
        if (!market.recallActive() || block.timestamp <= market.recallDeadline()) revert RecallWindowOpen();
    }

    function _liabilityOutstanding() internal view returns (bool) {
        return market.liveDebt(owner) > 0 || _recoveryOpen();
    }

    function _recoveryOpen() internal view returns (bool) {
        return market.recoveryObligation(owner) > 0;
    }

    fallback() external {
        revert NoArbitraryCall();
    }
}
