"use client";

import { formatHorizon, liquidationScenario } from "@/lib/forecast";
import type { HealthCode } from "@/lib/api/types";

const KIND_COPY: Record<ReturnType<typeof liquidationScenario>["kind"], string> = {
  "no-debt": "No debt — no liquidation scenario.",
  "already-eligible": "Already eligible for liquidation at current simulated prices.",
  "within-horizon": "Debt would cross the liquidation threshold within the 365-day horizon if prices stay fixed.",
  "not-in-horizon": "Not eligible within a 365-day horizon at the current borrow APR and fixed prices.",
  unavailable: "Oracle unavailable — no numerical scenario.",
};

export function LiquidationScenarioCard({
  healthCode,
  liquidatable,
  debtRaw,
  liquidationCapacityRaw,
  borrowAprRay,
}: {
  healthCode: HealthCode;
  liquidatable: boolean;
  debtRaw: string;
  liquidationCapacityRaw: string;
  borrowAprRay: string;
}) {
  const scenario = liquidationScenario({
    healthCode,
    liquidatable,
    debtRaw,
    liquidationCapacityRaw,
    borrowAprRay,
  });
  return (
    <div className="border border-border/50 bg-card p-4 space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Liquidation scenario
      </h3>
      <p className="font-mono text-sm text-foreground">{KIND_COPY[scenario.kind]}</p>
      {scenario.kind === "within-horizon" ? (
        <p className="font-mono text-xs text-accent">
          First liquidatable second (projection): {formatHorizon(scenario.firstLiquidatableSecond)}
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
