import { BASE_APR_RAY, RAY } from "@interline/math";
import {
  asAddress,
  type DirectAcceptanceRecord,
  type DirectAuxiliary,
  type DirectCapProposalRecord,
  type DirectCashflowRecord,
  type DirectFacilityRecord,
  type DirectHistoryRecord,
  type DirectRecallEpisodeRecord,
  type DirectTermsRecord,
  type IndexedEventRecord,
  type MarketRecord,
  type PositionRecord,
  type VaultRecord,
  ZERO_ADDRESS,
} from "../domain.js";

export type DerivedState = {
  markets: Map<string, MarketRecord>;
  positions: Map<string, PositionRecord>;
  vaults: Map<string, VaultRecord>;
  facilities: Map<string, DirectFacilityRecord>;
  terms: Map<string, DirectTermsRecord>;
  acceptances: Map<string, DirectAcceptanceRecord>;
  cashflows: Map<string, DirectCashflowRecord>;
  caps: Map<string, DirectCapProposalRecord>;
  recalls: Map<string, DirectRecallEpisodeRecord>;
  history: Map<string, DirectHistoryRecord>;
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

function cloneMap<T>(m: Map<string, T>): Map<string, T> {
  return new Map([...m.entries()].map(([k, v]) => [k, { ...v }]));
}

export function emptyAuxiliary(): DirectAuxiliary {
  return { terms: [], acceptances: [], cashflows: [], caps: [], recalls: [], history: [] };
}

export function cloneDerived(state: DerivedState): DerivedState {
  return {
    markets: cloneMap(state.markets),
    positions: cloneMap(state.positions),
    vaults: cloneMap(state.vaults),
    facilities: cloneMap(state.facilities),
    terms: cloneMap(state.terms),
    acceptances: cloneMap(state.acceptances),
    cashflows: cloneMap(state.cashflows),
    caps: cloneMap(state.caps),
    recalls: cloneMap(state.recalls),
    history: cloneMap(state.history),
  };
}

export function derivedFromRecords(
  markets: MarketRecord[],
  positions: PositionRecord[],
  vaults: VaultRecord[],
  facilities: DirectFacilityRecord[] = [],
  auxiliary: DirectAuxiliary = emptyAuxiliary(),
): DerivedState {
  const state: DerivedState = {
    markets: new Map(),
    positions: new Map(),
    vaults: new Map(),
    facilities: new Map(),
    terms: new Map(),
    acceptances: new Map(),
    cashflows: new Map(),
    caps: new Map(),
    recalls: new Map(),
    history: new Map(),
  };
  for (const m of markets) state.markets.set(marketKey(m), { ...m });
  for (const p of positions) state.positions.set(posKey(p.chainId, p.marketAddress, p.owner), { ...p });
  for (const v of vaults) state.vaults.set(`${v.chainId}:${v.vault.toLowerCase()}`, { ...v });
  for (const f of facilities) state.facilities.set(`${f.chainId}:${f.facility.toLowerCase()}`, { ...f });
  for (const t of auxiliary.terms) state.terms.set(`${t.chainId}:${t.facility.toLowerCase()}`, { ...t });
  for (const a of auxiliary.acceptances) {
    state.acceptances.set(`${a.chainId}:${a.facility.toLowerCase()}:${a.party.toLowerCase()}`, { ...a });
  }
  for (const c of auxiliary.cashflows) {
    state.cashflows.set(`${c.chainId}:${c.txHash.toLowerCase()}:${c.logIndex}`, { ...c });
  }
  for (const cap of auxiliary.caps) {
    state.caps.set(`${cap.chainId}:${cap.facility.toLowerCase()}:${cap.digest.toLowerCase()}`, { ...cap });
  }
  for (const r of auxiliary.recalls) state.recalls.set(`${r.chainId}:${r.facility.toLowerCase()}`, { ...r });
  for (const h of auxiliary.history) {
    state.history.set(`${h.chainId}:${h.txHash.toLowerCase()}:${h.logIndex}`, { ...h });
  }
  return state;
}

export function flattenDerived(state: DerivedState): {
  markets: MarketRecord[];
  positions: PositionRecord[];
  vaults: VaultRecord[];
  facilities: DirectFacilityRecord[];
  auxiliary: DirectAuxiliary;
} {
  return {
    markets: [...state.markets.values()].map((m) => ({ ...m })),
    positions: [...state.positions.values()].map((p) => ({ ...p })),
    vaults: [...state.vaults.values()].map((v) => ({ ...v })),
    facilities: [...state.facilities.values()].map((f) => ({ ...f })),
    auxiliary: {
      terms: [...state.terms.values()].map((t) => ({ ...t })),
      acceptances: [...state.acceptances.values()].map((a) => ({ ...a })),
      cashflows: [...state.cashflows.values()].map((c) => ({ ...c })),
      caps: [...state.caps.values()].map((c) => ({ ...c })),
      recalls: [...state.recalls.values()].map((r) => ({ ...r })),
      history: [...state.history.values()].map((h) => ({ ...h })),
    },
  };
}

export function termsFromFacility(row: DirectFacilityRecord): DirectTermsRecord {
  return {
    chainId: row.chainId,
    facility: row.facility,
    loanToken: row.asset,
    creditLimit: row.creditLimit,
    aprRay: row.aprRay,
    acceptanceLifetime: 0n,
    borrowPeriod: row.borrowPeriod,
    recallWindow: row.recallWindow,
    venue: row.venue,
    swapRouter: row.swapRouter,
    otherToken: row.otherToken,
    termsHash: row.termsHash,
  };
}

function findFacility(state: DerivedState, chainId: number, address: string): DirectFacilityRecord | undefined {
  return state.facilities.get(`${chainId}:${address.toLowerCase()}`);
}

function emptyFacility(chainId: number, facility: DirectFacilityRecord["facility"]): DirectFacilityRecord {
  return {
    chainId,
    facility,
    lender: asAddress("0x0000000000000000000000000000000000000000"),
    borrower: asAddress("0x0000000000000000000000000000000000000000"),
    vault: asAddress("0x0000000000000000000000000000000000000000"),
    asset: asAddress("0x0000000000000000000000000000000000000000"),
    termsHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    lenderAccepted: false,
    borrowerAccepted: false,
    declined: false,
    cancelled: false,
    ended: false,
    acceptanceDeadline: 0n,
    activatedAt: 0n,
    borrowExpiry: 0n,
    repaymentDueAt: 0n,
    creditLimit: 0n,
    accountedCash: 0n,
    debtShares: 0n,
    principal: 0n,
    lastDebt: 0n,
    aprRay: 0n,
    recallDeadline: 0n,
    recallActive: false,
    borrowingPaused: false,
    venue: ZERO_ADDRESS,
    swapRouter: ZERO_ADDRESS,
    otherToken: ZERO_ADDRESS,
    borrowPeriod: 0n,
    recallWindow: 0n,
  };
}

function eventKey(event: IndexedEventRecord): string {
  return `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`;
}

function recordCashMutation(
  state: DerivedState,
  fac: DirectFacilityRecord,
  event: IndexedEventRecord,
  kind: string,
  assets: bigint,
): void {
  const key = eventKey(event);
  state.cashflows.set(key, {
    chainId: event.chainId,
    facility: fac.facility,
    kind,
    assets,
    cashAfter: fac.accountedCash,
    debtAfter: fac.lastDebt,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
  });
  state.history.set(key, {
    chainId: event.chainId,
    facility: fac.facility,
    cash: fac.accountedCash,
    debt: fac.lastDebt,
    principal: fac.principal,
    creditLimit: fac.creditLimit,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
  });
}

/** Apply a decoded log. Returns true if state changed. */
export function applyEvent(state: DerivedState, event: IndexedEventRecord): boolean {
  switch (event.eventName) {
    case "FacilityCreated": {
      const facility = argAddr(event, "facility");
      const lender = argAddr(event, "lender");
      const borrower = argAddr(event, "borrower");
      const vault = asAddress(arg(event, "vault") ?? "0x0000000000000000000000000000000000000000");
      const row: DirectFacilityRecord = {
        ...emptyFacility(event.chainId, facility),
        lender,
        borrower,
        vault,
        termsHash: (arg(event, "termsHash") ?? emptyFacility(event.chainId, facility).termsHash) as DirectFacilityRecord["termsHash"],
        lenderAccepted: (arg(event, "creator") ?? "").toLowerCase() === lender.toLowerCase(),
        borrowerAccepted: (arg(event, "creator") ?? "").toLowerCase() === borrower.toLowerCase(),
      };
      state.facilities.set(`${event.chainId}:${facility.toLowerCase()}`, row);
      state.terms.set(`${event.chainId}:${facility.toLowerCase()}`, termsFromFacility(row));
      const creator = argAddr(event, "creator");
      if (creator !== ZERO_ADDRESS) {
        state.acceptances.set(`${event.chainId}:${facility.toLowerCase()}:${creator.toLowerCase()}`, {
          chainId: event.chainId,
          facility,
          party: creator,
          accepted: true,
          txHash: event.txHash,
          logIndex: event.logIndex,
          timestamp: event.timestamp,
        });
      }
      if (vault !== "0x0000000000000000000000000000000000000000") {
        state.vaults.set(`${event.chainId}:${vault.toLowerCase()}`, {
          chainId: event.chainId,
          marketAddress: facility,
          owner: borrower,
          vault,
          venueAssets: 0n,
        });
      }
      return true;
    }
    case "TermsAccepted": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      const party = argAddr(event, "party");
      if (party.toLowerCase() === fac.lender.toLowerCase()) fac.lenderAccepted = true;
      if (party.toLowerCase() === fac.borrower.toLowerCase()) fac.borrowerAccepted = true;
      state.acceptances.set(`${event.chainId}:${fac.facility.toLowerCase()}:${party.toLowerCase()}`, {
        chainId: event.chainId,
        facility: fac.facility,
        party,
        accepted: true,
        txHash: event.txHash,
        logIndex: event.logIndex,
        timestamp: event.timestamp,
      });
      return true;
    }
    case "RequestDeclined": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.declined = true;
      return true;
    }
    case "RequestCancelled": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.cancelled = true;
      return true;
    }
    case "Activated": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.activatedAt = argBig(event, "activatedAt");
      fac.borrowExpiry = argBig(event, "borrowExpiry");
      fac.repaymentDueAt = argBig(event, "repaymentDueAt");
      return true;
    }
    case "Funded": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.accountedCash = argBig(event, "cashAfter");
      recordCashMutation(state, fac, event, "fund", argBig(event, "assets"));
      return true;
    }
    case "CashWithdrawn": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.accountedCash = argBig(event, "cashAfter");
      recordCashMutation(state, fac, event, "withdraw", argBig(event, "assets"));
      return true;
    }
    case "AgreementEnded": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.ended = true;
      return true;
    }
    case "RecallRequested": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.recallActive = true;
      fac.recallDeadline = argBig(event, "deadline");
      state.recalls.set(`${event.chainId}:${fac.facility.toLowerCase()}`, {
        chainId: event.chainId,
        facility: fac.facility,
        reasonHash: (arg(event, "reasonHash") ?? "0x") as DirectRecallEpisodeRecord["reasonHash"],
        reasonCode: Number(arg(event, "reasonCode") ?? "0"),
        deadline: fac.recallDeadline,
        cleared: false,
        startedTxHash: event.txHash,
        startedLogIndex: event.logIndex,
        timestamp: event.timestamp,
      });
      return true;
    }
    case "RecallCleared": {
      const fac = findFacility(state, event.chainId, event.address);
      if (fac) {
        fac.recallActive = false;
        fac.recallDeadline = 0n;
        const rec = state.recalls.get(`${event.chainId}:${fac.facility.toLowerCase()}`);
        if (rec) rec.cleared = true;
        return true;
      }
      const market = findMarketByAddress(state, event.chainId, event.address);
      if (!market) return false;
      market.recallActive = false;
      market.recallDeadline = 0n;
      market.recallClearableAt = 0n;
      return true;
    }
    case "BorrowingPaused": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.borrowingPaused = true;
      return true;
    }
    case "BorrowingResumed": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.borrowingPaused = false;
      return true;
    }
    case "CapProposed": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      const digest = (arg(event, "digest") ?? "0x") as DirectCapProposalRecord["digest"];
      state.caps.set(`${event.chainId}:${fac.facility.toLowerCase()}:${digest.toLowerCase()}`, {
        chainId: event.chainId,
        facility: fac.facility,
        digest,
        proposer: argAddr(event, "proposer"),
        nonce: argBig(event, "nonce"),
        validUntil: argBig(event, "validUntil"),
        newCap: 0n,
        lenderApproved: false,
        borrowerApproved: false,
        cancelled: false,
        executed: false,
      });
      return true;
    }
    case "CapApproved": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      const digest = (arg(event, "digest") ?? "").toLowerCase();
      const row = state.caps.get(`${event.chainId}:${fac.facility.toLowerCase()}:${digest}`);
      if (!row) return false;
      const party = argAddr(event, "party");
      if (party.toLowerCase() === fac.lender.toLowerCase()) row.lenderApproved = true;
      if (party.toLowerCase() === fac.borrower.toLowerCase()) row.borrowerApproved = true;
      return true;
    }
    case "CapCancelled": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      const digest = (arg(event, "digest") ?? "").toLowerCase();
      const row = state.caps.get(`${event.chainId}:${fac.facility.toLowerCase()}:${digest}`);
      if (!row) return false;
      row.cancelled = true;
      return true;
    }
    case "CapExecuted": {
      const fac = findFacility(state, event.chainId, event.address);
      if (!fac) return false;
      fac.creditLimit = argBig(event, "newCap");
      const terms = state.terms.get(`${event.chainId}:${fac.facility.toLowerCase()}`);
      if (terms) terms.creditLimit = fac.creditLimit;
      for (const cap of state.caps.values()) {
        if (cap.chainId === event.chainId && cap.facility.toLowerCase() === fac.facility.toLowerCase() && !cap.cancelled) {
          cap.executed = true;
          cap.newCap = fac.creditLimit;
        }
      }
      return true;
    }
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
        maxLtvBps: 8000,
        liquidationThresholdBps: 9000,
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
      const fac = findFacility(state, event.chainId, event.address);
      if (fac) {
        const shares = argBig(event, "shares");
        const assets = argBig(event, "assets");
        fac.debtShares += shares;
        fac.principal += assets;
        if (fac.accountedCash >= assets) fac.accountedCash -= assets;
        fac.lastDebt = argBig(event, "debtAfter");
        recordCashMutation(state, fac, event, "borrow", assets);
        return true;
      }
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
      const fac = findFacility(state, event.chainId, event.address);
      if (fac) {
        const sharesBurned = argBig(event, "sharesBurned");
        const assets = argBig(event, "assets");
        const principalPaid = argBig(event, "principalPaid");
        if (fac.debtShares >= sharesBurned) fac.debtShares -= sharesBurned;
        fac.accountedCash += assets;
        if (fac.principal >= principalPaid) fac.principal -= principalPaid;
        fac.lastDebt = fac.lastDebt > assets ? fac.lastDebt - assets : 0n;
        recordCashMutation(state, fac, event, "repay", assets);
        return true;
      }
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
