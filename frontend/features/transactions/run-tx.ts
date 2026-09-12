import { erc20Abi, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import type { TxKind, TxPhase } from "./tx-store";

export class TxAborted extends Error {}

type Patch = (id: string, patch: { phase?: TxPhase; approvalHash?: Hex; actionHash?: Hex; error?: string }) => void;

/**
 * edit → simulate → wait approval receipt → action → confirm.
 * Exact allowance only. One record id is updated; callers must not reuse a global status slot.
 */
export async function runMarketTx(args: {
  id: string;
  patch: Patch;
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  needsApprove: boolean;
  simulate: () => Promise<void>;
  writeAction: () => Promise<Hex>;
}): Promise<void> {
  const { id, patch } = args;
  try {
    patch(id, { phase: "simulating", error: undefined });
    await args.simulate();

    if (args.needsApprove && args.amount > 0n) {
      const allowance = await args.publicClient.readContract({
        address: args.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [args.account, args.spender],
      });
      if (allowance < args.amount) {
        patch(id, { phase: "awaiting_approval" });
        const approvalHash = await args.walletClient.writeContract({
          account: args.account,
          address: args.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [args.spender, args.amount],
          chain: args.walletClient.chain,
        });
        patch(id, { approvalHash, phase: "awaiting_approval" });
        const approvalReceipt = await args.publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") {
          throw new Error("Approval transaction reverted");
        }
      }
    }

    patch(id, { phase: "awaiting_action" });
    const actionHash = await args.writeAction();
    patch(id, { actionHash, phase: "confirming" });
    const actionReceipt = await args.publicClient.waitForTransactionReceipt({ hash: actionHash });
    if (actionReceipt.status !== "success") {
      throw new Error("Action transaction reverted");
    }
    patch(id, { phase: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = /rejected|denied|abort/i.test(message);
    patch(id, { phase: "error", error: cancelled ? "Rejected in wallet" : message });
    throw error;
  }
}

export function txLabel(kind: TxKind): string {
  switch (kind) {
    case "supply":
      return "Supply";
    case "withdraw":
      return "Withdraw";
    case "redeem":
      return "Redeem";
    case "addCollateral":
      return "Add collateral";
    case "removeCollateral":
      return "Remove collateral";
    case "borrow":
      return "Borrow";
    case "repay":
      return "Repay";
    case "liquidate":
      return "Liquidate";
  }
}
