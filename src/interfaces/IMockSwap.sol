// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Demo swap: 1:1 raw amounts, no decimal normalization.
interface IMockSwap {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 amountOut);
}
