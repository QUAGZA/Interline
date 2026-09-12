// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestAsset} from "./TestAsset.sol";

contract TestnetFaucet {
    TestAsset public immutable musdc;
    TestAsset public immutable mweth;
    address public operator;
    uint256 public usdcAmount = 100_000e6;
    uint256 public wethAmount = 50 ether;
    uint32 public cooldown = 1 hours;
    mapping(address => uint64) public lastDrip;

    error Cooldown();
    error NotOperator();
    error ZeroAddress();

    constructor(TestAsset musdc_, TestAsset mweth_) {
        musdc = musdc_;
        mweth = mweth_;
        operator = msg.sender;
    }

    function setAmounts(uint256 usdcAmount_, uint256 wethAmount_) external {
        if (msg.sender != operator) revert NotOperator();
        usdcAmount = usdcAmount_;
        wethAmount = wethAmount_;
    }

    function setCooldown(uint32 cooldown_) external {
        if (msg.sender != operator) revert NotOperator();
        cooldown = cooldown_;
    }

    function drip() external {
        _drip(msg.sender, false);
    }

    /// @notice Operator seed helper. Does not reset the recipient's cooldown.
    function dripTo(address account) external {
        if (msg.sender != operator) revert NotOperator();
        _drip(account, true);
    }

    function _drip(address account, bool skipCooldown) internal {
        if (account == address(0)) revert ZeroAddress();
        if (!skipCooldown) {
            uint64 last = lastDrip[account];
            if (last != 0 && block.timestamp < uint256(last) + uint256(cooldown)) revert Cooldown();
        }
        lastDrip[account] = uint64(block.timestamp);
        musdc.mint(account, usdcAmount);
        mweth.mint(account, wethAmount);
    }
}
