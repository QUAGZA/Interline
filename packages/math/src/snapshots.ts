/** ERC20Snapshot-equivalent `findUpperBound` / lazy value-at. Matches `SupplyShareSnapshots.sol`. */

export function findUpperBound(ids: readonly bigint[], element: bigint): number {
  const len = ids.length;
  if (len === 0) return 0;
  let low = 0;
  let high = len;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ids[mid]! > element) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  if (low > 0 && ids[low - 1] === element) {
    return low - 1;
  }
  return low;
}

export function writeCheckpoint(
  ids: bigint[],
  values: bigint[],
  id: bigint,
  value: bigint,
): void {
  if (id === 0n) return;
  const len = ids.length;
  if (len !== 0 && ids[len - 1] === id) return;
  ids.push(id);
  values.push(value);
}

export function valueAt(
  ids: readonly bigint[],
  values: readonly bigint[],
  snapshotId: bigint,
  currentSnapshotId: bigint,
  currentValue: bigint,
): bigint {
  if (snapshotId === 0n) throw new Error("SnapshotZero");
  if (snapshotId > currentSnapshotId) throw new Error("SnapshotTooNew");
  const index = findUpperBound(ids, snapshotId);
  if (index === ids.length) return currentValue;
  return values[index]!;
}
