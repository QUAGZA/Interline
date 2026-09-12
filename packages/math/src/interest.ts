import { APR_AT_KINK_RAY, BASE_APR_RAY, KINK_RAY, RAY, SLOPE1_RAY, SLOPE2_RAY, YEAR } from "./constants.js";
import { mulDiv } from "./muldiv.js";

/** Floor mulDiv only — never Math.pow. `rpow(0,0,b) = b`. 10y max-APR index from RAY: 22026462302533824731290734071189. */
export function rpow(x: bigint, n: bigint, b: bigint): bigint {
  if (x === 0n) return n === 0n ? b : 0n;
  let z = b;
  while (n > 0n) {
    if (n & 1n) z = mulDiv(z, x, b);
    n >>= 1n;
    if (n !== 0n) x = mulDiv(x, x, b);
  }
  return z;
}

export function ratePerSecondRay(borrowAprRay: bigint): bigint {
  return borrowAprRay / YEAR;
}

export function growthRay(borrowAprRay: bigint, dt: bigint): bigint {
  if (dt === 0n) return RAY;
  return rpow(RAY + ratePerSecondRay(borrowAprRay), dt, RAY);
}

export function projectIndex(
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

export function utilizationRay(cash: bigint, debt: bigint): bigint {
  const assets = cash + debt;
  if (assets === 0n) return 0n;
  const u = mulDiv(debt, RAY, assets);
  if (u > RAY) throw new Error("CorruptUtilization");
  return u;
}

export function borrowAprRay(utilRay: bigint): bigint {
  if (utilRay > RAY) throw new Error("CorruptUtilization");
  if (utilRay <= KINK_RAY) {
    return BASE_APR_RAY + mulDiv(SLOPE1_RAY, utilRay, KINK_RAY);
  }
  return APR_AT_KINK_RAY + mulDiv(SLOPE2_RAY, utilRay - KINK_RAY, RAY - KINK_RAY);
}

export function borrowApyGrowthRay(borrowAprRay_: bigint): bigint {
  return growthRay(borrowAprRay_, YEAR);
}

export function supplyAprRay(borrowAprRay_: bigint, utilRay: bigint): bigint {
  return mulDiv(borrowAprRay_, utilRay, RAY);
}

export function supplyApyEstGrowthRay(borrowAprRay_: bigint, utilRay: bigint): bigint {
  const g = borrowApyGrowthRay(borrowAprRay_);
  if (g <= RAY) return RAY;
  return RAY + mulDiv(utilRay, g - RAY, RAY);
}
