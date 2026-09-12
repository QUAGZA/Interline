// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BorrowerVaultV2} from "./BorrowerVaultV2.sol";
import {LendingMarket} from "./LendingMarket.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IBorrowerVaultFactory} from "./interfaces/IRestrictedVault.sol";

/// @title BorrowerVaultFactory
/// @notice Atomic constructor-bound vaults. No public `setLine`.
contract BorrowerVaultFactory is IBorrowerVaultFactory {
    address public immutable venue;
    address public immutable swapRouter;
    address public immutable otherToken;

    mapping(address => mapping(address => address)) internal _vaultOf;

    error Exists();
    error ZeroAddress();
    error NotMarket();
    error WrongMode();
    error WrongFactory();

    event VaultCreated(address indexed market, address indexed owner, address vault);

    constructor(address venue_, address swapRouter_, address otherToken_) {
        if (venue_ == address(0) || swapRouter_ == address(0) || otherToken_ == address(0)) revert ZeroAddress();
        venue = venue_;
        swapRouter = swapRouter_;
        otherToken = otherToken_;
    }

    function vaultOf(address market, address owner) external view returns (address) {
        return _vaultOf[market][owner];
    }

    function createVault(address market, address owner) external returns (address vault) {
        if (market == address(0) || owner == address(0)) revert ZeroAddress();
        if (_vaultOf[market][owner] != address(0)) revert Exists();
        LendingMarket m = LendingMarket(market);
        if (m.deliveryMode() != ILendingMarket.DeliveryMode.Restricted) revert WrongMode();
        if (address(m.vaultFactory()) != address(this)) revert WrongFactory();
        if (msg.sender != market && msg.sender != owner) revert NotMarket();
        vault = address(new BorrowerVaultV2(owner, market, venue, swapRouter, otherToken));
        _vaultOf[market][owner] = vault;
        emit VaultCreated(market, owner, vault);
    }
}
