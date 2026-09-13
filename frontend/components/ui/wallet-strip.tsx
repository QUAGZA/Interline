"use client";

import { useWalletCatalogBalances } from "@/hooks/useWalletCatalogBalances";
import { formatTokenAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

export function WalletStrip({ chainId, className }: { chainId: number; className?: string }) {
  const { ready, musdc, mweth } = useWalletCatalogBalances(chainId);
  if (!ready) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground", className)}>
      <span title="Wallet mUSDC">{formatTokenAmount(musdc ?? 0n, 6, "mUSDC")}</span>
      <span title="Wallet mWETH">{formatTokenAmount(mweth ?? 0n, 18, "mWETH", 4)}</span>
    </div>
  );
}
