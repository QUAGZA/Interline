// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {ILendingMarket} from "../../../src/v2/interfaces/ILendingMarket.sol";
import {MarketFactory} from "../../../src/v2/MarketFactory.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";

contract MarketFactoryTest is RestrictedFixture {
    function setUp() public {
        _deployRestricted();
    }

    function test_NonCuratorCannotCreate() public {
        vm.prank(alice);
        vm.expectRevert(MarketFactory.NotCurator.selector);
        factory.createMarket(_walletInit());
    }

    function test_CreateMarketRegistersEscrowAndPreset() public {
        assertTrue(escrow.isMarket(address(restricted)));
        bytes32 id = factory.presetHash(_restrictedInit());
        assertTrue(factory.isPreset(id));
        assertEq(factory.presetCount(), 1);
        assertEq(factory.marketCount(), 1);
    }

    function test_WalletPresetEnumeratesSeparately() public {
        vm.prank(curator);
        address walletMkt = factory.createMarket(_walletInit());
        assertEq(factory.presetCount(), 2);
        assertTrue(factory.isMarket(walletMkt));
        assertEq(uint256(LendingMarket(walletMkt).deliveryMode()), uint256(ILendingMarket.DeliveryMode.Wallet));
        assertEq(LendingMarket(walletMkt).defaultPositionCap(), BORROW_CAP);
        assertEq(restricted.defaultPositionCap(), RESTRICTED_CAP);
    }

    function test_EscrowMismatchReverts() public {
        ILendingMarket.Init memory init = _walletInit();
        init.recoveryEscrow = address(0);
        vm.prank(curator);
        vm.expectRevert(MarketFactory.EscrowMismatch.selector);
        factory.createMarket(init);
    }

    function test_RestrictedRequiresVaultFactory() public {
        ILendingMarket.Init memory init = _restrictedInit();
        init.vaultFactory = address(0);
        vm.prank(curator);
        vm.expectRevert(MarketFactory.InvalidPreset.selector);
        factory.createMarket(init);
    }

    function test_WalletRejectsVaultFactory() public {
        ILendingMarket.Init memory init = _walletInit();
        init.vaultFactory = address(vaultFactory);
        vm.prank(curator);
        vm.expectRevert(MarketFactory.InvalidPreset.selector);
        factory.createMarket(init);
    }

    function test_DisabledPresetCannotCreate() public {
        bytes32 id = factory.presetHash(_restrictedInit());
        vm.prank(curator);
        factory.setPresetEnabled(id, false);
        vm.prank(curator);
        vm.expectRevert(MarketFactory.PresetDisabled.selector);
        factory.createMarket(_restrictedInit());
    }

    function test_CreateMarketFromPreset() public {
        ILendingMarket.Init memory init = _walletInit();
        vm.prank(curator);
        bytes32 id = factory.registerPreset(init);
        vm.prank(curator);
        address created = factory.createMarketFromPreset(id, curator, guardian, address(escrow));
        assertTrue(factory.isMarket(created));
        assertEq(LendingMarket(created).guardian(), guardian);
    }

    function test_CuratorTwoStepTransfer() public {
        address next = makeAddr("factory-curator-2");
        vm.prank(curator);
        factory.transferCurator(next);
        vm.prank(alice);
        vm.expectRevert(MarketFactory.NotPending.selector);
        factory.acceptCurator();
        vm.prank(next);
        factory.acceptCurator();
        assertEq(factory.curator(), next);
        vm.prank(curator);
        vm.expectRevert(MarketFactory.NotCurator.selector);
        factory.createMarket(_walletInit());
        vm.prank(next);
        factory.createMarket(_walletInit());
        assertEq(factory.marketCount(), 2);
    }
}
