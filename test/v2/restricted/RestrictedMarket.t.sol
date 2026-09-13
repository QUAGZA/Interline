// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../../../src/v2/interfaces/ILendingMarket.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {MarketFactory} from "../../../src/v2/MarketFactory.sol";

contract RestrictedMarketTest is RestrictedFixture {
    function setUp() public {
        _deployRestricted();
    }

    function test_BorrowGoesToVaultNotEoa() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        assertEq(musdc.balanceOf(bob), 0);
        assertTrue(address(vault) != address(0));
        assertEq(musdc.balanceOf(address(vault)), 1_000e6);
        assertEq(vault.owner(), bob);
        assertEq(address(vault.market()), address(restricted));
    }

    function test_RecallBlocksBorrowAndEntryAllowsExitRepay() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.enterVenue(400e6, 0);
        vm.prank(guardian);
        restricted.startRecall("venue incident");
        vm.prank(bob);
        vm.expectRevert(LendingMarket.Frozen.selector);
        restricted.borrow(10e6, type(uint256).max);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.RecallBlocksEntry.selector);
        vault.enterVenue(10e6, 0);
        vm.prank(bob);
        vault.exitVenue(100e6, type(uint256).max);
        uint256 idle = musdc.balanceOf(address(vault));
        vm.prank(bob);
        vault.repay(idle);
        assertLt(restricted.positionDebt(bob), 1_000e6);
    }

    function test_PublicUnwindAfterDeadline() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.enterVenue(500e6, 0);
        vm.prank(guardian);
        restricted.startRecall("incident");
        vm.prank(carol);
        vm.expectRevert(BorrowerVaultV2.RecallWindowOpen.selector);
        vault.publicExitAndRepay(500e6, type(uint256).max);
        vm.warp(block.timestamp + 301);
        vm.prank(carol);
        vault.publicExitAndRepay(500e6, type(uint256).max);
        assertGt(restricted.accountedCash(), 49_000e6);
    }

    function test_SurplusBlockedWhileDebt() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.LiabilityOutstanding.selector);
        vault.releaseSurplus(address(musdc), 1);
    }

    function test_FactoryEnumeratesTwoMarkets() public {
        vm.prank(curator);
        address second = factory.createMarket(_walletInit());
        assertEq(factory.marketCount(), 2);
        assertTrue(factory.isMarket(address(restricted)));
        assertTrue(factory.isMarket(second));
        assertEq(factory.marketAt(0), address(restricted));
        assertEq(factory.marketAt(1), second);
    }

    function test_SupplyBlockedDuringRecallRepayAndCollateralAllowed() public {
        _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(guardian);
        restricted.startRecall("incident");
        _fundRestricted(alice, 1_000e6, 0);
        vm.prank(alice);
        vm.expectRevert(LendingMarket.Frozen.selector);
        restricted.supply(1_000e6, 0);
        _fundRestricted(bob, 0, 1 ether);
        vm.prank(bob);
        restricted.addCollateral(bob, 1 ether);
        address vaultAddr = vaultFactory.vaultOf(address(restricted), bob);
        vm.prank(bob);
        BorrowerVaultV2(vaultAddr).repay(100e6);
        assertLt(restricted.positionDebt(bob), 1_000e6);
    }

    function test_ClearRecallRequiresDocumentedDelay() public {
        _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(guardian);
        restricted.startRecall("incident");
        uint64 clearableAt = restricted.recallClearableAt();
        vm.warp(restricted.recallDeadline() + 1);
        vm.prank(guardian);
        vm.expectRevert(LendingMarket.RecallPending.selector);
        restricted.clearRecall();
        vm.warp(clearableAt);
        vm.prank(guardian);
        restricted.clearRecall();
        assertFalse(restricted.recallActive());
        assertEq(restricted.recallDeadline(), 0);
    }

    function test_RecallDeadlineDoesNotSeizeHealthyCollateral() public {
        _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(guardian);
        restricted.startRecall("incident");
        vm.warp(block.timestamp + 301);
        _fundRestricted(carol, 2_000e6, 0);
        uint256 shares = restricted.debtSharesOf(bob);
        uint256 col = restricted.collateralOf(bob);
        vm.prank(carol);
        vm.expectRevert(LendingMarket.Healthy.selector);
        restricted.liquidate(bob, shares, 0, type(uint256).max, 0);
        assertEq(restricted.collateralOf(bob), col);
    }

    function test_WalletModeCannotStartRecall() public {
        vm.prank(guardian);
        vm.expectRevert(LendingMarket.NotRestricted.selector);
        market.startRecall("incident");
    }

    function test_StartRecallOnlyGuardian() public {
        vm.prank(bob);
        vm.expectRevert(LendingMarket.NotGuardian.selector);
        restricted.startRecall("incident");
        vm.prank(guardian);
        restricted.startRecall("venue paused");
        assertTrue(restricted.recallActive());
        assertEq(restricted.recallReasonHash(), keccak256(bytes("venue paused")));
        assertEq(restricted.recallDeadline(), uint64(block.timestamp + 300));
    }

    function test_RecallBlocksSwapIntoOtherTokenAllowsUnwind() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 2_000e6);
        vm.prank(bob);
        vault.swap(address(musdc), address(mweth), 2_000e6, 0, block.timestamp + 1);
        vm.prank(guardian);
        restricted.startRecall("incident");
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.RecallBlocksEntry.selector);
        vault.swap(address(musdc), address(mweth), 1, 0, block.timestamp + 1);
        uint256 wethBal = mweth.balanceOf(address(vault));
        vm.prank(bob);
        vault.swap(address(mweth), address(musdc), wethBal, 0, block.timestamp + 1);
        assertGt(vault.idleLoan(), 0);
    }
}
