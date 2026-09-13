// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {MarketRecoveryEscrow} from "../../../src/v2/MarketRecoveryEscrow.sol";
import {IMarketRecoveryEscrow} from "../../../src/v2/interfaces/IMarketRecoveryEscrow.sol";

contract MarketRecoveryEscrowTest is RestrictedFixture {
    function setUp() public {
        _deployRestricted();
    }

    function test_WriteOffRecoveryGoesToEscrowNotBorrower() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        uint256 vaultIdle = vault.idleLoan();
        _writeOffBob(vault);
        uint256 obligation = restricted.recoveryObligation(bob);
        assertGt(restricted.writtenOffLiability(bob), 0);
        assertLt(obligation, vaultIdle);
        assertEq(musdc.balanceOf(bob), 0);

        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.LiabilityOutstanding.selector);
        vault.releaseSurplus(address(musdc), 1);

        vault.recoverIdleToEscrow();
        assertEq(vault.idleLoan(), vaultIdle - obligation);
        assertEq(musdc.balanceOf(bob), 0);
        assertEq(musdc.balanceOf(address(escrow)), obligation);
        assertEq(restricted.recoveryObligation(bob), 0);
        assertTrue(restricted.isDefaulted(bob));

        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        uint256 claimable = escrow.claimable(episodeId, alice);
        assertEq(claimable, obligation);
        vm.prank(alice);
        escrow.claim(episodeId);
        assertEq(musdc.balanceOf(alice), obligation);
        vm.prank(alice);
        vm.expectRevert(MarketRecoveryEscrow.NothingToClaim.selector);
        escrow.claim(episodeId);

        uint256 surplus = vault.idleLoan();
        vm.prank(bob);
        vault.releaseSurplus(address(musdc), surplus);
        assertEq(musdc.balanceOf(bob), surplus);
    }

    function test_TwoSuppliersSplitRecovery() public {
        _fundRestricted(alice, 100_000e6, 0);
        _fundRestricted(dave, 100_000e6, 0);
        vm.prank(alice);
        restricted.supply(100_000e6, 0);
        vm.prank(dave);
        restricted.supply(100_000e6, 0);
        _fundRestricted(bob, 0, 1 ether);
        vm.startPrank(bob);
        restricted.addCollateral(bob, 1 ether);
        restricted.borrow(1_400e6, type(uint256).max);
        vm.stopPrank();
        BorrowerVaultV2 vault = BorrowerVaultV2(vaultFactory.vaultOf(address(restricted), bob));
        _writeOffBob(vault);
        uint256 obligation = restricted.recoveryObligation(bob);
        vault.recoverIdleToEscrow();
        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        uint256 alicePay = escrow.claimable(episodeId, alice);
        uint256 davePay = escrow.claimable(episodeId, dave);
        assertEq(alicePay, obligation / 2);
        assertEq(davePay, obligation / 2);
        vm.prank(alice);
        escrow.claim(episodeId);
        vm.prank(dave);
        escrow.claim(episodeId);
        assertEq(musdc.balanceOf(alice), alicePay);
        assertEq(musdc.balanceOf(dave), davePay);
    }

    function test_NotifyRecoveryOnlyFromVault() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        _writeOffBob(vault);
        musdc.mint(carol, 100e6);
        vm.startPrank(carol);
        musdc.approve(address(escrow), 100e6);
        vm.expectRevert(MarketRecoveryEscrow.NotVault.selector);
        IMarketRecoveryEscrow(address(escrow)).notifyRecovery(address(restricted), bob, 100e6);
        vm.stopPrank();
    }

    function test_NotifyWriteOffOnlyFromMarket() public {
        vm.expectRevert(MarketRecoveryEscrow.NotMarket.selector);
        escrow.notifyWriteOff(address(restricted), bob, 1, 1, 1);
    }

    function test_ApplyRecoveryOnlyFromEscrow() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        _writeOffBob(vault);
        vm.expectRevert(LendingMarket.NotEscrow.selector);
        restricted.applyRecovery(bob, 1);
    }

    function test_PartialRecoveriesReconcileAndSurplusReleasable() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        vm.prank(bob);
        vault.enterVenue(1_200e6, 0);
        _writeOffBob(vault);
        uint256 obligation = restricted.recoveryObligation(bob);
        uint256 first = vault.idleLoan();
        assertLt(first, obligation);

        vault.recoverIdleToEscrow();
        assertEq(restricted.recoveryObligation(bob), obligation - first);
        assertEq(restricted.recoveredLiability(bob), first);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.LiabilityOutstanding.selector);
        vault.releaseSurplus(address(musdc), 1);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.ObligationBlocksEntry.selector);
        vault.enterVenue(1e6, 0);

        vm.prank(bob);
        vault.exitVenue(1_200e6, type(uint256).max);
        vault.recoverIdleToEscrow();
        assertEq(restricted.recoveryObligation(bob), 0);
        assertEq(restricted.recoveredLiability(bob), obligation);
        assertTrue(restricted.isDefaulted(bob));

        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        assertEq(escrow.claimable(episodeId, alice), obligation);
        assertEq(escrow.remainingRecoverable(episodeId), 0);

        uint256 surplus = vault.idleLoan();
        assertGt(surplus, 0);
        vm.prank(bob);
        vault.releaseSurplus(address(musdc), surplus);
        assertEq(musdc.balanceOf(bob), surplus);
    }

    function test_ClearedRecallDoesNotReenableUnresolvedDefault() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        _writeOffBob(vault);
        vm.prank(guardian);
        restricted.startRecall("incident");
        vm.warp(restricted.recallClearableAt());
        vm.prank(guardian);
        restricted.clearRecall();
        assertFalse(restricted.entryBlocked());
        assertGt(restricted.recoveryObligation(bob), 0);

        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.ObligationBlocksEntry.selector);
        vault.enterVenue(1e6, 0);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.ObligationBlocksEntry.selector);
        vault.swap(address(musdc), address(mweth), 1e6, 0, block.timestamp + 1);
    }

    function test_NewSupplierDoesNotClaimOldRecovery() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 200_000e6, 1 ether, 1_400e6);
        _writeOffBob(vault);
        uint256 obligation = restricted.recoveryObligation(bob);
        _fundRestricted(carol, 100_000e6, 0);
        vm.prank(carol);
        restricted.supply(100_000e6, 0);
        vault.recoverIdleToEscrow();
        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        assertEq(escrow.claimable(episodeId, alice), obligation);
        assertEq(escrow.claimable(episodeId, carol), 0);
    }
}
