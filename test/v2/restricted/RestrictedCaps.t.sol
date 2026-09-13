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

    function test_Eip712DigestMatchesDomain() public view {
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
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
        assertEq(restricted.pendingCapDigest(bob), digest);
        assertEq(restricted.pendingCapNonce(bob), 0);
        assertEq(restricted.pendingCapExpiry(bob), expiry);
    }

    function test_ExecuteAfterBothApprovalsRaisesCap() public {
        BorrowerVaultV2 vault = _openRestrictedBorrow(alice, bob, 100_000e6, 20 ether, 25_000e6);
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("raise");
        uint256 newCap = 27_000e6;
        bytes32 digest = _propose(bob, bob, newCap, 0, expiry, salt);
        _bothApprove(bob, digest);
        vm.prank(bob);
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
        market.proposeCap(alice, bytes32(uint256(1)), 0, block.timestamp + 1 days);
    }

    function test_ExpiredProposalCannotExecute() public {
        uint256 expiry = block.timestamp + 1 days;
        bytes32 salt = keccak256("exp");
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        _bothApprove(bob, digest);
        vm.warp(expiry + 1);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.Expired.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, salt);
    }

    function test_ReplayAfterExecuteFails() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("once");
        bytes32 digest = _propose(bob, bob, 30_000e6, 0, expiry, salt);
        _bothApprove(bob, digest);
        vm.prank(bob);
        restricted.executeCap(bob, 30_000e6, 0, expiry, salt);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 30_000e6, 0, expiry, salt);
    }

    function test_CuratorEpochInvalidatesPendingProposal() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("epoch");
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        _bothApprove(bob, digest);
        address next = makeAddr("market-curator-2");
        vm.prank(curator);
        restricted.transferCurator(next);
        vm.prank(next);
        restricted.acceptCurator();
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, salt);
        assertEq(digest, _digest(bob, 40_000e6, 0, expiry, salt, curator, 0));
    }

    function test_StrangerCannotPropose() public {
        vm.prank(carol);
        vm.expectRevert(LendingMarket.NotCurator.selector);
        restricted.proposeCap(bob, bytes32(uint256(2)), 0, block.timestamp + 1 days);
    }

    function test_BorrowerOnlyCannotExecute() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("borrower-only");
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        vm.prank(bob);
        restricted.approveCap(bob, digest);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotApproved.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, salt);
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
    }

    function test_ReplacementDropsPriorSibling() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 digestA = _propose(bob, bob, 30_000e6, 0, expiry, a);
        bytes32 digestB = _propose(bob, bob, 40_000e6, 0, expiry, b);
        assertEq(restricted.pendingCapDigest(bob), digestB);
        _bothApprove(bob, digestB);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 30_000e6, 0, expiry, a);
        vm.prank(bob);
        restricted.executeCap(bob, 40_000e6, 0, expiry, b);
        assertEq(restricted.positionCapOf(bob), 40_000e6);
        assertEq(restricted.capNonce(bob), 1);
        assertEq(digestA, restricted.hashCapProposal(bob, 30_000e6, 0, expiry, a));
    }

    function test_CancelInvalidatesNonce() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("cancel");
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        vm.prank(curator);
        restricted.cancelCap(bob, digest);
        assertEq(restricted.capNonce(bob), 1);
        assertEq(restricted.pendingCapDigest(bob), bytes32(0));
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.approveCap(bob, digest);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.InvalidConfig.selector);
        restricted.proposeCap(bob, digest, 0, expiry);
    }

    function test_CapBelowLiveDebtReverts() public {
        _openRestrictedBorrow(alice, bob, 100_000e6, 20 ether, 25_000e6);
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("below-debt");
        uint256 low = 10e6;
        bytes32 digest = _propose(curator, bob, low, 0, expiry, salt);
        _bothApprove(bob, digest);
        vm.prank(curator);
        vm.expectRevert(LendingMarket.CapBelowDebt.selector);
        restricted.executeCap(bob, low, 0, expiry, salt);
        assertEq(restricted.positionCapOf(bob), RESTRICTED_CAP);
    }

    function test_WrongSaltFailsReveal() public {
        uint256 expiry = block.timestamp + 7 days;
        bytes32 salt = keccak256("real");
        bytes32 digest = _propose(bob, bob, 40_000e6, 0, expiry, salt);
        _bothApprove(bob, digest);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.CapNotProposed.selector);
        restricted.executeCap(bob, 40_000e6, 0, expiry, keccak256("other"));
    }

    function _propose(address proposer, address owner, uint256 newCap, uint256 nonce, uint256 expiry, bytes32 salt)
        internal
        returns (bytes32 digest)
    {
        digest = restricted.hashCapProposal(owner, newCap, nonce, expiry, salt);
        vm.prank(proposer);
        restricted.proposeCap(owner, digest, nonce, expiry);
    }

    function _bothApprove(address owner, bytes32 digest) internal {
        vm.prank(owner);
        restricted.approveCap(owner, digest);
        vm.prank(curator);
        restricted.approveCap(owner, digest);
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
