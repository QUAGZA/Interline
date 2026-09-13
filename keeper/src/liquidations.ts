import { encodeFunctionData, type Address } from "viem";
import { marketAbi } from "./abi.js";
import { ensureAllowance, sendCall, type TxClients } from "./transactions.js";

export type LiquidationTarget = {
  market: Address;
  owner: Address;
  loanToken: Address;
};

type LiquidationQuote = {
  shares: bigint;
  loanIn: bigint;
  collatOut: bigint;
  writesOff: boolean;
};

async function previewFullDebt(
  clients: TxClients,
  target: LiquidationTarget,
  shares: bigint,
): Promise<LiquidationQuote | null> {
  const quote = await clients.publicClient.readContract({
    address: target.market,
    abi: marketAbi,
    functionName: "previewLiquidation",
    args: [target.owner, shares, 0n],
  });
  const loanIn = quote[1];
  const collatOut = quote[2];
  const writesOff = quote[3];
  if (loanIn === 0n) return null;
  return { shares, loanIn, collatOut, writesOff };
}

function skipUneconomic(target: LiquidationTarget, quote: LiquidationQuote, reason: string): boolean {
  if (quote.writesOff) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: uneconomic full-debt write-off (${reason})`,
    );
    return true;
  }
  if (quote.collatOut === 0n) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: no collateral incentive (${reason})`,
    );
    return true;
  }
  return false;
}

export async function liquidateIfUnhealthy(
  clients: TxClients,
  dryRun: boolean,
  target: LiquidationTarget,
): Promise<boolean> {
  const health = await clients.publicClient.readContract({
    address: target.market,
    abi: marketAbi,
    functionName: "healthOf",
    args: [target.owner],
  });
  const liquidatable = health[5];
  const debt = health[2];
  if (!liquidatable || debt === 0n) return false;

  const shares = await clients.publicClient.readContract({
    address: target.market,
    abi: marketAbi,
    functionName: "debtSharesOf",
    args: [target.owner],
  });
  if (shares === 0n) return false;

  let quote = await previewFullDebt(clients, target, shares);
  if (!quote) return false;
  if (skipUneconomic(target, quote, "pre-approval")) return false;

  const balance = await clients.publicClient.readContract({
    address: target.loanToken,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [clients.account.address],
  });
  if (balance < quote.loanIn) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: keeper loan-token balance ${balance} < ${quote.loanIn}`,
    );
    return false;
  }

  await ensureAllowance(clients, dryRun, target.loanToken, target.market, quote.loanIn);

  quote = await previewFullDebt(clients, target, shares);
  if (!quote) return false;
  if (skipUneconomic(target, quote, "re-quote after approval")) return false;
  if (balance < quote.loanIn) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: keeper loan-token balance ${balance} < ${quote.loanIn} after re-quote`,
    );
    return false;
  }

  const data = encodeFunctionData({
    abi: marketAbi,
    functionName: "liquidate",
    args: [target.owner, shares, 0n, quote.loanIn, quote.collatOut],
  });

  try {
    const gas = await clients.publicClient.estimateGas({
      account: clients.account,
      to: target.market,
      data,
    });
    const gasPrice = await clients.publicClient.getGasPrice();
    const gasCost = gas * gasPrice;
    if (gas === 0n || gasCost === 0n) {
      console.warn(`skip liquidate ${target.owner} on ${target.market}: gas/incentive estimate is zero`);
      return false;
    }
  } catch (err) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: gas/incentive check failed:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  await sendCall(
    clients,
    dryRun,
    `liquidate ${target.owner} debtShares=${shares} in=${quote.loanIn} out=${quote.collatOut}`,
    target.market,
    data,
  );
  return true;
}
