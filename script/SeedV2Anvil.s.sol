// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestAsset} from "../src/v2/mocks/TestAsset.sol";
import {TestnetFaucet} from "../src/v2/mocks/TestnetFaucet.sol";
import {LendingMarket} from "../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../src/v2/interfaces/ILendingMarket.sol";

/// @notice Anvil faucet seed: drip, two wallets supply (one per market), one posts collateral and borrows both modes.
/// @dev Well-known Anvil keys #2/#3/#4 (public test keys only). Do not use on any live network.
contract SeedV2Anvil is Script {
    uint256 internal constant ANVIL_KEY_2 = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant ANVIL_KEY_3 = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant ANVIL_KEY_4 = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    uint256 internal constant SUPPLY_EACH = 50_000e6;
    uint256 internal constant COLLATERAL_EACH = 20 ether;
    uint256 internal constant WALLET_BORROW = 5_000e6;
    uint256 internal constant RESTRICTED_BORROW = 2_000e6;

    function seedAnvil(TestnetFaucet faucet, address walletMarket, address restrictedMarket) internal {
        require(block.chainid == 31337, "SeedV2Anvil: anvil only");
        require(LendingMarket(walletMarket).deliveryMode() == ILendingMarket.DeliveryMode.Wallet, "wallet");
        require(LendingMarket(restrictedMarket).deliveryMode() == ILendingMarket.DeliveryMode.Restricted, "restricted");

        TestAsset musdc = faucet.musdc();
        TestAsset mweth = faucet.mweth();
        address borrower = vm.addr(ANVIL_KEY_4);

        vm.startBroadcast(ANVIL_KEY_2);
        faucet.drip();
        musdc.approve(walletMarket, type(uint256).max);
        LendingMarket(walletMarket).supply(SUPPLY_EACH, 0);
        vm.stopBroadcast();

        vm.startBroadcast(ANVIL_KEY_3);
        faucet.drip();
        musdc.approve(restrictedMarket, type(uint256).max);
        LendingMarket(restrictedMarket).supply(SUPPLY_EACH, 0);
        vm.stopBroadcast();

        vm.startBroadcast(ANVIL_KEY_4);
        faucet.drip();
        mweth.approve(walletMarket, type(uint256).max);
        mweth.approve(restrictedMarket, type(uint256).max);
        LendingMarket(walletMarket).addCollateral(borrower, COLLATERAL_EACH);
        LendingMarket(walletMarket).borrow(WALLET_BORROW, type(uint256).max);
        LendingMarket(restrictedMarket).addCollateral(borrower, COLLATERAL_EACH);
        LendingMarket(restrictedMarket).borrow(RESTRICTED_BORROW, type(uint256).max);
        vm.stopBroadcast();

        console.log("seeded anvil #2 supply wallet, #3 supply restricted, #4 collateral+borrow both");
    }
}
