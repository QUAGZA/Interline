// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal line surface used by BorrowerVault (breaks the circular import).
interface ICreditLine {
    function lender() external view returns (address);
    function borrower() external view returns (address);
    function asset() external view returns (IERC20);
    function onRepay(uint256 amount) external;
    function recallActive() external view returns (bool);
    function recallDeadline() external view returns (uint64);
    function venuePaused(address target) external view returns (bool);
}
