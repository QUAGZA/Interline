import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectGate } from "@/components/connect-gate";

export const metadata: Metadata = {
  title: "Connect — Interline",
  description: "Connect a wallet to manage positions. Public pages do not require a connection.",
};

export default function ConnectPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading…</p>}>
      <ConnectGate />
    </Suspense>
  );
}
