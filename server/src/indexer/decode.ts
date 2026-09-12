import { decodeEventLog, type Hex, type Log } from "viem";
import { asAddress, type IndexedEventRecord } from "../domain.js";
import { allEventAbis } from "./abis.js";

function stringifyArg(value: unknown): string {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function decodeLog(
  chainId: number,
  log: Log,
  timestamp: bigint,
): IndexedEventRecord | null {
  if (!log.transactionHash || log.logIndex === null || log.logIndex === undefined) return null;
  try {
    const decoded = decodeEventLog({
      abi: allEventAbis,
      data: log.data,
      topics: log.topics,
      strict: false,
    });
    const args: Record<string, string> = {};
    const raw = (decoded.args ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      if (Number.isNaN(Number(k))) args[k] = stringifyArg(v);
    }
    return {
      chainId,
      txHash: log.transactionHash.toLowerCase() as Hex,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber ?? 0n,
      blockHash: (log.blockHash ?? null) as Hex | null,
      address: asAddress(log.address),
      eventName: decoded.eventName,
      args,
      timestamp,
    };
  } catch {
    return {
      chainId,
      txHash: log.transactionHash.toLowerCase() as Hex,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber ?? 0n,
      blockHash: (log.blockHash ?? null) as Hex | null,
      address: asAddress(log.address),
      eventName: "Unknown",
      args: { topic0: log.topics[0] ?? "" },
      timestamp,
    };
  }
}
