import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView } from "@/features/portfolio/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard — Interline",
  description: "Wallet supplies and borrows across isolated markets. Health is never blended.",
};

export default function DashboardPage() {
  return <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading dashboard…</p>}><DashboardView /></Suspense>;
}
