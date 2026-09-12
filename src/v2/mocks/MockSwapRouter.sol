// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITypedSwapRouter} from "../interfaces/ITypedSwapRouter.sol";

/// @notice Typed mUSDC/mWETH router with decimal-aware quotes. Not 1:1 raw.
contract MockSwapRouter is ITypedSwapRouter {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint8 public immutable decimalsA;
    uint8 public immutable decimalsB;
    /// @dev How many tokenA raw units per 1e18 of tokenB (e.g. 2000e6 mUSDC per 1 WETH).
    uint256 public priceAPerBWad;
    address public operator;

    error UntypedPair();
    error Expired();
    error Slippage();
    error NotOperator();
    error ZeroAmount();

    event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(IERC20 tokenA_, IERC20 tokenB_, uint256 priceAPerBWad_) {
        tokenA = tokenA_;
        tokenB = tokenB_;
        decimalsA = IERC20Metadata(address(tokenA_)).decimals();
        decimalsB = IERC20Metadata(address(tokenB_)).decimals();
        priceAPerBWad = priceAPerBWad_;
        operator = msg.sender;
    }

    function setPrice(uint256 priceAPerBWad_) external {
        if (msg.sender != operator) revert NotOperator();
        priceAPerBWad = priceAPerBWad_;
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(tokenA) && tokenOut == address(tokenB)) {
            amountOut = (amountIn * 1e18) / priceAPerBWad;
        } else if (tokenIn == address(tokenB) && tokenOut == address(tokenA)) {
            amountOut = (amountIn * priceAPerBWad) / 1e18;
        } else {
            revert UntypedPair();
        }
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minOut) revert Slippage();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        emit Swap(tokenIn, tokenOut, amountIn, amountOut);
    }
}
