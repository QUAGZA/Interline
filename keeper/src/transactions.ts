import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  maxUint256,
} from "viem";
import { erc20Abi, marketAbi } from "./abi.js";

export type TxClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  chain: Chain;
};

export async function sendCall(
  clients: TxClients,
  dryRun: boolean,
  label: string,
  to: Address,
  data: Hex,
): Promise<Hex | undefined> {
  if (dryRun) {
    console.log(`[dry-run] ${label} -> ${to}`);
    return undefined;
  }
  const hash = await clients.walletClient.sendTransaction({
    account: clients.account,
    chain: clients.chain,
    to,
    data,
  });
  console.log(`${label} tx ${hash}`);
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted (${hash})`);
  }
  return hash;
}

export async function ensureAllowance(
  clients: TxClients,
  dryRun: boolean,
  token: Address,
  spender: Address,
  needed: bigint,
): Promise<void> {
  const allowance = await clients.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [clients.account.address, spender],
  });
  if (allowance >= needed) return;
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, maxUint256],
  });
  await sendCall(clients, dryRun, `approve ${token}`, token, data);
}
