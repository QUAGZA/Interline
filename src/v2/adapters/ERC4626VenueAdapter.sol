// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";

/// @title ERC4626VenueAdapter
/// @notice Owner-specific typed adapter. No arbitrary `call` / user bytes.
contract ERC4626VenueAdapter is IVenueAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable vault;
    IERC4626 public immutable venueContract;
    IERC20 public immutable loanAsset;

    error NotVault();
    error Slippage();
    error ZeroAmount();
    error ZeroAddress();
    error WrongAsset();
    error NoArbitraryCall();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(address vault_, address venue_, address asset_) {
        if (vault_ == address(0) || venue_ == address(0) || asset_ == address(0)) revert ZeroAddress();
        if (IERC4626(venue_).asset() != asset_) revert WrongAsset();
        vault = vault_;
        venueContract = IERC4626(venue_);
        loanAsset = IERC20(asset_);
    }

    function venue() external view returns (address) {
        return address(venueContract);
    }

    function asset() external view returns (address) {
        return address(loanAsset);
    }

    function deposit(uint256 assets, uint256 minShares) external onlyVault nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        loanAsset.safeTransferFrom(msg.sender, address(this), assets);
        loanAsset.forceApprove(address(venueContract), assets);
        shares = venueContract.deposit(assets, msg.sender);
        loanAsset.forceApprove(address(venueContract), 0);
        if (shares < minShares) revert Slippage();
    }

    function withdraw(uint256 assets, uint256 maxShares) external onlyVault nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        shares = venueContract.withdraw(assets, msg.sender, msg.sender);
        if (shares > maxShares) revert Slippage();
    }

    function redeem(uint256 shares, uint256 minAssets) external onlyVault nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        assets = venueContract.redeem(shares, msg.sender, msg.sender);
        if (assets < minAssets) revert Slippage();
    }

    fallback() external {
        revert NoArbitraryCall();
    }
}
