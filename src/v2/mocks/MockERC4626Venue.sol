// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Simulated ERC-4626 venue with pause, yield, loss, and failed-exit controls (testnet only).
contract MockERC4626Venue is ERC20, ERC4626 {
    using SafeERC20 for IERC20;

    address public operator;
    bool public paused;
    bool public exitsBlocked;

    error Paused();
    error FailedExit();
    error NotOperator();

    constructor(IERC20 asset_) ERC20("Mock Venue Share", "mVENUE") ERC4626(asset_) {
        operator = msg.sender;
    }

    function setPaused(bool paused_) external {
        if (msg.sender != operator) revert NotOperator();
        paused = paused_;
    }

    function setExitsBlocked(bool blocked) external {
        if (msg.sender != operator) revert NotOperator();
        exitsBlocked = blocked;
    }

    function simulateYield(uint256 assets) external {
        if (msg.sender != operator) revert NotOperator();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
    }

    function simulateLoss(uint256 assets) external {
        if (msg.sender != operator) revert NotOperator();
        IERC20(asset()).safeTransfer(msg.sender, assets);
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (paused) revert Paused();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override returns (uint256) {
        if (paused) revert Paused();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256) {
        if (exitsBlocked) revert FailedExit();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override returns (uint256) {
        if (exitsBlocked) revert FailedExit();
        return super.redeem(shares, receiver, owner);
    }

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return ERC4626.decimals();
    }
}
