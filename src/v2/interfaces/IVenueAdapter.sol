// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVenueAdapter {
    function venue() external view returns (address);
    function asset() external view returns (address);
    function deposit(uint256 assets, uint256 minShares) external returns (uint256 shares);
    function withdraw(uint256 assets, uint256 maxShares) external returns (uint256 shares);
    function redeem(uint256 shares, uint256 minAssets) external returns (uint256 assets);
}
