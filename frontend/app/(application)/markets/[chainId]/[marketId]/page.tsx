import type { Metadata } from "next";
import { MarketDetail } from "@/features/markets/market-detail";
import { parseMarketIdParam, parseRouteChainId } from "@/lib/chains";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; marketId: string }>;
}): Promise<Metadata> {
  const { chainId, marketId } = await params;
  return { title: `Market ${marketId.slice(0, 10)} · ${chainId} — Interline` };
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ chainId: string; marketId: string }>;
}) {
  const { chainId: chainRaw, marketId: marketRaw } = await params;
  const chainId = parseRouteChainId(chainRaw);
  const marketId = parseMarketIdParam(marketRaw);
  if (!chainId || !marketId) {
    return (
      <section className="px-6 py-10">
        <h1 className="font-[var(--font-bebas)] text-4xl">INVALID MARKET</h1>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          chainId must be 31337, 84532, or 11155111. marketId is a catalog slug or market address.
        </p>
      </section>
    );
  }
  return <MarketDetail chainId={chainId} marketId={marketId} />;
}
