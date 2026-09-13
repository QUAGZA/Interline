import { describe, expect, it } from "vitest";
import {
  actionKey,
  isPendingPhase,
  latestForKey,
  matchesActionKey,
  newAttemptId,
  pendingForKey,
} from "./tx-attempt";
import type { TxRecord } from "@/features/transactions/tx-store";

function rec(id: string, phase: TxRecord["phase"], updatedAt = 1): TxRecord {
  return {
    id,
    kind: "directBorrow",
    chainId: 31337,
    marketId: "0xabc",
    amountRaw: "1",
    spender: "0xabc",
    tokenSymbol: "mUSDC",
    phase,
    updatedAt,
  };
}

describe("per-attempt ids", () => {
  it("keys attempts by chain, account, facility, and action", () => {
    const key = actionKey({
      chainId: 31337,
      account: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
      facility: "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb",
      action: "directBorrow",
    });
    expect(key).toBe("31337:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:directBorrow");
    const a = newAttemptId(key);
    const b = newAttemptId(key);
    expect(matchesActionKey(a, key)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("treats only in-flight phases as pending", () => {
    expect(isPendingPhase("awaiting_approval")).toBe(true);
    expect(isPendingPhase("success")).toBe(false);
    expect(isPendingPhase("error")).toBe(false);
    expect(isPendingPhase("editing")).toBe(false);
  });

  it("finds a pending attempt so confirm can stay disabled", () => {
    const key = actionKey({
      chainId: 1,
      account: "0x1",
      facility: "0x2",
      action: "supply",
    });
    const records = [
      rec(`${key}:aa`, "success", 1),
      rec(`${key}:bb`, "awaiting_action", 2),
    ];
    expect(pendingForKey(records, key)?.id).toBe(`${key}:bb`);
    expect(latestForKey(records, key)?.phase).toBe("awaiting_action");
  });
});
