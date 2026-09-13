"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

export type TxKind =
  | "supply"
  | "withdraw"
  | "redeem"
  | "addCollateral"
  | "removeCollateral"
  | "borrow"
  | "repay"
  | "liquidate"
  | "directCreate"
  | "directAccept"
  | "directDecline"
  | "directCancel"
  | "directFund"
  | "directWithdrawCash"
  | "directBorrow"
  | "directRepay"
  | "directRecall"
  | "directCap"
  | "directPause"
  | "directEnd"
  | "directVenue"
  | "directAddCollateral"
  | "directRemoveCollateral"
  | "faucet"
  | "oracleRefresh";

export type TxPhase =
  | "idle"
  | "editing"
  | "simulating"
  | "awaiting_approval"
  | "awaiting_action"
  | "confirming"
  | "success"
  | "error";

export type TxRecord = {
  id: string;
  kind: TxKind;
  chainId: number;
  marketId: string;
  amountRaw: string;
  spender: string;
  tokenSymbol: string;
  phase: TxPhase;
  approvalHash?: `0x${string}`;
  actionHash?: `0x${string}`;
  error?: string;
  updatedAt: number;
};

type State = { byId: Record<string, TxRecord> };

type Action =
  | { type: "upsert"; record: TxRecord }
  | { type: "patch"; id: string; patch: Partial<TxRecord> };

const TX_STORAGE_KEY = "interline.tx-records.v1";

function loadState(): State {
  if (typeof sessionStorage === "undefined") return { byId: {} };
  try {
    const raw = sessionStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return { byId: {} };
    const parsed = JSON.parse(raw) as State;
    if (!parsed?.byId || typeof parsed.byId !== "object") return { byId: {} };
    return parsed;
  } catch {
    return { byId: {} };
  }
}

function persist(state: State) {
  try {
    sessionStorage.setItem(TX_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

function reducer(state: State, action: Action): State {
  if (action.type === "upsert") {
    const next = { byId: { ...state.byId, [action.record.id]: action.record } };
    persist(next);
    return next;
  }
  const current = state.byId[action.id];
  if (!current) return state;
  const next = {
    byId: {
      ...state.byId,
      [action.id]: { ...current, ...action.patch, updatedAt: Date.now() },
    },
  };
  persist(next);
  return next;
}

type TxContextValue = {
  records: TxRecord[];
  get: (id: string) => TxRecord | undefined;
  upsert: (record: TxRecord) => void;
  patch: (id: string, patch: Partial<TxRecord>) => void;
};

const TxContext = createContext<TxContextValue | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const upsert = useCallback((record: TxRecord) => dispatch({ type: "upsert", record }), []);
  const patch = useCallback((id: string, next: Partial<TxRecord>) => dispatch({ type: "patch", id, patch: next }), []);
  const get = useCallback((id: string) => state.byId[id], [state.byId]);
  const records = useMemo(
    () => Object.values(state.byId).sort((a, b) => b.updatedAt - a.updatedAt),
    [state.byId],
  );
  const value = useMemo(() => ({ records, get, upsert, patch }), [records, get, upsert, patch]);
  return <TxContext.Provider value={value}>{children}</TxContext.Provider>;
}

export function useTxMachine() {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTxMachine must be used within TxProvider");
  return ctx;
}

export function useOptionalTxMachine() {
  return useContext(TxContext);
}
