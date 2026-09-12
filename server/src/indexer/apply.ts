import { BASE_APR_RAY, RAY } from "@interline/math";
import { asAddress, type IndexedEventRecord, type MarketRecord, type PositionRecord, type VaultRecord } from "../domain.js";

export type DerivedState = {
  markets: Map<string, MarketRecord>;
  positions: Map<string, PositionRecord>;
  vaults: Map<string, VaultRecord>;
};

function marketKey(m: MarketRecord): string {
  return `${m.chainId}:${m.address.toLowerCase()}`;
}

function posKey(chainId: number, marketAddress: string, owner: string): string {
  return `${chainId}:${marketAddress.toLowerCase()}:${owner.toLowerCase()}`;
}

function arg(event: IndexedEventRecord, name: string): string | undefined {
  return event.args[name];
}

function argBig(event: IndexedEventRecord, name: string): bigint {
  const v = arg(event, name);
  return v ? BigInt(v) : 0n;
}

function argAddr(event: IndexedEventRecord, name: string): `0x${string}` {
  return asAddress(arg(event, name) ?? "0x0000000000000000000000000000000000000000");
}

function findMarketByAddress(state: DerivedState, chainId: number, address: string): MarketRecord | undefined {
  return state.markets.get(`${chainId}:${address.toLowerCase()}`);
}

function ensurePosition(state: DerivedState, market: MarketRecord, owner: string): PositionRecord {
  const key = posKey(market.chainId, market.address, owner);
  let row = state.positions.get(key);
  if (!row) {
    row = {
      chainId: market.chainId,
      marketId: market.marketId,
      marketAddress: market.address,
      owner: asAddress(owner),
      supplyShares: 0n,
      debtShares: 0n,
      collateral: 0n,
      principalOutstanding: 0n,
      defaulted: false,
      writtenOffLiability: 0n,
      positionCap: market.defaultPositionCap,
      vault: null,
    };
    state.positions.set(key, row);
  }
  return row;
}

function deliveryModeFrom(raw: string | undefined): "wallet" | "restricted" {
  if (raw === "1" || raw === "restricted") return "restricted";
  return "wallet";
}

export function cloneDerived(state: DerivedState): DerivedState {
  return {
    markets: new Map([...state.markets.entries()].map(([k, v]) => [k, { ...v }])),
    positions: new Map([...state.positions.entries()].map(([k, v]) => [k, { ...v }])),
    vaults: new Map([...state.vaults.entries()].map(([k, v]) => [k, { ...v }])),
  };
}

export function derivedFromRecords(
  markets: MarketRecord[],
  positions: PositionRecord[],
  vaults: VaultRecord[],
): DerivedState {
  const state: DerivedState = { markets: new Map(), positions: new Map(), vaults: new Map() };
  for (const m of markets) state.markets.set(marketKey(m), { ...m });
  for (const p of positions) state.positions.set(posKey(p.chainId, p.marketAddress, p.owner), { ...p });
  for (const v of vaults) state.vaults.set(`${v.chainId}:${v.vault.toLowerCase()}`, { ...v });
  return state;
}

export function flattenDerived(state: DerivedState): {
  markets: MarketRecord[];
  positions: PositionRecord[];
  vaults: VaultRecord[];
} {
  return {
    markets: [...state.markets.values()].map((m) => ({ ...m })),
    positions: [...state.positions.values()].map((p) => ({ ...p })),
    vaults: [...state.vaults.values()].map((v) => ({ ...v })),
  };
}

/** Apply a decoded log. Returns true if state changed. */
export function applyEvent(state: DerivedState, event: IndexedEventRecord): boolean {
  switch (event.eventName) {
    case "MarketCreated": {
      const address = argAddr(event, "market");
      const existing = findMarketByAddress(state, event.chainId, address);
      if (existing) {
        existing.loanToken = argAddr(event, "loanToken");
        existing.collateralToken = argAddr(event, "collateralToken");
        existing.deliveryMode = deliveryModeFrom(arg(event, "deliveryMode"));
        return true;
      }
      const marketId = address;
      const row: MarketRecord = {
        chainId: event.chainId,
        marketId,
        address,
        label: address,
        deliveryMode: deliveryModeFrom(arg(event, "deliveryMode")),
        loanToken: argAddr(event, "loanToken"),
        loanSymbol: "mUSDC",
        loanDecimals: 6,
        collateralToken: argAddr(event, "collateralToken"),
        collateralSymbol: "mWETH",
        collateralDecimals: 18,
        oracle: null,
        accountedCash: 0n,
        totalDebtShares: 0n,
        totalSupplyShares: 0n,
        epochIndexRay: RAY,
        epochTimestamp: event.timestamp,
        epochAprRay: BASE_APR_RAY,
        supplyCap: 0n,
        borrowCap: 0n,
        maxLtvBps: 7000,
        liquidationThresholdBps: 8000,
        liquidationBonusBps: 500,
        defaultPositionCap: 0n,
        supplyFrozen: false,
        borrowFrozen: false,
        recallActive: false,
        recallDeadline: 0n,
        recallClearableAt: 0n,
        terminal: false,
        unaccountedSurplus: 0n,
        quoteScale36: 0n,
        collateralUsdWad: 0n,
        loanUsdWad: 0n,
        oracleStatus: "UNAVAILABLE",
        oracleMode: "simulated",
      };
      state.markets.set(marketKey(row), row);
      return true;
    }
    case "VaultCreated": {
      const marketAddress = argAddr(event, "market");
      const owner = argAddr(event, "owner");
      const vault = asAddress(arg(event, "vault") ?? event.address);
      state.vaults.set(`${event.chainId}:${vault}`, {
        chainId: event.chainId,
        marketAddress,
        owner,
        vault,
        venueAssets: 0n,
      });
      const market = findMarketByAddress(state, event.chainId, marketAddress);
      if (market) {
        const pos = ensurePosition(state, market, owner);
        pos.vault = vault;
      }
      return true;
    }
    case "Supplied": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const supplier = argAddr(event, "supplier");
      const shares = argBig(event, "shares");
      market.accountedCash = argBig(event, "cashAfter");
      market.totalSupplyShares += shares;
      const pos = ensurePosition(state, market, supplier);
      pos.supplyShares += shares;
      return true;
    }
    case "Withdrawn": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const supplier = argAddr(event, "supplier");
      const shares = argBig(event, "shares");
      market.accountedCash = argBig(event, "cashAfter");
      if (market.totalSupplyShares >= shares) market.totalSupplyShares -= shares;
      const pos = ensurePosition(state, market, supplier);
      if (pos.supplyShares >= shares) pos.supplyShares -= shares;
      return true;
    }
    case "Redeemed": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const supplier = argAddr(event, "supplier");
      const shares = argBig(event, "shares");
      market.accountedCash = argBig(event, "cashAfter");
      if (market.totalSupplyShares >= shares) market.totalSupplyShares -= shares;
      const pos = ensurePosition(state, market, supplier);
      if (pos.supplyShares >= shares) pos.supplyShares -= shares;
      return true;
    }
    case "CollateralAdded": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const pos = ensurePosition(state, market, owner);
      pos.collateral += argBig(event, "amount");
      return true;
    }
    case "CollateralRemoved": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const pos = ensurePosition(state, market, owner);
      const amount = argBig(event, "amount");
      if (pos.collateral >= amount) pos.collateral -= amount;
      return true;
    }
    case "Borrowed": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const shares = argBig(event, "shares");
      const assets = argBig(event, "assets");
      market.totalDebtShares += shares;
      if (market.accountedCash >= assets) market.accountedCash -= assets;
      const pos = ensurePosition(state, market, owner);
      pos.debtShares += shares;
      pos.principalOutstanding += assets;
      const dest = arg(event, "destination");
      if (dest && dest.toLowerCase() !== owner.toLowerCase()) pos.vault = asAddress(dest);
      return true;
    }
    case "WrittenOff": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const pos = ensurePosition(state, market, owner);
      if (market.totalDebtShares >= pos.debtShares) market.totalDebtShares -= pos.debtShares;
      pos.debtShares = 0n;
      pos.principalOutstanding = 0n;
      pos.defaulted = true;
      pos.writtenOffLiability += argBig(event, "debtWritten");
      return true;
    }
    case "Repaid": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const sharesBurned = argBig(event, "sharesBurned");
      const assets = argBig(event, "assets");
      const principalPaid = argBig(event, "principalPaid");
      if (market.totalDebtShares >= sharesBurned) market.totalDebtShares -= sharesBurned;
      market.accountedCash += assets;
      const pos = ensurePosition(state, market, owner);
      if (pos.debtShares >= sharesBurned) pos.debtShares -= sharesBurned;
      if (pos.principalOutstanding >= principalPaid) pos.principalOutstanding -= principalPaid;
      return true;
    }
    case "Liquidated": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const pos = ensurePosition(state, market, owner);
      const loanIn = argBig(event, "loanAssetsIn");
      const collatOut = argBig(event, "collateralOut");
      const burned = argBig(event, "debtShares");
      market.accountedCash += loanIn;
      if (pos.collateral >= collatOut) pos.collateral -= collatOut;
      // WrittenOff (same tx, earlier log) already zeroed remaining shares.
      if (pos.debtShares > 0n) {
        const take = burned > pos.debtShares ? pos.debtShares : burned;
        pos.debtShares -= take;
        if (market.totalDebtShares >= take) market.totalDebtShares -= take;
      }
      return true;
    }
    case "RateEpoch": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.epochIndexRay = argBig(event, "indexRay");
      market.epochAprRay = argBig(event, "aprRay");
      market.epochTimestamp = argBig(event, "timestamp");
      return true;
    }
    case "Accrued": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      // Accrue poke does not reset the rate epoch; keep storage epoch, record utilization hint.
      return true;
    }
    case "SupplyFreezeSet": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.supplyFrozen = arg(event, "frozen") === "true" || arg(event, "frozen") === "1";
      return true;
    }
    case "BorrowFreezeSet": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.borrowFrozen = arg(event, "frozen") === "true" || arg(event, "frozen") === "1";
      return true;
    }
    case "RecallStarted": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.recallActive = true;
      market.recallDeadline = argBig(event, "deadline");
      market.recallClearableAt = argBig(event, "clearableAt");
      return true;
    }
    case "RecallCleared": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.recallActive = false;
      market.recallDeadline = 0n;
      market.recallClearableAt = 0n;
      return true;
    }
    case "PositionCapSet": {
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      const owner = argAddr(event, "owner");
      const pos = ensurePosition(state, market, owner);
      pos.positionCap = argBig(event, "newCap");
      return true;
    }
    case "EnteredVenue": {
      const vault = [...state.vaults.values()].find(
        (v) => v.chainId === event.chainId && v.vault.toLowerCase() === event.address.toLowerCase(),
      );
      if (!vault) return false;
      vault.venueAssets += argBig(event, "assets");
      return true;
    }
    case "ExitedVenue": {
      const vault = [...state.vaults.values()].find(
        (v) => v.chainId === event.chainId && v.vault.toLowerCase() === event.address.toLowerCase(),
      );
      if (!vault) return false;
      const assets = argBig(event, "assets");
      if (vault.venueAssets >= assets) vault.venueAssets -= assets;
      return true;
    }
    default:
      return false;
  }
}

export function replayEvents(base: DerivedState, events: IndexedEventRecord[]): DerivedState {
  const state = cloneDerived(base);
  for (const event of events) applyEvent(state, event);
  return state;
}
