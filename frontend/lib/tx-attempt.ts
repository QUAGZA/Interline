import type { TxPhase, TxRecord } from "@/features/transactions/tx-store";

export const PENDING_TX_PHASES: ReadonlySet<TxPhase> = new Set([
  "simulating",
  "awaiting_approval",
  "awaiting_action",
  "confirming",
]);

export function actionKey(args: {
  chainId: number;
  account: string;
  facility: string;
  action: string;
}): string {
  return `${args.chainId}:${args.account.toLowerCase()}:${args.facility.toLowerCase()}:${args.action}`;
}

export function newAttemptId(key: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${key}:${suffix}`;
}

export function isPendingPhase(phase: TxPhase): boolean {
  return PENDING_TX_PHASES.has(phase);
}

export function matchesActionKey(id: string, key: string): boolean {
  return id === key || id.startsWith(`${key}:`);
}

export function latestForKey(records: TxRecord[], key: string): TxRecord | undefined {
  return records.filter((r) => matchesActionKey(r.id, key)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export function pendingForKey(records: TxRecord[], key: string): TxRecord | undefined {
  return records.find((r) => matchesActionKey(r.id, key) && isPendingPhase(r.phase));
}
