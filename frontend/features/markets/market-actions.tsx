"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, maxUint256, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { lendingMarketAbi } from "@/lib/abi-market";
import { qk } from "@/lib/api/keys";
import type { MarketDetailDto } from "@/lib/api/types";
import { parseTokenInput } from "@/lib/format";
import { errMsg } from "@/lib/errors";
import { useTxMachine, type TxKind } from "@/features/transactions/tx-store";
import { runMarketTx } from "@/features/transactions/run-tx";
import { TxStatusList } from "@/features/transactions/tx-status";
import { cn } from "@/lib/utils";

export function MarketActions({
  market,
  owner,
}: {
  market: MarketDetailDto;
  owner?: Address;
}) {
  const [tab, setTab] = useState<"supply" | "borrow">("supply");
  return (
    <div className="border border-border/50 bg-card p-4 space-y-4">
      <div className="flex gap-2">
        {(["supply", "borrow"] as const).map((t) => (
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
          <ActionField
            market={market}
            owner={owner}
            kind="supply"
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
            kind="withdraw"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Withdraw amount"
            needsApprove={false}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            Collateral is escrowed separately. Supplier shares are not collateral. Borrowed tokens are not collateral.
            {market.deliveryMode === "restricted"
              ? " Restricted mode sends borrowed mUSDC to the owner vault, not the EOA."
              : " Wallet mode sends borrowed mUSDC to the owner wallet."}
          </p>
          <ActionField
            market={market}
            owner={owner}
            kind="addCollateral"
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
            kind="borrow"
            token={market.loan.address}
            decimals={market.loan.decimals}
            symbol={market.loan.symbol}
            spender={market.address}
            label="Borrow amount"
            needsApprove={false}
          />
        </div>
      )}
    </div>
  );
}

function ActionField({
  market,
  owner,
  kind,
  token,
  decimals,
  symbol,
  spender,
  label,
  needsApprove,
}: {
  market: MarketDetailDto;
  owner?: Address;
  kind: TxKind;
  token: Address;
  decimals: number;
  symbol: string;
  spender: Address;
  label: string;
  needsApprove: boolean;
}) {
  const [human, setHuman] = useState("");
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: market.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const id = useMemo(() => `${kind}-${market.chainId}-${market.marketId}-${owner ?? "self"}`, [kind, market, owner]);
  const record = tx.get(id);
  const busy = record && !["idle", "editing", "success", "error"].includes(record.phase);

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
      tx.upsert({
        id,
        kind,
        chainId: market.chainId,
        marketId: market.marketId,
        amountRaw: "0",
        spender,
        tokenSymbol: symbol,
        phase: "error",
        error: "Writes disabled: no live market in the catalog.",
        updatedAt: Date.now(),
      });
      return;
    }
    if (!publicClient || !walletClient) {
      toast.error("No client for this chain.");
      return;
    }
    let amount: bigint;
    try {
      amount = parseTokenInput(human, decimals);
    } catch {
      toast.error("Invalid amount.");
      return;
    }
    if (amount <= 0n) {
      toast.error("Enter an amount.");
      return;
    }
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
        simulate: async () => {
          const { request } = await publicClient.simulateContract({
            account: address,
            address: market.address,
            abi: lendingMarketAbi,
            functionName: kind === "supply" ? "supply" : kind === "withdraw" ? "withdraw" : kind === "borrow" ? "borrow" : "addCollateral",
            args:
              kind === "addCollateral"
                ? [owner ?? address, amount]
                : kind === "supply"
                  ? [amount, 0n]
                  : kind === "withdraw"
                    ? [amount, maxUint256]
                    : [amount, maxUint256],
          });
          void request;
        },
        writeAction: async (): Promise<Hex> => {
          if (kind === "supply") {
            return walletClient.writeContract({
              account: address,
              address: market.address,
              abi: lendingMarketAbi,
              functionName: "supply",
              args: [amount, 0n],
              chain: walletClient.chain,
            });
          }
          if (kind === "withdraw") {
            return walletClient.writeContract({
              account: address,
              address: market.address,
              abi: lendingMarketAbi,
              functionName: "withdraw",
              args: [amount, maxUint256],
              chain: walletClient.chain,
            });
          }
          if (kind === "borrow") {
            return walletClient.writeContract({
              account: address,
              address: market.address,
              abi: lendingMarketAbi,
              functionName: "borrow",
              args: [amount, maxUint256],
              chain: walletClient.chain,
            });
          }
          return walletClient.writeContract({
            account: address,
            address: market.address,
            abi: lendingMarketAbi,
            functionName: "addCollateral",
            args: [owner ?? address, amount],
            chain: walletClient.chain,
          });
        },
      });
      toast.success("Confirmed");
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.market(market.chainId, market.marketId) }),
        owner
          ? qc.invalidateQueries({ queryKey: qk.position(market.chainId, market.marketId, owner) })
          : Promise.resolve(),
        address
          ? qc.invalidateQueries({ queryKey: qk.portfolio(market.chainId as 31337 | 84532, address) })
          : Promise.resolve(),
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, spender],
        }),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-2">
      <label className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label} ({symbol})
        <input
          value={human}
          onChange={(e) => setHuman(e.target.value)}
          inputMode="decimal"
          className="mt-1 w-full border border-border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void onSubmit()}
        className="border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-foreground disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : label}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
