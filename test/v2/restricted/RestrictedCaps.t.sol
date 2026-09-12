// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "../fixtures/RestrictedFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";

contract RestrictedCapsTest is RestrictedFixture {
    bytes32 private constant _CAP_TYPEHASH = keccak256(
        "CapProposal(address market,address owner,address curator,uint256 curatorEpoch,uint256 newCap,uint256 nonce,uint256 expiry,bytes32 salt)"
    );

    function setUp() public {
        _deployRestricted();
    }

    function test_DefaultRestrictedCeiling() public {
        _openRestrictedBorrow(alice, bob, 100_000e6, 20 ether, 25_000e6);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.PositionCapExceeded.selector);
        restricted.borrow(10e6, type(uint256).max);
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
    }

    function test_Eip712DigestMatchesDomain() public {
        uint256 newCap = 40_000e6;
        uint256 nonce = restricted.capNonce(bob);
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("salt");
        bytes32 expected = _digest(bob, newCap, nonce, expiry, salt, curator, restricted.curatorEpoch());
        assertEq(restricted.hashCapProposal(bob, newCap, nonce, expiry, salt), expected);
    }

    function test_ProposeDoesNotChangeCap() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = bytes32(uint256(7));
        vm.prank(bob);
        restricted.proposeCap(bob, 40_000e6, 0, expiry, salt);
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
        assertTrue(restricted.capProposed(restricted.hashCapProposal(bob, 40_000e6, 0, expiry, salt)));
    }

    function test_ExecuteAfterCuratorApproveRaisesCap() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 100_000e6, 20 ether, 25_000e6);
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("raise");
        uint256 newCap = 27_000e6;
        vm.prank(bob);
        restricted.proposeCap(bob, newCap, 0, expiry, salt);
        bytes32 digest = restricted.hashCapProposal(bob, newCap, 0, expiry, salt);
        vm.prank(curator);
        restricted.approveCap(digest);
        restricted.executeCap(bob, newCap, 0, expiry, salt);
        assertEq(restricted.positionCapOf(bob), newCap);
        assertEq(restricted.capNonce(bob), 1);
        vm.prank(bob);
        restricted.borrow(2_000e6, type(uint256).max);
        assertEq(musdc.balanceOf(address(vault)), 27_000e6);
    }

    function test_WalletModeRejectsHashedCap() public {
        vm.prank(alice);
        vm.expectRevert(LendingMarket.WalletMode.selector);
        market.proposeCap(alice, 1_000e6, 0, block.timestamp + 1 days, bytes32(uint256(1)));
    }

    function test_ExpiredProposalCannotExecute() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 salt = keccak256("exp");
        vm.prank(bob);
        restricted.proposeCap(bob, 40_000e6, 0, expiry, salt);
        bytes32 digest = restricted.hashCapProposal(bob, 40_000e6, 0, expiry, salt);
        vm.prank(curator);
        restricted.approveCap(digest);
        vm.warp(expiry + 1);
        vm.expectRevert(LendingMarket.Expired.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, salt);
    }

    function test_ReplayAfterExecuteFails() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("once");
        vm.prank(bob);
        restricted.proposeCap(bob, 30_000e6, 0, expiry, salt);
        bytes32 digest = restricted.hashCapProposal(bob, 30_000e6, 0, expiry, salt);
        vm.prank(curator);
        restricted.approveCap(digest);
        restricted.executeCap(bob, 30_000e6, 0, expiry, salt);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 30_000e6, 0, expiry, salt);
    }

    function test_CuratorEpochInvalidatesPendingProposal() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("epoch");
        vm.prank(bob);
        restricted.proposeCap(bob, 40_000e6, 0, expiry, salt);
        bytes32 digest = restricted.hashCapProposal(bob, 40_000e6, 0, expiry, salt);
        vm.prank(curator);
        restricted.approveCap(digest);
        address next = makeAddr("market-curator-2");
        vm.prank(curator);
        restricted.transferCurator(next);
        vm.prank(next);
        restricted.acceptCurator();
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, salt);
    }

    function test_StrangerCannotPropose() public {
        vm.prank(carol);
        vm.expectRevert(LendingMarket.NotCurator.selector);
        restricted.proposeCap(bob, 40_000e6, 0, block.timestamp + 1 days, bytes32(uint256(2)));
    }

    function _digest(
        address owner,
        uint256 newCap,
        uint256 nonce,
        uint256 expiry,
        bytes32 salt,
        address curator_,
        uint256 epoch
    ) internal view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(_CAP_TYPEHASH, address(restricted), owner, curator_, epoch, newCap, nonce, expiry, salt));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("InterlineLendingMarket")),
                keccak256(bytes("2")),
                block.chainid,
                address(restricted)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }
}
