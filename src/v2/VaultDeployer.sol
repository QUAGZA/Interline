// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BorrowerVaultV2} from "./BorrowerVaultV2.sol";

/// @title VaultDeployer
/// @notice Holds `BorrowerVaultV2` initcode so `BorrowerVaultFactory` stays under EIP-170.
contract VaultDeployer {
    function deploy(
        address owner,
        address controller,
        address venue,
        address swapRouter,
        address otherToken,
        IERC20 loanToken
    ) external returns (address) {
        return address(new BorrowerVaultV2(owner, controller, venue, swapRouter, otherToken, loanToken));
    }
}
