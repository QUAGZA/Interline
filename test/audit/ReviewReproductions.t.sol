// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// A01 exact-collateral bonus and A03 pooled-cap cases are regression tests of the fixes.
// Remaining AUDIT_* tests still assert unrepaired defective behavior.
import {RestrictedFixture} from "../v2/fixtures/RestrictedFixture.sol";
import {BorrowerVaultV2} from "../../src/v2/BorrowerVaultV2.sol";
import {LendingMarket} from "../../src/v2/LendingMarket.sol";
import {LiquidationMath} from "../../src/v2/libraries/LiquidationMath.sol";
import {PriceMath} from "../../src/v2/libraries/PriceMath.sol";
import {IMarketOracle} from "../../src/v2/interfaces/IMarketOracle.sol";

contract PoolAuditReproductions is RestrictedFixture {
    function setUp() public { _deployRestricted(); }

    function test_AUDIT_ExactCollateralSeizesMoreThanFivePercentBonus() public {
        _fund(alice, 10_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 10_000e6, 0);
        _supply(alice, 10_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_400e6);
        wethFeed.setAnswer(1_550e8);
        uint256 beforeLoan = musdc.balanceOf(carol);
        vm.prank(carol);
        market.liquidate(bob, 0, 1 ether, type(uint256).max, 0);
        uint256 paid = beforeLoan - musdc.balanceOf(carol);
        uint256 seized = mweth.balanceOf(carol);
        assertEq(paid, 1_400e6);
        assertEq(market.debtSharesOf(bob), 0);
        assertLt(seized, 1 ether);
        assertGt(market.collateralOf(bob), 0);
        IMarketOracle.Quote memory oq = oracle.quote();
        uint256 seizedValue = PriceMath.collateralValueLoan(seized, oq.quoteScale36);
        assertLe(seizedValue, LiquidationMath.maxSeizedValueLoan(paid, oq.quoteScale36, 500, true));
        uint256 residual = market.collateralOf(bob);
        uint256 bobWethBefore = mweth.balanceOf(bob);
        vm.prank(bob);
        market.removeCollateral(residual);
        assertEq(market.collateralOf(bob), 0);
        assertEq(mweth.balanceOf(bob), bobWethBefore + residual);
    }

    function test_AUDIT_CuratorChangesCapWithoutBorrowerConsent() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 salt = keccak256("unilateral");
        bytes32 digest = restricted.hashCapProposal(bob, 10e6, 0, expiry, salt);
        vm.startPrank(curator);
        restricted.proposeCap(bob, digest, 0, expiry);
        restricted.approveCap(bob, digest);
        vm.expectRevert(LendingMarket.CapNotApproved.selector);
        restricted.executeCap(bob, 10e6, 0, expiry, salt);
        vm.stopPrank();
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
    }

    function test_AUDIT_SiblingProposalExecutesAfterNonceConsumed() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 digestA = restricted.hashCapProposal(bob, 30_000e6, 0, expiry, a);
        bytes32 digestB = restricted.hashCapProposal(bob, 40_000e6, 0, expiry, b);
        vm.startPrank(bob);
        restricted.proposeCap(bob, digestA, 0, expiry);
        restricted.proposeCap(bob, digestB, 0, expiry);
        restricted.approveCap(bob, digestB);
        vm.stopPrank();
        vm.prank(curator);
        restricted.approveCap(bob, digestB);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 30_000e6, 0, expiry, a);
        vm.prank(bob);
        restricted.executeCap(bob, 40_000e6, 0, expiry, b);
        assertEq(restricted.capNonce(bob), 1);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, b);
        assertEq(restricted.positionCapOf(bob), 40_000e6);
        assertEq(restricted.capNonce(bob), 1);
    }

    function test_AUDIT_RecoveryCapsRemainingLiabilityAndReleasesSurplus() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 10_000e6, 1 ether, 1_400e6);
        uint256 idle = vault.idleLoan();
        _writeOffBob(vault);
        uint256 obligation = restricted.recoveryObligation(bob);
        uint256 written = restricted.writtenOffLiability(bob);
        uint256 episode = escrow.latestEpisodeOf(address(restricted), bob);
        assertGt(idle, obligation);
        assertEq(written, obligation);
        assertEq(escrow.remainingRecoverable(episode), obligation);
        assertFalse(restricted.entryBlocked());

        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.ObligationBlocksEntry.selector);
        vault.enterVenue(1e6, 0);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.ObligationBlocksEntry.selector);
        vault.swap(address(musdc), address(mweth), 1e6, 0, block.timestamp + 1);

        vault.recoverIdleToEscrow();
        assertEq(escrow.claimable(episode, alice), obligation);
        assertEq(restricted.recoveryObligation(bob), 0);
        assertEq(restricted.writtenOffLiability(bob), written);
        assertEq(restricted.recoveredLiability(bob), obligation);
        assertTrue(restricted.isDefaulted(bob));
        assertEq(vault.idleLoan(), idle - obligation);
        assertEq(escrow.remainingRecoverable(episode), 0);

        uint256 surplus = vault.idleLoan();
        vm.prank(bob);
        vault.releaseSurplus(address(musdc), surplus);
        assertEq(musdc.balanceOf(bob), surplus);

        musdc.mint(address(vault), 10e6);
        vm.prank(bob);
        vault.releaseSurplus(address(musdc), 10e6);
        assertEq(musdc.balanceOf(bob), surplus + 10e6);

        vm.expectRevert(BorrowerVaultV2.NotDefaulted.selector);
        vault.recoverIdleToEscrow();
    }
}
