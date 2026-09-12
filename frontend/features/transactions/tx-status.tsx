"use client";

import { type TxRecord } from "./tx-store";
import { txLabel } from "./run-tx";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TxStatusList({ records }: { records: TxRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Transactions</h3>
      <ul className="space-y-2">
        {records.map((tx) => (
          <li key={tx.id} className="border border-border/50 bg-card px-3 py-2 font-mono text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{txLabel(tx.kind)}</span>
              <span
                className={cn(
                  "uppercase tracking-widest",
                  tx.phase === "success" && "text-accent",
                  tx.phase === "error" && "text-destructive",
                )}
              >
                {tx.phase.replaceAll("_", " ")}
              </span>
            </div>
            {tx.approvalHash ? <p className="text-muted-foreground">Approval {shortAddr(tx.approvalHash)}</p> : null}
            {tx.actionHash ? <p className="text-muted-foreground">Action {shortAddr(tx.actionHash)}</p> : null}
            {tx.error ? <p className="text-destructive">{tx.error}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
