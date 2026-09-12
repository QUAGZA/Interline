// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMockSwap} from "../interfaces/IMockSwap.sol";

/// @notice 1:1 raw swap for the demo. Does not normalize decimals (USDC 6 vs WETH 18).
contract MockSwap is IMockSwap {
    using SafeERC20 for IERC20;

    error InsufficientOut();
    error ZeroAmount();

    /// @inheritdoc IMockSwap
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        amountOut = amountIn;
        if (amountOut < minOut) revert InsufficientOut();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
