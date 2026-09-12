"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { chainId } from "@/lib/env";
import { ScrambleTextOnHover } from "@/components/scramble-text";

export function NetworkBanner() {
  const { isConnected, chainId: current } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || current === chainId) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-between gap-3 border-b border-destructive/50 bg-background/95 px-4 py-2 md:pl-36">
      <span className="font-mono text-xs text-destructive">
        Wrong network. App expects chain {chainId}; wallet is on {current ?? "—"}. Writes are disabled.
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => switchChain({ chainId: chainId as 31337 | 84532 | 11155111 })}
        className="border border-destructive bg-destructive px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary-foreground"
      >
        <ScrambleTextOnHover text="Switch chain" as="span" duration={0.4} />
      </button>
    </div>
  );
}
