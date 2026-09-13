import type { Metadata } from "next";
import { LegacyCreditLineViewer } from "@/features/direct/legacy-viewer";
import { parseRouteChainId } from "@/lib/chains";
import { isAddress } from "viem";

export const metadata: Metadata = {
  title: "v0 CreditLine — Interline",
};

export default async function LegacyDirectPage({
  params,
}: {
  params: Promise<{ chainId: string; facility: string }>;
}) {
  const { chainId: chainRaw, facility } = await params;
  const chainId = parseRouteChainId(chainRaw);
  if (!chainId || !isAddress(facility)) {
    return (
      <section className="px-6 py-10">
        <h1 className="font-[var(--font-bebas)] text-4xl">INVALID LEGACY LINE</h1>
      </section>
    );
  }
  return <LegacyCreditLineViewer chainId={chainId} facility={facility} />;
}
