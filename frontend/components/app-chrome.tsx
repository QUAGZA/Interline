"use client";

import Link from "next/link";
import { NetworkBanner } from "@/components/NetworkBanner";
import { WalletBar } from "@/components/WalletBar";
import { useLineState } from "@/hooks/useLineState";

export function AppChrome() {
  const line = useLineState();
  return (
    <>
      <Link
        href="/"
        className="fixed top-4 left-4 md:top-6 md:left-6 z-[60] font-[var(--font-bebas)] text-xl tracking-wide text-foreground hover:text-accent"
      >
        INTERLINE
      </Link>
      <NetworkBanner />
      <WalletBar lender={line.lender} borrower={line.borrower} />
    </>
  );
}
