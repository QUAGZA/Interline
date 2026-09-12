"use client";

import { useEffect, useState } from "react";
import { erc20Abi } from "viem";
import { useBlockNumber, useReadContracts } from "wagmi";
import { creditLineAbi, vaultAbi } from "@/lib/abi";
import {
  addressesReady,
  chainId,
  creditLineAddress,
  mockTargetAddress,
  usdcAddress,
  vaultAddress,
} from "@/lib/env";

const pollMs = chainId === 31337 ? 2_000 : 12_000;

export function useLineState() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(true);
  }, []);

  const enabled = live && addressesReady;

  const { data: blockNumber } = useBlockNumber({
    query: {
      enabled,
      refetchInterval: pollMs,
      refetchIntervalInBackground: false,
      staleTime: pollMs,
    },
  });

  const line = creditLineAddress ?? "0x0000000000000000000000000000000000000001";
  const vault = vaultAddress ?? "0x0000000000000000000000000000000000000001";
  const usdc = usdcAddress ?? "0x0000000000000000000000000000000000000001";
  const target = mockTargetAddress ?? "0x0000000000000000000000000000000000000001";

  const query = useReadContracts({
    contracts: [
      { address: line, abi: creditLineAbi, functionName: "cap" },
      { address: line, abi: creditLineAbi, functionName: "drawn" },
      { address: line, abi: creditLineAbi, functionName: "utilizationBps" },
      { address: line, abi: creditLineAbi, functionName: "potBalance" },
      { address: line, abi: creditLineAbi, functionName: "drawsPaused" },
      { address: line, abi: creditLineAbi, functionName: "recallDeadline" },
      { address: line, abi: creditLineAbi, functionName: "recallActive" },
      { address: line, abi: creditLineAbi, functionName: "lender" },
      { address: line, abi: creditLineAbi, functionName: "borrower" },
      { address: line, abi: creditLineAbi, functionName: "proposalHash" },
      { address: line, abi: creditLineAbi, functionName: "lenderApproved" },
      { address: line, abi: creditLineAbi, functionName: "borrowerApproved" },
      { address: line, abi: creditLineAbi, functionName: "rateBps" },
      { address: line, abi: creditLineAbi, functionName: "expiry" },
      { address: line, abi: creditLineAbi, functionName: "recallWindow" },
      { address: line, abi: creditLineAbi, functionName: "venuePaused", args: [target] },
      { address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault] },
      { address: vault, abi: vaultAbi, functionName: "exposure", args: [target] },
    ],
    query: {
      enabled,
      staleTime: pollMs,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });

  useEffect(() => {
    if (blockNumber === undefined || query.isFetching) return;
    void query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber]);

  const v = query.data;
  const pick = <T,>(i: number) => (v?.[i]?.status === "success" ? (v[i].result as T) : undefined);

  return {
    ready: addressesReady,
    isLoading: query.isLoading,
    cap: pick<bigint>(0),
    drawn: pick<bigint>(1),
    utilizationBps: pick<bigint>(2),
    pot: pick<bigint>(3),
    drawsPaused: pick<boolean>(4),
    recallDeadline: pick<bigint>(5),
    recallActive: pick<boolean>(6),
    lender: pick<`0x${string}`>(7),
    borrower: pick<`0x${string}`>(8),
    proposalHash: pick<`0x${string}`>(9),
    lenderApproved: pick<boolean>(10),
    borrowerApproved: pick<boolean>(11),
    rateBps: pick<bigint | number>(12),
    expiry: pick<bigint>(13),
    recallWindow: pick<bigint | number>(14),
    venuePaused: pick<boolean>(15),
    vaultIdle: pick<bigint>(16),
    exposure: pick<bigint>(17),
    blockNumber,
  };
}
