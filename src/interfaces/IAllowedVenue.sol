// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Only hardcoded selectors a vault may use on an allowlisted venue.
interface IAllowedVenue {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function paused() external view returns (bool);
}
