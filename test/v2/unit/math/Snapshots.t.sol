// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SupplyShareSnapshots} from "../../../../src/v2/libraries/SupplyShareSnapshots.sol";

contract SnapshotHarness {
    using SupplyShareSnapshots for SupplyShareSnapshots.Store;

    SupplyShareSnapshots.Store internal store;
    mapping(address => uint256) public live;
    uint256 public liveTotal;

    function snapshot() external returns (uint256) {
        return store.snapshot();
    }

    function currentId() external view returns (uint256) {
        return store.currentId();
    }

    function mint(address account, uint256 amount) external {
        store.writeAccount(account, live[account]);
        store.writeTotal(liveTotal);
        live[account] += amount;
        liveTotal += amount;
    }

    function burn(address account, uint256 amount) external {
        store.writeAccount(account, live[account]);
        store.writeTotal(liveTotal);
        live[account] -= amount;
        liveTotal -= amount;
    }

    function sharesAt(address account, uint256 id) external view returns (uint256) {
        return store.sharesAt(account, id, live[account]);
    }

    function totalAt(uint256 id) external view returns (uint256) {
        return store.totalAt(id, liveTotal);
    }
}

contract SupplyShareSnapshotsTest is Test {
    SnapshotHarness internal h;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        h = new SnapshotHarness();
    }

    function test_LazyFallbackAndExactId() public {
        h.mint(alice, 100);
        h.mint(bob, 50);
        uint256 id1 = h.snapshot();
        assertEq(id1, 1);

        assertEq(h.sharesAt(alice, 1), 100);
        assertEq(h.sharesAt(bob, 1), 50);
        assertEq(h.totalAt(1), 150);

        h.mint(alice, 20);
        assertEq(h.live(alice), 120);
        assertEq(h.sharesAt(alice, 1), 100);
        assertEq(h.sharesAt(bob, 1), 50);
        assertEq(h.totalAt(1), 150);

        uint256 id2 = h.snapshot();
        assertEq(id2, 2);
        h.mint(bob, 10);

        assertEq(h.sharesAt(bob, 1), 50);
        assertEq(h.sharesAt(bob, 2), 50);
        assertEq(h.live(bob), 60);
        assertEq(h.sharesAt(alice, 2), 120);
        assertEq(h.totalAt(2), 170);
        assertEq(h.totalAt(1), 150);
    }

    function test_DoubleWriteKeepsFirstValue() public {
        h.mint(alice, 10);
        uint256 id = h.snapshot();
        h.mint(alice, 5);
        h.mint(alice, 7);
        assertEq(h.sharesAt(alice, id), 10);
        assertEq(h.live(alice), 22);
    }

    function test_WriteBeforeSnapshotIsNoop() public {
        h.mint(alice, 3);
        uint256 id = h.snapshot();
        assertEq(h.sharesAt(alice, id), 3);
    }

    function test_SnapshotZeroReverts() public {
        h.snapshot();
        vm.expectRevert(SupplyShareSnapshots.SnapshotZero.selector);
        h.sharesAt(alice, 0);
    }

    function test_SnapshotTooNewReverts() public {
        h.snapshot();
        vm.expectRevert(SupplyShareSnapshots.SnapshotTooNew.selector);
        h.sharesAt(alice, 2);
    }

    function test_BetweenCheckpointsUsesNextStored() public {
        h.mint(alice, 1);
        h.snapshot();
        h.mint(alice, 1);
        h.snapshot();
        h.snapshot();
        h.mint(alice, 1);
        assertEq(h.sharesAt(alice, 1), 1);
        assertEq(h.sharesAt(alice, 2), 2);
        assertEq(h.sharesAt(alice, 3), 2);
        assertEq(h.live(alice), 3);
    }
}
