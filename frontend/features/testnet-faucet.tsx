"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine } from "@/features/transactions/tx-store";
import { TxStatusList } from "@/features/transactions/tx-status";
import { qk, walletBalancesKey } from "@/lib/api/keys";
import { directChainConfig } from "@/lib/catalog";
import { isV2ChainId } from "@/lib/chains";
import { errMsg, faucetAbi } from "@/lib/errors";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";

export function TestnetFaucetButton({ chainId, compact = false }: { chainId: number; compact?: boolean }) {
  const faucet = directChainConfig(chainId)?.faucet;
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const key = actionKey({
    chainId,
    account: address ?? "disconnected",
    facility: faucet ?? "faucet",
    action: "faucet",
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));
  if (!faucet) return null;
  const faucetAddr = faucet;

  async function drip() {
    if (!isConnected || !address) {
      toast.message("Connect a wallet to drip test tokens.");
      return;
    }
    if (walletChainId !== chainId) {
      toast.error(`Switch the wallet to chain ${chainId} before dripping.`);
      return;
    }
    if (!publicClient || !walletClient) {
      toast.error("No client for this chain.");
      return;
    }
    if (busy) {
      toast.message("Drip is already waiting for a signature or confirmation.");
      return;
    }
    const code = await publicClient.getCode({ address: faucetAddr });
    if (!code || code === "0x") {
      toast.error("Faucet has no code on this chain.");
      return;
    }
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind: "faucet",
      chainId,
      marketId: "faucet",
      amountRaw: "0",
      spender: faucetAddr,
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
        token: faucetAddr,
        spender: faucetAddr,
        amount: 0n,
        needsApprove: false,
        expectedChainId: chainId,
        simulate: async () => {
          await publicClient.simulateContract({
            account: address,
            address: faucetAddr,
            abi: faucetAbi,
            functionName: "drip",
          });
        },
        writeAction: (): Promise<Hex> =>
          walletClient.writeContract({
            account: address,
            address: faucetAddr,
            abi: faucetAbi,
            functionName: "drip",
            chain: walletClient.chain,
          }),
      });
      toast.success("Dripped 100,000 mUSDC and 50 mWETH. Add those token addresses in the wallet if they do not appear.");
      await Promise.all([
        address && isV2ChainId(chainId) ? qc.invalidateQueries({ queryKey: qk.portfolio(chainId, address) }) : Promise.resolve(),
        address ? qc.invalidateQueries({ queryKey: walletBalancesKey(chainId, address) }) : Promise.resolve(),
        qc.invalidateQueries({ queryKey: ["v2", "direct"] }),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2 border border-border/40 px-3 py-3"}>
      <p className="font-mono text-[11px] text-muted-foreground">
        100,000 mUSDC + 50 mWETH · 1h cooldown · not Circle USDC
      </p>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void drip()}
        className="border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Drip test tokens"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}
