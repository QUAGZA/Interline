"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { OracleBanner, PageHeader, SourceBanner, StatusPill, TestAssetBadge } from "@/components/ui/chrome";
import { MarketActions } from "@/features/markets/market-actions";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { LiquidationScenarioCard, RecallClock } from "@/features/risk/liquidation-scenario";
import { useMarketQuery, usePositionQuery } from "@/hooks/useV2Api";
import { formatApyFromGrowthRay, formatRayPercent, formatTokenAmount } from "@/lib/money";
import { shortAddr } from "@/lib/format";
import { chainName } from "@/lib/chains";
import { useEffect, useState } from "react";

export function MarketDetail({ chainId, marketId }: { chainId: number; marketId: string }) {
  const q = useMarketQuery(chainId, marketId);
  const { address } = useAccount();
  const pos = usePositionQuery(chainId, marketId, address ?? "0x0000000000000000000000000000000000000000", Boolean(address));
  const market = q.data?.data;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (q.isLoading) {
    return (
      <section className="px-4 md:px-6 py-10">
        <p className="font-mono text-sm text-muted-foreground">Loading market…</p>
      </section>
    );
  }
  if (!market) {
    return (
      <section className="px-4 md:px-6 py-10">
        <PageHeader kicker="Market" title="NOT FOUND" description="Unknown chain or market id." />
        <Link href="/markets" className="font-mono text-xs uppercase tracking-widest text-accent">
          Back to markets
        </Link>
      </section>
    );
  }

  const position = pos.data?.data;
  const liqCapacity = position?.collateralValueLoan.raw
    ? (
        (BigInt(position.collateralValueLoan.raw) * BigInt(market.liquidationThresholdBps)) /
        10000n
      ).toString()
    : "0";

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-8">
      <PageHeader
        kicker={`${chainName(chainId)} / ${market.deliveryMode}`}
        title={market.label.toUpperCase()}
        description={`${market.loan.symbol} loan · ${market.collateral.symbol} collateral. Isolation: this pool cannot spend another market's cash.`}
        actions={<OracleBanner />}
      />
      <SourceBanner usingStub={q.data?.usingStub} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={market.status} />
        <TestAssetBadge />
        <span className="font-mono text-[11px] text-muted-foreground">
          {market.marketId} · {shortAddr(market.address)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Supply APY" value={formatApyFromGrowthRay(market.supplyApyGrowthRay)} />
        <Stat label="Borrow APR" value={formatRayPercent(market.borrowAprRay)} />
        <Stat
          label="Supplied"
          value={formatTokenAmount(market.supplied.raw, market.supplied.decimals, market.supplied.symbol)}
        />
        <Stat
          label="Borrowed"
          value={formatTokenAmount(market.borrowed.raw, market.borrowed.decimals, market.borrowed.symbol)}
        />
        <Stat
          label="Cash / liquidity"
          value={formatTokenAmount(market.liquidity.raw, market.liquidity.decimals, market.liquidity.symbol)}
        />
        <Stat label="Utilisation" value={formatRayPercent(market.utilizationRay)} />
        <Stat label="Max LTV" value={`${(market.maxLtvBps / 100).toFixed(0)}%`} />
        <Stat label="Liq. threshold" value={`${(market.liquidationThresholdBps / 100).toFixed(0)}%`} />
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        Supplied is not a guarantee of immediately withdrawable cash. Caps never block repay, liquidation, or withdrawal.
      </p>

      {position && address ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-border/50 bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your supply</p>
            <p className="mt-2">
              <TokenAmount {...position.supplyAssets} />
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Withdrawable <TokenAmount {...position.maxWithdraw} />
            </p>
          </div>
          <div className="border border-border/50 bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your debt</p>
            <p className="mt-2">
              <TokenAmount {...position.debt} />
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Collateral <TokenAmount {...position.collateral} />
            </p>
          </div>
          <div className="border border-border/50 bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Health</p>
            <p className="mt-2">
              <HealthDisplay code={position.healthCode} wad={position.healthFactorWad} liquidatable={position.liquidatable} />
            </p>
            <Link
              href={`/positions/${chainId}/${marketId}/${address}`}
              className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-accent"
            >
              Open position
            </Link>
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">
          Connect to manage a position. Public totals above do not require a wallet.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MarketActions market={market} owner={address} />
        <div className="space-y-4">
          {position ? (
            <LiquidationScenarioCard
              healthCode={position.healthCode}
              liquidatable={position.liquidatable}
              debtRaw={position.debt.raw}
              liquidationCapacityRaw={liqCapacity}
              borrowAprRay={market.borrowAprRay}
            />
          ) : null}
          <RecallClock active={market.recallActive} deadlineUnix={market.recallDeadline} nowSec={now} />
          {market.deliveryMode === "restricted" ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Optional negotiated ceiling is an advanced restricted-facility flow. Ordinary collateralized borrowing does
              not require a hashed cap.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/50 bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}
