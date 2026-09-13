// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingMarket} from "./LendingMarket.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";

/// @title MarketDeployer
/// @notice Holds `LendingMarket` initcode so `MarketFactory` stays under EIP-170 on public testnets.
contract MarketDeployer {
    function deploy(ILendingMarket.Init memory init) external returns (address) {
        return address(new LendingMarket(init));
    }
}
