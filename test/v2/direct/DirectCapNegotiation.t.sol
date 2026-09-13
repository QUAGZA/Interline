// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";

contract DirectCapNegotiationTest is DirectFixture {
    DirectCreditFacility internal fac;
    bytes32 internal salt;

    function setUp() public {
        _deployDirectStack();
        fac = _createAccepted(alice, bob);
        salt = keccak256("salt");
    }

    function test_ProposeApproveExecute() public {
        uint256 newCap = 8_000e6;
        uint256 expiry = block.timestamp + 1 days;
        bytes32 digest = fac.hashCapProposal(newCap, 0, expiry, salt);
        vm.prank(alice);
        fac.proposeCap(digest, 0, expiry);
        vm.prank(alice);
        fac.approveCap(digest);
        vm.prank(bob);
        fac.approveCap(digest);
        vm.prank(alice);
        fac.executeCap(newCap, 0, expiry, salt);
        assertEq(fac.creditLimit(), newCap);
    }

    function test_WrongPartyAndBelowDebt() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 digest = fac.hashCapProposal(9_000e6, 0, expiry, salt);
        vm.prank(carol);
        vm.expectRevert(DirectCreditFacility.WrongParty.selector);
        fac.proposeCap(digest, 0, expiry);

        _fundLender(fac, alice, 5_000e6);
        vm.prank(bob);
        fac.borrow(4_000e6, type(uint256).max, block.timestamp + 1);
        uint256 low = 1_000e6;
        bytes32 d2 = fac.hashCapProposal(low, 0, expiry, salt);
        vm.prank(alice);
        fac.proposeCap(d2, 0, expiry);
        vm.prank(alice);
        fac.approveCap(d2);
        vm.prank(bob);
        fac.approveCap(d2);
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.CapBelowDebt.selector);
        fac.executeCap(low, 0, expiry, salt);
    }

    function test_CancelAndNonce() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 digest = fac.hashCapProposal(6_000e6, 0, expiry, salt);
        vm.prank(bob);
        fac.proposeCap(digest, 0, expiry);
        vm.prank(alice);
        fac.cancelCap(digest);
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.CapNotProposed.selector);
        fac.approveCap(digest);
    }

    function test_ExpiredAndWrongSalt() public {
        uint256 expiry = block.timestamp + 10;
        bytes32 digest = fac.hashCapProposal(6_000e6, 0, expiry, salt);
        vm.prank(alice);
        fac.proposeCap(digest, 0, expiry);
        vm.prank(alice);
        fac.approveCap(digest);
        vm.prank(bob);
        fac.approveCap(digest);
        vm.warp(expiry + 1);
        vm.prank(alice);
        vm.expectRevert(DirectCreditFacility.Expired.selector);
        fac.executeCap(6_000e6, 0, expiry, salt);
    }
}
