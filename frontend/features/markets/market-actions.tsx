"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex, type PublicClient } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { lendingMarketAbi } from "@/lib/abi-market";
import { qk } from "@/lib/api/keys";
import type { MarketDetailDto } from "@/lib/api/types";
import { isLiveTokenAddress } from "@/lib/catalog";
import { isV2ChainId } from "@/lib/chains";
import { formatTokenUnits, formatUnits, parseTokenInput } from "@/lib/format";
import { errMsg } from "@/lib/errors";
import { useTxMachine, type TxKind } from "@/features/transactions/tx-store";
import { runMarketTx } from "@/features/transactions/run-tx";
import { TxStatusList } from "@/features/transactions/tx-status";
import { cn } from "@/lib/utils";
import { debtFromShares, quotePoolBorrow, quotePoolSupply, quotePoolWithdraw } from "@/lib/execution-bounds";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";
import { TestnetFaucetButton } from "@/features/testnet-faucet";
import { SimulatedOracleRefresh } from "@/features/simulated-oracle";
import { InfoTip } from "@/components/ui/info-tip";

type Tab = "supply" | "borrow" | "repay";
type MarketCall = "supply" | "withdraw" | "borrow" | "addCollateral" | "removeCollateral" | "repay" | "repayAll";

export function MarketActions({
  market,
  owner,
  debtRaw,
  maxWithdrawRaw,
  initialTab,
  showTestnet = false,
}: {
  market: MarketDetailDto;
  owner?: Address;
  debtRaw?: string;
  maxWithdrawRaw?: string;
  initialTab?: Tab;
  showTestnet?: boolean;
}) {
  const debtWei = (() => {
    try {
      return debtRaw ? BigInt(debtRaw) : 0n;
    } catch {
      return 0n;
    }
  })();
  const [tab, setTab] = useState<Tab>(initialTab ?? (debtWei > 0n ? "repay" : "supply"));
  const owed = formatOwed(debtRaw, market.loan.decimals, market.loan.symbol);
  return (
    <div className="border border-border/50 bg-card p-4 space-y-4">
      {showTestnet ? (
        <>
          <TestnetFaucetButton chainId={market.chainId} />
          <SimulatedOracleRefresh chainId={market.chainId} />
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(["supply", "borrow", "repay"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest",
              tab === t ? "border-accent text-accent" : "border-border text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "supply" ? (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            Pooled {market.loan.symbol}
            <InfoTip>You supply into pooled liquidity, not to a named lender. Withdrawing returns your shares as {market.loan.symbol}.</InfoTip>
          </p>
          <ActionField
            market={market}
            owner={owner}
            call="supply"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Supply amount"
            needsApprove
          />
          <ActionField
            market={market}
            owner={owner}
            call="withdraw"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Withdraw amount"
            needsApprove={false}
            maxRaw={maxWithdrawRaw}
            emptyHint="Nothing supplied to withdraw"
            allowWithdrawMax
          />
        </div>
      ) : null}
      {tab === "borrow" ? (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            Collateral then borrow
            <InfoTip>
              Collateral is escrowed separately. Supplier shares are not collateral. Borrowed tokens are not collateral.
              {market.deliveryMode === "restricted"
                ? " Restricted mode sends borrowed mUSDC to the owner vault, not the EOA."
                : " Wallet mode sends borrowed mUSDC to the owner wallet."}
            </InfoTip>
          </p>
          <ActionField
            market={market}
            owner={owner}
            call="addCollateral"
            token={market.collateral.address}
            decimals={market.collateral.decimals}
            symbol={market.collateral.symbol}
            spender={market.address}
            label="Add collateral"
            needsApprove
          />
          <ActionField
            market={market}
            owner={owner}
            call="borrow"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Borrow amount"
            needsApprove={false}
          />
        </div>
      ) : null}
      {tab === "repay" ? (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            {owed ? `You owe ${owed}` : "No outstanding debt"}
            <InfoTip>Repayment pays this pool, not a named lender. Anyone may repay. Only the position owner can remove collateral.</InfoTip>
          </p>
          <ActionField
            market={market}
            owner={owner}
            call="repay"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Repay"
            needsApprove
            debtRaw={debtRaw}
            allowRepayMax
          />
          <ActionField
            market={market}
            owner={owner}
            call="removeCollateral"
            token={market.collateral.address}
            decimals={market.collateral.decimals}
            symbol={market.collateral.symbol}
            spender={market.address}
            label="Remove collateral"
            needsApprove={false}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatOwed(debtRaw: string | undefined, decimals: number, symbol: string): string | undefined {
  if (!debtRaw) return undefined;
  try {
    const raw = BigInt(debtRaw);
    if (raw <= 0n) return undefined;
    return `${formatTokenUnits(raw, decimals)} ${symbol}`;
  } catch {
    return undefined;
  }
}

function ActionField({
  market,
  owner,
  call,
  token,
  decimals,
  symbol,
  spender,
  label,
  needsApprove,
  maxRaw,
  emptyHint,
  debtRaw,
  allowRepayMax,
  allowWithdrawMax,
}: {
  market: MarketDetailDto;
  owner?: Address;
  call: MarketCall;
  token: Address;
  decimals: number;
  symbol: string;
  spender: Address;
  label: string;
  needsApprove: boolean;
  maxRaw?: string;
  emptyHint?: string;
  debtRaw?: string;
  allowRepayMax?: boolean;
  allowWithdrawMax?: boolean;
}) {
  const [human, setHuman] = useState("");
  const [repayMax, setRepayMax] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: market.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const effectiveCall: MarketCall = call === "repay" && repayMax ? "repayAll" : call;
  const kind = txKindFor(effectiveCall);
  const key = actionKey({
    chainId: market.chainId,
    account: address ?? "disconnected",
    facility: market.address,
    action: `${kind}-${effectiveCall}`,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));
  const withdrawOwner = owner ?? address;
  const liveMaxWithdraw = useReadContract({
    address: market.address,
    abi: lendingMarketAbi,
    functionName: "maxWithdraw",
    args: withdrawOwner ? [withdrawOwner] : undefined,
    chainId: market.chainId,
    query: { enabled: Boolean(allowWithdrawMax && withdrawOwner), refetchInterval: 8_000 },
  });
  const liveMaxWei = typeof liveMaxWithdraw.data === "bigint" ? liveMaxWithdraw.data : undefined;
  const maxWei = liveMaxWei ?? safeBig(maxRaw);
  const debtWei = safeBig(debtRaw);
  const withdrawEmpty = call === "withdraw" && maxWei === 0n;
  const displayHuman = repayMax && debtWei > 0n ? formatUnits(debtWei, decimals) : human;

  useEffect(() => {
    if (repayMax && debtWei > 0n) setHuman(formatUnits(debtWei, decimals));
  }, [repayMax, debtWei, decimals]);

  useEffect(() => {
    if (!publicClient || !address || (effectiveCall !== "supply" && effectiveCall !== "withdraw" && effectiveCall !== "borrow")) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const amount = parseTokenInput(displayHuman, decimals);
        if (amount <= 0n) {
          if (!cancelled) setPreview(null);
          return;
        }
        const quoted = await quoteMarketCall(publicClient, market.address, owner ?? address, effectiveCall, amount, {
          decimals,
          symbol,
        });
        if (!cancelled) setPreview(quoted.preview);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, decimals, displayHuman, effectiveCall, market.address, owner, publicClient, symbol]);

  async function onSubmit() {
    if (!isConnected || !address) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== market.chainId) {
      toast.error(`Switch the wallet to chain ${market.chainId} before writing.`);
      return;
    }
    if (!market.writable) {
      toast.message("This market is a fixture until a live deployment manifest is indexed.");
      return;
    }
    if (!isLiveTokenAddress(market.loan.address) || !isLiveTokenAddress(token)) {
      toast.error("Loan token address is a fixture. Refresh so the catalog stamps live Sepolia tokens.");
      return;
    }
    if (!publicClient || !walletClient) {
      toast.error("No client for this chain.");
      return;
    }
    const code = await publicClient.getCode({ address: market.loan.address });
    if (!code || code === "0x") {
      toast.error("Loan token has no code on this chain. Catalog tokens are not live here.");
      return;
    }
    if (withdrawEmpty) {
      toast.message(emptyHint ?? "Nothing supplied to withdraw");
      return;
    }
    let amount: bigint;
    try {
      amount = parseTokenInput(displayHuman, decimals);
    } catch {
      toast.error("Invalid amount.");
      return;
    }
    if (effectiveCall === "repayAll" && debtWei > 0n) {
      amount = debtWei + debtWei / 1000n + 1n;
    }
    if (amount <= 0n) {
      toast.error("Enter an amount.");
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    const positionOwner = owner ?? address;
    const quoted = await quoteMarketCall(publicClient, market.address, positionOwner, effectiveCall, amount, {
      decimals,
      symbol,
    });
    setPreview(quoted.preview);
    const { fn, args } = quoted;
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind,
      chainId: market.chainId,
      marketId: market.marketId,
      amountRaw: amount.toString(),
      spender,
      tokenSymbol: symbol,
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
        token,
        spender,
        amount,
        needsApprove,
        expectedChainId: market.chainId,
        simulate: async () => {
          const { request } = await publicClient.simulateContract({
            account: address,
            address: market.address,
            abi: lendingMarketAbi,
            functionName: fn,
            args: args as never,
          });
          void request;
        },
        writeAction: (): Promise<Hex> =>
          walletClient.writeContract({
            account: address,
            address: market.address,
            abi: lendingMarketAbi,
            functionName: fn,
            args: args as never,
            chain: walletClient.chain,
          }),
      });
      toast.success("Confirmed");
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.market(market.chainId, market.marketId) }),
        owner
          ? qc.invalidateQueries({ queryKey: qk.position(market.chainId, market.marketId, owner) })
          : Promise.resolve(),
        address && isV2ChainId(market.chainId)
          ? qc.invalidateQueries({ queryKey: qk.portfolio(market.chainId, address) })
          : Promise.resolve(),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  function fillWithdrawMax() {
    if (maxWei <= 0n) {
      toast.message(emptyHint ?? "Nothing supplied to withdraw");
      return;
    }
    setHuman(formatUnits(maxWei, decimals));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="block min-w-0 flex-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label} ({symbol})
          <input
            value={displayHuman}
            onChange={(e) => setHuman(e.target.value)}
            inputMode="decimal"
            disabled={repayMax || withdrawEmpty}
            className="mt-1 w-full border border-border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        {allowWithdrawMax ? (
          <button
            type="button"
            disabled={withdrawEmpty || maxWei <= 0n}
            onClick={fillWithdrawMax}
            className="shrink-0 border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
          >
            Max
          </button>
        ) : null}
      </div>
      {allowWithdrawMax ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Max is your supply converted at the current pool index (principal plus earned interest), capped by idle cash.
        </p>
      ) : null}
      {allowRepayMax ? (
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={repayMax}
            onChange={(e) => setRepayMax(e.target.checked)}
            disabled={debtWei <= 0n}
          />
          Repay max (fills outstanding {symbol} and calls repay all)
        </label>
      ) : null}
      {preview ? <p className="font-mono text-[11px] text-muted-foreground">{preview}</p> : null}
      <button
        type="button"
        disabled={Boolean(busy) || withdrawEmpty}
        onClick={() => void onSubmit()}
        className="border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-foreground disabled:opacity-40"
      >
        {withdrawEmpty ? emptyHint : busy ? record?.phase.replaceAll("_", " ") : repayMax ? "Repay max" : label}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}

function txKindFor(call: MarketCall): TxKind {
  if (call === "repay" || call === "repayAll") return "repay";
  return call;
}

function safeBig(raw: string | undefined): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

async function quoteMarketCall(
  client: PublicClient,
  market: Address,
  owner: Address,
  call: MarketCall,
  amount: bigint,
  token: { decimals: number; symbol: string },
): Promise<{
  fn: "supply" | "withdraw" | "borrow" | "addCollateral" | "removeCollateral" | "repay" | "repayAll";
  args: readonly unknown[];
  preview: string | null;
}> {
  const shown = `${formatTokenUnits(amount, token.decimals)} ${token.symbol}`;
  if (call === "supply") {
    const q = await quotePoolSupply(client, market, owner, amount);
    return {
      fn: "supply",
      args: [amount, q.minSharesOut],
      preview: `Supply ${shown} into this pool. Min shares are protected by a 0.10% quote tolerance.`,
    };
  }
  if (call === "withdraw") {
    const q = await quotePoolWithdraw(client, market, owner, amount);
    return {
      fn: "withdraw",
      args: [amount, q.maxSharesBurn],
      preview: `Withdraw ${shown} from your supply. Max shares burned uses a 0.10% quote tolerance.`,
    };
  }
  if (call === "borrow") {
    const q = await quotePoolBorrow(client, market, owner, amount);
    const index = await client.readContract({
      address: market,
      abi: lendingMarketAbi,
      functionName: "indexNow",
    });
    const owe = debtFromShares(q.debtSharesAfter, index);
    return {
      fn: "borrow",
      args: [amount, q.maxDebtShares],
      preview: `Borrow ${shown}. You will owe about ${formatTokenUnits(owe, token.decimals)} ${token.symbol} after this borrow.`,
    };
  }
  if (call === "addCollateral") return { fn: "addCollateral", args: [owner, amount], preview: `Post ${shown} as collateral.` };
  if (call === "removeCollateral") return { fn: "removeCollateral", args: [amount], preview: `Remove ${shown} collateral.` };
  if (call === "repayAll") {
    return { fn: "repayAll", args: [owner, amount], preview: `Repay outstanding debt. Budget ${shown}.` };
  }
  return { fn: "repay", args: [owner, amount], preview: `Repay ${shown}.` };
}

