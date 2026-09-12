"use client";

import { formatTokenAmount, formatWadNumber } from "@/lib/money";
import type { HealthCode } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function HealthDisplay({
  code,
  wad,
  liquidatable,
}: {
  code: HealthCode | "NONE";
  wad: string | null;
  liquidatable?: boolean;
}) {
  if (code === "UNAVAILABLE") {
    return <span className="font-mono text-destructive">Unavailable</span>;
  }
  if (code === "NO_DEBT" || code === "NONE") {
    return (
      <span className="font-mono text-muted-foreground" title="No debt">
        ∞
        <span className="ml-2 text-[10px] uppercase tracking-widest">No debt</span>
      </span>
    );
  }
  const text = wad ? formatWadNumber(wad, 2) : "—";
  return (
    <span className={cn("font-mono tabular-nums", liquidatable ? "text-destructive" : "text-foreground")}>
      {text}
      {liquidatable ? (
        <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-destructive">Liquidatable</span>
      ) : null}
    </span>
  );
}

export function TokenAmount({
  raw,
  decimals,
  symbol,
  digits = 2,
}: {
  raw: string;
  decimals: number;
  symbol?: string;
  digits?: number;
}) {
  return (
    <span className="font-mono tabular-nums">
      {formatTokenAmount(raw, decimals, symbol, digits)}
    </span>
  );
}
