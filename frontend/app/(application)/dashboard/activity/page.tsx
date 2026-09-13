import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityFeed } from "@/features/activity/activity-feed";

export const metadata: Metadata = {
  title: "Activity — Interline",
};

export default function ActivityPage() {
  return <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading activity…</p>}><ActivityFeed /></Suspense>;
}
