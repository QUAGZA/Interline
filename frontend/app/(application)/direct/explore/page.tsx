import type { Metadata } from "next";
import { Suspense } from "react";
import { DirectWorkspace } from "@/features/direct/workspace";

export const metadata: Metadata = {
  title: "Explore agreements — Direct lending — Interline",
};

export default function DirectExplorePage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading directory…</p>}>
      <DirectWorkspace filter="explore" />
    </Suspense>
  );
}
