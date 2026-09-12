"use client";

import { useAccount, useConnect, useDisconnect, useEnsName } from "wagmi";
import { borrowerLabel, lenderLabel } from "@/lib/env";
import { shortAddr } from "@/lib/format";

export function WalletBar({
  lender,
  borrower,
}: {
  lender?: `0x${string}`;
  borrower?: `0x${string}`;
}) {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ens } = useEnsName({ address, query: { enabled: Boolean(address) } });

  const role =
    address && lender && address.toLowerCase() === lender.toLowerCase()
      ? "Lender"
      : address && borrower && address.toLowerCase() === borrower.toLowerCase()
        ? "Borrower"
        : isConnected
          ? "Observer"
          : "Disconnected";

  const label =
    role === "Lender" ? lenderLabel : role === "Borrower" ? borrowerLabel : undefined;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight text-amber-400">Interline</span>
        <span className="text-xs uppercase tracking-widest text-zinc-500">bilateral credit</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isConnected ? (
          <>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                role === "Lender"
                  ? "bg-amber-400/15 text-amber-300"
                  : role === "Borrower"
                    ? "bg-sky-400/15 text-sky-300"
                    : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {role}
            </span>
            <span className="font-mono text-zinc-200">
              {ens ?? shortAddr(address)}
              {label ? <span className="ml-2 text-zinc-500">{label}</span> : null}
            </span>
            <span className="text-xs text-zinc-500">{chain?.name ?? "unknown chain"}</span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
            >
              Disconnect
            </button>
          </>
        ) : (
          connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              disabled={isPending}
              onClick={() => connect({ connector: c })}
              className="rounded bg-amber-400 px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              Connect {c.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
