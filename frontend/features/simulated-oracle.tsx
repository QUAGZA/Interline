"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine } from "@/features/transactions/tx-store";
import { TxStatusList } from "@/features/transactions/tx-status";
import { directChainConfig } from "@/lib/catalog";
import { borrowCapacityUsdcRaw } from "@/lib/direct-ltv";
import { errMsg } from "@/lib/errors";
import { formatTokenAmount } from "@/lib/money";
import { formatUsdc } from "@/lib/format";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";

const STATUS = ["OK", "STALE", "SEQUENCER_DOWN", "INVALID", "UNAVAILABLE"] as const;
const USDC_PEG_8 = 100_000_000n;

export type MainnetFx = {
  ethAnswer8: string;
  usdcAnswer8: string;
  ethUsd: number;
  usdcUsd: number;
  source: string;
};

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

export async function fetchMainnetFx(): Promise<MainnetFx> {
  const res = await fetch("/api/eth-usd", { cache: "no-store" });
  if (!res.ok) throw new Error("Mainnet ETH/USDC rate unavailable");
  return res.json() as Promise<MainnetFx>;
}

export function SimulatedOracleRefresh({
  chainId,
  onRefreshed,
}: {
  chainId: number;
  onRefreshed?: () => void;
}) {
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
  const mainnet = useQuery({
    queryKey: ["mainnet-eth-usdc"],
    queryFn: fetchMainnetFx,
    staleTime: 30_000,
    refetchInterval: 60_000,
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
  const oracleAddr = oracle;

  const status = quote.data ? STATUS[Number(quote.data.status)] ?? "UNAVAILABLE" : "…";
  const ok = status === "OK";
  const simEth = quote.data ? formatTokenAmount(quote.data.collateralUsdWad, 18, undefined, 2) : "…";
  const simUsdc = quote.data ? formatTokenAmount(quote.data.loanUsdWad, 18, undefined, 4) : "…";
  const ltvPerWeth =
    quote.data && quote.data.collateralUsdWad > 0n && quote.data.loanUsdWad > 0n
      ? borrowCapacityUsdcRaw(10n ** 18n, quote.data.collateralUsdWad, quote.data.loanUsdWad)
      : undefined;

  async function pokeFeed(feed: Address, label: string, nextAnswer: bigint) {
    if (!publicClient || !walletClient || !address) throw new Error("No client");
    const id = newAttemptId(`${key}:${label}`);
    tx.upsert({
      id,
      kind: "oracleRefresh",
      chainId,
      marketId: label,
      amountRaw: nextAnswer.toString(),
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
          args: [nextAnswer],
        });
      },
      writeAction: (): Promise<Hex> =>
        walletClient.writeContract({
          account: address,
          address: feed,
          abi: mockFeedAbi,
          functionName: "setAnswer",
          args: [nextAnswer],
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
        publicClient.readContract({ address: oracleAddr, abi: pairOracleAbi, functionName: "collateralUsd" }),
        publicClient.readContract({ address: oracleAddr, abi: pairOracleAbi, functionName: "loanUsd" }),
      ]);
      let ethAnswer = 0n;
      let usdcAnswer = USDC_PEG_8;
      try {
        const fx = await (mainnet.data ? Promise.resolve(mainnet.data) : fetchMainnetFx());
        ethAnswer = BigInt(fx.ethAnswer8);
        usdcAnswer = BigInt(fx.usdcAnswer8);
        toast.message(`Sign two feed updates: mWETH $${fx.ethUsd.toFixed(2)}, mUSDC $${fx.usdcUsd.toFixed(4)} (${fx.source}).`);
      } catch {
        ethAnswer = await publicClient.readContract({ address: collateralFeed, abi: mockFeedAbi, functionName: "answer" });
        usdcAnswer = await publicClient.readContract({ address: loanFeed, abi: mockFeedAbi, functionName: "answer" });
        toast.message("Mainnet rate unavailable. Re-stamping the stored simulated prices.");
      }
      if (ethAnswer <= 0n) throw new Error("ETH/USD answer must be positive");
      if (usdcAnswer <= 0n) usdcAnswer = USDC_PEG_8;
      await pokeFeed(collateralFeed, "weth-feed", ethAnswer);
      await pokeFeed(loanFeed, "usdc-feed", usdcAnswer);
      await quote.refetch();
      onRefreshed?.();
      toast.success("Simulated mWETH/mUSDC now tracks mainnet. LTV checks are good for the next hour.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-2 border border-border/40 px-3 py-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        Simulated oracle: <span className={ok ? "text-foreground" : "text-destructive"}>{status}</span>
        {". "}
        On-chain {simEth} USD / mWETH · {simUsdc} USD / mUSDC.
        {ltvPerWeth !== undefined ? ` 1 mWETH backs ${formatUsdc(ltvPerWeth)} mUSDC at 80% LTV.` : null}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">
        Mainnet ETH/USD:{" "}
        {mainnet.data
          ? `$${mainnet.data.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} · USDC $${mainnet.data.usdcUsd.toFixed(4)} (${mainnet.data.source})`
          : mainnet.isError
            ? "unavailable"
            : "…"}
        {ok ? "" : ". Feeds expire after 1 hour — push mainnet prices before borrow."}
      </p>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void refresh()}
        className="border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Push mainnet ETH/USDC onto feeds"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
