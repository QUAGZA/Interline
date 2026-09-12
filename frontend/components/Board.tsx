"use client";

import { useEffect, useState } from "react";
import { mockTargetAddress } from "@/lib/env";
import { formatBps, formatDeadline, formatUsdc, shortAddr } from "@/lib/format";
import { useEvents } from "@/hooks/useEvents";
import { useLineState } from "@/hooks/useLineState";

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
    <div className={`rounded-lg border px-4 py-3 ${alert ? "border-red-700 bg-red-950/40" : "border-zinc-800 bg-zinc-900/50"}`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{value}</div>
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
      <section className="p-6 text-zinc-400">
        <h2 className="text-lg font-semibold text-zinc-100">Board</h2>
        <p className="mt-2 max-w-xl text-sm">
          No contract addresses in env. Deploy with Foundry, then copy the printed{" "}
          <code className="text-amber-300">NEXT_PUBLIC_*</code> values into{" "}
          <code className="text-amber-300">frontend/.env.local</code> and restart the app.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Board</h2>
          <p className="text-xs text-zinc-500">Public. Wallet not required. Refetch every block.</p>
        </div>
        {hot ? (
          <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300">
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

      <div>
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>Utilisation</span>
          <span className="font-mono tabular-nums">{util.toFixed(2)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full ${hot ? "bg-red-500" : "bg-amber-400"}`}
            style={{ width: `${util}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800">
        <div className="border-b border-zinc-800 px-4 py-2 text-xs uppercase tracking-wide text-zinc-500">
          Exposure
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">USDC sent</th>
              <th className="px-4 py-2">Venue paused</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr className="border-t border-zinc-800">
              <td className="px-4 py-2 text-zinc-200">
                MockTarget {shortAddr(mockTargetAddress)}
              </td>
              <td className="px-4 py-2">{formatUsdc(s.exposure)}</td>
              <td className={`px-4 py-2 ${s.venuePaused ? "text-red-300" : "text-zinc-400"}`}>
                {s.venuePaused ? "yes" : "no"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-zinc-800">
        <div className="border-b border-zinc-800 px-4 py-2 text-xs uppercase tracking-wide text-zinc-500">
          Last 15 events
        </div>
        <ul className="max-h-64 overflow-auto text-sm">
          {events.length === 0 ? (
            <li className="px-4 py-3 text-zinc-500">No events yet.</li>
          ) : (
            events.map((e) => (
              <li key={e.id} className="border-t border-zinc-800/80 px-4 py-2 font-mono text-xs text-zinc-300">
                <span className="text-amber-300">{e.label}</span>
                <span className="ml-2 text-zinc-600">#{e.block.toString()}</span>
                <span className="ml-2 text-zinc-400">{e.detail}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
