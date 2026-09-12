"use client";

import { Board } from "@/components/Board";
import { CopyBanner } from "@/components/CopyBanner";
import { NetworkBanner } from "@/components/NetworkBanner";
import { OpsPanel } from "@/components/OpsPanel";
import { WalletBar } from "@/components/WalletBar";
import { useLineState } from "@/hooks/useLineState";

export default function Home() {
  const line = useLineState();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <WalletBar lender={line.lender} borrower={line.borrower} />
      <NetworkBanner />
      <CopyBanner />
      <Board />
      <OpsPanel />
    </main>
  );
}
