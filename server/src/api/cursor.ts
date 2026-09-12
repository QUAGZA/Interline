import { Buffer } from "node:buffer";

export type PositionCursor = {
  debt: string;
  chainId: number;
  marketId: string;
  owner: string;
};

export type EventCursor = {
  blockNumber: string;
  logIndex: number;
};

export function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodePositionCursor(raw: string | undefined): PositionCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PositionCursor;
    if (!parsed.debt || !parsed.marketId || !parsed.owner) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function decodeEventCursor(raw: string | undefined): EventCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as EventCursor;
    if (!parsed.blockNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cmpActiveLoan(a: { projectedDebt: string; chainId: number; marketId: string; owner: string }, b: typeof a): number {
  const da = BigInt(a.projectedDebt);
  const db = BigInt(b.projectedDebt);
  if (da !== db) return da > db ? -1 : 1;
  if (a.chainId !== b.chainId) return a.chainId - b.chainId;
  if (a.marketId !== b.marketId) return a.marketId.localeCompare(b.marketId);
  return a.owner.localeCompare(b.owner);
}

export function afterPositionCursor(
  row: { projectedDebt: string; chainId: number; marketId: string; owner: string },
  cursor: PositionCursor,
): boolean {
  return (
    cmpActiveLoan(row, {
      projectedDebt: cursor.debt,
      chainId: cursor.chainId,
      marketId: cursor.marketId,
      owner: cursor.owner,
    }) > 0
  );
}
