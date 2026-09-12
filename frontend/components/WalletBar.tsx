"use client";

import { useAccount, useConnect, useDisconnect, useEnsName } from "wagmi";
import { borrowerLabel, lenderLabel } from "@/lib/env";
import { shortAddr } from "@/lib/format";
import { ScrambleTextOnHover } from "@/components/scramble-text";
import { cn } from "@/lib/utils";

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
    <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[60] flex flex-wrap items-center justify-end gap-2 max-w-[min(100vw-2rem,28rem)]">
      {isConnected ? (
        <>
          <span
            className={cn(
              "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
              role === "Lender"
                ? "border-accent text-accent"
                : role === "Borrower"
                  ? "border-foreground/40 text-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {role}
          </span>
          <span className="font-mono text-xs text-foreground">
            {ens ?? shortAddr(address)}
            {label ? <span className="ml-2 text-muted-foreground">{label}</span> : null}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {chain?.name ?? "unknown chain"}
          </span>
          <button
            type="button"
            onClick={() => disconnect()}
            className="border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
          >
            <ScrambleTextOnHover text="Disconnect" as="span" duration={0.4} />
          </button>
        </>
      ) : (
        connectors.map((c) => (
          <button
            key={c.uid}
            type="button"
            disabled={isPending}
            onClick={() => connect({ connector: c })}
            className="border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            <ScrambleTextOnHover text={`Connect ${c.name}`} as="span" duration={0.45} />
          </button>
        ))
      )}
    </div>
  );
}
