"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OracleBanner, PageHeader, SourceBanner } from "@/components/ui/chrome";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { usePositionsQuery } from "@/hooks/useV2Api";
import { parseRouteChainId } from "@/lib/chains";
import { defaultV2ChainId, PAGE_SIZE } from "@/lib/config";
import { useAppPrefs } from "@/features/settings/prefs";
import { shortAddr } from "@/lib/format";
import type { DeliveryMode } from "@/lib/api/types";

export function PublicDesk() {
  const search = useSearchParams();
  const router = useRouter();
  const { prefs } = useAppPrefs();
  const chainId = parseRouteChainId(search.get("chainId") ?? undefined) ?? prefs.defaultChainId ?? defaultV2ChainId;
  const marketId = search.get("marketId") ?? undefined;
  const mode = (search.get("mode") ?? "") as DeliveryMode | "";
  const cursor = search.get("cursor") ?? undefined;

  const q = usePositionsQuery({
    chainId,
    marketId: marketId || undefined,
    deliveryMode: mode || undefined,
    cursor,
    sort: "debt",
    limit: PAGE_SIZE,
  });
  const page = q.data?.data;
  const rows = page?.items ?? [];

  function push(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/desk?${sp.toString()}`);
  }

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto">
      <PageHeader
        kicker="02 / Desk"
        title="PUBLIC DESK"
        description="Active loans, keyed by chain, market, and owner. Sorted by current debt. Wallet not required."
        actions={<OracleBanner />}
      />
      <SourceBanner usingStub={q.data?.usingStub} />
      <div className="mt-6 flex flex-wrap gap-3">
        <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Chain
          <select
            className="ml-2 border border-border bg-background px-2 py-1"
            value={chainId}
            onChange={(e) => push({ chainId: e.target.value, cursor: undefined })}
          >
            <option value="31337">Anvil</option>
            <option value="84532">Base Sepolia</option>
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Mode
          <select
            className="ml-2 border border-border bg-background px-2 py-1"
            value={mode}
            onChange={(e) => push({ mode: e.target.value || undefined, cursor: undefined })}
          >
            <option value="">All</option>
            <option value="wallet">Wallet</option>
            <option value="restricted">Restricted</option>
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Market
          <input
            className="ml-2 border border-border bg-background px-2 py-1 font-mono text-xs w-64"
            placeholder="usdc-weth-wallet"
            defaultValue={marketId ?? ""}
            onBlur={(e) => push({ marketId: e.target.value || undefined, cursor: undefined })}
          />
        </label>
      </div>

      <div className="mt-6 hidden md:block overflow-x-auto border border-border/50">
        <table className="w-full text-left">
          <thead className="border-b border-border/50 bg-card">
            <tr className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-3">Owner</th>
              <th className="px-3 py-3">Market</th>
              <th className="px-3 py-3">Mode</th>
              <th className="px-3 py-3">Debt</th>
              <th className="px-3 py-3">Collateral</th>
              <th className="px-3 py-3">HF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${p.chainId}-${p.marketId}-${p.owner}`} className="border-b border-border/30 hover:bg-card/60">
                <td className="px-3 py-3">
                  <Link
                    href={`/positions/${p.chainId}/${p.marketId}/${p.owner}`}
                    className="font-mono text-xs hover:text-accent"
                  >
                    {shortAddr(p.owner)}
                  </Link>
                </td>
                <td className="px-3 py-3 font-mono text-xs">{p.marketLabel}</td>
                <td className="px-3 py-3 font-mono text-xs capitalize">{p.deliveryMode}</td>
                <td className="px-3 py-3">
                  <TokenAmount {...p.debt} />
                </td>
                <td className="px-3 py-3">
                  <TokenAmount {...p.collateral} digits={4} />
                </td>
                <td className="px-3 py-3">
                  <HealthDisplay code={p.healthCode} wad={p.healthFactorWad} liquidatable={p.liquidatable} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {rows.map((p) => (
          <Link
            key={`${p.chainId}-${p.marketId}-${p.owner}`}
            href={`/positions/${p.chainId}/${p.marketId}/${p.owner}`}
            className="block border border-border/50 bg-card p-4 space-y-2"
          >
            <div className="flex justify-between">
              <span className="font-mono text-xs">{shortAddr(p.owner)}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {p.healthCode === "NO_DEBT" ? "No debt" : p.liquidatable ? "Liquidatable" : "Healthy"}
              </span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              {p.marketLabel} · {p.deliveryMode}
            </p>
            <p className="font-mono text-xs">
              Debt <TokenAmount {...p.debt} />
            </p>
            <HealthDisplay code={p.healthCode} wad={p.healthFactorWad} liquidatable={p.liquidatable} />
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[11px]">
        <span className="text-muted-foreground">{rows.length} of page size {PAGE_SIZE} · sort debt desc</span>
        <div className="flex gap-3">
          {cursor ? (
            <button type="button" className="uppercase tracking-widest hover:text-accent" onClick={() => push({ cursor: undefined })}>
              First page
            </button>
          ) : null}
          {page?.nextCursor ? (
            <button
              type="button"
              className="uppercase tracking-widest hover:text-accent"
              onClick={() => push({ cursor: page.nextCursor ?? undefined })}
            >
              Next
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
