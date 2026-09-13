// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../v2/fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../src/v2/direct/DirectCreditFacility.sol";
import {IDirectCreditFacility} from "../../src/v2/direct/interfaces/IDirectCreditFacility.sol";
import {DirectFacilityLens} from "../../src/v2/direct/DirectFacilityLens.sol";
import {BorrowerVaultV2} from "../../src/v2/BorrowerVaultV2.sol";
import {IMarketOracle} from "../../src/v2/interfaces/IMarketOracle.sol";

contract DirectAuditReproductions is DirectFixture {
    function setUp() public {
        _deployDirectStack();
    }

    function test_AUDIT_RecallCanDelayEarlierMaturityRecovery() public {
        IDirectCreditFacility.Terms memory t = _terms(alice, bob);
        t.borrowPeriod = 1 days;
        DirectCreditFacility fac = _create(alice, t);
        _accept(fac, bob);
        _postCollateral(fac, bob, 1 ether);
        _fundLender(fac, alice, 1_000e6);
        vm.prank(bob);
        fac.borrow(500e6, type(uint256).max, block.timestamp + 100);
        BorrowerVaultV2 vault = BorrowerVaultV2(fac.vault());
        vm.prank(bob);
        vault.enterVenue(500e6, 0);
        uint256 maturity = fac.repaymentDueAt();
        vm.warp(maturity - 100);
        vm.prank(alice);
        fac.requestRepayment(1);

        uint64 due = fac.publicRecoveryDeadline();
        assertEq(due, maturity);
        assertEq(fac.recallDeadline(), due);
        DirectFacilityLens.Snapshot memory snap = directLens.snapshot(address(fac));
        assertEq(snap.recallDeadline, due);
        assertEq(snap.effectiveDue, due);

        vm.warp(maturity);
        assertEq(block.timestamp, due);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.recoverVenue(500e6, type(uint256).max);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.SettlementClosed.selector);
        fac.settleDefault();
        vm.prank(bob);
        vault.exitVenue(1e6, type(uint256).max);
        vm.prank(bob);
        fac.repayFromVault(1e6);

        vm.warp(maturity + 1);
        assertEq(fac.recallDeadline(), maturity);
        vm.prank(carol);
        fac.recoverVenue(499e6, type(uint256).max);
        assertLt(fac.currentDebt(), 500e6);
    }

    function test_AUDIT_PostedCollateralSettlesAfterDefault() public {
        IDirectCreditFacility.Terms memory t = _terms(alice, bob);
        t.borrowPeriod = 1 days;
        DirectCreditFacility fac = _create(alice, t);
        _accept(fac, bob);
        _postCollateral(fac, bob, 1 ether);
        _fundLender(fac, alice, 1_000e6);
        vm.prank(bob);
        fac.borrow(500e6, type(uint256).max, block.timestamp + 100);

        (address boundOracle, uint16 maxLtv, uint16 settleBps) = fac.settlementPolicy();
        assertEq(boundOracle, address(oracle));
        assertEq(maxLtv, 8000);
        assertEq(settleBps, 10_000);
        bytes32 expectedHash = keccak256(
            abi.encode(
                t.lender,
                t.borrower,
                t.loanToken,
                t.creditLimit,
                t.aprRay,
                t.borrowPeriod,
                t.recallWindow,
                t.venue,
                t.swapRouter,
                t.otherToken,
                address(oracle),
                uint16(8000),
                uint16(10_000)
            )
        );
        assertEq(fac.termsHash(), expectedHash);

        vm.prank(alice);
        fac.requestRepayment(1);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.SettlementClosed.selector);
        fac.settleDefault();

        uint64 due = fac.publicRecoveryDeadline();
        vm.warp(due);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.SettlementClosed.selector);
        fac.settleDefault();

        vm.warp(uint256(due) + 1);
        _refreshOracle();
        (uint256 seize, uint256 residual, uint256 credit) = fac.previewSettlement();
        assertGt(seize, 0);
        assertGt(residual, 0);
        assertGt(credit, 0);
        uint256 lenderBefore = mweth.balanceOf(alice);
        uint256 borrowerBefore = mweth.balanceOf(bob);
        uint256 cashBefore = fac.accountedCash();
        vm.prank(carol);
        fac.settleDefault();
        assertEq(fac.collateralPosted(), 0);
        assertEq(fac.currentDebt(), 0);
        assertEq(mweth.balanceOf(alice), lenderBefore + seize);
        assertEq(mweth.balanceOf(bob), borrowerBefore + residual);
        assertEq(fac.accountedCash(), cashBefore);
        IMarketOracle.Quote memory q = oracle.quote();
        assertEq(uint8(q.status), uint8(IMarketOracle.Status.OK));
    }
}
