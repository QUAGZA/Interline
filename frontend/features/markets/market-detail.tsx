"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { HeaderMeta, PageHeader, StatusPill, TestAssetBadge } from "@/components/ui/chrome";
import { HeroMetric } from "@/components/ui/hero-metric";
import { InfoTip } from "@/components/ui/info-tip";
import { WorkspaceSplit } from "@/features/layout/workspace-split";
import { MarketActions } from "@/features/markets/market-actions";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { LiquidationScenarioCard, RecallClock } from "@/features/risk/liquidation-scenario";
import { TestnetPanel } from "@/features/testnet-panel";
import { useMarketQuery, usePositionQuery } from "@/hooks/useV2Api";
import { useWalletCatalogBalances } from "@/hooks/useWalletCatalogBalances";
import { formatApyFromGrowthRay, formatRayPercent, formatTokenAmount } from "@/lib/money";
import { shortAddr } from "@/lib/format";
import { chainName } from "@/lib/chains";
import { useEffect, useState } from "react";
import { liquidationCapacity } from "@/lib/forecast";

export function MarketDetail({ chainId, marketId }: { chainId: number; marketId: string }) {
  const q = useMarketQuery(chainId, marketId);
  const { address } = useAccount();
  const pos = usePositionQuery(chainId, marketId, address ?? "0x0000000000000000000000000000000000000000", Boolean(address));
  const market = q.data?.data;
  const balances = useWalletCatalogBalances(chainId);
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
        <PageHeader size="page" kicker="Market" title="NOT FOUND" description="Unknown chain or market id." />
        <Link href="/markets" className="font-mono text-xs uppercase tracking-widest text-accent">
          Back to markets
        </Link>
      </section>
    );
  }

  const position = pos.data?.data;
  const debtRaw = position?.debt.raw;
  const hasDebt = Boolean(debtRaw && BigInt(debtRaw) > 0n);
  const liqCapacity = position?.collateralValueLoan.raw
    ? liquidationCapacity(
        BigInt(position.collateralValueLoan.raw),
        BigInt(market.liquidationThresholdBps),
      ).toString()
    : "0";

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-5">
      <PageHeader
        size="page"
        kicker={`${chainName(chainId)} / ${market.deliveryMode}`}
        title={market.label.toUpperCase()}
        description={`${market.loan.symbol} / ${market.collateral.symbol}`}
        actions={
          <HeaderMeta usingStub={q.data?.usingStub} stale={q.data?.stale} source={q.data?.source} extra={<StatusPill status={market.status} />} />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <TestAssetBadge />
        <span className="font-mono text-[11px] text-muted-foreground">
          {market.marketId} · {shortAddr(market.address)}
        </span>
        <InfoTip>This isolated pool cannot spend another market&apos;s cash.</InfoTip>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroMetric label="Supply APY" value={formatApyFromGrowthRay(market.supplyApyGrowthRay)} />
        <HeroMetric label="Borrow APR" value={formatRayPercent(market.borrowAprRay)} />
        <HeroMetric label="Util" value={formatRayPercent(market.utilizationRay)} />
        <HeroMetric
          label="Max LTV"
          value={`${(market.maxLtvBps / 100).toFixed(0)}%`}
          hint={`Liq. threshold ${(market.liquidationThresholdBps / 100).toFixed(0)}%. Caps never block repay, liquidation, or withdrawal.`}
        />
      </div>

      <WorkspaceSplit
        main={
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="Your supply"
                value={position ? <TokenAmount {...position.supplyAssets} /> : formatTokenAmount(0n, 6, market.loan.symbol)}
                subline={position ? <>Withdrawable <TokenAmount {...position.maxWithdraw} /></> : "Connect to manage"}
                hint="Supplied is not a guarantee of immediately withdrawable cash."
              />
              <HeroMetric
                label="Your debt"
                value={position ? <TokenAmount {...position.debt} /> : formatTokenAmount(0n, 6, market.loan.symbol)}
                subline={
                  position ? (
                    <>
                      Collateral <TokenAmount {...position.collateral} digits={4} />
                    </>
                  ) : null
                }
              />
              <HeroMetric
                label="Wallet mUSDC"
                value={formatTokenAmount(balances.musdc ?? 0n, 6)}
              />
              <HeroMetric
                label="Health"
                value={
                  position ? (
                    <HealthDisplay code={position.healthCode} wad={position.healthFactorWad} liquidatable={position.liquidatable} />
                  ) : (
                    "—"
                  )
                }
                subline={
                  address ? (
                    <Link href={`/positions/${chainId}/${marketId}/${address}`} className="text-accent">
                      Open position
                    </Link>
                  ) : null
                }
              />
            </div>
            <details className="border border-border/40 px-3 py-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Pool details
              </summary>
              <dl className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-2">
                <div>
                  Supplied <TokenAmount {...market.supplied} />
                </div>
                <div>
                  Borrowed <TokenAmount {...market.borrowed} />
                </div>
                <div>
                  Cash {formatTokenAmount(market.liquidity.raw, market.liquidity.decimals, market.liquidity.symbol)}
                </div>
                <div>Liq. threshold {(market.liquidationThresholdBps / 100).toFixed(0)}%</div>
              </dl>
            </details>
            {position ? (
              <LiquidationScenarioCard
                healthCode={position.healthCode}
                liquidatable={position.liquidatable}
                oracleStatus={market.oracleStatus}
                debtShares={position.debtShares}
                epochIndexRay={market.epochIndexRay}
                epochAprRay={market.borrowAprRay}
                epochTimestamp={market.epochTimestamp}
                recordedTimestamp={position.freshness.indexedBlockTimestamp}
                liquidationCapacityRaw={liqCapacity}
              />
            ) : null}
            <RecallClock active={market.recallActive} deadlineUnix={market.recallDeadline} nowSec={now} />
          </>
        }
        rail={
          <>
            <TestnetPanel chainId={chainId} />
            <MarketActions
              market={market}
              owner={address}
              debtRaw={debtRaw}
              maxWithdrawRaw={position?.maxWithdraw.raw}
              initialTab={hasDebt ? "repay" : "supply"}
            />
          </>
        }
      />
    </section>
  );
}
