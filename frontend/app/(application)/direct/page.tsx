import type { Metadata } from "next";
import { Suspense } from "react";
import { DirectWorkspace } from "@/features/direct/workspace";

export const metadata: Metadata = {
  title: "Direct lending — Interline",
  description: "Bilateral 1:1 credit agreements. Wallet not required to browse.",
};

export default function DirectPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading direct lending…</p>}>
      <DirectWorkspace />
    </Suspense>
  );
}
