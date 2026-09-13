"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { HeaderMeta, PageHeader } from "@/components/ui/chrome";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { usePortfolioQuery } from "@/hooks/useV2Api";
import { chainName, sameAddr } from "@/lib/chains";
import { formatUsdFromWad } from "@/lib/money";
import { shortAddr } from "@/lib/format";
import type { V2ChainId } from "@/lib/chains";

export function WatchAccount({ chainId, address }: { chainId: V2ChainId; address: `0x${string}` }) {
  const q = usePortfolioQuery(chainId, address);
  const { address: connected } = useAccount();
  const isSame = sameAddr(connected, address);
  const p = q.data?.data;

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-6">
      <PageHeader
        size="page"
        kicker={`${chainName(chainId)} · watch-only`}
        title="ACCOUNT"
        description={`${shortAddr(address)} · public portfolio`}
        actions={<HeaderMeta usingStub={q.data?.usingStub} stale={q.data?.stale} source={q.data?.source} />}
      />
      {isSame ? (
        <p className="border border-border/50 bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground">
          You are connected as this address, but this route stays watch-only. Manage positions on the{" "}
          <Link href="/dashboard" className="text-accent">
            dashboard
          </Link>
          .
        </p>
      ) : null}
      <div className="border border-border/50 bg-card px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Lowest isolated health</p>
        <div className="mt-2">
          <HealthDisplay code={p?.lowestHealthCode ?? "NONE"} wad={p?.lowestHealthFactorWad ?? null} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-[var(--font-bebas)] text-3xl mb-3">Supplies</h2>
          {(p?.supplies ?? []).length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">No supplies.</p>
          ) : (
            <ul className="space-y-3">
              {p!.supplies.map((s) => (
                <li key={s.marketId} className="border border-border/50 bg-card p-4">
                  <Link href={`/markets/${chainId}/${s.marketId}`} className="font-mono text-sm hover:text-accent">
                    {s.label}
                  </Link>
                  <p className="font-mono text-xs mt-1">
                    <TokenAmount {...s.assets} /> · withdrawable <TokenAmount {...s.maxWithdraw} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-[var(--font-bebas)] text-3xl mb-3">Borrows</h2>
          {(p?.borrows ?? []).length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">No borrows.</p>
          ) : (
            <ul className="space-y-3">
              {p!.borrows.map((row) => (
                <li key={row.marketId} className="border border-border/50 bg-card p-4">
                  <Link
                    href={`/positions/${chainId}/${row.marketId}/${address}`}
                    className="font-mono text-sm hover:text-accent"
                  >
                    {row.label}
                  </Link>
                  <p className="font-mono text-xs mt-1">
                    Debt <TokenAmount {...row.debt} /> · {formatUsdFromWad(row.collateralUsdWad)}
                  </p>
                  <HealthDisplay code={row.healthCode} wad={row.healthFactorWad} liquidatable={row.liquidatable} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
