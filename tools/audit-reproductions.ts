// Forecast section asserts the fixed 365-day horizon. Transaction-order asserts the fixed approve-then-simulate sequence.
import assert from "node:assert/strict";
import { RAY } from "@interline/math";
import { HORIZON_SECONDS, liquidationScenario } from "../frontend/lib/forecast.ts";
import { runMarketTx } from "../frontend/features/transactions/run-tx.ts";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const TOKEN = "0x0000000000000000000000000000000000000002";
const SPENDER = "0x0000000000000000000000000000000000000003";

async function runZeroAllowancePath(id: string) {
  const steps: string[] = [];
  let allowance = 0n;
  const hash = await runMarketTx({
    id,
    patch: () => {},
    account: ACCOUNT,
    token: TOKEN,
    spender: SPENDER,
    amount: 100n,
    needsApprove: true,
    expectedChainId: 31337,
    publicClient: {
      chain: { id: 31337 },
      getChainId: async () => 31337,
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "balanceOf") {
          steps.push("balance");
          return 1_000n;
        }
        if (functionName === "allowance") {
          steps.push("allowance");
          return allowance;
        }
        throw new Error(`unexpected read ${functionName}`);
      },
      waitForTransactionReceipt: async ({ hash }: { hash: string }) => {
        steps.push(hash === "0x01" ? "approvalReceipt" : "actionReceipt");
        if (hash === "0x01") allowance = 100n;
        return { status: "success" };
      },
    } as never,
    walletClient: {
      chain: { id: 31337 },
      account: ACCOUNT,
      getChainId: async () => 31337,
      getAddresses: async () => [ACCOUNT],
      writeContract: async () => {
        steps.push("approve");
        return "0x01";
      },
    } as never,
    simulate: async () => {
      if (allowance < 100n) throw new Error("ERC20InsufficientAllowance");
      steps.push("simulate");
    },
    writeAction: async () => {
      steps.push("action");
      return "0x02";
    },
  });
  return { hash, steps };
}

async function main() {
  const apr5 = 5n * 10n ** 25n;
  const shares = 100_000_000n * RAY;
  const forecast = liquidationScenario({
    healthCode: "OK",
    liquidatable: false,
    oracleStatus: "ok",
    debtShares: shares.toString(),
    epochIndexRay: RAY.toString(),
    epochAprRay: apr5.toString(),
    epochTimestamp: "1",
    recordedTimestamp: "1",
    liquidationCapacityRaw: "120000000",
  });
  assert.equal(HORIZON_SECONDS, 365n * 86400n);
  assert.notEqual(HORIZON_SECONDS, 365n * 31_536_000n);
  assert.equal(forecast.kind, "not-in-horizon");
  assert.equal(forecast.firstLiquidatableSecond, null);
  console.log("AUDIT confirmed: 100/120 at 5% APR does not cross within the 365-day horizon");

  const expected = ["balance", "allowance", "approve", "approvalReceipt", "simulate", "action", "actionReceipt"];
  for (const kind of ["supply", "addCollateral", "directFund", "repay"] as const) {
    const { hash, steps } = await runZeroAllowancePath(kind);
    assert.equal(hash, "0x02");
    assert.deepEqual(steps, expected, `${kind} must approve and wait before simulating`);
  }
  console.log("FIXED: zero-allowance supply/collateral/direct-fund/repay request approval before action simulation");
}
void main();
