"use client";

import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine } from "@/features/transactions/tx-store";
import { TxStatusList } from "@/features/transactions/tx-status";
import { directChainConfig } from "@/lib/catalog";
import { errMsg } from "@/lib/errors";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";

const STATUS = ["OK", "STALE", "SEQUENCER_DOWN", "INVALID", "UNAVAILABLE"] as const;

export const pairOracleAbi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "collateralUsdWad", type: "uint256" },
          { name: "loanUsdWad", type: "uint256" },
          { name: "quoteScale36", type: "uint256" },
          { name: "collateralUpdatedAt", type: "uint256" },
          { name: "loanUpdatedAt", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  { type: "function", name: "collateralUsd", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "loanUsd", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const mockFeedAbi = [
  { type: "function", name: "answer", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  {
    type: "function",
    name: "setAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "answer_", type: "int256" }],
    outputs: [],
  },
] as const;

export function SimulatedOracleRefresh({ chainId }: { chainId: number }) {
  const oracle = directChainConfig(chainId)?.oracle;
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const quote = useReadContract({
    address: oracle ?? undefined,
    abi: pairOracleAbi,
    functionName: "quote",
    chainId,
    query: { enabled: Boolean(oracle), refetchInterval: 15_000 },
  });
  const key = actionKey({
    chainId,
    account: address ?? "disconnected",
    facility: oracle ?? "oracle",
    action: "oracleRefresh",
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));
  if (!oracle) return null;

  const status = quote.data ? STATUS[Number(quote.data.status)] ?? "UNAVAILABLE" : "…";
  const ok = status === "OK";

  async function pokeFeed(feed: Address, label: string) {
    if (!publicClient || !walletClient || !address) throw new Error("No client");
    const answer = await publicClient.readContract({ address: feed, abi: mockFeedAbi, functionName: "answer" });
    const id = newAttemptId(`${key}:${label}`);
    tx.upsert({
      id,
      kind: "oracleRefresh",
      chainId,
      marketId: label,
      amountRaw: "0",
      spender: feed,
      tokenSymbol: "oracle",
      phase: "editing",
      updatedAt: Date.now(),
    });
    await runMarketTx({
      id,
      patch: tx.patch,
      publicClient,
      walletClient,
      account: address,
      token: feed,
      spender: feed,
      amount: 0n,
      needsApprove: false,
      expectedChainId: chainId,
      simulate: async () => {
        await publicClient.simulateContract({
          account: address,
          address: feed,
          abi: mockFeedAbi,
          functionName: "setAnswer",
          args: [answer],
        });
      },
      writeAction: (): Promise<Hex> =>
        walletClient.writeContract({
          account: address,
          address: feed,
          abi: mockFeedAbi,
          functionName: "setAnswer",
          args: [answer],
          chain: walletClient.chain,
        }),
    });
  }

  async function refresh() {
    if (!isConnected || !address) {
      toast.message("Connect a wallet to refresh simulated prices.");
      return;
    }
    if (walletChainId !== chainId) {
      toast.error(`Switch the wallet to chain ${chainId} before refreshing prices.`);
      return;
    }
    if (!publicClient || !walletClient) {
      toast.error("No client for this chain.");
      return;
    }
    if (busy) {
      toast.message("Oracle refresh is already waiting for a signature.");
      return;
    }
    try {
      const [collateralFeed, loanFeed] = await Promise.all([
        publicClient.readContract({ address: oracle, abi: pairOracleAbi, functionName: "collateralUsd" }),
        publicClient.readContract({ address: oracle, abi: pairOracleAbi, functionName: "loanUsd" }),
      ]);
      toast.message("Sign two feed updates (mWETH then mUSDC). Same simulated prices, new timestamp.");
      await pokeFeed(collateralFeed, "weth-feed");
      await pokeFeed(loanFeed, "usdc-feed");
      await quote.refetch();
      toast.success("Simulated prices refreshed. Borrow and LTV checks can run for the next hour.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-2 border border-border/40 px-3 py-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        Simulated oracle: <span className={ok ? "text-foreground" : "text-destructive"}>{status}</span>
        {ok ? ". LTV uses $2,000 mWETH / $1 mUSDC." : ". Feeds expire after 1 hour. Refresh before borrow."}
      </p>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void refresh()}
        className="border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Refresh simulated prices"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
