import type { Metadata } from "next";
import { Suspense } from "react";
import { CreationWizard } from "@/features/direct/wizard";

export const metadata: Metadata = {
  title: "New agreement — Direct lending — Interline",
};

export default async function DirectNewPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading wizard…</p>}>
      <CreationWizard initialIntent={intent} />
    </Suspense>
  );
}
