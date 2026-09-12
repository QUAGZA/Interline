// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {BorrowerVaultFactory} from "../../../src/v2/BorrowerVaultFactory.sol";
import {ERC4626VenueAdapter} from "../../../src/v2/adapters/ERC4626VenueAdapter.sol";
import {MockERC4626Venue} from "../../../src/v2/mocks/MockERC4626Venue.sol";
import {MockSwapRouter} from "../../../src/v2/mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RestrictedVaultTest is RestrictedFixture {
    function setUp() public {
        _deployRestricted();
    }

    function test_ConstructorBoundNoSetLine() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        (bool ok,) = address(vault).call(
            abi.encodeWithSignature(
                "setLine(address,address[],address[])", address(restricted), new address[](0), new address[](0)
            )
        );
        assertFalse(ok);
        assertEq(vault.owner(), bob);
        assertEq(address(vault.market()), address(restricted));
        assertEq(address(vault.loanToken()), address(musdc));
        assertEq(address(vault.otherToken()), address(mweth));
    }

    function test_RejectsArbitraryCallAndEth() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        (bool ok, bytes memory data) = address(vault).call{value: 1}("");
        assertFalse(ok);
        (ok, data) = address(vault).call(abi.encodeWithSignature("execute(address,bytes)", address(1), bytes("0x")));
        assertFalse(ok);
        assertEq(bytes4(data), BorrowerVaultV2.NoArbitraryCall.selector);
        (ok, data) = vault.adapter().call(abi.encodeWithSignature("execute(address,bytes)", address(1), bytes("0x")));
        assertFalse(ok);
        assertEq(bytes4(data), ERC4626VenueAdapter.NoArbitraryCall.selector);
    }

    function test_TypedSwapAndReverseUnwind() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 2_000e6);
        vm.prank(bob);
        uint256 wethOut = vault.swap(address(musdc), address(mweth), 2_000e6, 1 ether, block.timestamp + 60);
        assertEq(wethOut, 1 ether);
        assertEq(mweth.balanceOf(address(vault)), 1 ether);
        assertEq(musdc.allowance(address(vault), vault.swapRouter()), 0);
        vm.prank(bob);
        uint256 usdcOut = vault.swap(address(mweth), address(musdc), 1 ether, 2_000e6, block.timestamp + 60);
        assertEq(usdcOut, 2_000e6);
        assertEq(vault.idleLoan(), 2_000e6);
    }

    function test_UntypedSwapReverts() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.UntypedPair.selector);
        vault.swap(address(musdc), address(junk), 100e6, 0, block.timestamp + 1);
    }

    function test_SwapDeadlineAndMinOut() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 2_000e6);
        vm.prank(bob);
        vm.expectRevert(MockSwapRouter.Expired.selector);
        vault.swap(address(musdc), address(mweth), 2_000e6, 0, block.timestamp - 1);
        vm.prank(bob);
        vm.expectRevert(MockSwapRouter.Slippage.selector);
        vault.swap(address(musdc), address(mweth), 2_000e6, 2 ether, block.timestamp + 1);
    }

    function test_VenuePauseBlocksEntryAllowsExit() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.enterVenue(400e6, 0);
        assertEq(musdc.allowance(address(vault), vault.adapter()), 0);
        venue.setPaused(true);
        vm.prank(bob);
        vm.expectRevert(MockERC4626Venue.Paused.selector);
        vault.enterVenue(10e6, 0);
        vm.prank(bob);
        vault.exitVenue(100e6, type(uint256).max);
        assertGt(vault.idleLoan(), 600e6);
    }

    function test_FailedVenueExitDoesNotSeizeTokens() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.enterVenue(500e6, 0);
        venue.setExitsBlocked(true);
        vm.prank(bob);
        vm.expectRevert(MockERC4626Venue.FailedExit.selector);
        vault.exitVenue(100e6, type(uint256).max);
        vm.prank(bob);
        vault.repay(400e6);
        assertLt(restricted.positionDebt(bob), 1_000e6);
    }

    function test_RedeemVenueAndResidualAllowance() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.enterVenue(400e6, 0);
        uint256 shares = vault.venueShares();
        vm.prank(bob);
        vault.redeemVenue(shares, 0);
        assertEq(vault.venueShares(), 0);
        assertEq(IERC20(address(venue)).allowance(address(vault), vault.adapter()), 0);
        assertEq(vault.idleLoan(), 1_000e6);
    }

    function test_AdapterOnlyVault() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        ERC4626VenueAdapter ad = ERC4626VenueAdapter(vault.adapter());
        vm.prank(bob);
        vm.expectRevert(ERC4626VenueAdapter.NotVault.selector);
        ad.deposit(1e6, 0);
    }

    function test_SurplusAfterDebtCleared() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        vm.prank(bob);
        vault.repay(1_000e6);
        assertEq(restricted.positionDebt(bob), 0);
        musdc.mint(address(vault), 5e6);
        vm.prank(bob);
        vault.releaseSurplus(address(musdc), 5e6);
        assertEq(musdc.balanceOf(bob), 5e6);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultV2.UntypedToken.selector);
        vault.releaseSurplus(address(junk), 1);
    }

    function test_OwnerCanPreCreateVaultStrangerCannot() public {
        vm.prank(carol);
        vm.expectRevert(BorrowerVaultFactory.NotMarket.selector);
        vaultFactory.createVault(address(restricted), bob);
        vm.prank(bob);
        address created = vaultFactory.createVault(address(restricted), bob);
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 1_000e6);
        assertEq(address(vault), created);
        assertEq(musdc.balanceOf(created), 1_000e6);
    }

    function test_WrongFactoryAndWalletModeRejected() public {
        BorrowerVaultFactory other = new BorrowerVaultFactory(address(venue), address(router), address(mweth));
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultFactory.WrongFactory.selector);
        other.createVault(address(restricted), bob);
        vm.prank(bob);
        vm.expectRevert(BorrowerVaultFactory.WrongMode.selector);
        vaultFactory.createVault(address(market), bob);
    }

    function test_PublicUnwindSwapAfterDeadline() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 50_000e6, 20 ether, 2_000e6);
        vm.prank(bob);
        vault.swap(address(musdc), address(mweth), 2_000e6, 0, block.timestamp + 1);
        vm.prank(guardian);
        restricted.startRecall("incident");
        vm.warp(block.timestamp + 301);
        uint256 wethBal = mweth.balanceOf(address(vault));
        vm.prank(carol);
        vault.publicUnwindSwap(wethBal, 0, block.timestamp + 1);
        assertEq(mweth.balanceOf(address(vault)), 0);
        assertLt(restricted.positionDebt(bob), 2_000e6);
        assertEq(musdc.balanceOf(carol), 0);
    }
}
