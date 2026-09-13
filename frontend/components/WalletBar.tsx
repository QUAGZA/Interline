"use client";

import { useAccount } from "wagmi";
import { borrowerLabel, lenderLabel } from "@/lib/env";
import { ConnectButton, DisconnectButton } from "@/components/connect-button";
import { EnsLabel } from "@/components/ens-label";
import { cn } from "@/lib/utils";

export function WalletBar({
  lender,
  borrower,
}: {
  lender?: `0x${string}`;
  borrower?: `0x${string}`;
}) {
  const { address, isConnected, chain } = useAccount();

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
            <EnsLabel address={address} />
            {label ? <span className="ml-2 text-muted-foreground">{label}</span> : null}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {chain?.name ?? "unknown chain"}
          </span>
          <DisconnectButton />
        </>
      ) : (
        <ConnectButton />
      )}
    </div>
  );
}
