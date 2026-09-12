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
  | "liquidate";

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

function reducer(state: State, action: Action): State {
  if (action.type === "upsert") {
    return { byId: { ...state.byId, [action.record.id]: action.record } };
  }
  const current = state.byId[action.id];
  if (!current) return state;
  return {
    byId: {
      ...state.byId,
      [action.id]: { ...current, ...action.patch, updatedAt: Date.now() },
    },
  };
}

type TxContextValue = {
  records: TxRecord[];
  get: (id: string) => TxRecord | undefined;
  upsert: (record: TxRecord) => void;
  patch: (id: string, patch: Partial<TxRecord>) => void;
};

const TxContext = createContext<TxContextValue | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { byId: {} });
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
