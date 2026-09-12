"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OracleBanner, PageHeader, SourceBanner, StatusPill, TestAssetBadge } from "@/components/ui/chrome";
import { useMarketsQuery } from "@/hooks/useV2Api";
import { parseRouteChainId } from "@/lib/chains";
import { defaultV2ChainId } from "@/lib/config";
import { useAppPrefs } from "@/features/settings/prefs";
import { formatApyFromGrowthRay, formatRayPercent, formatTokenAmount } from "@/lib/money";
import type { MarketSummaryDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function utilPct(ray: string): string {
  return formatRayPercent(ray, 1);
}

export function MarketsTable() {
  const search = useSearchParams();
  const router = useRouter();
  const { prefs } = useAppPrefs();
  const chainId = parseRouteChainId(search.get("chainId") ?? undefined) ?? prefs.defaultChainId ?? defaultV2ChainId;
  const q = useMarketsQuery(chainId);
  const usingStub = q.data?.usingStub ?? true;
  const rows = q.data?.data ?? [];

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto">
      <PageHeader
        kicker="01 / Markets"
        title="MARKETS"
        description="Isolated pools. Public totals. Wallet not required. Each row is one loan asset and one collateral asset."
        actions={<OracleBanner />}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Chain
          <select
            className="ml-2 border border-border bg-background px-2 py-1 text-foreground"
            value={chainId}
            onChange={(e) => router.push(`/markets?chainId=${e.target.value}`)}
          >
            <option value="31337">Anvil</option>
            <option value="84532">Base Sepolia</option>
          </select>
        </label>
      </div>
      <SourceBanner usingStub={usingStub} />
      {q.isError ? (
        <p className="mt-4 font-mono text-sm text-destructive">Market list unavailable.</p>
      ) : null}

      <div className="mt-6 hidden md:block overflow-x-auto border border-border/50">
        <table className="w-full text-left">
          <thead className="border-b border-border/50 bg-card">
            <tr className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-3">Asset pair</th>
              <th className="px-3 py-3">Mode</th>
              <th className="px-3 py-3">Supply APY</th>
              <th className="px-3 py-3">Borrow APR</th>
              <th className="px-3 py-3">Supplied</th>
              <th className="px-3 py-3">Borrowed</th>
              <th className="px-3 py-3">Liquidity</th>
              <th className="px-3 py-3">Util</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <MarketRow key={`${m.chainId}-${m.marketId}`} market={m} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {rows.map((m) => (
          <MarketCard key={`${m.chainId}-${m.marketId}`} market={m} />
        ))}
      </div>
      {rows.length === 0 && !q.isLoading ? (
        <p className="mt-6 font-mono text-sm text-muted-foreground">No markets on this chain.</p>
      ) : null}
    </section>
  );
}

function MarketRow({ market: m }: { market: MarketSummaryDto }) {
  const href = `/markets/${m.chainId}/${m.marketId}`;
  return (
    <tr className="border-b border-border/30 hover:bg-card/60">
      <td className="px-3 py-3">
        <Link href={href} className="font-mono text-sm text-foreground hover:text-accent">
          {m.loan.symbol} / {m.collateral.symbol}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{m.label}</span>
          <TestAssetBadge />
        </div>
      </td>
      <td className="px-3 py-3 font-mono text-xs capitalize">{m.deliveryMode}</td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">{formatApyFromGrowthRay(m.supplyApyGrowthRay)}</td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">{formatRayPercent(m.borrowAprRay)}</td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">
        {formatTokenAmount(m.supplied.raw, m.supplied.decimals, m.supplied.symbol)}
      </td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">
        {formatTokenAmount(m.borrowed.raw, m.borrowed.decimals, m.borrowed.symbol)}
      </td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">
        {formatTokenAmount(m.liquidity.raw, m.liquidity.decimals, m.liquidity.symbol)}
      </td>
      <td className="px-3 py-3 font-mono text-xs tabular-nums">{utilPct(m.utilizationRay)}</td>
      <td className="px-3 py-3">
        <StatusPill status={m.status} />
      </td>
    </tr>
  );
}

function MarketCard({ market: m }: { market: MarketSummaryDto }) {
  return (
    <Link href={`/markets/${m.chainId}/${m.marketId}`} className="block border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm">
            {m.loan.symbol} / {m.collateral.symbol}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">{m.label}</p>
        </div>
        <StatusPill status={m.status} />
      </div>
      <p className={cn("font-mono text-[10px] uppercase tracking-widest text-muted-foreground")}>
        {m.deliveryMode} · <TestAssetBadge />
      </p>
      <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div>
          <dt className="text-muted-foreground">Supply APY</dt>
          <dd>{formatApyFromGrowthRay(m.supplyApyGrowthRay)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Borrow APR</dt>
          <dd>{formatRayPercent(m.borrowAprRay)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Supplied</dt>
          <dd>{formatTokenAmount(m.supplied.raw, m.supplied.decimals)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Borrowed</dt>
          <dd>{formatTokenAmount(m.borrowed.raw, m.borrowed.decimals)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Liquidity</dt>
          <dd>{formatTokenAmount(m.liquidity.raw, m.liquidity.decimals)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Util</dt>
          <dd>{utilPct(m.utilizationRay)}</dd>
        </div>
      </dl>
    </Link>
  );
}
