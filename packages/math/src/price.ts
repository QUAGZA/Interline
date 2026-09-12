import { BPS, DEFAULT_BONUS_BPS, DEFAULT_LT_BPS, DEFAULT_LTV_BPS, PRICE_SCALE, WAD } from "./constants.js";
import { mulDiv } from "./muldiv.js";

export { DEFAULT_BONUS_BPS, DEFAULT_LT_BPS, DEFAULT_LTV_BPS };

export type HealthCode = "NO_DEBT" | "OK" | "UNAVAILABLE";

export function pow10(exp: bigint): bigint {
  if (exp > 77n) throw new Error("InvalidDecimals");
  let r = 1n;
  for (let i = 0n; i < exp; i++) r *= 10n;
  return r;
}

export function quoteScale36(
  collateralUsdWad: bigint,
  loanUsdWad: bigint,
  collateralDecimals: number,
  loanDecimals: number,
): bigint {
  if (collateralDecimals < 6 || collateralDecimals > 18 || loanDecimals < 6 || loanDecimals > 18) {
    throw new Error("InvalidDecimals");
  }
  if (collateralUsdWad === 0n || loanUsdWad === 0n) throw new Error("InvalidQuote");
  const exp = 36n + BigInt(loanDecimals) - BigInt(collateralDecimals);
  return mulDiv(collateralUsdWad, pow10(exp), loanUsdWad);
}

export function collateralValueLoan(collateralRaw: bigint, scale36: bigint): bigint {
  if (collateralRaw === 0n || scale36 === 0n) return 0n;
  return mulDiv(collateralRaw, scale36, PRICE_SCALE);
}

export function borrowCapacity(collatValueLoan: bigint, maxLtvBps: bigint): bigint {
  return mulDiv(collatValueLoan, maxLtvBps, BPS);
}

export function liquidationCapacity(collatValueLoan: bigint, liquidationThresholdBps: bigint): bigint {
  return mulDiv(collatValueLoan, liquidationThresholdBps, BPS);
}

export function healthFactorWad(liqCapacity: bigint, currentDebt: bigint): bigint {
  if (currentDebt === 0n) return 0n;
  return mulDiv(liqCapacity, WAD, currentDebt);
}

export function isLiquidatable(currentDebt: bigint, liqCapacity: bigint): boolean {
  return currentDebt > liqCapacity;
}

export function originationAllowed(postActionDebt: bigint, postActionBorrowCapacity: bigint): boolean {
  return postActionDebt <= postActionBorrowCapacity;
}

/** `NO_DEBT` / `UNAVAILABLE` never report a healthy numeric HF (`null`). */
export function evaluateHealth(
  liqCapacity: bigint,
  currentDebt: bigint,
  pricesValid: boolean,
): { code: HealthCode; healthFactorWad: bigint | null; liquidatable: boolean } {
  if (currentDebt === 0n) {
    return { code: "NO_DEBT", healthFactorWad: null, liquidatable: false };
  }
  if (!pricesValid) {
    return { code: "UNAVAILABLE", healthFactorWad: null, liquidatable: false };
  }
  return {
    code: "OK",
    healthFactorWad: healthFactorWad(liqCapacity, currentDebt),
    liquidatable: isLiquidatable(currentDebt, liqCapacity),
  };
}
