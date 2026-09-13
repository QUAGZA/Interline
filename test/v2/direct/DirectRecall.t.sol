// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {DirectFacilityLens} from "../../../src/v2/direct/DirectFacilityLens.sol";

contract DirectRecallTest is DirectFixture {
    DirectCreditFacility internal fac;

    function setUp() public {
        _deployDirectStack();
        fac = _createAccepted(alice, bob);
        _fundLender(fac, alice, 2_000e6);
        vm.prank(bob);
        fac.borrow(500e6, type(uint256).max, block.timestamp + 1);
    }

    function test_RecallBlocksBorrowNotRepay() public {
        vm.prank(alice);
        fac.requestRepayment(1);
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.ActiveRecall.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
        BorrowerVaultV2 vault = BorrowerVaultV2(fac.vault());
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.RecallBlocksEntry.selector);
        vault.enterVenue(100e6, 0);
        musdc.mint(bob, 500e6);
        vm.startPrank(bob);
        musdc.approve(address(fac), 500e6);
        fac.repayAssets(500e6);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.AlreadyRecalled.selector);
        fac.requestRepayment(2);
    }

    function test_PublicRecoveryAfterDeadline() public {
        vm.prank(alice);
        fac.requestRepayment(1);
        vm.prank(carol);
        vm.expectRevert();
        fac.recoverVenue(1, 1);
        vm.warp(block.timestamp + 301);
        vm.prank(carol);
        fac.repayFromVault(500e6);
        uint256 leftover = fac.currentDebt();
        if (leftover > 0) {
            musdc.mint(carol, leftover + 1e6);
            vm.startPrank(carol);
            musdc.approve(address(fac), leftover + 1e6);
            fac.repayAll(leftover + 1e6);
            vm.stopPrank();
        }
        assertEq(fac.currentDebt(), 0);
    }

    function test_ExpiryActsAsRecall() public {
        vm.warp(block.timestamp + 365 days + 1);
        assertTrue(fac.recallActive());
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.BorrowingExpired.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
        DirectFacilityLens.Snapshot memory snap = directLens.snapshot(address(fac));
        assertEq(uint256(snap.debtState), uint256(DirectFacilityLens.DebtState.OVERDUE));
    }

    function test_VenuePauseTriggerAndNoWriteOff() public {
        venue.setPaused(true);
        vm.prank(carol);
        fac.triggerRecallFromVenue(0);
        assertTrue(fac.recallActive());
        assertEq(fac.recoveryObligation(bob), 0);
        assertFalse(fac.isDefaulted(bob));
    }

    function test_EndAgreementGates() public {
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.OutstandingDebt.selector);
        fac.endAgreement();
        vm.prank(bob);
        fac.repayFromVault(type(uint256).max);
        uint256 leftover = fac.currentDebt();
        if (leftover > 0) {
            musdc.mint(bob, leftover + 1e6);
            vm.startPrank(bob);
            musdc.approve(address(fac), leftover + 1e6);
            fac.repayAll(leftover + 1e6);
            vm.stopPrank();
        }
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.OutstandingCash.selector);
        fac.endAgreement();
        uint256 cash = fac.accountedCash();
        vm.prank(alice);
        fac.withdrawCash(cash);
        vm.prank(alice);
        fac.endAgreement();
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.Ended.selector);
        fac.fund(1);
    }

    function test_PublicRecoveryExactEqualityBoundary() public {
        vm.prank(alice);
        fac.requestRepayment(1);
        uint64 due = fac.publicRecoveryDeadline();
        assertEq(due, fac.recallDeadline());
        DirectFacilityLens.Snapshot memory snap = directLens.snapshot(address(fac));
        assertEq(snap.effectiveDue, due);
        assertEq(uint256(snap.recall), uint256(DirectFacilityLens.Recall.IN_WINDOW));

        vm.warp(due);
        snap = directLens.snapshot(address(fac));
        assertEq(uint256(snap.debtState), uint256(DirectFacilityLens.DebtState.OVERDUE));
        assertEq(uint256(snap.recall), uint256(DirectFacilityLens.Recall.IN_WINDOW));
        vm.prank(carol);
        vm.expectRevert();
        fac.recoverVenue(1, 1);
        musdc.mint(bob, 1e6);
        vm.startPrank(bob);
        musdc.approve(address(fac), 1e6);
        fac.repayAssets(1e6);
        vm.stopPrank();

        vm.warp(uint256(due) + 1);
        snap = directLens.snapshot(address(fac));
        assertEq(uint256(snap.recall), uint256(DirectFacilityLens.Recall.RECOVERY_OPEN));
        vm.prank(carol);
        fac.repayFromVault(type(uint256).max);
    }

    function test_RecallAloneDoesNotSettle() public {
        vm.prank(alice);
        fac.requestRepayment(1);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.SettlementClosed.selector);
        fac.settleDefault();
        uint256 posted = fac.collateralPosted();
        assertGt(posted, 0);
        assertEq(mweth.balanceOf(alice), 0);
    }

    function test_PauseDoesNotBlockRepay() public {
        DirectCreditFacility fac2 = _createAccepted(alice, carol);
        _fundLender(fac2, alice, 500e6);
        vm.prank(carol);
        fac2.borrow(50e6, type(uint256).max, block.timestamp + 1);
        vm.prank(alice);
        fac2.pauseNewBorrowing();
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.LenderPaused.selector);
        fac2.borrow(1, type(uint256).max, block.timestamp + 1);
        musdc.mint(carol, 50e6);
        vm.startPrank(carol);
        musdc.approve(address(fac2), 50e6);
        fac2.repayAssets(50e6);
        vm.stopPrank();
        vm.prank(alice);
        fac2.resumeNewBorrowing();
        vm.prank(carol);
        fac2.borrow(50e6, type(uint256).max, block.timestamp + 1);
    }
}
