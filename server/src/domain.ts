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
  /** Last block whose view/oracle reads succeeded. Distinct from event cursor `lastBlock`. */
  hydratedBlockNumber: bigint | null;
  hydratedBlockHash: Hex | null;
  hydratedBlockTimestamp: bigint;
  lastHydratedAt: string | null;
  lastPolledAt: string;
  hydrationOk: boolean;
};

export function cursorHydrationDefaults(
  cursor?: Partial<Pick<CursorRecord, "updatedAt" | "lastPolledAt">> | null,
): Pick<
  CursorRecord,
  | "hydratedBlockNumber"
  | "hydratedBlockHash"
  | "hydratedBlockTimestamp"
  | "lastHydratedAt"
  | "lastPolledAt"
  | "hydrationOk"
> {
  const polled = cursor?.lastPolledAt ?? cursor?.updatedAt ?? new Date(0).toISOString();
  return {
    hydratedBlockNumber: null,
    hydratedBlockHash: null,
    hydratedBlockTimestamp: 0n,
    lastHydratedAt: null,
    lastPolledAt: polled,
    hydrationOk: false,
  };
}

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
  directFactory: Address | null;
  directLens: Address | null;
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

export type DirectFacilityRecord = {
  chainId: number;
  facility: Address;
  lender: Address;
  borrower: Address;
  vault: Address;
  asset: Address;
  termsHash: Hex;
  lenderAccepted: boolean;
  borrowerAccepted: boolean;
  declined: boolean;
  cancelled: boolean;
  ended: boolean;
  acceptanceDeadline: bigint;
  activatedAt: bigint;
  borrowExpiry: bigint;
  repaymentDueAt: bigint;
  creditLimit: bigint;
  accountedCash: bigint;
  debtShares: bigint;
  principal: bigint;
  lastDebt: bigint;
  aprRay: bigint;
  recallDeadline: bigint;
  recallActive: boolean;
  borrowingPaused: boolean;
  venue: Address;
  swapRouter: Address;
  otherToken: Address;
  borrowPeriod: bigint;
  recallWindow: bigint;
};

export type DirectTermsRecord = {
  chainId: number;
  facility: Address;
  loanToken: Address;
  creditLimit: bigint;
  aprRay: bigint;
  acceptanceLifetime: bigint;
  borrowPeriod: bigint;
  recallWindow: bigint;
  venue: Address;
  swapRouter: Address;
  otherToken: Address;
  termsHash: Hex;
};

export type DirectAcceptanceRecord = {
  chainId: number;
  facility: Address;
  party: Address;
  accepted: boolean;
  txHash: Hex;
  logIndex: number;
  timestamp: bigint;
};

export type DirectCashflowRecord = {
  chainId: number;
  facility: Address;
  kind: string;
  assets: bigint;
  cashAfter: bigint;
  debtAfter: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: bigint;
};

export type DirectCapProposalRecord = {
  chainId: number;
  facility: Address;
  digest: Hex;
  proposer: Address;
  nonce: bigint;
  validUntil: bigint;
  newCap: bigint;
  lenderApproved: boolean;
  borrowerApproved: boolean;
  cancelled: boolean;
  executed: boolean;
};

export type DirectRecallEpisodeRecord = {
  chainId: number;
  facility: Address;
  reasonHash: Hex;
  reasonCode: number;
  deadline: bigint;
  cleared: boolean;
  startedTxHash: Hex;
  startedLogIndex: number;
  timestamp: bigint;
};

export type DirectHistoryRecord = {
  chainId: number;
  facility: Address;
  cash: bigint;
  debt: bigint;
  principal: bigint;
  creditLimit: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: bigint;
};

export type DirectAuxiliary = {
  terms: DirectTermsRecord[];
  acceptances: DirectAcceptanceRecord[];
  cashflows: DirectCashflowRecord[];
  caps: DirectCapProposalRecord[];
  recalls: DirectRecallEpisodeRecord[];
  history: DirectHistoryRecord[];
};

export function positionKey(marketAddress: string, owner: string): string {
  return `${marketAddress.toLowerCase()}:${owner.toLowerCase()}`;
}

export function asAddress(value: string): Address {
  return value.toLowerCase() as Address;
}

export const ZERO_ADDRESS = asAddress("0x0000000000000000000000000000000000000000");

export function dec(value: bigint | number | string): string {
  return typeof value === "bigint" ? value.toString(10) : BigInt(value).toString(10);
}
