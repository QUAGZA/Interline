// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestAsset} from "../src/v2/mocks/TestAsset.sol";
import {TestnetFaucet} from "../src/v2/mocks/TestnetFaucet.sol";
import {LendingMarket} from "../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../src/v2/interfaces/ILendingMarket.sol";
import {DirectFacilityFactory} from "../src/v2/direct/DirectFacilityFactory.sol";
import {DirectCreditFacility} from "../src/v2/direct/DirectCreditFacility.sol";
import {IDirectCreditFacility} from "../src/v2/direct/interfaces/IDirectCreditFacility.sol";

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

    /// @notice Fresh Anvil accounts #5/#6 (not env lender/borrower) create two reversed-role facilities.
    function seedDirectAnvil(DirectFacilityFactory factory, TestnetFaucet faucet) internal {
        uint256 k5 = vm.deriveKey("test test test test test test test test test test test junk", 5);
        uint256 k6 = vm.deriveKey("test test test test test test test test test test test junk", 6);
        address alice = vm.addr(k5);
        address bob = vm.addr(k6);
        TestAsset musdc = faucet.musdc();
        TestAsset mweth = faucet.mweth();

        vm.startBroadcast(k5);
        faucet.drip();
        vm.stopBroadcast();
        vm.startBroadcast(k6);
        faucet.drip();
        vm.stopBroadcast();

        IDirectCreditFacility.Terms memory offer = IDirectCreditFacility.Terms({
            lender: alice,
            borrower: bob,
            loanToken: address(musdc),
            creditLimit: 5_000e6,
            aprRay: 5e25,
            acceptanceLifetime: 7 days,
            borrowPeriod: 365 days,
            recallWindow: 300,
            venue: factory.venue(),
            swapRouter: factory.swapRouter(),
            otherToken: factory.otherToken()
        });

        vm.startBroadcast(k5);
        DirectCreditFacility fac1 = DirectCreditFacility(factory.createFacility(offer));
        musdc.approve(address(fac1), type(uint256).max);
        vm.stopBroadcast();

        vm.startBroadcast(k6);
        fac1.acceptTerms(fac1.termsHash());
        mweth.approve(address(fac1), type(uint256).max);
        fac1.addCollateral(5 ether);
        vm.stopBroadcast();

        vm.startBroadcast(k5);
        fac1.fund(2_000e6);
        vm.stopBroadcast();

        vm.startBroadcast(k6);
        fac1.borrow(500e6, type(uint256).max, block.timestamp + 1 hours);
        vm.stopBroadcast();

        IDirectCreditFacility.Terms memory reverse = offer;
        reverse.lender = bob;
        reverse.borrower = alice;

        vm.startBroadcast(k6);
        DirectCreditFacility fac2 = DirectCreditFacility(factory.createFacility(reverse));
        musdc.approve(address(fac2), type(uint256).max);
        vm.stopBroadcast();

        vm.startBroadcast(k5);
        fac2.acceptTerms(fac2.termsHash());
        mweth.approve(address(fac2), type(uint256).max);
        fac2.addCollateral(5 ether);
        vm.stopBroadcast();

        vm.startBroadcast(k6);
        fac2.fund(1_000e6);
        vm.stopBroadcast();

        vm.startBroadcast(k5);
        fac2.borrow(200e6, type(uint256).max, block.timestamp + 1 hours);
        vm.stopBroadcast();

        console.log("seeded direct #5 lends to #6, #6 lends to #5");
        console.log("directFacilityA", address(fac1));
        console.log("directFacilityB", address(fac2));
    }
}
