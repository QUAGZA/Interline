// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Shared surface for restricted vaults. A pool market and a direct facility both implement
///         this; a direct facility is not a pool and must not share cash, shares, or write-off.
interface ICreditController {
    function loanToken() external view returns (IERC20);

    function recallActive() external view returns (bool);

    function recallDeadline() external view returns (uint64);

    function liveDebt(address owner) external view returns (uint256);

    function collectRepayment(address owner, uint256 maxAssets) external;

    /// @dev Remaining recoverable write-off. Distinct from `isDefaulted`, which is historical.
    function recoveryObligation(address owner) external view returns (uint256);

    function recoverySink() external view returns (address);

    function isDefaulted(address owner) external view returns (bool);

    /// @dev Blocks new venue entry / forward swaps. Pool: recall only (vault also blocks while
    ///      `recoveryObligation` remains). Direct: recall or expiry-with-debt.
    function entryBlocked() external view returns (bool);
}
