export type Hex = `0x${string}`;
export type Address = Hex;

export type DeliveryMode = "wallet" | "restricted";
export type OracleStatus = "OK" | "STALE" | "SEQUENCER_DOWN" | "INVALID" | "UNAVAILABLE";

export type MarketRecord = {
  chainId: number;
  marketId: string;
  address: Address;
  label: string;
  deliveryMode: DeliveryMode;
  loanToken: Address;
  loanSymbol: string;
  loanDecimals: number;
  collateralToken: Address;
  collateralSymbol: string;
  collateralDecimals: number;
  oracle: Address | null;
  accountedCash: bigint;
  totalDebtShares: bigint;
  totalSupplyShares: bigint;
  epochIndexRay: bigint;
  epochTimestamp: bigint;
  epochAprRay: bigint;
  supplyCap: bigint;
  borrowCap: bigint;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  defaultPositionCap: bigint;
  supplyFrozen: boolean;
  borrowFrozen: boolean;
  recallActive: boolean;
  recallDeadline: bigint;
  recallClearableAt: bigint;
  terminal: boolean;
  unaccountedSurplus: bigint;
  quoteScale36: bigint;
  collateralUsdWad: bigint;
  loanUsdWad: bigint;
  oracleStatus: OracleStatus;
  oracleMode: "simulated";
};

export type PositionRecord = {
  chainId: number;
  marketId: string;
  marketAddress: Address;
  owner: Address;
  supplyShares: bigint;
  debtShares: bigint;
  collateral: bigint;
  principalOutstanding: bigint;
  defaulted: boolean;
  writtenOffLiability: bigint;
  positionCap: bigint;
  vault: Address | null;
};

export type VaultRecord = {
  chainId: number;
  marketAddress: Address;
  owner: Address;
  vault: Address;
  venueAssets: bigint;
};

export type IndexedEventRecord = {
  chainId: number;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex | null;
  address: Address;
  eventName: string;
  args: Record<string, string>;
  timestamp: bigint;
};

export type CursorRecord = {
  chainId: number;
  startBlock: bigint;
  lastBlock: bigint;
  lastHash: Hex | null;
  lastTimestamp: bigint;
  headBlock: bigint;
  lastError: string | null;
  updatedAt: string;
};

export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  factory: Address | null;
  vaultFactory: Address | null;
  recoveryEscrow: Address | null;
  lens: Address | null;
  startBlock: bigint;
  oracleMode: "simulated";
  faucet: Address | null;
  markets: Array<{
    id: string;
    address: Address;
    label: string;
    deliveryMode: DeliveryMode;
    loanSymbol: string;
    collateralSymbol: string;
    oracle: Address | null;
  }>;
};

export function positionKey(marketAddress: string, owner: string): string {
  return `${marketAddress.toLowerCase()}:${owner.toLowerCase()}`;
}

export function asAddress(value: string): Address {
  return value.toLowerCase() as Address;
}

export function dec(value: bigint | number | string): string {
  return typeof value === "bigint" ? value.toString(10) : BigInt(value).toString(10);
}
