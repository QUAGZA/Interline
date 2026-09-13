import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import {
  classifyTxError,
  runMarketTx,
  TxAborted,
  TxExecutionError,
} from "./run-tx";

const ACCOUNT = "0x0000000000000000000000000000000000000001" as Address;
const OTHER = "0x00000000000000000000000000000000000000aa" as Address;
const TOKEN = "0x0000000000000000000000000000000000000002" as Address;
const SPENDER = "0x0000000000000000000000000000000000000003" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

type Step = string;

type HarnessOpts = {
  id?: string;
  amount?: bigint;
  needsApprove?: boolean;
  balance?: bigint;
  allowance?: bigint;
  account?: Address;
  token?: Address;
  spender?: Address;
  expectedChainId?: number;
  walletAccount?: Address | { address: Address } | undefined;
  getAddresses?: () => Promise<Address[]>;
  getWalletChainId?: () => Promise<number>;
  getPublicChainId?: () => Promise<number>;
  approveWrite?: () => Promise<Hex>;
  approvalReceipt?: { status: "success" | "reverted" };
  actionReceipt?: { status: "success" | "reverted" };
  simulate?: () => Promise<void>;
  writeAction?: () => Promise<Hex>;
  refreshQuote?: () => Promise<void>;
  waitThrows?: Error;
};

function harness(opts: HarnessOpts = {}) {
  const steps: Step[] = [];
  const phases: string[] = [];
  let allowance = opts.allowance ?? 0n;
  const amount = opts.amount ?? 100n;
  const wallet = {
    account: opts.walletAccount === undefined ? (opts.account ?? ACCOUNT) : opts.walletAccount,
    chain: { id: 31337 },
    getChainId: opts.getWalletChainId ?? (async () => 31337),
    getAddresses: opts.getAddresses ?? (async () => [opts.account ?? ACCOUNT]),
    writeContract: async () => {
      steps.push("approve");
      if (opts.approveWrite) return opts.approveWrite();
      return "0x01" as Hex;
    },
  };
  const publicClient = {
    chain: { id: 31337 },
    getChainId: opts.getPublicChainId ?? (async () => 31337),
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") {
        steps.push("balance");
        return opts.balance ?? 1_000n;
      }
      if (functionName === "allowance") {
        steps.push("allowance");
        return allowance;
      }
      throw new Error(`unexpected read ${functionName}`);
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      if (opts.waitThrows) throw opts.waitThrows;
      if (hash === "0x01") {
        steps.push("approvalReceipt");
        allowance = amount;
        return opts.approvalReceipt ?? { status: "success" as const };
      }
      steps.push("actionReceipt");
      return opts.actionReceipt ?? { status: "success" as const };
    },
  };
  return {
    steps,
    phases,
    publicClient,
    args: {
      id: opts.id ?? "tx",
      patch: (_id: string, patch: { phase?: string }) => {
        if (patch.phase) phases.push(patch.phase);
      },
      publicClient: publicClient as never,
      walletClient: wallet as never,
      account: opts.account ?? ACCOUNT,
      token: opts.token ?? TOKEN,
      spender: opts.spender ?? SPENDER,
      amount,
      needsApprove: opts.needsApprove ?? true,
      expectedChainId: opts.expectedChainId ?? 31337,
      refreshQuote: opts.refreshQuote
        ? async () => {
            steps.push("refreshQuote");
            await opts.refreshQuote!();
          }
        : undefined,
      simulate:
        opts.simulate ??
        (async () => {
          if (allowance < amount) throw new Error("ERC20InsufficientAllowance");
          steps.push("simulate");
        }),
      writeAction:
        opts.writeAction ??
        (async () => {
          steps.push("action");
          return "0x02" as Hex;
        }),
    },
  };
}

describe("runMarketTx approval order", () => {
  for (const kind of ["supply", "addCollateral", "directFund", "repay"] as const) {
    it(`fresh wallet zero-allowance ${kind} approves before simulate`, async () => {
      const { args, steps, phases } = harness({ id: kind });
      const hash = await runMarketTx(args);
      assert.equal(hash, "0x02");
      assert.deepEqual(steps, ["balance", "allowance", "approve", "approvalReceipt", "simulate", "action", "actionReceipt"]);
      assert.deepEqual(phases, ["awaiting_approval", "awaiting_approval", "simulating", "awaiting_action", "confirming", "success"]);
    });
  }

  it("skips approval when allowance is already sufficient", async () => {
    const { args, steps } = harness({ allowance: 100n });
    await runMarketTx(args);
    assert.deepEqual(steps, ["balance", "allowance", "simulate", "action", "actionReceipt"]);
  });

  it("does not request approval when needsApprove is false", async () => {
    const { args, steps } = harness({ needsApprove: false, allowance: 100n });
    await runMarketTx(args);
    assert.deepEqual(steps, ["simulate", "action", "actionReceipt"]);
  });

  it("refreshes quote after approval and before simulate", async () => {
    const { args, steps } = harness({ refreshQuote: async () => {} });
    await runMarketTx(args);
    assert.deepEqual(steps, [
      "balance",
      "allowance",
      "approve",
      "approvalReceipt",
      "refreshQuote",
      "simulate",
      "action",
      "actionReceipt",
    ]);
  });

  it("does not swallow a post-approval simulation revert", async () => {
    const { args, steps } = harness({
      simulate: async () => {
        throw Object.assign(new Error("execution reverted: cap exceeded"), { name: "ContractFunctionRevertedError" });
      },
    });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "reverted");
        assert.equal(error.stage, "simulate");
        return true;
      },
    );
    assert.deepEqual(steps, ["balance", "allowance", "approve", "approvalReceipt"]);
  });
});

describe("runMarketTx validation", () => {
  it("rejects insufficient balance before any wallet write", async () => {
    const { args, steps } = harness({ balance: 1n });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /Insufficient token balance/);
        return true;
      },
    );
    assert.deepEqual(steps, ["balance"]);
  });

  it("rejects a zero spender", async () => {
    const { args, steps } = harness({ spender: ZERO });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /spender/);
        return true;
      },
    );
    assert.deepEqual(steps, []);
  });

  it("rejects a zero account", async () => {
    const { args, steps } = harness({ account: ZERO, walletAccount: ZERO });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "validation");
        return true;
      },
    );
    assert.deepEqual(steps, []);
  });
});

describe("runMarketTx error kinds", () => {
  it("classifies approval wallet rejection", async () => {
    const { args, steps } = harness({
      approveWrite: async () => {
        throw Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
      },
    });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "rejected");
        assert.equal(error.stage, "approval");
        assert.equal(error.message, "Rejected in wallet");
        return true;
      },
    );
    assert.ok(!steps.includes("simulate"));
  });

  it("classifies approval receipt revert", async () => {
    const { args, steps } = harness({ approvalReceipt: { status: "reverted" } });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "reverted");
        assert.equal(error.stage, "approval");
        assert.match(error.message, /Approval transaction reverted/);
        return true;
      },
    );
    assert.ok(!steps.includes("simulate"));
  });

  it("classifies approval receipt RPC timeout", async () => {
    const { args } = harness({
      waitThrows: Object.assign(new Error("Timed out waiting for transaction receipt"), {
        name: "WaitForTransactionReceiptTimeoutError",
      }),
    });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "rpc");
        assert.equal(error.stage, "approval");
        return true;
      },
    );
  });

  it("classifies action revert separately from approval", async () => {
    const { args, steps } = harness({ actionReceipt: { status: "reverted" } });
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "reverted");
        assert.equal(error.stage, "action");
        assert.match(error.message, /Action transaction reverted/);
        return true;
      },
    );
    assert.ok(steps.includes("simulate"));
  });

  it("stops after approval if the wallet account changes", async () => {
    let switched = false;
    const { args, steps, publicClient } = harness({
      getAddresses: async () => [switched ? OTHER : ACCOUNT],
    });
    const originalWait = publicClient.waitForTransactionReceipt;
    publicClient.waitForTransactionReceipt = async (input: { hash: Hex }) => {
      const receipt = await originalWait(input);
      switched = true;
      return receipt;
    };
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /account changed/);
        return true;
      },
    );
    assert.deepEqual(steps, ["balance", "allowance", "approve", "approvalReceipt"]);
  });

  it("stops after approval if the wallet chain changes", async () => {
    let chain = 31337;
    const { args, steps, publicClient } = harness({
      getWalletChainId: async () => chain,
    });
    const originalWait = publicClient.waitForTransactionReceipt;
    publicClient.waitForTransactionReceipt = async (input: { hash: Hex }) => {
      const receipt = await originalWait(input);
      chain = 84532;
      return receipt;
    };
    await assert.rejects(
      () => runMarketTx(args),
      (error: unknown) => {
        assert.ok(error instanceof TxExecutionError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /network changed/);
        return true;
      },
    );
    assert.ok(!steps.includes("simulate"));
  });
});

describe("classifyTxError", () => {
  it("distinguishes rejection, revert, and RPC", () => {
    assert.equal(classifyTxError(Object.assign(new Error("User denied"), { name: "UserRejectedRequestError", code: 4001 })), "rejected");
    assert.equal(classifyTxError(new TxAborted("stop")), "rejected");
    assert.equal(
      classifyTxError(Object.assign(new Error("execution reverted"), { name: "ContractFunctionRevertedError" })),
      "reverted",
    );
    assert.equal(classifyTxError(Object.assign(new Error("fetch failed"), { name: "HttpRequestError" })), "rpc");
    assert.equal(classifyTxError(new TxExecutionError("validation", "validate", "bad")), "validation");
  });
});
