"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { creditLineAbi, vaultAbi } from "@/lib/abi";
import { creditLineAddress, vaultAddress } from "@/lib/env";
import { formatUsdc, shortAddr } from "@/lib/format";

export type TapeItem = {
  id: string;
  block: bigint;
  label: string;
  detail: string;
};

function fmt(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => {
      if (typeof v === "bigint") {
        if (k.toLowerCase().includes("cap") || k === "amount" || k === "drawnAfter" || k === "amountIn" || k === "amountOut") {
          return `${k}=${formatUsdc(v)}`;
        }
        if (k === "recallDeadline" || k === "deadline") return `${k}=${v.toString()}`;
        return `${k}=${v.toString()}`;
      }
      if (typeof v === "string" && v.startsWith("0x") && v.length === 42) return `${k}=${shortAddr(v)}`;
      if (typeof v === "string" && v.startsWith("0x") && v.length === 66) return `${k}=${v.slice(0, 10)}…`;
      return `${k}=${String(v)}`;
    })
    .join("  ");
}

export function useEvents(blockNumber?: bigint) {
  const client = usePublicClient();
  const [items, setItems] = useState<TapeItem[]>([]);

  useEffect(() => {
    if (!client || !creditLineAddress || !vaultAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const [lineLogs, vaultLogs] = await Promise.all([
          client.getContractEvents({
            address: creditLineAddress,
            abi: creditLineAbi,
            fromBlock: 0n,
            toBlock: "latest",
          }),
          client.getContractEvents({
            address: vaultAddress,
            abi: vaultAbi,
            fromBlock: 0n,
            toBlock: "latest",
          }),
        ]);
        if (cancelled) return;
        const merged = [...lineLogs, ...vaultLogs]
          .sort((a, b) => {
            const bd = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
            if (bd !== 0) return bd;
            return (a.logIndex ?? 0) - (b.logIndex ?? 0);
          })
          .slice(-15)
          .reverse()
          .map((log, i) => ({
            id: `${log.transactionHash ?? "x"}-${log.logIndex ?? i}`,
            block: log.blockNumber ?? 0n,
            label: log.eventName,
            detail: fmt((log.args ?? {}) as Record<string, unknown>),
          }));
        setItems(merged);
      } catch {
        /* RPC may be down before deploy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, blockNumber]);

  return items;
}
