// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingMarket} from "./LendingMarket.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IBorrowerVaultFactory} from "./interfaces/IRestrictedVault.sol";
import {VaultDeployer} from "./VaultDeployer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title BorrowerVaultFactory
/// @notice Atomic constructor-bound vaults. No public `setLine`.
contract BorrowerVaultFactory is IBorrowerVaultFactory {
    address public immutable venue;
    address public immutable swapRouter;
    address public immutable otherToken;
    address public immutable vaultDeployer;

    mapping(address => mapping(address => address)) internal _vaultOf;

    error Exists();
    error ZeroAddress();
    error NotMarket();
    error WrongMode();
    error WrongFactory();

    event VaultCreated(address indexed market, address indexed owner, address vault);

    constructor(address venue_, address swapRouter_, address otherToken_, address vaultDeployer_) {
        if (
            venue_ == address(0) || swapRouter_ == address(0) || otherToken_ == address(0)
                || vaultDeployer_ == address(0)
        ) revert ZeroAddress();
        venue = venue_;
        swapRouter = swapRouter_;
        otherToken = otherToken_;
        vaultDeployer = vaultDeployer_;
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
        vault = VaultDeployer(vaultDeployer).deploy(
            owner, market, venue, swapRouter, otherToken, IERC20(address(m.loanToken()))
        );
        _vaultOf[market][owner] = vault;
        emit VaultCreated(market, owner, vault);
    }

    /// @notice Direct facilities call this while constructing (controller code is still empty).
    function deployDirectVault(address owner, address controller, address loanToken_)
        external
        returns (address vault)
    {
        if (owner == address(0) || controller == address(0) || loanToken_ == address(0)) revert ZeroAddress();
        vault = VaultDeployer(vaultDeployer).deploy(owner, controller, venue, swapRouter, otherToken, IERC20(loanToken_));
        emit VaultCreated(controller, owner, vault);
    }
}
