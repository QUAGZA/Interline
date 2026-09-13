// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDirectCreditFacility} from "./interfaces/IDirectCreditFacility.sol";
import {DirectCreditFacility} from "./DirectCreditFacility.sol";

/// @title DirectFacilityDeployer
/// @notice Holds `DirectCreditFacility` initcode so `DirectFacilityFactory` stays under EIP-170.
contract DirectFacilityDeployer {
    function deploy(IDirectCreditFacility.Terms memory terms, address creator, address oracle, address vaultFactory)
        external
        returns (address)
    {
        return address(new DirectCreditFacility(terms, creator, oracle, vaultFactory));
    }
}
