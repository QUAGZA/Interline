// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";

contract FundingAndWithdrawalTest is DirectFixture {
    DirectCreditFacility internal fac;

    function setUp() public {
        _deployDirectStack();
        fac = _createAccepted(alice, bob);
    }

    function test_FundBorrowRepayWithdraw() public {
        _fundLender(fac, alice, 2_000e6);
        assertEq(fac.accountedCash(), 2_000e6);
        uint256 poolCashBefore = restricted.accountedCash();

        vm.prank(bob);
        fac.borrow(500e6, type(uint256).max, block.timestamp + 1);
        BorrowerVaultV2 vault = BorrowerVaultV2(fac.vault());
        assertEq(vault.idleLoan(), 500e6);
        assertEq(fac.accountedCash(), 1_500e6);
        assertEq(restricted.accountedCash(), poolCashBefore);

        musdc.mint(bob, 500e6);
        vm.startPrank(bob);
        musdc.approve(address(fac), 500e6);
        fac.repayAll(600e6);
        vm.stopPrank();
        assertEq(fac.currentDebt(), 0);

        vm.prank(alice);
        fac.withdrawCash(2_000e6);
        assertEq(musdc.balanceOf(alice), 2_000e6);
        assertEq(fac.accountedCash(), 0);
    }

    function test_WithdrawIdleCashWhileDebtRemains() public {
        _fundLender(fac, alice, 2_000e6);
        vm.prank(bob);
        fac.borrow(800e6, type(uint256).max, block.timestamp + 1);
        vm.prank(alice);
        fac.withdrawCash(1_200e6);
        assertEq(fac.accountedCash(), 0);
        assertGt(fac.currentDebt(), 0);
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.NoLenderCash.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
    }

    function test_DonationDoesNotIncreaseCash() public {
        _fundLender(fac, alice, 100e6);
        musdc.mint(address(fac), 50e6);
        assertEq(fac.accountedCash(), 100e6);
        vm.prank(bob);
        fac.borrow(100e6, type(uint256).max, block.timestamp + 1);
        assertEq(BorrowerVaultV2(fac.vault()).idleLoan(), 100e6);
    }

    function test_StrangerCannotFundOrWithdraw() public {
        musdc.mint(carol, 1_000e6);
        vm.startPrank(carol);
        musdc.approve(address(fac), 1_000e6);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.fund(1_000e6);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.withdrawCash(1);
        vm.stopPrank();
    }

    function test_TwoFacilitiesIsolated() public {
        DirectCreditFacility b = _createAccepted(alice, bob);
        DirectCreditFacility c = _createAccepted(alice, carol);
        _fundLender(b, alice, 1_000e6);
        _fundLender(c, alice, 400e6);
        vm.prank(bob);
        b.borrow(200e6, type(uint256).max, block.timestamp + 1);
        assertEq(c.accountedCash(), 400e6);
        assertEq(c.currentDebt(), 0);
        assertEq(b.vault() == c.vault(), false);
    }
}
