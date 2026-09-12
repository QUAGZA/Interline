export const V2_CHAIN_IDS = [31337, 84532] as const;
export type V2ChainId = (typeof V2_CHAIN_IDS)[number];

export const V2_CHAINS: { chainId: V2ChainId; name: string; short: string }[] = [
  { chainId: 31337, name: "Anvil", short: "Anvil" },
  { chainId: 84532, name: "Base Sepolia", short: "Base Sepolia" },
];

export function isV2ChainId(value: number): value is V2ChainId {
  return value === 31337 || value === 84532;
}

/** Catalog / route chain — never derived from the connected wallet. */
export function parseRouteChainId(value: string | number | undefined): V2ChainId | null {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || !isV2ChainId(n)) return null;
  return n;
}

export function chainName(chainId: number): string {
  return V2_CHAINS.find((c) => c.chainId === chainId)?.name ?? `Chain ${chainId}`;
}

export function parseAddressParam(value: string | undefined): `0x${string}` | null {
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

/** API market id is a slug (`usdc-weth-wallet`) or a market address. */
export function parseMarketIdParam(value: string | undefined): string | null {
  if (!value) return null;
  if (parseAddressParam(value)) return value;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)) return null;
  return value;
}

export function sameAddr(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
