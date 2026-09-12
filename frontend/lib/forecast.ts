/** Contract-identical RAY accrual helpers for liquidation scenarios (display/forecast only). */

const RAY = 10n ** 27n;
const YEAR = 31_536_000n;

function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  return (a * b) / d;
}

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

function ratePerSecondRay(borrowAprRay: bigint): bigint {
  return borrowAprRay / YEAR;
}

function growthRay(borrowAprRay: bigint, dt: bigint): bigint {
  if (dt === 0n) return RAY;
  return rpow(RAY + ratePerSecondRay(borrowAprRay), dt, RAY);
}

function projectDebt(debt: bigint, borrowAprRay: bigint, dt: bigint): bigint {
  return mulDiv(debt, growthRay(borrowAprRay, dt), RAY);
}

export type ScenarioKind = "no-debt" | "already-eligible" | "within-horizon" | "not-in-horizon" | "unavailable";

export type LiquidationScenario = {
  kind: ScenarioKind;
  firstLiquidatableSecond: bigint | null;
  assumptions: string;
};

const HORIZON = 365n * YEAR;

export function liquidationScenario(input: {
  healthCode: "NO_DEBT" | "OK" | "UNAVAILABLE";
  liquidatable: boolean;
  debtRaw: string;
  liquidationCapacityRaw: string;
  borrowAprRay: string;
}): LiquidationScenario {
  const assumptions =
    "Constant simulated oracle prices. Debt grows at the current borrow APR. Collateral value is held fixed. This is a liquidation scenario, not a promised time.";
  if (input.healthCode === "UNAVAILABLE") {
    return { kind: "unavailable", firstLiquidatableSecond: null, assumptions };
  }
  if (input.healthCode === "NO_DEBT" || input.debtRaw === "0") {
    return { kind: "no-debt", firstLiquidatableSecond: null, assumptions };
  }
  if (input.liquidatable) {
    return { kind: "already-eligible", firstLiquidatableSecond: 0n, assumptions };
  }
  const debt = BigInt(input.debtRaw);
  const cap = BigInt(input.liquidationCapacityRaw);
  const apr = BigInt(input.borrowAprRay);
  if (debt > cap) {
    return { kind: "already-eligible", firstLiquidatableSecond: 0n, assumptions };
  }
  const atHorizon = projectDebt(debt, apr, HORIZON);
  if (atHorizon <= cap) {
    return { kind: "not-in-horizon", firstLiquidatableSecond: null, assumptions };
  }
  let lo = 1n;
  let hi = HORIZON;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (projectDebt(debt, apr, mid) > cap) hi = mid;
    else lo = mid + 1n;
  }
  return { kind: "within-horizon", firstLiquidatableSecond: lo, assumptions };
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
