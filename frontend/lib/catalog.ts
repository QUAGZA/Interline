import anvilManifest from "../../deployments/31337/v2.json";
import baseSepoliaManifest from "../../deployments/84532/v2.json";
import type { V2ChainId } from "./chains";
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
  markets: Array<{
    id: string;
    address: string;
    label: string;
    deliveryMode: "wallet" | "restricted";
    loanSymbol: string;
    collateralSymbol: string;
  }>;
};

function isLiveAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO.toLowerCase();
}

function fromManifest(file: ManifestFile): CatalogMarket[] {
  if (file.chainId !== 31337 && file.chainId !== 84532) return [];
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
