// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRestrictedVault {
    function owner() external view returns (address);
    function market() external view returns (address);
    function notifyBorrow(uint256 assets) external;
}

interface IBorrowerVaultFactory {
    function vaultOf(address market, address owner) external view returns (address);
    function createVault(address market, address owner) external returns (address);
    function deployDirectVault(address owner, address controller, address loanToken) external returns (address);
}
