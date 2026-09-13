import { erc20Abi, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { errMsg } from "@/lib/errors";
import type { TxKind, TxPhase } from "./tx-store";

export class TxAborted extends Error {}

export type TxErrorKind = "rejected" | "reverted" | "rpc" | "validation";
export type TxErrorStage = "validate" | "approval" | "simulate" | "action";

export class TxExecutionError extends Error {
  readonly kind: TxErrorKind;
  readonly stage: TxErrorStage;
  constructor(kind: TxErrorKind, stage: TxErrorStage, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TxExecutionError";
    this.kind = kind;
    this.stage = stage;
  }
}

type Patch = (id: string, patch: { phase?: TxPhase; approvalHash?: Hex; actionHash?: Hex; error?: string }) => void;

const ZERO = zeroAddress.toLowerCase();

/**
 * validate → approve (if needed) → revalidate account/chain → simulate → action → confirm.
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
  expectedChainId?: number;
  refreshQuote?: () => Promise<void>;
  simulate: () => Promise<void>;
  writeAction: () => Promise<Hex>;
}): Promise<Hex> {
  const { id, patch } = args;
  let stage: TxErrorStage = "validate";
  try {
    const expectedChainId = await validateBeforeApproval(args);

    if (args.needsApprove && args.amount > 0n) {
      const allowance = await readTokenUint(args.publicClient, args.token, "allowance", [args.account, args.spender]);
      if (allowance < args.amount) {
        stage = "approval";
        patch(id, { phase: "awaiting_approval", error: undefined });
        let approvalHash: Hex;
        try {
          approvalHash = await args.walletClient.writeContract({
            account: args.account,
            address: args.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [args.spender, args.amount],
            chain: args.walletClient.chain,
          });
        } catch (error) {
          throw toTxError(error, "approval");
        }
        patch(id, { approvalHash, phase: "awaiting_approval" });
        const approvalReceipt = await args.publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") {
          throw new TxExecutionError("reverted", "approval", "Approval transaction reverted");
        }
        await revalidateAccountAndChain(args, expectedChainId);
      }
    }

    if (args.refreshQuote) {
      await args.refreshQuote();
    }

    stage = "simulate";
    patch(id, { phase: "simulating", error: undefined });
    try {
      await args.simulate();
    } catch (error) {
      throw toTxError(error, "simulate");
    }

    stage = "action";
    await revalidateAccountAndChain(args, expectedChainId);
    patch(id, { phase: "awaiting_action" });
    let actionHash: Hex;
    try {
      actionHash = await args.writeAction();
    } catch (error) {
      throw toTxError(error, "action");
    }
    patch(id, { actionHash, phase: "confirming" });
    const actionReceipt = await args.publicClient.waitForTransactionReceipt({ hash: actionHash });
    if (actionReceipt.status !== "success") {
      throw new TxExecutionError("reverted", "action", "Action transaction reverted");
    }
    patch(id, { phase: "success" });
    return actionHash;
  } catch (error) {
    const wrapped = error instanceof TxExecutionError ? error : toTxError(error, stage);
    patch(id, { phase: "error", error: userFacing(wrapped) });
    throw wrapped;
  }
}

async function validateBeforeApproval(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  needsApprove: boolean;
  expectedChainId?: number;
}): Promise<number | undefined> {
  if (args.amount < 0n) {
    throw new TxExecutionError("validation", "validate", "Amount must be zero or positive.");
  }
  requireAddress(args.account, "account");
  const walletAccount = addressOf(args.walletClient.account);
  if (walletAccount && !sameAddr(walletAccount, args.account)) {
    throw new TxExecutionError("validation", "validate", "Wallet account does not match the connected account.");
  }

  const expectedChainId = args.expectedChainId ?? (await resolveChainId(args.publicClient, args.walletClient));
  await assertChain(args.publicClient, args.walletClient, expectedChainId);

  if (args.needsApprove && args.amount > 0n) {
    requireAddress(args.token, "token");
    requireAddress(args.spender, "spender");
    const balance = await readTokenUint(args.publicClient, args.token, "balanceOf", [args.account]);
    if (balance < args.amount) {
      throw new TxExecutionError(
        "validation",
        "validate",
        `Insufficient token balance of ${args.token}. Interline spends test mUSDC from the in-app drip, not Circle Sepolia USDC.`,
      );
    }
  }

  return expectedChainId;
}

async function revalidateAccountAndChain(
  args: { publicClient: PublicClient; walletClient: WalletClient; account: Address },
  expectedChainId: number | undefined,
): Promise<void> {
  const active = await activeWalletAddress(args.walletClient);
  if (active && !sameAddr(active, args.account)) {
    throw new TxExecutionError("validation", "validate", "Wallet account changed. The action was not submitted.");
  }
  const addresses = await walletAddresses(args.walletClient);
  if (addresses && addresses.length > 0 && !addresses.some((value) => sameAddr(value, args.account))) {
    throw new TxExecutionError("validation", "validate", "Wallet account changed. The action was not submitted.");
  }
  await assertChain(args.publicClient, args.walletClient, expectedChainId);
}

async function assertChain(
  publicClient: PublicClient,
  walletClient: WalletClient,
  expectedChainId: number | undefined,
): Promise<void> {
  if (expectedChainId == null) return;
  const current = await resolveChainId(publicClient, walletClient);
  if (current != null && current !== expectedChainId) {
    throw new TxExecutionError(
      "validation",
      "validate",
      `Wallet network changed (expected chain ${expectedChainId}, got ${current}). The action was not submitted.`,
    );
  }
}

async function resolveChainId(publicClient: PublicClient, walletClient: WalletClient): Promise<number | undefined> {
  const fromWalletFn = await callChainId(walletClient);
  if (fromWalletFn != null) return fromWalletFn;
  const fromWallet = asChainId(walletClient.chain?.id);
  if (fromWallet != null) return fromWallet;
  const fromPublicFn = await callChainId(publicClient);
  if (fromPublicFn != null) return fromPublicFn;
  return asChainId(publicClient.chain?.id);
}

async function callChainId(client: { getChainId?: () => Promise<number> }): Promise<number | undefined> {
  if (typeof client.getChainId !== "function") return undefined;
  try {
    return asChainId(await client.getChainId());
  } catch {
    return undefined;
  }
}

async function activeWalletAddress(walletClient: WalletClient): Promise<Address | undefined> {
  const fromAccount = addressOf(walletClient.account);
  if (fromAccount) return fromAccount;
  const addresses = await walletAddresses(walletClient);
  if (addresses?.length === 1) return addresses[0];
  return undefined;
}

async function walletAddresses(walletClient: WalletClient): Promise<Address[] | undefined> {
  if (typeof walletClient.getAddresses !== "function") return undefined;
  try {
    const addresses = await walletClient.getAddresses();
    return Array.isArray(addresses) ? (addresses as Address[]) : undefined;
  } catch {
    return undefined;
  }
}

async function readTokenUint(
  publicClient: PublicClient,
  token: Address,
  functionName: "balanceOf" | "allowance",
  args: readonly Address[],
): Promise<bigint> {
  const value = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName,
    args: args as never,
  });
  if (typeof value !== "bigint") {
    throw new TxExecutionError("rpc", "validate", `Token ${functionName} returned an unexpected value.`);
  }
  return value;
}

export function classifyTxError(error: unknown): TxErrorKind {
  if (error instanceof TxExecutionError) return error.kind;
  const name = error instanceof Error ? error.name : "";
  const message = errorMessage(error);
  const code = errorCode(error);

  if (code === 4001 || code === "ACTION_REJECTED" || code === "USER_REJECTED") return "rejected";
  if (/UserRejectedRequestError/i.test(name)) return "rejected";
  if (error instanceof TxAborted) return "rejected";
  if (/reverted|ContractFunctionRevertedError|ContractFunctionExecutionError/i.test(name) || /execution reverted|reverted/i.test(message)) {
    return "reverted";
  }
  if (/rejected|denied|user abort|aborted/i.test(message) || /UserRejected|AbortError/i.test(name)) return "rejected";
  if (
    /HttpRequestError|TimeoutError|RpcRequestError|WaitForTransactionReceiptTimeoutError|TransactionNotFoundError|InternalRpcError/i.test(
      name,
    ) ||
    /rpc|timeout|fetch failed|network|http request/i.test(message)
  ) {
    return "rpc";
  }
  return "rpc";
}

function toTxError(error: unknown, stage: TxErrorStage): TxExecutionError {
  if (error instanceof TxExecutionError) return error;
  const kind = classifyTxError(error);
  const decoded = errMsg(error);
  const message =
    kind === "rejected" ? "Rejected in wallet" : kind === "rpc" ? rpcMessage(error) : decoded;
  return new TxExecutionError(kind, stage, message, { cause: error });
}

function userFacing(error: TxExecutionError): string {
  if (error.kind === "rejected") return "Rejected in wallet";
  return error.message;
}

function rpcMessage(error: unknown): string {
  const message = errorMessage(error);
  return message.startsWith("RPC ") ? message : `RPC error: ${message}`;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const o = error as { shortMessage?: unknown; message?: unknown };
    if (typeof o.shortMessage === "string" && o.shortMessage.trim()) return o.shortMessage;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorCode(error: unknown): unknown {
  if (error && typeof error === "object" && "code" in error) return (error as { code: unknown }).code;
  return undefined;
}

function requireAddress(value: string, label: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value) || value.toLowerCase() === ZERO) {
    throw new TxExecutionError("validation", "validate", `Invalid ${label}.`);
  }
}

function addressOf(account: unknown): Address | undefined {
  if (typeof account === "string" && /^0x[a-fA-F0-9]{40}$/.test(account)) return account as Address;
  if (account && typeof account === "object" && "address" in account) {
    const value = (account as { address: unknown }).address;
    if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) return value as Address;
  }
  return undefined;
}

function sameAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function asChainId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
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
    case "directCreate":
      return "Create agreement";
    case "directAccept":
      return "Accept terms";
    case "directDecline":
      return "Decline";
    case "directCancel":
      return "Cancel request";
    case "directFund":
      return "Fund agreement";
    case "directWithdrawCash":
      return "Withdraw cash";
    case "directBorrow":
      return "Borrow into vault";
    case "directRepay":
      return "Repay";
    case "directRecall":
      return "Request repayment";
    case "directCap":
      return "Update limit";
    case "directPause":
      return "Pause borrowing";
    case "directEnd":
      return "End agreement";
    case "directVenue":
      return "Use venue";
    case "directAddCollateral":
      return "Add collateral";
    case "directRemoveCollateral":
      return "Remove collateral";
    case "faucet":
      return "Drip test tokens";
    case "oracleRefresh":
      return "Refresh simulated prices";
  }
}
