import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicDesk } from "@/features/desk/public-desk";

export const metadata: Metadata = {
  title: "Public desk — Interline",
  description: "Public active loans across isolated Interline markets.",
};

export default function DeskPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading desk…</p>}>
      <PublicDesk />
    </Suspense>
  );
}
