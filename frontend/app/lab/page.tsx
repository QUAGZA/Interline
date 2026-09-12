import type { Metadata } from "next";
import { AppChrome } from "@/components/app-chrome";
import { Board } from "@/components/Board";
import { OpsPanel } from "@/components/OpsPanel";

export const metadata: Metadata = {
  title: "Operator lab — Interline",
  description: "v0 bilateral board, JUNK swap, Anvil warp. Not part of the customer app.",
};

export default function LabPage() {
  return (
    <main className="relative min-h-screen">
      <AppChrome />
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden="true" />
      <div className="relative z-10 pt-16">
        <p className="px-6 md:px-12 font-mono text-[11px] text-destructive">
          Operator lab — v0 CreditLine. JUNK swaps, hashed salt 0x01, and Anvil time warp live here, not on the public
          desk.
        </p>
        <Board />
        <OpsPanel />
      </div>
    </main>
  );
}
