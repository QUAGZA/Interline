import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 6;

export function parseUsdc(human: string): bigint {
  const trimmed = human.trim();
  if (!trimmed) return 0n;
  return parseUnits(trimmed, USDC_DECIMALS);
}

export function formatUsdc(base: bigint | undefined): string {
  if (base === undefined) return "—";
  const asNumber = Number(formatUnits(base, USDC_DECIMALS));
  if (!Number.isFinite(asNumber)) return formatUnits(base, USDC_DECIMALS);
  return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function shortAddr(value?: string): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatBps(bps: bigint | undefined): string {
  if (bps === undefined) return "—";
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

export function formatDeadline(unix: bigint | undefined, nowSec: number): string {
  if (!unix || unix === 0n) return "inactive";
  const remaining = Number(unix) - nowSec;
  if (remaining <= 0) return "elapsed — enter/swap locked";
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
