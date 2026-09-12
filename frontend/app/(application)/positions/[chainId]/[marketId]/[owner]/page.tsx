import type { Metadata } from "next";
import { PositionView } from "@/features/positions/position-view";
import { parseAddressParam, parseMarketIdParam, parseRouteChainId } from "@/lib/chains";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; marketId: string; owner: string }>;
}): Promise<Metadata> {
  const { owner } = await params;
  return { title: `Position ${owner.slice(0, 8)} — Interline` };
}

export default async function PositionPage({
  params,
}: {
  params: Promise<{ chainId: string; marketId: string; owner: string }>;
}) {
  const raw = await params;
  const chainId = parseRouteChainId(raw.chainId);
  const marketId = parseMarketIdParam(raw.marketId);
  const owner = parseAddressParam(raw.owner);
  if (!chainId || !marketId || !owner) {
    return (
      <section className="px-6 py-10">
        <h1 className="font-[var(--font-bebas)] text-4xl">INVALID POSITION</h1>
      </section>
    );
  }
  return <PositionView chainId={chainId} marketId={marketId} owner={owner} />;
}
