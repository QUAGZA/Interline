/** 80% LTV in loan raw units (mUSDC, 6 decimals) from posted mWETH (18 decimals). */

const BPS = 10_000n;
const PRICE_SHIFT = 10n ** 12n; // 18 collateral decimals − 6 loan decimals

export const DIRECT_MAX_LTV_BPS = 8000n;

export function borrowCapacityUsdcRaw(
  collateralPosted: bigint,
  collateralUsdWad: bigint,
  loanUsdWad: bigint,
  ltvBps: bigint = DIRECT_MAX_LTV_BPS,
): bigint {
  if (collateralPosted <= 0n || collateralUsdWad <= 0n || loanUsdWad <= 0n || ltvBps === 0n) return 0n;
  return (collateralPosted * collateralUsdWad * ltvBps) / (loanUsdWad * BPS * PRICE_SHIFT);
}

/** Smallest mWETH (wei) that covers `debtUsdcRaw` at max LTV. */
export function requiredCollateralWei(
  debtUsdcRaw: bigint,
  collateralUsdWad: bigint,
  loanUsdWad: bigint,
  ltvBps: bigint = DIRECT_MAX_LTV_BPS,
): bigint {
  if (debtUsdcRaw <= 0n) return 0n;
  if (collateralUsdWad <= 0n || loanUsdWad <= 0n || ltvBps === 0n) return 0n;
  const num = debtUsdcRaw * loanUsdWad * BPS * PRICE_SHIFT;
  const den = collateralUsdWad * ltvBps;
  return (num + den - 1n) / den;
}

export function availableFromLtv(ltvCap: bigint, debt: bigint): bigint {
  return debt >= ltvCap ? 0n : ltvCap - debt;
}
