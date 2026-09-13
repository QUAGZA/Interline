"use client";

import { SimulatedOracleRefresh } from "@/features/simulated-oracle";
import { TestnetFaucetButton } from "@/features/testnet-faucet";

export function TestnetPanel({ chainId }: { chainId: number }) {
  return (
    <details className="border border-border/40 bg-card px-3 py-2">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Testnet
      </summary>
      <div className="mt-3 space-y-3">
        <TestnetFaucetButton chainId={chainId} compact />
        <SimulatedOracleRefresh chainId={chainId} />
      </div>
    </details>
  );
}
