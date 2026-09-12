// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAllowedVenue} from "../interfaces/IAllowedVenue.sol";

/// @notice Pretend venue. Holds USDC 1:1. Owner can pause deposits/withdrawals.
contract MockTarget is IAllowedVenue, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    bool public override paused;
    mapping(address => uint256) public balances;

    error Paused();
    error ZeroAmount();
    error InsufficientBalance();

    constructor(address _asset) Ownable(msg.sender) {
        asset = IERC20(_asset);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
    }

    /// @inheritdoc IAllowedVenue
    function deposit(uint256 amount) external {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        balances[msg.sender] += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @inheritdoc IAllowedVenue
    function withdraw(uint256 amount) external {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        balances[msg.sender] -= amount;
        asset.safeTransfer(msg.sender, amount);
    }
}
