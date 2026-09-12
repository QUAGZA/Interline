import { catalogById } from "@/lib/catalog";
import { PAGE_SIZE } from "@/lib/config";
import { V2_CHAINS, type V2ChainId } from "@/lib/chains";
import type {
  AmountDto,
  ApiHealthDto,
  ChainDto,
  EventDto,
  EventsPageDto,
  MarketDetailDto,
  MarketSummaryDto,
  PortfolioDto,
  PositionDto,
  PositionsPageDto,
  PositionsQuery,
  TokenRef,
  AddressString,
} from "./types";

const MUSDC: TokenRef = {
  address: "0x0000000000000000000000000000000000000011",
  symbol: "mUSDC",
  decimals: 6,
  testAsset: true,
};
const MWETH: TokenRef = {
  address: "0x0000000000000000000000000000000000000018",
  symbol: "mWETH",
  decimals: 18,
  testAsset: true,
};

const FRESH = {
  blockNumber: "1",
  blockHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
  indexedAt: "2026-09-13T00:00:00.000Z",
  lagSeconds: 0,
};

function amt(raw: string, decimals: number, symbol: string): AmountDto {
  return { raw, decimals, symbol };
}

function hexAddr(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

const MARKETS: MarketDetailDto[] = [
  detail(31337, "usdc-weth-wallet", hexAddr(0xa11ce01), "mUSDC / mWETH - Wallet", "wallet", {
    supplied: "250000000000",
    borrowed: "80000000000",
    liquidity: "170000000000",
    utilRay: "320000000000000000000000000",
    borrowAprRay: "52000000000000000000000000",
    supplyApyGrowthRay: "1016640000000000000000000000",
  }),
  detail(31337, "usdc-weth-restricted", hexAddr(0xa11ce02), "mUSDC / mWETH - Restricted", "restricted", {
    supplied: "120000000000",
    borrowed: "25000000000",
    liquidity: "95000000000",
    utilRay: "208333333333333333333333333",
    borrowAprRay: "40833333333333333333333333",
    supplyApyGrowthRay: "1008500000000000000000000000",
  }),
  detail(84532, "usdc-weth-wallet", hexAddr(0xb05e01), "mUSDC / mWETH - Wallet", "wallet", {
    supplied: "50000000000",
    borrowed: "10000000000",
    liquidity: "40000000000",
    utilRay: "200000000000000000000000000",
    borrowAprRay: "40000000000000000000000000",
    supplyApyGrowthRay: "1008000000000000000000000000",
  }),
  detail(84532, "usdc-weth-restricted", hexAddr(0xb05e02), "mUSDC / mWETH - Restricted", "restricted", {
    supplied: "18000000000",
    borrowed: "4000000000",
    liquidity: "14000000000",
    utilRay: "222222222222222222222222222",
    borrowAprRay: "42222222222222222222222222",
    supplyApyGrowthRay: "1009380000000000000000000000",
  }),
];

function detail(
  chainId: V2ChainId,
  marketId: string,
  address: `0x${string}`,
  label: string,
  deliveryMode: "wallet" | "restricted",
  rates: {
    supplied: string;
    borrowed: string;
    liquidity: string;
    utilRay: string;
    borrowAprRay: string;
    supplyApyGrowthRay: string;
  },
): MarketDetailDto {
  return {
    chainId,
    marketId,
    address,
    label,
    deliveryMode,
    loan: MUSDC,
    collateral: MWETH,
    supplyApyGrowthRay: rates.supplyApyGrowthRay,
    borrowAprRay: rates.borrowAprRay,
    supplied: amt(rates.supplied, 6, "mUSDC"),
    borrowed: amt(rates.borrowed, 6, "mUSDC"),
    liquidity: amt(rates.liquidity, 6, "mUSDC"),
    utilizationRay: rates.utilRay,
    status: "active",
    oracleMode: "simulated",
    oracleStatus: "ok",
    writable: false,
    freshness: FRESH,
    maxLtvBps: 7000,
    liquidationThresholdBps: 8000,
    liquidationBonusBps: 500,
    supplyCap: amt("1000000000000", 6, "mUSDC"),
    borrowCap: amt("800000000000", 6, "mUSDC"),
    defaultPositionCap: amt(deliveryMode === "restricted" ? "25000000000" : "800000000000", 6, "mUSDC"),
    minBorrow: amt("10000000", 6, "mUSDC"),
    minSupply: amt("1000000", 6, "mUSDC"),
    recallWindowSeconds: chainId === 31337 ? 300 : 3600,
    recallDeadline: "0",
    supplyFrozen: false,
    borrowFrozen: false,
    recallActive: false,
  };
}

function makePosition(
  market: MarketDetailDto,
  ownerN: number,
  debtRaw: string,
  collateralWei: string,
  hfWad: string | null,
  extra?: Partial<PositionDto>,
): PositionDto {
  const liquidatable = extra?.liquidatable ?? false;
  const healthCode = extra?.healthCode ?? (debtRaw === "0" ? "NO_DEBT" : "OK");
  return {
    chainId: market.chainId,
    marketId: market.marketId,
    address: market.address,
    owner: hexAddr(ownerN),
    marketLabel: market.label,
    deliveryMode: market.deliveryMode,
    debt: amt(debtRaw, 6, "mUSDC"),
    principal: amt(debtRaw, 6, "mUSDC"),
    collateral: amt(collateralWei, 18, "mWETH"),
    collateralValueLoan: amt("2000000000", 6, "mUSDC"),
    collateralUsdWad: "2000000000000000000000",
    supplyAssets: amt("0", 6, "mUSDC"),
    maxWithdraw: amt("0", 6, "mUSDC"),
    healthFactorWad: hfWad,
    healthCode,
    liquidatable,
    maxBorrow: amt("600000000", 6, "mUSDC"),
    defaulted: false,
    writtenOffLiability: amt("0", 6, "mUSDC"),
    vaultAddress: market.deliveryMode === "restricted" ? hexAddr(0x7a11 + ownerN) : null,
    recallActive: false,
    recallDeadline: "0",
    freshness: FRESH,
    ...extra,
  };
}

const POSITIONS: PositionDto[] = (() => {
  const wallet = MARKETS[0]!;
  const restricted = MARKETS[1]!;
  const baseWallet = MARKETS[2]!;
  const rows: PositionDto[] = [
    makePosition(wallet, 1, "800000000", "1000000000000000000", "2000000000000000000"),
    makePosition(wallet, 2, "400000000", "1000000000000000000", "4000000000000000000"),
    makePosition(restricted, 3, "25000000000", "20000000000000000000", "1280000000000000000", {
      vaultAddress: hexAddr(0x7a113),
    }),
    makePosition(baseWallet, 4, "10000000000", "10000000000000000000", "1600000000000000000"),
    makePosition(wallet, 5, "0", "500000000000000000", null, { healthCode: "NO_DEBT", liquidatable: false }),
  ];
  for (let i = 0; i < 26; i++) {
    const debt = String(50_000_000 - i * 1_000_000);
    rows.push(
      makePosition(wallet, 100 + i, debt, "1000000000000000000", "32000000000000000000"),
    );
  }
  return rows;
})();

const EVENTS: EventDto[] = [
  {
    chainId: 31337,
    marketId: MARKETS[0]!.marketId,
    txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    logIndex: 0,
    blockNumber: "12",
    name: "Supplied",
    detail: "250000 mUSDC into USDC / WETH — Wallet",
    at: "2026-09-13T00:00:00.000Z",
  },
  {
    chainId: 31337,
    marketId: MARKETS[0]!.marketId,
    txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    logIndex: 1,
    blockNumber: "18",
    name: "Borrowed",
    detail: "800 mUSDC to wallet 0x0000…0001",
    at: "2026-09-13T00:10:00.000Z",
  },
  {
    chainId: 31337,
    marketId: MARKETS[1]!.marketId,
    txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    logIndex: 0,
    blockNumber: "20",
    name: "Borrowed",
    detail: "25,000 mUSDC to restricted vault (not an EOA)",
    at: "2026-09-13T00:12:00.000Z",
  },
];

export function stubHealth(): ApiHealthDto {
  return { ok: true, lagSeconds: 0, usingStub: true };
}

export function stubChains(): ChainDto[] {
  return V2_CHAINS.map((c) => ({
    chainId: c.chainId,
    name: c.name,
    oracleMode: "simulated",
  }));
}

export function stubMarkets(chainId?: number): MarketSummaryDto[] {
  const rows = MARKETS.filter((m) => chainId === undefined || m.chainId === chainId);
  return rows.map((m) => {
    const listed = catalogById(m.chainId, m.marketId);
    if (!listed) return m;
    return { ...m, marketId: listed.id, address: listed.address, label: listed.label, writable: listed.writable };
  });
}

export function stubMarket(chainId: number, marketId: string): MarketDetailDto | null {
  const id = marketId.toLowerCase();
  const listed = catalogById(chainId, marketId);
  const found =
    MARKETS.find(
      (m) =>
        m.chainId === chainId && (m.marketId.toLowerCase() === id || m.address.toLowerCase() === id),
    ) ?? (listed ? MARKETS.find((m) => m.chainId === chainId && m.marketId === listed.id) : undefined);
  if (!found) return null;
  if (!listed) return found;
  return { ...found, marketId: listed.id, address: listed.address, label: listed.label, writable: listed.writable };
}

export function stubPositions(q: PositionsQuery): PositionsPageDto {
  const limit = q.limit ?? PAGE_SIZE;
  const offset = q.cursor && /^\d+$/.test(q.cursor) ? Number(q.cursor) : 0;
  let items = POSITIONS.slice();
  if (q.chainId !== undefined) items = items.filter((p) => p.chainId === q.chainId);
  if (q.marketId) {
    const id = q.marketId.toLowerCase();
    items = items.filter((p) => p.marketId.toLowerCase() === id);
  }
  if (q.deliveryMode) items = items.filter((p) => p.deliveryMode === q.deliveryMode);
  items.sort((a, b) => {
    const cmp = BigInt(b.debt.raw) - BigInt(a.debt.raw);
    return cmp > 0n ? 1 : cmp < 0n ? -1 : 0;
  });
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? String(offset + limit) : null;
  return { items: slice, nextCursor: next, limit };
}

export function stubPosition(chainId: number, marketId: string, owner: string): PositionDto | null {
  const m = marketId.toLowerCase();
  const o = owner.toLowerCase();
  const found = POSITIONS.find(
    (p) => p.chainId === chainId && p.marketId.toLowerCase() === m && p.owner.toLowerCase() === o,
  );
  if (found) return found;
  const market = stubMarket(chainId, marketId);
  if (!market) return null;
  return makePosition(market, 0, "0", "0", null, {
    owner: owner as `0x${string}`,
    healthCode: "NO_DEBT",
    collateralValueLoan: amt("0", 6, "mUSDC"),
    collateralUsdWad: "0",
    maxBorrow: amt("0", 6, "mUSDC"),
  });
}

export function stubPortfolio(chainId: number, address: string): PortfolioDto {
  const addr = address.toLowerCase();
  const supplies = MARKETS.filter((m) => m.chainId === chainId && addr.endsWith("01"))
    .slice(0, 1)
    .map((m) => ({
      marketId: m.marketId,
      label: m.label,
      deliveryMode: m.deliveryMode,
      assets: amt("10000000000", 6, "mUSDC"),
      maxWithdraw: amt("8000000000", 6, "mUSDC"),
      apyGrowthRay: m.supplyApyGrowthRay,
    }));
  const borrows = POSITIONS.filter(
    (p) => p.chainId === chainId && p.owner.toLowerCase() === addr && p.debt.raw !== "0",
  ).map((p) => ({
    marketId: p.marketId,
    label: p.marketLabel,
    deliveryMode: p.deliveryMode,
    debt: p.debt,
    collateral: p.collateral,
    collateralUsdWad: p.collateralUsdWad,
    healthFactorWad: p.healthFactorWad,
    healthCode: p.healthCode,
    liquidatable: p.liquidatable,
  }));
  const hfs = borrows
    .filter((b) => b.healthCode === "OK" && b.healthFactorWad)
    .map((b) => b.healthFactorWad as string);
  const unavailable = borrows.some((b) => b.healthCode === "UNAVAILABLE");
  return {
    chainId,
    address: address as AddressString,
    supplies,
    borrows,
    lowestHealthFactorWad: unavailable ? null : hfs.length ? hfs.reduce((a, b) => (BigInt(a) < BigInt(b) ? a : b)) : null,
    lowestHealthCode: unavailable
      ? "UNAVAILABLE"
      : borrows.length === 0
        ? "NONE"
        : hfs.length === 0
          ? "NO_DEBT"
          : "OK",
    freshness: FRESH,
  };
}

export function stubEvents(chainId?: number, address?: string): EventsPageDto {
  let items = EVENTS.slice();
  if (chainId !== undefined) items = items.filter((e) => e.chainId === chainId);
  if (address) {
    const a = address.toLowerCase();
    items = items.filter((e) => e.detail.toLowerCase().includes(a.slice(0, 6)));
  }
  return { items, nextCursor: null };
}

export { MARKETS as STUB_MARKETS };
