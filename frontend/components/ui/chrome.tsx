import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SourceBanner({ usingStub }: { usingStub?: boolean }) {
  if (!usingStub) return null;
  return (
    <p className="border border-border/60 bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground">
      Read API is not live — showing typed fixtures (bigint strings). These are not on-chain balances.
    </p>
  );
}

export function OracleBanner() {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Simulated prices / testnet</p>
  );
}

export function StatusPill({
  status,
}: {
  status: "active" | "supply_frozen" | "borrow_frozen" | "recall" | "terminal" | string;
}) {
  const alert = status !== "active";
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        alert ? "border-destructive/70 text-destructive" : "border-border text-muted-foreground",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function TestAssetBadge() {
  return (
    <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      Test asset
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{kicker}</span>
        <h1 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight md:text-6xl">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
