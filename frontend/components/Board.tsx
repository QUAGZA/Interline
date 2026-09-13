"use client";

import { useEffect, useState } from "react";
import { mockTargetAddress } from "@/lib/env";
import { formatBps, formatDeadline, formatUsdc, shortAddr } from "@/lib/format";
import { useEvents } from "@/hooks/useEvents";
import { useLineState } from "@/hooks/useLineState";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "border px-4 py-3 bg-card",
        alert ? "border-destructive/70" : "border-border/50",
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-lg tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function Board() {
  const s = useLineState();
  const events = useEvents(s.blockNumber);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const util = s.utilizationBps !== undefined ? Math.min(100, Number(s.utilizationBps) / 100) : 0;
  const hot = Boolean(s.drawsPaused || s.recallActive);

  if (!s.ready) {
    return (
      <section id="board" className="relative pt-24 pb-16 pl-6 md:pl-12 pr-6 md:pr-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">01 / Board</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">PUBLIC DESK</h2>
        <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
          No contract addresses in env. Deploy with Foundry, then copy the printed{" "}
          <code className="text-accent">NEXT_PUBLIC_*</code> values into{" "}
          <code className="text-accent">frontend/.env.local</code> and restart the app.
        </p>
      </section>
    );
  }

  return (
    <section id="board" className="relative pt-24 pb-16 pl-6 md:pl-12 pr-6 md:pr-12">
      <div className="mb-16 flex items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">01 / Board</span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">PUBLIC DESK</h2>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Wallet not required. Refetch every block.
          </p>
        </div>
        {hot ? (
          <span className="border border-destructive/70 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-destructive">
            {s.recallActive ? "RECALL" : "DRAWS PAUSED"}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cap (USDC)" value={formatUsdc(s.cap)} />
        <Stat label="Drawn (USDC)" value={formatUsdc(s.drawn)} />
        <Stat label="Pot" value={formatUsdc(s.pot)} />
        <Stat label="Vault idle" value={formatUsdc(s.vaultIdle)} />
        <Stat label="Utilisation" value={formatBps(s.utilizationBps)} />
        <Stat label="Draws paused" value={s.drawsPaused ? "yes" : "no"} alert={s.drawsPaused} />
        <Stat
          label="Recall deadline"
          value={formatDeadline(s.recallDeadline, now)}
          alert={s.recallActive}
        />
        <Stat label="Rate (display)" value={s.rateBps !== undefined ? `${Number(s.rateBps) / 100}%` : "—"} />
      </div>

      <div className="mt-10">
        <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <span>Utilisation</span>
          <span className="tabular-nums">{util.toFixed(2)}%</span>
        </div>
        <div className="h-2 overflow-hidden border border-border bg-secondary">
          <div
            className={cn("h-full", hot ? "bg-destructive" : "bg-accent")}
            style={{ width: `${util}%` }}
          />
        </div>
      </div>

      <div className="mt-10 border border-border/50 bg-card">
        <div className="border-b border-border/50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Exposure
        </div>
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">USDC sent</th>
              <th className="px-4 py-2">Venue paused</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr className="border-t border-border/40">
              <td className="px-4 py-2 text-foreground">
                MockTarget {shortAddr(mockTargetAddress)}
              </td>
              <td className="px-4 py-2">{formatUsdc(s.exposure)}</td>
              <td className={cn("px-4 py-2", s.venuePaused ? "text-destructive" : "text-muted-foreground")}>
                {s.venuePaused ? "yes" : "no"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-10 border border-border/50 bg-card">
        <div className="border-b border-border/50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Last 15 events
        </div>
        <ul tabIndex={0} aria-label="Last 15 events" className="max-h-64 overflow-auto text-sm">
          {events.length === 0 ? (
            <li className="px-4 py-3 font-mono text-xs text-muted-foreground">No events yet.</li>
          ) : (
            events.map((e) => (
              <li key={e.id} className="border-t border-border/30 px-4 py-2 font-mono text-xs text-foreground/80">
                <span className="text-accent">{e.label}</span>
                <span className="ml-2 text-muted-foreground">#{e.block.toString()}</span>
                <span className="ml-2 text-muted-foreground">{e.detail}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
