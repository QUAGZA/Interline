"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { directChainConfig, isLiveTokenAddress } from "@/lib/catalog";
import { walletBalancesKey } from "@/lib/api/keys";

export function useWalletCatalogBalances(chainId: number) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const cfg = directChainConfig(chainId);
  const loanOk = isLiveTokenAddress(cfg?.loanToken);
  const collOk = isLiveTokenAddress(cfg?.otherToken);
  const enabled = Boolean(isConnected && address && publicClient && cfg && (loanOk || collOk));

  const q = useQuery({
    queryKey: walletBalancesKey(chainId, address ?? "0x0000000000000000000000000000000000000000"),
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!publicClient || !address || !cfg) throw new Error("No client");
      const [musdc, mweth] = await Promise.all([
        loanOk
          ? publicClient.readContract({
              address: cfg.loanToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
        collOk
          ? publicClient.readContract({
              address: cfg.otherToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
      ]);
      return { musdc, mweth };
    },
  });

  return {
    ready: Boolean(isConnected && address),
    musdc: q.data?.musdc,
    mweth: q.data?.mweth,
    isLoading: q.isLoading,
  };
}
