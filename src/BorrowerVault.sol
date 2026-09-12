// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICreditLine} from "./interfaces/ICreditLine.sol";
import {IAllowedVenue} from "./interfaces/IAllowedVenue.sol";
import {IMockSwap} from "./interfaces/IMockSwap.sol";

/// @title BorrowerVault
/// @notice Sole holder of drawn USDC. Repay, allowlisted swap, allowlisted venue enter/exit.
/// @dev No sweep, no transfer-to-EOA, no arbitrary `call`. After the recall deadline only repay works.
contract BorrowerVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotLine();
    error NotBorrower();
    error TokenNotAllowed();
    error TargetNotAllowed();
    error RecallLocked();
    error UnsafeTarget();
    error AlreadySet();
    error ZeroAddress();
    error ZeroAmount();
    error ExcessExposure();

    event RepaidFromVault(uint256 amount);
    event EnteredTarget(address indexed target, uint256 amount);
    event ExitedTarget(address indexed target, uint256 amount);
    event SwapExecuted(address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event BlockedSwap(address indexed tokenOut, uint256 amountIn);
    event BlockedTarget(address indexed target, uint256 amount);
    event LineSet(address indexed line);

    ICreditLine public line;
    address public immutable swap;
    mapping(address => bool) public allowedTokens;
    mapping(address => bool) public allowedTargets;
    mapping(address => uint256) public exposure;
    address[] public targetList;

    modifier onlyBorrower() {
        if (address(line) == address(0) || msg.sender != line.borrower()) revert NotBorrower();
        _;
    }

    constructor(address _swap) {
        if (_swap == address(0)) revert ZeroAddress();
        swap = _swap;
    }

    /// @notice One-time bind to the credit line plus allowlists. Called by the deploy script after both exist.
    function setLine(address _line, address[] calldata tokens, address[] calldata targets) external {
        if (address(line) != address(0)) revert AlreadySet();
        if (_line == address(0)) revert ZeroAddress();
        line = ICreditLine(_line);
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i] == address(0)) revert ZeroAddress();
            allowedTokens[tokens[i]] = true;
        }
        for (uint256 i; i < targets.length; ++i) {
            if (targets[i] == address(0)) revert ZeroAddress();
            allowedTargets[targets[i]] = true;
            targetList.push(targets[i]);
        }
        emit LineSet(_line);
    }

    function targetCount() external view returns (uint256) {
        return targetList.length;
    }

    /// @notice Always allowed, including while draws are paused or recall is active.
    function repay(uint256 amount) external onlyBorrower nonReentrant {
        if (amount == 0) revert ZeroAmount();
        IERC20 token = line.asset();
        token.safeTransfer(address(line), amount);
        line.onRepay(amount);
        emit RepaidFromVault(amount);
    }

    /// @notice Send idle vault USDC into an allowlisted venue. Locked after the recall deadline.
    function enterTarget(address target, uint256 amount) external onlyBorrower nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!allowedTargets[target]) {
            emit BlockedTarget(target, amount);
            revert TargetNotAllowed();
        }
        if (_recallLocked()) revert RecallLocked();
        if (IAllowedVenue(target).paused() || line.venuePaused(target)) {
            emit BlockedTarget(target, amount);
            revert TargetNotAllowed();
        }
        IERC20 token = line.asset();
        exposure[target] += amount;
        token.forceApprove(target, amount);
        IAllowedVenue(target).deposit(amount);
        emit EnteredTarget(target, amount);
    }

    /// @notice Pull USDC back from a venue into the vault. Locked after the recall deadline.
    function exitTarget(address target, uint256 amount) external onlyBorrower nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!allowedTargets[target]) {
            emit BlockedTarget(target, amount);
            revert TargetNotAllowed();
        }
        if (_recallLocked()) revert RecallLocked();
        if (exposure[target] < amount) revert ExcessExposure();
        exposure[target] -= amount;
        IAllowedVenue(target).withdraw(amount);
        emit ExitedTarget(target, amount);
    }

    /// @notice Swap idle USDC to an allowlisted token via the immutable MockSwap (1:1 raw).
    function swapAllowlisted(address tokenOut, uint256 amountIn, uint256 minOut) external onlyBorrower nonReentrant {
        if (amountIn == 0) revert ZeroAmount();
        if (!allowedTokens[tokenOut]) {
            emit BlockedSwap(tokenOut, amountIn);
            revert TokenNotAllowed();
        }
        if (_recallLocked()) revert RecallLocked();
        IERC20 token = line.asset();
        token.forceApprove(swap, amountIn);
        uint256 amountOut = IMockSwap(swap).swap(address(token), tokenOut, amountIn, minOut);
        emit SwapExecuted(tokenOut, amountIn, amountOut);
    }

    function _recallLocked() internal view returns (bool) {
        uint64 deadline = line.recallDeadline();
        return deadline != 0 && block.timestamp >= deadline;
    }
}
