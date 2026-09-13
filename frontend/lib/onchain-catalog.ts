import { createPublicClient, http, type Address } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import type { DirectFacilityDto } from "@/features/direct/dto";
import { anvil } from "@/lib/wagmi";
import {
  catalogById,
  chainHasLiveMarkets,
  directChainConfig,
  listCatalog,
  type CatalogMarket,
} from "@/lib/catalog";
import { chainId as envChainId, rpcUrl as envRpcUrl } from "@/lib/env";
import type {
  AmountDto,
  MarketDetailDto,
  MarketStatus,
  OracleStatus,
  PortfolioDto,
  PositionDto,
} from "@/lib/api/types";
import { emptyPosition } from "@/lib/api/map";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const marketLensAbi = [
  {
    type: "function",
    name: "marketView",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "loanDecimals", type: "uint8" },
          { name: "collateralDecimals", type: "uint8" },
          { name: "deliveryMode", type: "uint8" },
          { name: "accountedCash", type: "uint256" },
          { name: "totalDebt", type: "uint256" },
          { name: "supplierAssets", type: "uint256" },
          { name: "totalSupplyShares", type: "uint256" },
          { name: "utilizationRay", type: "uint256" },
          { name: "borrowAprRay", type: "uint256" },
          { name: "supplyAprRay", type: "uint256" },
          { name: "borrowApyGrowthRay", type: "uint256" },
          { name: "supplyApyGrowthRay", type: "uint256" },
          { name: "epochIndexRay", type: "uint256" },
          { name: "epochTimestamp", type: "uint64" },
          { name: "supplyFrozen", type: "bool" },
          { name: "borrowFrozen", type: "bool" },
          { name: "recallActive", type: "bool" },
          { name: "recallDeadline", type: "uint64" },
          { name: "terminal", type: "bool" },
          { name: "oracleStatus", type: "uint8" },
          { name: "unaccountedSurplus", type: "uint256" },
          { name: "supplyCap", type: "uint256" },
          { name: "borrowCap", type: "uint256" },
          { name: "maxLtvBps", type: "uint16" },
          { name: "liquidationThresholdBps", type: "uint16" },
          { name: "liquidationBonusBps", type: "uint16" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "positionView",
    stateMutability: "view",
    inputs: [
      { name: "market", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "supplyShares", type: "uint256" },
          { name: "supplyAssets", type: "uint256" },
          { name: "maxWithdraw", type: "uint256" },
          { name: "maxRedeem", type: "uint256" },
          { name: "debt", type: "uint256" },
          { name: "principal", type: "uint256" },
          { name: "collateral", type: "uint256" },
          { name: "collateralValueLoan", type: "uint256" },
          { name: "borrowCapacity", type: "uint256" },
          { name: "liquidationCapacity", type: "uint256" },
          { name: "healthFactorWad", type: "uint256" },
          { name: "healthCode", type: "uint8" },
          { name: "liquidatable", type: "bool" },
          { name: "maxBorrow", type: "uint256" },
          { name: "defaulted", type: "bool" },
          { name: "writtenOffLiability", type: "uint256" },
          { name: "positionCap", type: "uint256" },
        ],
      },
    ],
  },
] as const;

const extraMarketAbi = [
  { type: "function", name: "minBorrow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "defaultPositionCap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "recallWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  {
    type: "function",
    name: "debtSharesOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const directFactoryAbi = [
  { type: "function", name: "facilityCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "facilityAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const directLensAbi = [
  {
    type: "function",
    name: "snapshot",
    stateMutability: "view",
    inputs: [{ name: "facility", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "facility", type: "address" },
          { name: "lender", type: "address" },
          { name: "borrower", type: "address" },
          { name: "vault", type: "address" },
          { name: "creditLimit", type: "uint256" },
          { name: "cash", type: "uint256" },
          { name: "debt", type: "uint256" },
          { name: "principal", type: "uint256" },
          { name: "accruedInterest", type: "uint256" },
          { name: "availableToBorrow", type: "uint256" },
          { name: "withdrawableCash", type: "uint256" },
          { name: "fixedAprRay", type: "uint256" },
          { name: "acceptanceDeadline", type: "uint64" },
          { name: "activatedAt", type: "uint64" },
          { name: "borrowExpiry", type: "uint64" },
          { name: "repaymentDueAt", type: "uint64" },
          { name: "recallDeadline", type: "uint64" },
          { name: "effectiveDue", type: "uint64" },
          { name: "ended", type: "bool" },
          { name: "acceptance", type: "uint8" },
          { name: "credit", type: "uint8" },
          { name: "debtState", type: "uint8" },
          { name: "recall", type: "uint8" },
          { name: "vaultIdle", type: "uint256" },
          { name: "venueShares", type: "uint256" },
          { name: "collateralPosted", type: "uint256" },
          { name: "maxLtvBps", type: "uint16" },
        ],
      },
    ],
  },
] as const;

const facilityFlagsAbi = [
  { type: "function", name: "termsHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "loanToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "lenderAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "borrowerAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "declined", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "cancelled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "borrowingPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const clients = new Map<number, ReturnType<typeof createPublicClient>>();

function rpcUrlFor(id: number): string {
  if (id === 84532) return id === envChainId ? envRpcUrl : "https://sepolia.base.org";
  if (id === 11155111) return id === envChainId ? envRpcUrl : "https://ethereum-sepolia-rpc.publicnode.com";
  if (id === 31337) return id === envChainId ? envRpcUrl : "http://127.0.0.1:8545";
  return envRpcUrl;
}

function chainFor(id: number) {
  if (id === 84532) return baseSepolia;
  if (id === 11155111) return sepolia;
  return anvil;
}

export function publicClientFor(id: number) {
  const hit = clients.get(id);
  if (hit) return hit;
  const client = createPublicClient({
    chain: chainFor(id),
    transport: http(rpcUrlFor(id), { timeout: id === 31337 ? 4_000 : 8_000, retryCount: 0, batch: true }),
  });
  clients.set(id, client as never);
  return client;
}

function amt(raw: bigint | string | number, decimals: number, symbol: string): AmountDto {
  return { raw: typeof raw === "bigint" ? raw.toString(10) : String(raw), decimals, symbol };
}

function rpcFreshness() {
  return {
    blockNumber: "0",
    blockHash: null as `0x${string}` | null,
    indexedAt: new Date().toISOString(),
    indexedBlockTimestamp: String(Math.floor(Date.now() / 1000)),
    lagSeconds: 0,
  };
}

function oracleOf(code: number): OracleStatus {
  if (code === 0) return "ok";
  if (code === 1) return "stale";
  return "unavailable";
}

function statusOf(v: { terminal: boolean; recallActive: boolean; supplyFrozen: boolean; borrowFrozen: boolean }): MarketStatus {
  if (v.terminal) return "terminal";
  if (v.recallActive) return "recall";
  if (v.borrowFrozen) return "borrow_frozen";
  if (v.supplyFrozen) return "supply_frozen";
  return "active";
}

function healthOf(code: number): PositionDto["healthCode"] {
  if (code === 0) return "NO_DEBT";
  if (code === 1) return "OK";
  return "UNAVAILABLE";
}

type MarketView = {
  loanToken: Address;
  collateralToken: Address;
  loanDecimals: number;
  collateralDecimals: number;
  deliveryMode: number;
  accountedCash: bigint;
  totalDebt: bigint;
  supplierAssets: bigint;
  utilizationRay: bigint;
  borrowAprRay: bigint;
  supplyApyGrowthRay: bigint;
  epochIndexRay: bigint;
  epochTimestamp: number | bigint;
  supplyFrozen: boolean;
  borrowFrozen: boolean;
  recallActive: boolean;
  recallDeadline: number | bigint;
  terminal: boolean;
  oracleStatus: number;
  supplyCap: bigint;
  borrowCap: bigint;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
};

export function catalogMarketShell(listed: CatalogMarket): MarketDetailDto | null {
  const cfg = directChainConfig(listed.chainId);
  if (!listed.writable || !cfg?.loanToken || !cfg.otherToken) return null;
  if (cfg.loanToken.toLowerCase() === ZERO || cfg.otherToken.toLowerCase() === ZERO) return null;
  const loan = { address: cfg.loanToken, symbol: listed.loanSymbol, decimals: 6, testAsset: true as const };
  const collateral = { address: cfg.otherToken, symbol: listed.collateralSymbol, decimals: 18, testAsset: true as const };
  const z = (decimals: number, symbol: string) => amt(0n, decimals, symbol);
  return {
    chainId: listed.chainId,
    marketId: listed.id,
    address: listed.address,
    label: listed.label,
    deliveryMode: listed.deliveryMode,
    loan,
    collateral,
    supplyApyGrowthRay: "1000000000000000000000000000",
    borrowAprRay: "0",
    supplied: z(loan.decimals, loan.symbol),
    borrowed: z(loan.decimals, loan.symbol),
    liquidity: z(loan.decimals, loan.symbol),
    utilizationRay: "0",
    epochIndexRay: "1000000000000000000000000000",
    epochTimestamp: "0",
    status: "active",
    oracleMode: "simulated",
    oracleStatus: "unavailable",
    writable: true,
    freshness: rpcFreshness(),
    maxLtvBps: 8000,
    liquidationThresholdBps: 9000,
    liquidationBonusBps: 500,
    supplyCap: amt(1_000_000_000_000n, loan.decimals, loan.symbol),
    borrowCap: amt(800_000_000_000n, loan.decimals, loan.symbol),
    defaultPositionCap: amt(
      listed.deliveryMode === "restricted" ? 25_000_000_000n : 800_000_000_000n,
      loan.decimals,
      loan.symbol,
    ),
    minBorrow: amt(10_000_000n, loan.decimals, loan.symbol),
    minSupply: amt(1_000_000n, loan.decimals, loan.symbol),
    recallWindowSeconds: listed.chainId === 31337 ? 300 : 3600,
    recallDeadline: "0",
    supplyFrozen: false,
    borrowFrozen: false,
    recallActive: false,
  };
}

function toDetail(listed: CatalogMarket, v: MarketView, extras: { minBorrow: bigint; minSupply: bigint; defaultPositionCap: bigint; recallWindow: number }): MarketDetailDto {
  const loan = {
    address: v.loanToken,
    symbol: listed.loanSymbol,
    decimals: Number(v.loanDecimals),
    testAsset: true as const,
  };
  const collateral = {
    address: v.collateralToken,
    symbol: listed.collateralSymbol,
    decimals: Number(v.collateralDecimals),
    testAsset: true as const,
  };
  return {
    chainId: listed.chainId,
    marketId: listed.id,
    address: listed.address,
    label: listed.label,
    deliveryMode: listed.deliveryMode,
    loan,
    collateral,
    supplyApyGrowthRay: v.supplyApyGrowthRay.toString(10),
    borrowAprRay: v.borrowAprRay.toString(10),
    supplied: amt(v.supplierAssets, loan.decimals, loan.symbol),
    borrowed: amt(v.totalDebt, loan.decimals, loan.symbol),
    liquidity: amt(v.accountedCash, loan.decimals, loan.symbol),
    utilizationRay: v.utilizationRay.toString(10),
    epochIndexRay: v.epochIndexRay.toString(10),
    epochTimestamp: String(v.epochTimestamp),
    status: statusOf(v),
    oracleMode: "simulated",
    oracleStatus: oracleOf(Number(v.oracleStatus)),
    writable: true,
    freshness: rpcFreshness(),
    maxLtvBps: Number(v.maxLtvBps),
    liquidationThresholdBps: Number(v.liquidationThresholdBps),
    liquidationBonusBps: Number(v.liquidationBonusBps),
    supplyCap: amt(v.supplyCap, loan.decimals, loan.symbol),
    borrowCap: amt(v.borrowCap, loan.decimals, loan.symbol),
    defaultPositionCap: amt(extras.defaultPositionCap, loan.decimals, loan.symbol),
    minBorrow: amt(extras.minBorrow, loan.decimals, loan.symbol),
    minSupply: amt(extras.minSupply, loan.decimals, loan.symbol),
    recallWindowSeconds: extras.recallWindow,
    recallDeadline: String(v.recallDeadline),
    supplyFrozen: v.supplyFrozen,
    borrowFrozen: v.borrowFrozen,
    recallActive: v.recallActive,
  };
}

async function extrasFor(
  client: { readContract: ReturnType<typeof createPublicClient>["readContract"] },
  market: Address,
  deliveryMode: CatalogMarket["deliveryMode"],
) {
  const fallback = {
    minBorrow: 10_000_000n,
    minSupply: 1_000_000n,
    defaultPositionCap: deliveryMode === "restricted" ? 25_000_000_000n : 800_000_000_000n,
    recallWindow: 3600,
  };
  try {
    const [minBorrow, minSupply, defaultPositionCap, recallWindow] = await Promise.all([
      client.readContract({ address: market, abi: extraMarketAbi, functionName: "minBorrow" }),
      client.readContract({ address: market, abi: extraMarketAbi, functionName: "minSupply" }),
      client.readContract({ address: market, abi: extraMarketAbi, functionName: "defaultPositionCap" }),
      client.readContract({ address: market, abi: extraMarketAbi, functionName: "recallWindow" }),
    ]);
    return {
      minBorrow,
      minSupply,
      defaultPositionCap,
      recallWindow: Number(recallWindow),
    };
  } catch {
    return fallback;
  }
}

export async function rpcMarketDetail(chainId: number, marketId: string): Promise<MarketDetailDto | null> {
  const listed = catalogById(chainId, marketId);
  if (!listed?.writable) return null;
  const cfg = directChainConfig(chainId);
  const shell = catalogMarketShell(listed);
  if (!cfg?.lens) return shell;
  const client = publicClientFor(chainId);
  try {
    const view = (await client.readContract({
      address: cfg.lens,
      abi: marketLensAbi,
      functionName: "marketView",
      args: [listed.address],
    })) as MarketView;
    const extras = await extrasFor(client, listed.address, listed.deliveryMode);
    return toDetail(listed, view, extras);
  } catch {
    return shell;
  }
}

export async function rpcMarkets(chainId?: number): Promise<MarketDetailDto[] | null> {
  const ids = chainId !== undefined ? [chainId] : [...new Set(listCatalog().map((m) => m.chainId))];
  const live = ids.filter(chainHasLiveMarkets);
  if (live.length === 0) return null;
  const listed = live.flatMap((id) => listCatalog(id).filter((x) => x.writable));
  const rows = await Promise.all(listed.map((m) => rpcMarketDetail(m.chainId, m.id)));
  return rows.filter((row): row is MarketDetailDto => Boolean(row));
}

export async function rpcPosition(chainId: number, marketId: string, owner: string): Promise<PositionDto | null> {
  const listed = catalogById(chainId, marketId);
  if (!listed?.writable) return null;
  const cfg = directChainConfig(chainId);
  if (!cfg?.lens) return null;
  const client = publicClientFor(chainId);
  const market = await rpcMarketDetail(chainId, listed.id);
  try {
    const v = await client.readContract({
      address: cfg.lens,
      abi: marketLensAbi,
      functionName: "positionView",
      args: [listed.address, owner as Address],
    });
    const loanDec = market?.loan.decimals ?? 6;
    const collDec = market?.collateral.decimals ?? 18;
    const loanSym = market?.loan.symbol ?? listed.loanSymbol;
    const collSym = market?.collateral.symbol ?? listed.collateralSymbol;
    const healthCode = healthOf(Number(v.healthCode));
    let debtShares = "0";
    try {
      const shares = await client.readContract({
        address: listed.address,
        abi: extraMarketAbi,
        functionName: "debtSharesOf",
        args: [owner as Address],
      });
      debtShares = shares.toString(10);
    } catch {
      /* optional */
    }
    return {
      chainId,
      marketId: listed.id,
      address: listed.address,
      owner: owner as Address,
      marketLabel: listed.label,
      deliveryMode: listed.deliveryMode,
      debt: amt(v.debt, loanDec, loanSym),
      debtShares,
      principal: amt(v.principal, loanDec, loanSym),
      collateral: amt(v.collateral, collDec, collSym),
      collateralValueLoan: amt(v.collateralValueLoan, loanDec, loanSym),
      collateralUsdWad: "0",
      supplyAssets: amt(v.supplyAssets, loanDec, loanSym),
      maxWithdraw: amt(v.maxWithdraw, loanDec, loanSym),
      healthFactorWad: healthCode === "OK" ? v.healthFactorWad.toString(10) : null,
      healthCode,
      liquidatable: v.liquidatable,
      maxBorrow: amt(v.maxBorrow, loanDec, loanSym),
      defaulted: v.defaulted,
      writtenOffLiability: amt(v.writtenOffLiability, loanDec, loanSym),
      vaultAddress: null,
      recallActive: market?.recallActive ?? false,
      recallDeadline: market?.recallDeadline ?? "0",
      freshness: rpcFreshness(),
    };
  } catch {
    return market ? emptyPosition(chainId, listed.id, owner, market) : null;
  }
}

const ACCEPT_DECLINED = 2;
const ACCEPT_CANCELLED = 3;

function unixOrNull(v: bigint | number): string | null {
  const n = Number(v);
  return n === 0 ? null : String(n);
}

async function rpcFacilityDto(chainId: number, facility: Address): Promise<DirectFacilityDto | null> {
  const cfg = directChainConfig(chainId);
  if (!cfg?.directLens) return null;
  const client = publicClientFor(chainId);
  try {
    const snap = await client.readContract({
      address: cfg.directLens,
      abi: directLensAbi,
      functionName: "snapshot",
      args: [facility],
    });
    const [termsHash, loanToken, lenderAccepted, borrowerAccepted, declined, cancelled, borrowingPaused] =
      await Promise.all([
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "termsHash" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "loanToken" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "lenderAccepted" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "borrowerAccepted" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "declined" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "cancelled" }),
        client.readContract({ address: facility, abi: facilityFlagsAbi, functionName: "borrowingPaused" }),
      ]);
    const acceptance = Number(snap.acceptance);
    return {
      product: "DIRECT",
      protocolVersion: "interline-direct-v2",
      chainId,
      facility,
      lender: snap.lender,
      borrower: snap.borrower,
      vault: snap.vault,
      asset: { address: loanToken, symbol: "mUSDC", decimals: 6 },
      termsHash,
      lenderAccepted,
      borrowerAccepted,
      declined: declined || acceptance === ACCEPT_DECLINED,
      cancelled: cancelled || acceptance === ACCEPT_CANCELLED,
      ended: snap.ended,
      acceptanceDeadline: String(snap.acceptanceDeadline),
      activatedAt: unixOrNull(snap.activatedAt),
      borrowExpiry: unixOrNull(snap.borrowExpiry),
      repaymentDueAt: unixOrNull(snap.repaymentDueAt),
      creditLimitRaw: snap.creditLimit.toString(10),
      availableCashRaw: snap.cash.toString(10),
      principalRaw: snap.principal.toString(10),
      debtRaw: snap.debt.toString(10),
      accruedInterestRaw: snap.accruedInterest.toString(10),
      fixedAprRay: snap.fixedAprRay.toString(10),
      recallDeadline: unixOrNull(snap.recallDeadline),
      borrowingPaused,
      collateralization: "OVERCOLLATERALIZED_80",
      healthFactorWad: null,
      priceLiquidatable: false,
    };
  } catch {
    return null;
  }
}

export async function rpcDirectFacilities(args: {
  chainId?: number;
  party?: string;
  role?: string;
}): Promise<DirectFacilityDto[] | null> {
  const chainIds =
    args.chainId !== undefined ? [args.chainId] : [...new Set(listCatalog().map((m) => m.chainId))];
  const out: DirectFacilityDto[] = [];
  let anyLive = false;
  for (const id of chainIds) {
    const cfg = directChainConfig(id);
    if (!cfg?.directFactory || !cfg.directLens) continue;
    anyLive = true;
    const factory = cfg.directFactory;
    const client = publicClientFor(id);
    try {
      const count = await client.readContract({
        address: factory,
        abi: directFactoryAbi,
        functionName: "facilityCount",
      });
      const n = Math.min(Number(count), 200);
      const addrs = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          client.readContract({
            address: factory,
            abi: directFactoryAbi,
            functionName: "facilityAt",
            args: [BigInt(i)],
          }),
        ),
      );
      const dtos = await Promise.all(
        addrs
          .filter((addr): addr is Address => Boolean(addr) && addr.toLowerCase() !== ZERO)
          .map((addr) => rpcFacilityDto(id, addr)),
      );
      for (const dto of dtos) {
        if (dto) out.push(dto);
      }
    } catch {
      /* chain unreachable */
    }
  }
  if (!anyLive) return null;
  const party = args.party?.toLowerCase();
  return out.filter((row) => {
    if (!party) return true;
    const isLender = row.lender.toLowerCase() === party;
    const isBorrower = row.borrower.toLowerCase() === party;
    if (args.role === "lender") return isLender;
    if (args.role === "borrower") return isBorrower;
    return isLender || isBorrower;
  });
}

export async function rpcDirectFacility(chainId: number, facility: string): Promise<DirectFacilityDto | null> {
  if (!directChainConfig(chainId)?.directLens) return null;
  return rpcFacilityDto(chainId, facility as Address);
}

export async function rpcPortfolio(chainId: number, address: string): Promise<PortfolioDto | null> {
  if (!chainHasLiveMarkets(chainId) && !directChainConfig(chainId)?.directFactory) return null;
  const markets = listCatalog(chainId).filter((m) => m.writable);
  const positions = await Promise.all(markets.map((m) => rpcPosition(chainId, m.id, address)));
  const supplies: PortfolioDto["supplies"] = [];
  const borrows: PortfolioDto["borrows"] = [];
  for (const [i, m] of markets.entries()) {
    const pos = positions[i];
    if (!pos) continue;
    if (BigInt(pos.supplyAssets.raw) > 0n) {
      supplies.push({
        marketId: m.id,
        label: m.label,
        deliveryMode: m.deliveryMode,
        assets: pos.supplyAssets,
        maxWithdraw: pos.maxWithdraw,
        apyGrowthRay: "1000000000000000000000000000",
      });
    }
    if (BigInt(pos.debt.raw) > 0n) {
      borrows.push({
        marketId: m.id,
        label: m.label,
        deliveryMode: m.deliveryMode,
        debt: pos.debt,
        collateral: pos.collateral,
        collateralUsdWad: pos.collateralUsdWad,
        healthFactorWad: pos.healthFactorWad,
        healthCode: pos.healthCode,
        liquidatable: pos.liquidatable,
      });
    }
  }
  const directs = (await rpcDirectFacilities({ chainId, party: address, role: "either" })) ?? [];
  const pending = (row: DirectFacilityDto) =>
    !(row.lenderAccepted && row.borrowerAccepted) && !row.declined && !row.cancelled && !row.ended;
  const hfs = borrows.filter((b) => b.healthCode === "OK" && b.healthFactorWad).map((b) => b.healthFactorWad as string);
  const unavailable = borrows.some((b) => b.healthCode === "UNAVAILABLE");
  return {
    chainId,
    address: address as Address,
    supplies,
    borrows,
    lowestHealthFactorWad: unavailable ? null : hfs.length ? hfs.reduce((a, b) => (BigInt(a) < BigInt(b) ? a : b)) : null,
    lowestHealthCode: unavailable ? "UNAVAILABLE" : borrows.length === 0 ? "NONE" : hfs.length === 0 ? "NO_DEBT" : "OK",
    freshness: rpcFreshness(),
    directLending: directs.filter((r) => r.lender.toLowerCase() === address.toLowerCase() && !pending(r)),
    directBorrowing: directs.filter((r) => r.borrower.toLowerCase() === address.toLowerCase() && !pending(r)),
    directRequests: directs.filter(pending),
  };
}