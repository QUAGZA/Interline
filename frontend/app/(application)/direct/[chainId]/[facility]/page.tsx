import type { Metadata } from "next";
import { Suspense } from "react";
import { FacilityDetail } from "@/features/direct/facility-detail";
import { parseRouteChainId } from "@/lib/chains";
import { isAddress } from "viem";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; facility: string }>;
}): Promise<Metadata> {
  const { facility } = await params;
  return { title: `Agreement ${facility.slice(0, 10)} — Direct lending` };
}

export default async function DirectFacilityPage({
  params,
}: {
  params: Promise<{ chainId: string; facility: string }>;
}) {
  const { chainId: chainRaw, facility } = await params;
  const chainId = parseRouteChainId(chainRaw);
  if (!chainId || !isAddress(facility)) {
    return (
      <section className="px-6 py-10">
        <h1 className="font-[var(--font-bebas)] text-4xl">INVALID AGREEMENT</h1>
        <p className="mt-3 font-mono text-sm text-muted-foreground">chainId must be 31337, 84532, or 11155111.</p>
      </section>
    );
  }
  return (
    <Suspense fallback={<p className="px-6 py-10 font-mono text-sm text-muted-foreground">Loading agreement…</p>}>
      <FacilityDetail chainId={chainId} facility={facility} />
    </Suspense>
  );
}
