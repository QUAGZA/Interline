// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
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
        assertGt(restricted.writtenOffLiability(bob), 0);
        assertEq(musdc.balanceOf(bob), 0);

        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.LiabilityOutstanding.selector);
        vault.releaseSurplus(address(musdc), 1);

        vault.recoverIdleToEscrow();
        assertEq(vault.idleLoan(), 0);
        assertEq(musdc.balanceOf(bob), 0);
        assertEq(musdc.balanceOf(address(escrow)), vaultIdle);

        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        uint256 claimable = escrow.claimable(episodeId, alice);
        assertEq(claimable, vaultIdle);
        vm.prank(alice);
        escrow.claim(episodeId);
        assertEq(musdc.balanceOf(alice), vaultIdle);
        vm.prank(alice);
        vm.expectRevert(MarketRecoveryEscrow.NothingToClaim.selector);
        escrow.claim(episodeId);
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
        uint256 recovered = vault.idleLoan();
        _writeOffBob(vault);
        vault.recoverIdleToEscrow();
        uint256 episodeId = escrow.latestEpisodeOf(address(restricted), bob);
        uint256 alicePay = escrow.claimable(episodeId, alice);
        uint256 davePay = escrow.claimable(episodeId, dave);
        assertEq(alicePay, recovered / 2);
        assertEq(davePay, recovered / 2);
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
}
