// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";
import {IDirectCreditFacility} from "../../../src/v2/direct/interfaces/IDirectCreditFacility.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {InterestMath} from "../../../src/v2/libraries/InterestMath.sol";

contract BorrowingAndInterestTest is DirectFixture {
    function setUp() public {
        _deployDirectStack();
    }

    function test_FixedAprAccrualAndFullRepay() public {
        DirectCreditFacility fac = _createAccepted(alice, bob);
        _fundLender(fac, alice, 5_000e6);
        vm.prank(bob);
        fac.borrow(1_000e6, type(uint256).max, block.timestamp + 1);
        uint256 start = fac.currentDebt();
        vm.warp(block.timestamp + 365 days);
        uint256 grown = fac.currentDebt();
        assertGt(grown, start);
        uint256 expectedIndex = InterestMath.projectIndex(InterestMath.RAY, DIRECT_APR, 1, 1 + 365 days);
        assertGt(expectedIndex, InterestMath.RAY);
        musdc.mint(bob, grown + 10e6);
        vm.startPrank(bob);
        musdc.approve(address(fac), grown + 10e6);
        fac.repayAll(grown + 10e6);
        vm.stopPrank();
        assertEq(fac.currentDebt(), 0);
        assertEq(fac.debtShares(), 0);
    }

    function test_ZeroAprNoGrowth() public {
        IDirectCreditFacility.Terms memory t = _terms(alice, bob);
        t.aprRay = 0;
        DirectCreditFacility fac = _create(alice, t);
        _accept(fac, bob);
        _postCollateral(fac, bob, 1 ether);
        _fundLender(fac, alice, 1_000e6);
        vm.prank(bob);
        fac.borrow(100e6, type(uint256).max, block.timestamp + 1);
        uint256 d0 = fac.currentDebt();
        vm.warp(block.timestamp + 30 days);
        assertEq(fac.currentDebt(), d0);
    }

    function test_InterestMayExceedCapBlocksBorrowNotRepay() public {
        IDirectCreditFacility.Terms memory t = _terms(alice, bob);
        t.creditLimit = 100e6;
        t.aprRay = InterestMath.RAY;
        DirectCreditFacility fac = _create(alice, t);
        _accept(fac, bob);
        _postCollateral(fac, bob, 1 ether);
        _fundLender(fac, alice, 200e6);
        vm.prank(bob);
        fac.borrow(100e6, type(uint256).max, block.timestamp + 1);
        vm.warp(block.timestamp + 30 days);
        assertGt(fac.currentDebt(), fac.creditLimit());
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.LimitExceeded.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
        uint256 debt = fac.currentDebt();
        musdc.mint(carol, debt + 1e6);
        vm.startPrank(carol);
        musdc.approve(address(fac), debt + 1e6);
        fac.repayAll(debt + 1e6);
        vm.stopPrank();
        assertEq(fac.currentDebt(), 0);
    }

    function test_RepayFromVault() public {
        DirectCreditFacility fac = _createAccepted(alice, bob);
        _fundLender(fac, alice, 1_000e6);
        vm.prank(bob);
        fac.borrow(400e6, type(uint256).max, block.timestamp + 1);
        vm.prank(bob);
        fac.repayFromVault(400e6);
        assertEq(BorrowerVaultV2(fac.vault()).idleLoan(), 0);
        assertEq(fac.currentDebt(), 0);
    }

    function test_MixedRolesAndPoolIsolation() public {
        DirectCreditFacility lend = _createAccepted(bob, carol);
        DirectCreditFacility borrow = _createAccepted(alice, bob);
        uint256 poolCash = restricted.accountedCash();
        _fundLender(lend, bob, 800e6);
        _fundLender(borrow, alice, 800e6);
        vm.prank(carol);
        lend.borrow(100e6, type(uint256).max, block.timestamp + 1);
        vm.prank(bob);
        borrow.borrow(100e6, type(uint256).max, block.timestamp + 1);
        assertEq(restricted.accountedCash(), poolCash);
        assertEq(lend.lender(), bob);
        assertEq(borrow.borrower(), bob);
    }

    function test_ThirdPartyRepayDoesNotGrantRights() public {
        DirectCreditFacility fac = _createAccepted(alice, bob);
        _fundLender(fac, alice, 500e6);
        vm.prank(bob);
        fac.borrow(200e6, type(uint256).max, block.timestamp + 1);
        musdc.mint(carol, 200e6);
        vm.startPrank(carol);
        musdc.approve(address(fac), 200e6);
        fac.repayAssets(200e6);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.withdrawCash(1);
        vm.stopPrank();
    }
}
