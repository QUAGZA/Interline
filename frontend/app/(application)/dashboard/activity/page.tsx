import type { Metadata } from "next";
import { ActivityFeed } from "@/features/activity/activity-feed";

export const metadata: Metadata = {
  title: "Activity — Interline",
};

export default function ActivityPage() {
  return <ActivityFeed />;
}
