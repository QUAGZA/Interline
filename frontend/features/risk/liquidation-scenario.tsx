"use client";

import { formatHorizon, liquidationScenario } from "@/lib/forecast";
import type { HealthCode, OracleStatus } from "@/lib/api/types";

const KIND_COPY: Record<ReturnType<typeof liquidationScenario>["kind"], string> = {
  "no-debt": "No debt — no liquidation scenario.",
  "already-eligible": "Already eligible for liquidation at the frozen snapshot prices.",
  "within-horizon":
    "Under frozen prices and a frozen borrow rate, projected debt would exceed liquidation capacity within the 365-day horizon.",
  "not-in-horizon":
    "Under frozen prices and a frozen borrow rate, projected debt does not exceed liquidation capacity within 365 days. That is not a claim of no liquidation risk.",
  unavailable: "Oracle unavailable — no numerical scenario.",
  unknown: "Unknown — source snapshot is stale or projection inputs are incomplete.",
};

export function LiquidationScenarioCard({
  healthCode,
  liquidatable,
  oracleStatus,
  debtShares,
  epochIndexRay,
  epochAprRay,
  epochTimestamp,
  recordedTimestamp,
  liquidationCapacityRaw,
}: {
  healthCode: HealthCode;
  liquidatable: boolean;
  oracleStatus: OracleStatus;
  debtShares: string;
  epochIndexRay: string;
  epochAprRay: string;
  epochTimestamp: string;
  recordedTimestamp: string;
  liquidationCapacityRaw: string;
}) {
  const scenario = liquidationScenario({
    healthCode,
    liquidatable,
    oracleStatus,
    debtShares,
    epochIndexRay,
    epochAprRay,
    epochTimestamp,
    recordedTimestamp,
    liquidationCapacityRaw,
  });
  return (
    <div className="border border-border/50 bg-card p-4 space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Liquidation scenario
      </h3>
      <p className="font-mono text-[11px] text-muted-foreground">
        If current prices and the current borrowing rate stayed unchanged.
      </p>
      <p className="font-mono text-sm text-foreground">{KIND_COPY[scenario.kind]}</p>
      {scenario.kind === "within-horizon" ? (
        <p className="font-mono text-xs text-accent">
          Scenario offset (frozen price and rate, not a calendar date): {formatHorizon(scenario.firstLiquidatableSecond)}{" "}
          into the 365-day horizon.
        </p>
      ) : null}
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{scenario.assumptions}</p>
    </div>
  );
}

export function RecallClock({
  active,
  deadlineUnix,
  nowSec,
}: {
  active: boolean;
  deadlineUnix: string;
  nowSec: number;
}) {
  const deadline = BigInt(deadlineUnix || "0");
  if (!active && deadline === 0n) {
    return (
      <p className="font-mono text-[11px] text-muted-foreground">Recall clock inactive. Separate from liquidation.</p>
    );
  }
  const remaining = Number(deadline) - nowSec;
  const label =
    remaining <= 0 ? "Recall window elapsed — bounded public recovery may apply on restricted markets." : `${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, "0")}s remaining`;
  return (
    <div className="border border-border/50 bg-card p-4 space-y-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Recall clock</h3>
      <p className="font-mono text-sm">{label}</p>
      <p className="font-mono text-[11px] text-muted-foreground">
        Expiry does not seize otherwise healthy collateral.
      </p>
    </div>
  );
}
