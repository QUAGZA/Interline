// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITypedSwapRouter {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 amountOut);

    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}
