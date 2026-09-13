// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";
import {IDirectCreditFacility} from "../../../src/v2/direct/interfaces/IDirectCreditFacility.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";

contract CreationAndAcceptanceTest is DirectFixture {
    function setUp() public {
        _deployDirectStack();
    }

    function test_AliceOfferBobPendingCannotFundOrBorrow() public {
        DirectCreditFacility fac = _create(alice, _terms(alice, bob));
        assertTrue(fac.lenderAccepted());
        assertFalse(fac.borrowerAccepted());
        musdc.mint(alice, 1_000e6);
        vm.startPrank(alice);
        musdc.approve(address(fac), 1_000e6);
        vm.expectRevert(DirectCreditFacility.NotBothAccepted.selector);
        fac.fund(1_000e6);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.NotBothAccepted.selector);
        fac.borrow(1, type(uint256).max, block.timestamp + 1);
    }

    function test_BobAcceptsCarolCannot() public {
        DirectCreditFacility fac = _create(alice, _terms(alice, bob));
        bytes32 hash = fac.termsHash();
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.acceptTerms(hash);
        vm.prank(bob);
        fac.acceptTerms(hash);
        assertGt(fac.activatedAt(), 0);
    }

    function test_BobCreatesBorrowRequestCarolAcceptsAsLender() public {
        DirectCreditFacility fac = _create(bob, _terms(carol, bob));
        assertTrue(fac.borrowerAccepted());
        assertFalse(fac.lenderAccepted());
        _accept(fac, carol);
        assertEq(fac.lender(), carol);
        assertEq(fac.borrower(), bob);
        assertGt(fac.activatedAt(), 0);
    }

    function test_RejectsZeroSelfAndCorruptParties() public {
        IDirectCreditFacility.Terms memory t = _terms(alice, bob);
        t.lender = address(0);
        vm.prank(bob);
        vm.expectRevert();
        directFactory.createFacility(t);
        t = _terms(alice, alice);
        vm.prank(alice);
        vm.expectRevert();
        directFactory.createFacility(t);
        t = _terms(alice, bob);
        vm.prank(carol);
        vm.expectRevert();
        directFactory.createFacility(t);
    }

    function test_CancelDeclineExpiry() public {
        DirectCreditFacility fac = _create(alice, _terms(alice, bob));
        bytes32 hash = fac.termsHash();
        vm.prank(alice);
        fac.cancelPending();
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.AlreadyDecided.selector);
        fac.acceptTerms(hash);

        DirectCreditFacility fac2 = _create(alice, _terms(alice, bob));
        bytes32 hash2 = fac2.termsHash();
        vm.prank(bob);
        fac2.decline();
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.AlreadyDecided.selector);
        fac2.acceptTerms(hash2);

        DirectCreditFacility fac3 = _create(alice, _terms(alice, bob));
        bytes32 hash3 = fac3.termsHash();
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(bob);
        vm.expectRevert(DirectCreditFacility.RequestExpired.selector);
        fac3.acceptTerms(hash3);
    }

    function test_VaultBoundAtomicallyNoSetLine() public {
        DirectCreditFacility fac = _createAccepted(alice, bob);
        BorrowerVaultV2 vault = BorrowerVaultV2(fac.vault());
        assertEq(vault.owner(), bob);
        assertEq(address(vault.market()), address(fac));
        (bool ok,) = address(vault).call(abi.encodeWithSignature("setLine(address)", address(1)));
        assertFalse(ok);
    }

    function test_ContractWalletPartySupported() public {
        DirectCreditFacility fac = _create(alice, _terms(alice, address(this)));
        fac.acceptTerms(fac.termsHash());
        assertGt(fac.activatedAt(), 0);
    }
}
