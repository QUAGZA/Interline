import { formatUnits, parseUnits } from "viem";
import { decToDisplay } from "./money";

export const USDC_DECIMALS = 6;

export function parseUsdc(human: string): bigint {
  const trimmed = human.trim();
  if (!trimmed) return 0n;
  return parseUnits(trimmed, USDC_DECIMALS);
}

export function parseTokenInput(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (!trimmed) return 0n;
  return parseUnits(trimmed, decimals);
}

/** Display-only. Uses decimal.js — not JS Number — for token amounts. */
export function formatUsdc(base: bigint | undefined): string {
  if (base === undefined) return "—";
  return decToDisplay(base, USDC_DECIMALS, 2);
}

export function formatTokenUnits(base: bigint | undefined, decimals: number): string {
  if (base === undefined) return "—";
  return decToDisplay(base, decimals, Math.min(decimals, 6));
}

export function shortAddr(value?: string): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatBps(bps: bigint | number | undefined): string {
  if (bps === undefined) return "—";
  const raw = typeof bps === "bigint" ? bps.toString() : String(Math.trunc(bps));
  return `${decToDisplay(raw, 2, 2)}%`;
}

export function formatDeadline(unix: bigint | undefined, nowSec: number): string {
  if (!unix || unix === 0n) return "inactive";
  const remaining = Number(unix) - nowSec;
  if (remaining <= 0) return "elapsed — enter/swap locked";
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export { formatUnits, parseUnits };
