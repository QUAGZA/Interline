import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketsTable } from "@/features/markets/markets-table";

export const metadata: Metadata = {
  title: "Markets — Interline",
  description: "Public isolated lending markets. Wallet not required.",
};

export default function MarketsPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading markets…</p>}>
      <MarketsTable />
    </Suspense>
  );
}
