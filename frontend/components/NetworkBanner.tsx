"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { chainId } from "@/lib/env";

export function NetworkBanner() {
  const { isConnected, chainId: current } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || current === chainId) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-red-950/80 px-4 py-2 text-sm text-red-100">
      <span>
        Wrong network. App expects chain {chainId}; wallet is on {current ?? "—"}. Writes are disabled.
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => switchChain({ chainId: chainId as 31337 | 84532 | 11155111 })}
        className="rounded bg-red-200 px-3 py-1 text-xs font-medium text-red-950"
      >
        Switch chain
      </button>
    </div>
  );
}
