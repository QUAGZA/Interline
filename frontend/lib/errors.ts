import { decodeErrorResult, type Hex } from "viem";
import { lendingMarketAbi } from "@/lib/abi-market";
import { directFacilityAbi } from "@/lib/direct-abi";

export const faucetAbi = [
  { type: "function", name: "drip", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "error", name: "Cooldown", inputs: [] },
  { type: "error", name: "NotOperator", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

const MESSAGES: Record<string, string> = {
  InsufficientCash: "Not enough cash in this pool. Supply first, or borrow less.",
  InsufficientCollateral: "Not enough collateral for this borrow. Add mWETH, or borrow less (max 80% LTV).",
  InsufficientShares: "Nothing supplied to withdraw.",
  MinAmount: "Amount is below the market minimum.",
  ZeroAmount: "Enter an amount greater than zero.",
  Frozen: "This action is frozen on the market.",
  TerminalMarket: "This market is terminal.",
  OracleInvalid:
    "Simulated oracle is stale (1 hour heartbeat). Refresh simulated prices, then borrow again.",
  SupplyCapExceeded: "Supply would exceed the market cap.",
  BorrowCapExceeded: "Borrow would exceed the market cap.",
  PositionCapExceeded: "This would exceed the position cap.",
  Slippage: "Quote moved. Refresh the amount and try again.",
  DustDebt: "Leaving dust debt is not allowed. Repay the rest or use repay max.",
  LastShareWithDebt: "Cannot withdraw the last supply shares while debt remains.",
  Healthy: "This position is not liquidatable.",
  Defaulted: "This position is already defaulted.",
  Cooldown: "Faucet cooldown: wait 1 hour between drips.",
  AlreadyDecided: "You already accepted, or this request is no longer pending.",
  NotPending: "This request is no longer pending.",
  InvalidTerms: "Terms hash does not match this agreement.",
  WrongParty: "This wallet is not a named party on this agreement.",
  RequestExpired: "The acceptance window has expired.",
  NotBothAccepted: "Both named parties must accept before cash can move.",
  NotActive: "This agreement is not active yet.",
  NoLenderCash: "No lender cash available. The lender must fund first.",
  LimitExceeded: "This would exceed the credit limit.",
  BorrowingExpired: "The borrowing window has ended.",
  LenderPaused: "The lender paused new borrowing.",
  ActiveRecall: "A repayment request is already active.",
  SameParty: "Lender and borrower must be different wallets.",
  Ended: "This agreement has ended.",
  OutstandingDebt: "Outstanding debt remains.",
  OutstandingCash: "Idle lender cash remains.",
};

function extractRevertData(error: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  for (let i = 0; i < 10 && cur && typeof cur === "object" && !seen.has(cur); i++) {
    seen.add(cur);
    const o = cur as { data?: unknown; cause?: unknown; error?: unknown; raw?: unknown };
    const candidates = [o.data, o.raw];
    for (const c of candidates) {
      if (typeof c === "string" && /^0x[0-9a-fA-F]{8,}$/.test(c)) return c as Hex;
      if (c && typeof c === "object") {
        const inner = (c as { data?: unknown }).data;
        if (typeof inner === "string" && /^0x[0-9a-fA-F]{8,}$/.test(inner)) return inner as Hex;
      }
    }
    cur = o.cause ?? o.error;
  }
  return undefined;
}

export function decodeRevert(error: unknown): string | null {
  const data = extractRevertData(error);
  if (data) {
    for (const abi of [lendingMarketAbi, directFacilityAbi, faucetAbi]) {
      try {
        const decoded = decodeErrorResult({ abi, data });
        return MESSAGES[decoded.errorName] ?? decoded.errorName;
      } catch {
        /* try next abi */
      }
    }
  }
  const text = errorMessage(error);
  const named = /(?:error\s+)?([A-Z][A-Za-z0-9]+)\(\)/.exec(text)?.[1];
  if (named && MESSAGES[named]) return MESSAGES[named];
  return null;
}

export function errMsg(error: unknown): string {
  return decodeRevert(error) ?? errorMessage(error);
}

function errorMessage(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "object") {
    const o = error as { shortMessage?: string; message?: string };
    if (o.shortMessage) return o.shortMessage;
    if (o.message) return o.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
