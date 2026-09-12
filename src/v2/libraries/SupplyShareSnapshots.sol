// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SupplyShareSnapshots
/// @notice ERC20Snapshot-equivalent checkpoints for recovery claims on supplier shares.
/// @dev Lazy writes: `snapshot()` increments the id; the next share mutation records
///      the pre-mutation value at that id. Unchanged accounts fall back to the live value.
///      `valueAt` uses OpenZeppelin `findUpperBound` (first stored id >= query, else live).
///      Off-chain twin: `packages/math` `valueAt` / `writeCheckpoint`.
library SupplyShareSnapshots {
    struct Snapshots {
        uint256[] ids;
        uint256[] values;
    }

    struct Store {
        uint256 currentSnapshotId;
        mapping(address => Snapshots) account;
        Snapshots total;
    }

    error SnapshotTooNew();
    error SnapshotZero();

    function snapshot(Store storage self) internal returns (uint256 id) {
        id = ++self.currentSnapshotId;
    }

    function currentId(Store storage self) internal view returns (uint256) {
        return self.currentSnapshotId;
    }

    /// @dev Call *before* mutating live shares so the pre-change value is stored at `currentId`.
    function writeAccount(Store storage self, address account_, uint256 currentValue) internal {
        _write(self.account[account_], self.currentSnapshotId, currentValue);
    }

    function writeTotal(Store storage self, uint256 currentValue) internal {
        _write(self.total, self.currentSnapshotId, currentValue);
    }

    function sharesAt(Store storage self, address account_, uint256 snapshotId, uint256 currentValue)
        internal
        view
        returns (uint256)
    {
        (bool found, uint256 value) = _valueAt(self.account[account_], snapshotId, self.currentSnapshotId);
        return found ? value : currentValue;
    }

    function totalAt(Store storage self, uint256 snapshotId, uint256 currentTotal) internal view returns (uint256) {
        (bool found, uint256 value) = _valueAt(self.total, snapshotId, self.currentSnapshotId);
        return found ? value : currentTotal;
    }

    function _write(Snapshots storage snaps, uint256 id, uint256 value) private {
        if (id == 0) return;
        uint256 len = snaps.ids.length;
        if (len != 0 && snaps.ids[len - 1] == id) return;
        snaps.ids.push(id);
        snaps.values.push(value);
    }

    function _valueAt(Snapshots storage snaps, uint256 snapshotId, uint256 current)
        private
        view
        returns (bool found, uint256 value)
    {
        if (snapshotId == 0) revert SnapshotZero();
        if (snapshotId > current) revert SnapshotTooNew();
        uint256 index = _findUpperBound(snaps.ids, snapshotId);
        if (index == snaps.ids.length) return (false, 0);
        return (true, snaps.values[index]);
    }

    /// @dev First index whose id is >= `element`, or `length` if none (OZ Arrays.findUpperBound).
    function _findUpperBound(uint256[] storage array, uint256 element) private view returns (uint256) {
        uint256 len = array.length;
        if (len == 0) return 0;
        uint256 low;
        uint256 high = len;
        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (array[mid] > element) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        if (low > 0 && array[low - 1] == element) {
            return low - 1;
        }
        return low;
    }
}
