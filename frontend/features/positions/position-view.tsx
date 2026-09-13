"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { maxUint256, type Hex } from "viem";
import { toast } from "sonner";
import { HeaderMeta, PageHeader, TestAssetBadge } from "@/components/ui/chrome";
import { HeroMetric } from "@/components/ui/hero-metric";
import { InfoTip } from "@/components/ui/info-tip";
import { WorkspaceSplit } from "@/features/layout/workspace-split";
import { MarketActions } from "@/features/markets/market-actions";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { LiquidationScenarioCard, RecallClock } from "@/features/risk/liquidation-scenario";
import { TestnetPanel } from "@/features/testnet-panel";
import { useMarketQuery, usePositionQuery } from "@/hooks/useV2Api";
import { lendingMarketAbi } from "@/lib/abi-market";
import { chainName, sameAddr } from "@/lib/chains";
import { formatUsdFromWad } from "@/lib/money";
import { shortAddr } from "@/lib/format";
import { errMsg } from "@/lib/errors";
import { useTxMachine } from "@/features/transactions/tx-store";
import { runMarketTx } from "@/features/transactions/run-tx";
import { TxStatusList } from "@/features/transactions/tx-status";
import { parseTokenInput } from "@/lib/format";
import { liquidationCapacity } from "@/lib/forecast";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";

export function PositionView({
  chainId,
  marketId,
  owner,
}: {
  chainId: number;
  marketId: string;
  owner: `0x${string}`;
}) {
  const pos = usePositionQuery(chainId, marketId, owner);
  const market = useMarketQuery(chainId, marketId);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const isOwner = sameAddr(address, owner);
  const m = market.data?.data;
  const p = pos.data?.data;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!p) {
    return (
      <section className="px-4 md:px-6 py-10">
        <PageHeader kicker="Position" title="NOT FOUND" />
      </section>
    );
  }

  const liqCapacity = liquidationCapacity(
    BigInt(p.collateralValueLoan.raw || "0"),
    BigInt(m?.liquidationThresholdBps ?? 9000),
  ).toString();

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-5">
      <PageHeader
        size="page"
        kicker={`${chainName(chainId)} · ${p.deliveryMode}`}
        title="POSITION"
        description={p.marketLabel}
        actions={<HeaderMeta usingStub={pos.data?.usingStub} stale={pos.data?.stale} source={pos.data?.source} />}
      />
      <p className="font-mono text-xs text-muted-foreground">
        {shortAddr(owner)}
        {p.deliveryMode === "restricted" && p.vaultAddress ? ` · vault ${shortAddr(p.vaultAddress)}` : null}{" "}
        <TestAssetBadge />
        {p.deliveryMode === "restricted" ? (
          <InfoTip>Vault exposure is not extra collateral and is not an extra pool receivable.</InfoTip>
        ) : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroMetric label="Debt" value={<TokenAmount {...p.debt} />} />
        <HeroMetric label="Collateral" value={<TokenAmount {...p.collateral} digits={4} />} subline={formatUsdFromWad(p.collateralUsdWad)} />
        <HeroMetric
          label="Health"
          value={<HealthDisplay code={p.healthCode} wad={p.healthFactorWad} liquidatable={p.liquidatable} />}
        />
        <HeroMetric
          label="Supply"
          value={<TokenAmount {...p.supplyAssets} />}
          subline={
            <>
              Withdrawable <TokenAmount {...p.maxWithdraw} />
            </>
          }
        />
      </div>

      <WorkspaceSplit
        main={
          <>
            <details className="border border-border/40 px-3 py-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                More
              </summary>
              <dl className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-2">
                <div>
                  Principal <TokenAmount {...p.principal} />
                </div>
                <div>
                  Written-off <TokenAmount {...p.writtenOffLiability} />
                </div>
              </dl>
            </details>
            {m ? (
              <LiquidationScenarioCard
                healthCode={p.healthCode}
                liquidatable={p.liquidatable}
                oracleStatus={m.oracleStatus}
                debtShares={p.debtShares}
                epochIndexRay={m.epochIndexRay}
                epochAprRay={m.borrowAprRay}
                epochTimestamp={m.epochTimestamp}
                recordedTimestamp={p.freshness.indexedBlockTimestamp}
                liquidationCapacityRaw={liqCapacity}
              />
            ) : null}
            <RecallClock active={p.recallActive} deadlineUnix={p.recallDeadline} nowSec={now} />
            <Link href={`/accounts/${chainId}/${owner}`} className="block font-mono text-[11px] uppercase tracking-widest text-accent">
              Watch-only account
            </Link>
          </>
        }
        rail={
          <>
            {m && isOwner ? <TestnetPanel chainId={chainId} /> : null}
            {m && isOwner ? (
              <MarketActions
                market={m}
                owner={owner}
                debtRaw={p.debt.raw}
                maxWithdrawRaw={p.maxWithdraw.raw}
                initialTab={BigInt(p.debt.raw) > 0n ? "repay" : "supply"}
              />
            ) : null}
            {m && !isOwner && isConnected ? (
              <ThirdPartyActions
                chainId={chainId}
                marketId={marketId}
                marketAddress={m.address}
                owner={owner}
                writable={Boolean(m.writable)}
                loan={m.loan}
                decimals={m.loan.decimals}
                walletChainId={walletChainId}
              />
            ) : null}
            {p.liquidatable && isConnected ? (
              <LiquidateButton
                chainId={chainId}
                marketId={marketId}
                marketAddress={m?.address}
                owner={owner}
                writable={Boolean(m?.writable)}
                loan={m?.loan.address}
                walletChainId={walletChainId}
              />
            ) : null}
            {!isConnected ? (
              <p className="font-mono text-xs text-muted-foreground">
                Connect to repay or liquidate.{" "}
                <Link href={`/connect?return=/positions/${chainId}/${marketId}/${owner}`} className="text-accent">
                  Connect
                </Link>
              </p>
            ) : null}
          </>
        }
      />
    </section>
  );
}

function ThirdPartyActions({
  chainId,
  marketId,
  marketAddress,
  owner,
  writable,
  loan,
  decimals,
  walletChainId,
}: {
  chainId: number;
  marketId: string;
  marketAddress: `0x${string}`;
  owner: `0x${string}`;
  writable: boolean;
  loan: { address: `0x${string}`; decimals: number; symbol: string };
  decimals: number;
  walletChainId?: number;
}) {
  const [human, setHuman] = useState("");
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const key = actionKey({
    chainId,
    account: address ?? "disconnected",
    facility: marketAddress,
    action: `repay-third-party-${owner}`,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function repay() {
    if (!address || !publicClient || !walletClient) return;
    if (walletChainId !== chainId) {
      toast.error(`Switch wallet to chain ${chainId}`);
      return;
    }
    if (!writable) {
      toast.message("Fixture market — writes wait for a live manifest.");
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    const amount = parseTokenInput(human, decimals);
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind: "repay",
      chainId,
      marketId,
      amountRaw: amount.toString(),
      spender: marketAddress,
      tokenSymbol: loan.symbol,
      phase: "editing",
      updatedAt: Date.now(),
    });
    try {
      await runMarketTx({
        id,
        patch: tx.patch,
        publicClient,
        walletClient,
        account: address,
        token: loan.address,
        spender: marketAddress,
        amount,
        needsApprove: true,
        simulate: async () => {
          await publicClient.simulateContract({
            account: address,
            address: marketAddress,
            abi: lendingMarketAbi,
            functionName: "repay",
            args: [owner, amount],
          });
        },
        writeAction: (): Promise<Hex> =>
          walletClient.writeContract({
            account: address,
            address: marketAddress,
            abi: lendingMarketAbi,
            functionName: "repay",
            args: [owner, amount],
            chain: walletClient.chain,
          }),
      });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="border border-border/50 bg-card p-4 space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Third-party repay</h3>
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-2 py-1.5 font-mono text-sm"
        placeholder={`${loan.symbol} amount`}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void repay()}
        className="border border-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Repay"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}

function LiquidateButton({
  chainId,
  marketId,
  marketAddress,
  owner,
  writable,
  loan,
  walletChainId,
}: {
  chainId: number;
  marketId: string;
  marketAddress?: `0x${string}`;
  owner: `0x${string}`;
  writable: boolean;
  loan?: `0x${string}`;
  walletChainId?: number;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const key = actionKey({
    chainId,
    account: address ?? "disconnected",
    facility: marketAddress ?? "market",
    action: `liquidate-${owner}`,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function run() {
    if (!address || !publicClient || !walletClient || !loan || !marketAddress) return;
    if (walletChainId !== chainId) {
      toast.error(`Switch wallet to chain ${chainId}`);
      return;
    }
    if (!writable) {
      toast.message("Fixture market — liquidation waits for a live manifest.");
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind: "liquidate",
      chainId,
      marketId,
      amountRaw: "0",
      spender: marketAddress,
      tokenSymbol: "mUSDC",
      phase: "editing",
      updatedAt: Date.now(),
    });
    try {
      await runMarketTx({
        id,
        patch: tx.patch,
        publicClient,
        walletClient,
        account: address,
        token: loan,
        spender: marketAddress,
        amount: 0n,
        needsApprove: true,
        simulate: async () => {
          await publicClient.simulateContract({
            account: address,
            address: marketAddress,
            abi: lendingMarketAbi,
            functionName: "liquidate",
            args: [owner, 0n, 0n, maxUint256, 0n],
          });
        },
        writeAction: (): Promise<Hex> =>
          walletClient.writeContract({
            account: address,
            address: marketAddress,
            abi: lendingMarketAbi,
            functionName: "liquidate",
            args: [owner, 0n, 0n, maxUint256, 0n],
            chain: walletClient.chain,
          }),
      });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="border border-destructive/50 bg-card p-4 space-y-2">
      <p className="font-mono text-[11px] text-destructive">This position is liquidatable at current simulated prices.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="border border-destructive bg-destructive px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Liquidate"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
