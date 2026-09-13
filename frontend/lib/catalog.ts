import anvilManifest from "../../deployments/31337/v2.json";
import baseSepoliaManifest from "../../deployments/84532/v2.json";
import ethSepoliaManifest from "../../deployments/11155111/v2.json";
import { isV2ChainId, type V2ChainId } from "./chains";
import type { DeliveryMode } from "./api/types";

const ZERO = "0x0000000000000000000000000000000000000000";

export type CatalogMarket = {
  chainId: V2ChainId;
  id: string;
  address: `0x${string}`;
  label: string;
  deliveryMode: DeliveryMode;
  loanSymbol: string;
  collateralSymbol: string;
  writable: boolean;
};

type ManifestFile = {
  chainId: number;
  oracleMode: string;
  faucet?: string;
  lens?: string;
  loanToken?: string;
  collateralToken?: string;
  swapRouter?: string;
  venue?: string;
  directFactory?: string;
  directLens?: string;
  markets: Array<{
    id: string;
    address: string;
    label: string;
    deliveryMode: "wallet" | "restricted";
    loanSymbol: string;
    collateralSymbol: string;
    oracle?: string;
  }>;
};

function isLiveAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO.toLowerCase();
}

function fromManifest(file: ManifestFile): CatalogMarket[] {
  if (!isV2ChainId(file.chainId)) return [];
  return file.markets.map((m) => ({
    chainId: file.chainId as V2ChainId,
    id: m.id,
    address: (isLiveAddress(m.address) ? m.address : ZERO) as `0x${string}`,
    label: m.label,
    deliveryMode: m.deliveryMode,
    loanSymbol: m.loanSymbol,
    collateralSymbol: m.collateralSymbol,
    writable: isLiveAddress(m.address),
  }));
}

const CATALOG: CatalogMarket[] = [
  ...fromManifest(anvilManifest as ManifestFile),
  ...fromManifest(baseSepoliaManifest as ManifestFile),
  ...fromManifest(ethSepoliaManifest as ManifestFile),
];

export const hasDeploymentManifests = CATALOG.length > 0;

export function listCatalog(chainId?: number): CatalogMarket[] {
  if (chainId === undefined) return CATALOG;
  return CATALOG.filter((m) => m.chainId === chainId);
}

export function catalogById(chainId: number, marketIdOrAddress: string): CatalogMarket | undefined {
  const key = marketIdOrAddress.toLowerCase();
  return CATALOG.find(
    (m) => m.chainId === chainId && (m.id.toLowerCase() === key || m.address.toLowerCase() === key),
  );
}

export function catalogSlugForMode(chainId: number, mode: DeliveryMode): string | undefined {
  return CATALOG.find((m) => m.chainId === chainId && m.deliveryMode === mode)?.id;
}

export function isWritableMarket(chainId: number, marketIdOrAddress: string): boolean {
  return Boolean(catalogById(chainId, marketIdOrAddress)?.writable);
}

export type DirectChainConfig = {
  chainId: V2ChainId;
  loanToken: `0x${string}`;
  otherToken: `0x${string}`;
  venue: `0x${string}`;
  swapRouter: `0x${string}`;
  faucet: `0x${string}` | null;
  lens: `0x${string}` | null;
  oracle: `0x${string}` | null;
  directFactory: `0x${string}` | null;
  directLens: `0x${string}` | null;
};

function firstOracle(file: ManifestFile): `0x${string}` | null {
  for (const m of file.markets) {
    if (m.oracle && isLiveAddress(m.oracle)) return m.oracle;
  }
  return null;
}

function directFrom(file: ManifestFile): DirectChainConfig | null {
  if (!isV2ChainId(file.chainId)) return null;
  if (!file.loanToken || !file.collateralToken || !file.venue || !file.swapRouter) return null;
  return {
    chainId: file.chainId as V2ChainId,
    loanToken: (isLiveAddress(file.loanToken) ? file.loanToken : ZERO) as `0x${string}`,
    otherToken: (isLiveAddress(file.collateralToken) ? file.collateralToken : ZERO) as `0x${string}`,
    venue: (isLiveAddress(file.venue) ? file.venue : ZERO) as `0x${string}`,
    swapRouter: (isLiveAddress(file.swapRouter) ? file.swapRouter : ZERO) as `0x${string}`,
    faucet: file.faucet && isLiveAddress(file.faucet) ? file.faucet : null,
    lens: file.lens && isLiveAddress(file.lens) ? file.lens : null,
    oracle: firstOracle(file),
    directFactory: file.directFactory && isLiveAddress(file.directFactory) ? file.directFactory : null,
    directLens: file.directLens && isLiveAddress(file.directLens) ? file.directLens : null,
  };
}

const DIRECT_CHAINS: DirectChainConfig[] = [
  directFrom(anvilManifest as ManifestFile),
  directFrom(baseSepoliaManifest as ManifestFile),
  directFrom(ethSepoliaManifest as ManifestFile),
].filter((x): x is DirectChainConfig => Boolean(x));

export function directChainConfig(chainId: number): DirectChainConfig | undefined {
  return DIRECT_CHAINS.find((c) => c.chainId === chainId);
}

export function chainHasLiveMarkets(chainId: number): boolean {
  return listCatalog(chainId).some((m) => m.writable);
}

const FAKE_TOKEN = /^0x0{38}1[18]$/i;

export function isLiveTokenAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && isLiveAddress(value) && !FAKE_TOKEN.test(value));
}

type Tokenish = { address: `0x${string}`; symbol: string; decimals: number; testAsset: true };

/** Stamp manifest loan/collateral onto a DTO so writes never hit fixture 0x…0011 / 0x…0018. */
export function withCatalogTokens<T extends { chainId: number; marketId?: string; address?: string; loan: Tokenish; collateral: Tokenish; writable?: boolean }>(
  dto: T,
): T {
  const listed = catalogById(dto.chainId, dto.marketId ?? dto.address ?? "");
  const cfg = directChainConfig(dto.chainId);
  if (!listed?.writable || !cfg || !isLiveTokenAddress(cfg.loanToken) || !isLiveTokenAddress(cfg.otherToken)) return dto;
  return {
    ...dto,
    address: listed.address,
    writable: true,
    loan: { ...dto.loan, address: cfg.loanToken, symbol: listed.loanSymbol || dto.loan.symbol },
    collateral: { ...dto.collateral, address: cfg.otherToken, symbol: listed.collateralSymbol || dto.collateral.symbol },
  };
}
