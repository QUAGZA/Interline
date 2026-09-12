// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {BorrowerVault} from "../src/BorrowerVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {JunkToken} from "../src/mocks/JunkToken.sol";
import {MockSwap} from "../src/mocks/MockSwap.sol";
import {MockTarget} from "../src/mocks/MockTarget.sol";

/// @notice Local / testnet deploy. Anvil #0 = lender/deployer, Anvil #1 = borrower.
contract Deploy is Script {
    uint256 constant CAP = 2_000_000e6;
    uint16 constant RATE_BPS = 500;
    uint32 constant RECALL_WINDOW = 5 minutes;
    uint256 constant LENDER_MINT = 10_000_000e6;

    // Anvil account #1
    address constant ANVIL_BORROWER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address lender = vm.addr(pk);
        address borrower = vm.envOr("BORROWER_ADDRESS", ANVIL_BORROWER);

        vm.startBroadcast(pk);

        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        JunkToken junk = new JunkToken();
        MockSwap swap = new MockSwap();
        MockTarget target = new MockTarget(address(usdc));
        BorrowerVault vault = new BorrowerVault(address(swap));

        address[] memory tokens = new address[](1);
        tokens[0] = address(weth);
        address[] memory targets = new address[](1);
        targets[0] = address(target);

        CreditLine line = new CreditLine(
            lender,
            borrower,
            address(usdc),
            CAP,
            RATE_BPS,
            uint64(block.timestamp + 365 days),
            RECALL_WINDOW,
            tokens,
            targets,
            address(vault)
        );
        vault.setLine(address(line), tokens, targets);

        usdc.mint(lender, LENDER_MINT);
        // Inventory for 1:1 raw swaps (demo: 1 USDC base unit -> 1 WETH wei).
        weth.mint(address(swap), 20_000_000 ether);
        junk.mint(address(swap), 20_000_000 ether);

        vm.stopBroadcast();

        console.log("=== Interline deploy ===");
        console.log("lender (deployer):", lender);
        console.log("borrower:", borrower);
        console.log("CREDIT_LINE_ADDRESS=", address(line));
        console.log("VAULT_ADDRESS=", address(vault));
        console.log("USDC_ADDRESS=", address(usdc));
        console.log("WETH_ADDRESS=", address(weth));
        console.log("JUNK_ADDRESS=", address(junk));
        console.log("MOCK_SWAP_ADDRESS=", address(swap));
        console.log("MOCK_TARGET_ADDRESS=", address(target));
        console.log("NEXT_PUBLIC_CREDIT_LINE_ADDRESS=", address(line));
        console.log("NEXT_PUBLIC_VAULT_ADDRESS=", address(vault));
        console.log("NEXT_PUBLIC_USDC_ADDRESS=", address(usdc));
        console.log("NEXT_PUBLIC_WETH_ADDRESS=", address(weth));
        console.log("NEXT_PUBLIC_JUNK_ADDRESS=", address(junk));
        console.log("NEXT_PUBLIC_MOCK_TARGET_ADDRESS=", address(target));
        console.log("cap (base units)=", CAP);
        console.log("recallWindow seconds=", RECALL_WINDOW);
    }
}
