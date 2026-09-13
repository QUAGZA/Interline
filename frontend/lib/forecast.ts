/** Liquidation scenarios: contract-exact share/index projection over a 365-day horizon (display only). */

import { BPS, DEBT_DENOMINATOR, RAY, YEAR } from "../../packages/math/src/constants";
import { mulDiv, mulDivCeil } from "../../packages/math/src/muldiv";

/** 365 days in seconds — one YEAR, never `365 * YEAR`. */
export const HORIZON_SECONDS = YEAR;

export type ScenarioKind =
  | "no-debt"
  | "already-eligible"
  | "within-horizon"
  | "not-in-horizon"
  | "unavailable"
  | "unknown";

export type LiquidationScenario = {
  kind: ScenarioKind;
  /** First whole second offset from the recorded timestamp where debt > capacity, or null. Not a calendar date. */
  firstLiquidatableSecond: bigint | null;
  assumptions: string;
};

export type LiquidationScenarioInput = {
  healthCode: "NO_DEBT" | "OK" | "UNAVAILABLE";
  liquidatable: boolean;
  oracleStatus?: "ok" | "stale" | "unavailable";
  debtShares: string;
  epochIndexRay: string;
  epochAprRay: string;
  epochTimestamp: string;
  recordedTimestamp: string;
  liquidationCapacityRaw: string;
};

export const FROZEN_ASSUMPTIONS =
  "Interest-only scenario. Oracle prices and the borrow APR are frozen at the recorded snapshot. Collateral value is held fixed. No future deposits, repayments, borrows, or rate-epoch changes are modeled. This is not a liquidation date.";

function rpow(x: bigint, n: bigint, b: bigint): bigint {
  if (x === 0n) return n === 0n ? b : 0n;
  let z = b;
  while (n > 0n) {
    if (n & 1n) z = mulDiv(z, x, b);
    n >>= 1n;
    if (n !== 0n) x = mulDiv(x, x, b);
  }
  return z;
}

function growthRay(borrowAprRay: bigint, dt: bigint): bigint {
  if (dt === 0n) return RAY;
  return rpow(RAY + borrowAprRay / YEAR, dt, RAY);
}

function projectIndex(
  epochIndexRay: bigint,
  epochAprRay: bigint,
  epochTimestamp: bigint,
  timestamp: bigint,
): bigint {
  if (timestamp < epochTimestamp) throw new Error("InvalidTime");
  const dt = timestamp - epochTimestamp;
  if (dt === 0n) return epochIndexRay;
  return mulDiv(epochIndexRay, growthRay(epochAprRay, dt), RAY);
}

function debtFromShares(shares: bigint, indexRay: bigint): bigint {
  if (shares === 0n) return 0n;
  if (indexRay === 0n) throw new Error("InvalidShareState");
  return mulDivCeil(shares, indexRay, DEBT_DENOMINATOR);
}

function isLiquidatable(currentDebt: bigint, liqCapacity: bigint): boolean {
  return currentDebt > liqCapacity;
}

/** Frozen-price capacity twin of `PriceMath.liquidationCapacity`. */
export function liquidationCapacity(collatValueLoan: bigint, liquidationThresholdBps: bigint): bigint {
  return mulDiv(collatValueLoan, liquidationThresholdBps, BPS);
}

function parseUInt(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === "") return null;
  try {
    const n = BigInt(raw);
    return n < 0n ? null : n;
  } catch {
    return null;
  }
}

function result(kind: ScenarioKind, first: bigint | null, extra = ""): LiquidationScenario {
  return {
    kind,
    firstLiquidatableSecond: first,
    assumptions: extra ? `${FROZEN_ASSUMPTIONS} ${extra}` : FROZEN_ASSUMPTIONS,
  };
}

export function projectScenarioDebt(args: {
  debtShares: bigint;
  epochIndexRay: bigint;
  epochAprRay: bigint;
  epochTimestamp: bigint;
  recordedTimestamp: bigint;
  dt: bigint;
}): bigint {
  const timestamp = args.recordedTimestamp + args.dt;
  const indexRay = projectIndex(args.epochIndexRay, args.epochAprRay, args.epochTimestamp, timestamp);
  return debtFromShares(args.debtShares, indexRay);
}

export function liquidationScenario(input: LiquidationScenarioInput): LiquidationScenario {
  if (input.oracleStatus === "stale") {
    return result("unknown", null, "Source snapshot is stale — scenario unknown.");
  }
  if (input.oracleStatus === "unavailable" || input.healthCode === "UNAVAILABLE") {
    return result("unavailable", null, "Oracle unavailable — no numerical scenario.");
  }

  const debtShares = parseUInt(input.debtShares);
  const epochIndexRay = parseUInt(input.epochIndexRay);
  const epochAprRay = parseUInt(input.epochAprRay);
  const epochTimestamp = parseUInt(input.epochTimestamp);
  const recordedTimestamp = parseUInt(input.recordedTimestamp);
  const cap = parseUInt(input.liquidationCapacityRaw);

  if (
    debtShares === null ||
    epochIndexRay === null ||
    epochAprRay === null ||
    epochTimestamp === null ||
    recordedTimestamp === null ||
    cap === null
  ) {
    return result("unknown", null, "Projection inputs are incomplete — scenario unknown.");
  }

  if (input.healthCode === "NO_DEBT" || debtShares === 0n) {
    return result("no-debt", null);
  }

  if (recordedTimestamp < epochTimestamp) {
    return result("unknown", null, "Recorded timestamp is before the rate epoch — scenario unknown.");
  }

  const base = {
    debtShares,
    epochIndexRay,
    epochAprRay,
    epochTimestamp,
    recordedTimestamp,
  };

  let atNow: bigint;
  let atHorizon: bigint;
  try {
    atNow = projectScenarioDebt({ ...base, dt: 0n });
    atHorizon = projectScenarioDebt({ ...base, dt: HORIZON_SECONDS });
  } catch {
    return result("unknown", null, "Index/share projection failed — scenario unknown.");
  }

  if (input.liquidatable || isLiquidatable(atNow, cap)) {
    return result("already-eligible", 0n);
  }

  const zeroAprNote = epochAprRay === 0n ? "Borrow APR is zero, so projected debt does not grow." : "";
  if (!isLiquidatable(atHorizon, cap)) {
    return result("not-in-horizon", null, zeroAprNote);
  }

  let lo = 1n;
  let hi = HORIZON_SECONDS;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    let debtMid: bigint;
    try {
      debtMid = projectScenarioDebt({ ...base, dt: mid });
    } catch {
      return result("unknown", null, "Index/share projection failed — scenario unknown.");
    }
    if (isLiquidatable(debtMid, cap)) hi = mid;
    else lo = mid + 1n;
  }
  return result("within-horizon", lo);
}

export function formatHorizon(seconds: bigint | null): string {
  if (seconds === null) return "—";
  if (seconds === 0n) return "now";
  const s = seconds;
  const d = s / 86400n;
  const h = (s % 86400n) / 3600n;
  if (d > 0n) return `${d}d ${h}h`;
  const m = (s % 3600n) / 60n;
  if (h > 0n) return `${h}h ${m}m`;
  return `${s}s`;
}
