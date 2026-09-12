import Decimal from "decimal.js";

/** Display-only decimal context. Never use Decimal (or JS Number) for execution math. */
const Display = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_DOWN });

const RAY = new Display("1000000000000000000000000000");
const WAD = new Display("1000000000000000000");

export function isDecString(value: string): boolean {
  return /^-?\d+$/.test(value);
}

export function decToDisplay(raw: string | bigint, decimals: number, fractionDigits = 2): string {
  const src = typeof raw === "bigint" ? raw.toString() : raw;
  if (!isDecString(src)) return "—";
  const scale = new Display(10).pow(decimals);
  const value = new Display(src).div(scale);
  const negative = value.isNegative();
  const abs = value.abs();
  const fixed = abs.toFixed(fractionDigits, Display.ROUND_DOWN);
  const [intPart, fracPart = ""] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracPart.replace(/0+$/, "");
  const body = frac.length > 0 ? `${grouped}.${frac}` : grouped;
  return negative ? `-${body}` : body;
}

export function formatTokenAmount(
  raw: string | bigint | undefined,
  decimals: number,
  symbol?: string,
  fractionDigits = 2,
): string {
  if (raw === undefined) return "—";
  const amount = decToDisplay(raw, decimals, fractionDigits);
  return symbol ? `${amount} ${symbol}` : amount;
}

export function formatRayPercent(ray: string | undefined, fractionDigits = 2): string {
  if (!ray || !isDecString(ray)) return "—";
  const pct = new Display(ray).mul(100).div(RAY);
  return `${pct.toFixed(fractionDigits, Display.ROUND_DOWN)}%`;
}

/** Supply APY from growth ray: (g - RAY) / RAY. */
export function formatApyFromGrowthRay(growthRay: string | undefined, fractionDigits = 2): string {
  if (!growthRay || !isDecString(growthRay)) return "—";
  const g = new Display(growthRay);
  if (g.lte(RAY)) return `${new Display(0).toFixed(fractionDigits)}%`;
  const pct = g.minus(RAY).mul(100).div(RAY);
  return `${pct.toFixed(fractionDigits, Display.ROUND_DOWN)}%`;
}

export function formatWadNumber(wad: string | null | undefined, fractionDigits = 2): string {
  if (wad === null || wad === undefined || !isDecString(wad)) return "—";
  const value = new Display(wad).div(WAD);
  return value.toFixed(fractionDigits, Display.ROUND_DOWN);
}

export function formatUsdFromWad(usdWad: string | undefined, fractionDigits = 2): string {
  if (!usdWad || !isDecString(usdWad)) return "—";
  return `$${decToDisplay(usdWad, 18, fractionDigits)}`;
}

export function compareDec(a: string, b: string): number {
  return new Display(a).cmp(new Display(b));
}

export function minDec(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.reduce((m, v) => (new Display(v).lt(m) ? v : m));
}
