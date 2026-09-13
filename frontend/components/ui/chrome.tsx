import type { DataSource } from "@/lib/api/types";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";

export function SourceBanner({
  usingStub,
  stale,
  source,
}: {
  usingStub?: boolean;
  stale?: boolean;
  source?: DataSource;
}) {
  let label: string | null = null;
  let detail: string | null = null;
  if (source === "rpc") {
    label = "RPC";
    detail = "On-chain reads (indexer offline). Figures come from the catalog RPC, not typed fixtures.";
  } else if (usingStub || source === "stub") {
    label = "FIXTURE";
    detail = "Read API is not live — showing typed fixtures (bigint strings). These are not on-chain balances.";
  } else if (stale) {
    label = "STALE";
    detail = "Indexer error — showing last-known live data. Figures may be stale.";
  } else if (source === "indexer") {
    label = "LIVE";
    detail = "Figures from the live indexer.";
  }
  if (!label || !detail) return null;
  return (
    <span className="inline-flex items-center gap-1 border border-border/60 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {label}
      <InfoTip label="Data source">{detail}</InfoTip>
    </span>
  );
}

export function OracleBanner() {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Simulated prices / testnet</p>
  );
}

export function HeaderMeta({
  usingStub,
  stale,
  source,
  extra,
}: {
  usingStub?: boolean;
  stale?: boolean;
  source?: DataSource;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBanner usingStub={usingStub} stale={stale} source={source} />
        <OracleBanner />
      </div>
      {extra}
    </div>
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
  size = "hub",
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  size?: "hub" | "page";
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{kicker}</span>
        <h1
          className={cn(
            "mt-1 font-[var(--font-bebas)] tracking-tight",
            size === "hub" ? "text-4xl md:text-6xl" : "text-3xl md:text-4xl",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
