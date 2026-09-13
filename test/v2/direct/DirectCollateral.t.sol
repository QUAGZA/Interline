// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";

contract DirectCollateralTest is DirectFixture {
    DirectCreditFacility internal fac;

    function setUp() public {
        _deployDirectStack();
        fac = _create(alice, _terms(alice, bob));
        _accept(fac, bob);
        _fundLender(fac, alice, 5_000e6);
    }

    function test_BorrowWithoutCollateralReverts() public {
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.InsufficientCollateral.selector);
        fac.borrow(10e6, type(uint256).max, block.timestamp + 1);
    }

    function test_BorrowCappedAtEightyPercentOfCollateral() public {
        _postCollateral(fac, bob, 1 ether);
        vm.startPrank(bob);
        fac.borrow(1_600e6, type(uint256).max, block.timestamp + 1);
        vm.expectRevert(DirectCreditFacility.InsufficientCollateral.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
        vm.stopPrank();
        assertEq(fac.currentDebt(), 1_600e6);
        assertEq(fac.availableToBorrow(), 0);
    }

    function test_RemoveCollateralKeepsEightyPercentLtv() public {
        _postCollateral(fac, bob, 2 ether);
        vm.prank(bob);
        fac.borrow(1_600e6, type(uint256).max, block.timestamp + 1);
        vm.prank(bob);
        fac.removeCollateral(1 ether);
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.InsufficientCollateral.selector);
        fac.removeCollateral(1);
    }

    function test_SettleDefaultAfterMaturityReturnsResidual() public {
        _postCollateral(fac, bob, 1 ether);
        vm.prank(bob);
        fac.borrow(400e6, type(uint256).max, block.timestamp + 1);
        uint64 due = fac.publicRecoveryDeadline();
        vm.warp(due);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.SettlementClosed.selector);
        fac.settleDefault();
        vm.warp(uint256(due) + 1);
        _refreshOracle();
        (uint256 seize, uint256 residual,) = fac.previewSettlement();
        uint256 lenderBefore = mweth.balanceOf(alice);
        vm.prank(dave);
        fac.settleDefault();
        assertEq(fac.currentDebt(), 0);
        assertEq(fac.collateralPosted(), 0);
        assertEq(mweth.balanceOf(alice), lenderBefore + seize);
        assertEq(mweth.balanceOf(bob), residual);
    }

    function test_SettleDefaultUndercollateralizedLeavesDebt() public {
        _postCollateral(fac, bob, 1 ether);
        vm.prank(bob);
        fac.borrow(1_600e6, type(uint256).max, block.timestamp + 1);
        uint64 due = fac.publicRecoveryDeadline();
        vm.warp(uint256(due) + 1);
        usdcFeed.setAnswer(1e8);
        wethFeed.setAnswer(1_000e8);
        uint256 debtBefore = fac.currentDebt();
        (uint256 seize, uint256 residual, uint256 credit) = fac.previewSettlement();
        assertEq(seize, 1 ether);
        assertEq(residual, 0);
        assertLt(credit, debtBefore);
        vm.prank(carol);
        fac.settleDefault();
        assertEq(fac.collateralPosted(), 0);
        assertEq(mweth.balanceOf(alice), 1 ether);
        assertGt(fac.currentDebt(), 0);
        assertLt(fac.currentDebt(), debtBefore);
    }

    function test_SettleDefaultOracleInvalidReverts() public {
        _postCollateral(fac, bob, 1 ether);
        vm.prank(bob);
        fac.borrow(100e6, type(uint256).max, block.timestamp + 1);
        vm.warp(uint256(fac.publicRecoveryDeadline()) + 1);
        wethFeed.setRevert(true);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.OracleInvalid.selector);
        fac.settleDefault();
    }
}
