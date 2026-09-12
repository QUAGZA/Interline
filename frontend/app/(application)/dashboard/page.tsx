import type { Metadata } from "next";
import { DashboardView } from "@/features/portfolio/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard — Interline",
  description: "Wallet supplies and borrows across isolated markets. Health is never blended.",
};

export default function DashboardPage() {
  return <DashboardView />;
}
