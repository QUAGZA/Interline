import type { EventDto, EventsPageDto } from "@/lib/api/types";

export const GRAPH_CHAIN_ID = 11155111;

export function graphUrl(): string {
  return (process.env.NEXT_PUBLIC_GRAPH_URL ?? "").replace(/\/$/, "");
}

type GraphEventRow = {
  id?: unknown;
  chainId?: unknown;
  product?: unknown;
  name?: unknown;
  contract?: unknown;
  marketOrFacility?: unknown;
  detail?: unknown;
  txHash?: unknown;
  logIndex?: unknown;
  blockNumber?: unknown;
  timestamp?: unknown;
};

export type GraphActivityQuery = {
  protocolEvents?: GraphEventRow[];
};

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return 0;
}

function asHex(value: unknown): `0x${string}` | null {
  const s = asString(value);
  if (/^0x[0-9a-fA-F]+$/.test(s)) return s as `0x${string}`;
  return null;
}

export function mapGraphActivity(data: GraphActivityQuery | null | undefined, chainId: number): EventsPageDto {
  const rows = data?.protocolEvents ?? [];
  const items: EventDto[] = [];
  for (const row of rows) {
    const txHash = asHex(row.txHash);
    if (!txHash) continue;
    const name = asString(row.name) || "Event";
    const product = asString(row.product) === "DIRECT" ? "DIRECT" : "POOL";
    const marketOrFacility = asString(row.marketOrFacility);
    items.push({
      chainId: asInt(row.chainId) || chainId,
      marketId: marketOrFacility || null,
      txHash,
      logIndex: asInt(row.logIndex),
      blockNumber: asString(row.blockNumber) || "0",
      name,
      product,
      detail: asString(row.detail) || name,
      at: asString(row.timestamp) || "0",
    });
  }
  return { items, nextCursor: null };
}

const ACTIVITY_ALL = `
query Activity($chainId: Int!, $first: Int!) {
  protocolEvents(first: $first, orderBy: blockNumber, orderDirection: desc, where: { chainId: $chainId }) {
    id chainId product name contract marketOrFacility detail txHash logIndex blockNumber timestamp
  }
}
`;

const ACTIVITY_PARTY = `
query Activity($chainId: Int!, $first: Int!, $party: Bytes!) {
  protocolEvents(
    first: $first
    orderBy: blockNumber
    orderDirection: desc
    where: { chainId: $chainId, or: [{ party: $party }, { counterparty: $party }] }
  ) {
    id chainId product name contract marketOrFacility detail txHash logIndex blockNumber timestamp
  }
}
`;

export async function fetchGraphActivity(chainId?: number, address?: string): Promise<EventsPageDto | null> {
  const url = graphUrl();
  if (!url || chainId !== GRAPH_CHAIN_ID) return null;
  const party = address?.toLowerCase();
  const query = party ? ACTIVITY_PARTY : ACTIVITY_ALL;
  const variables: Record<string, unknown> = { chainId: GRAPH_CHAIN_ID, first: 50 };
  if (party) variables.party = party;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: GraphActivityQuery; errors?: unknown };
    if (!body.data || body.errors) return null;
    return mapGraphActivity(body.data, GRAPH_CHAIN_ID);
  } catch {
    return null;
  }
}
