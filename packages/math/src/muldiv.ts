export function mulDiv(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("div0");
  return (x * y) / d;
}

export function mulDivCeil(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("div0");
  if (x === 0n || y === 0n) return 0n;
  return (x * y + d - 1n) / d;
}
