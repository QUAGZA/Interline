"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { maxUint256, type Hex } from "viem";
import { toast } from "sonner";
import { OracleBanner, PageHeader, SourceBanner, TestAssetBadge } from "@/components/ui/chrome";
import { MarketActions } from "@/features/markets/market-actions";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { LiquidationScenarioCard, RecallClock } from "@/features/risk/liquidation-scenario";
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

  const liqCapacity = ((BigInt(p.collateralValueLoan.raw) * BigInt(m?.liquidationThresholdBps ?? 8000)) / 10000n).toString();

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-8">
      <PageHeader
        kicker={`${chainName(chainId)} · public loan`}
        title="POSITION"
        description={`Owner ${shortAddr(owner)}. Third parties may repay or add collateral. Only the owner withdraws, borrows, or removes collateral.`}
        actions={<OracleBanner />}
      />
      <SourceBanner usingStub={pos.data?.usingStub} />
      <p className="font-mono text-xs">
        {p.marketLabel} · {p.deliveryMode}
        {p.deliveryMode === "restricted" && p.vaultAddress ? ` · vault ${shortAddr(p.vaultAddress)}` : null}{" "}
        <TestAssetBadge />
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Debt" value={<TokenAmount {...p.debt} />} />
        <Stat label="Collateral" value={<TokenAmount {...p.collateral} digits={4} />} />
        <Stat label="Collateral USD" value={formatUsdFromWad(p.collateralUsdWad)} />
        <Stat
          label="Health"
          value={<HealthDisplay code={p.healthCode} wad={p.healthFactorWad} liquidatable={p.liquidatable} />}
        />
        <Stat label="Supply (this market)" value={<TokenAmount {...p.supplyAssets} />} />
        <Stat label="Withdrawable" value={<TokenAmount {...p.maxWithdraw} />} />
        <Stat label="Principal" value={<TokenAmount {...p.principal} />} />
        <Stat label="Written-off" value={<TokenAmount {...p.writtenOffLiability} />} />
      </div>
      {p.deliveryMode === "restricted" ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Exposure in the vault is not extra collateral and is not an extra pool receivable.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {m && isOwner ? <MarketActions market={m} owner={owner} /> : null}
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
              Connect to repay, add collateral, or liquidate.{" "}
              <Link href={`/connect?return=/positions/${chainId}/${marketId}/${owner}`} className="text-accent">
                Connect
              </Link>
            </p>
          ) : null}
        </div>
        <div className="space-y-4">
          {m ? (
            <LiquidationScenarioCard
              healthCode={p.healthCode}
              liquidatable={p.liquidatable}
              debtRaw={p.debt.raw}
              liquidationCapacityRaw={liqCapacity}
              borrowAprRay={m.borrowAprRay}
            />
          ) : null}
          <RecallClock active={p.recallActive} deadlineUnix={p.recallDeadline} nowSec={now} />
          <Link href={`/accounts/${chainId}/${owner}`} className="block font-mono text-[11px] uppercase tracking-widest text-accent">
            Watch-only account
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border/50 bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-sm tabular-nums">{value}</div>
    </div>
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
  const id = useMemo(() => `repay-${chainId}-${marketId}-${owner}`, [chainId, marketId, owner]);
  const record = tx.get(id);

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
    const amount = parseTokenInput(human, decimals);
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
        onClick={() => void repay()}
        className="border border-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest"
      >
        Repay
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
  const id = `liquidate-${chainId}-${marketId}-${owner}`;

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

  const record = tx.get(id);
  return (
    <div className="border border-destructive/50 bg-card p-4 space-y-2">
      <p className="font-mono text-[11px] text-destructive">This position is liquidatable at current simulated prices.</p>
      <button
        type="button"
        onClick={() => void run()}
        className="border border-destructive bg-destructive px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary-foreground"
      >
        Liquidate
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
