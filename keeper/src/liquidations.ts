import { encodeFunctionData, type Address } from "viem";
import { marketAbi } from "./abi.js";
import { ensureAllowance, sendCall, type TxClients } from "./transactions.js";

export type LiquidationTarget = {
  market: Address;
  owner: Address;
  loanToken: Address;
};

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

  const quote = await clients.publicClient.readContract({
    address: target.market,
    abi: marketAbi,
    functionName: "previewLiquidation",
    args: [target.owner, shares, 0n],
  });
  const loanIn = quote[1];
  const collatOut = quote[2];
  if (loanIn === 0n) return false;

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
  if (balance < loanIn) {
    console.warn(
      `skip liquidate ${target.owner} on ${target.market}: keeper loan-token balance ${balance} < ${loanIn}`,
    );
    return false;
  }

  await ensureAllowance(clients, dryRun, target.loanToken, target.market, loanIn);
  const data = encodeFunctionData({
    abi: marketAbi,
    functionName: "liquidate",
    args: [target.owner, shares, 0n, loanIn, collatOut],
  });
  await sendCall(
    clients,
    dryRun,
    `liquidate ${target.owner} debtShares=${shares} in=${loanIn} out=${collatOut}`,
    target.market,
    data,
  );
  return true;
}
