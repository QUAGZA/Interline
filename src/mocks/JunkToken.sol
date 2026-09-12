// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// @notice Not on the vault allowlist. Swap JUNK must revert with BlockedSwap.
contract JunkToken is MockERC20 {
    constructor() MockERC20("Junk Token", "JUNK", 18) {}
}
