"use client";

import { useEffect, useRef, useState } from "react";
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

const LOOKBACK = 50_000n;

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

function toItems(logs: { blockNumber?: bigint; logIndex?: number; transactionHash?: `0x${string}`; eventName: string; args?: unknown }[]): TapeItem[] {
  return logs.map((log, i) => ({
    id: `${log.transactionHash ?? "x"}-${log.logIndex ?? i}`,
    block: log.blockNumber ?? 0n,
    label: log.eventName,
    detail: fmt((log.args ?? {}) as Record<string, unknown>),
  }));
}

export function useEvents(blockNumber?: bigint) {
  const client = usePublicClient();
  const [items, setItems] = useState<TapeItem[]>([]);
  const lastBlockRef = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (!client || !creditLineAddress || !vaultAddress || blockNumber === undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = blockNumber;
        const prev = lastBlockRef.current;
        const fromBlock =
          prev !== undefined ? prev + 1n : latest > LOOKBACK ? latest - LOOKBACK : 0n;
        if (fromBlock > latest) return;

        const [lineLogs, vaultLogs] = await Promise.all([
          client.getContractEvents({
            address: creditLineAddress,
            abi: creditLineAbi,
            fromBlock,
            toBlock: latest,
          }),
          client.getContractEvents({
            address: vaultAddress,
            abi: vaultAbi,
            fromBlock,
            toBlock: latest,
          }),
        ]);
        if (cancelled) return;
        lastBlockRef.current = latest;

        const fresh = toItems(
          [...lineLogs, ...vaultLogs].sort((a, b) => {
            const bd = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
            if (bd !== 0) return bd;
            return (a.logIndex ?? 0) - (b.logIndex ?? 0);
          }),
        );

        setItems((cur) => {
          const seen = new Set<string>();
          const merged = [...fresh.reverse(), ...cur].filter((e) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
          return merged.slice(0, 15);
        });
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
