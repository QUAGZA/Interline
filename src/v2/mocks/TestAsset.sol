// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Standard test ERC-20 (6 or 18 dp). Not redeemable real USDC/ETH.
contract TestAsset is ERC20 {
    uint8 private immutable _decimals;
    address public operator;
    mapping(address => bool) public minters;

    error NotMinter();
    error NotOperator();

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
        operator = msg.sender;
        minters[msg.sender] = true;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function setMinter(address account, bool allowed) external {
        if (msg.sender != operator) revert NotOperator();
        minters[account] = allowed;
    }

    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        _mint(to, amount);
    }
}
