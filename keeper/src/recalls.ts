import { encodeFunctionData, type Address } from "viem";
import { adapterAbi, erc4626Abi, vaultAbi, vaultFactoryAbi } from "./abi.js";
import { sendCall, type TxClients } from "./transactions.js";

export type RecallTarget = {
  market: Address;
  owner: Address;
  vaultFactory: Address;
};

export async function publicRecallExitIfOpen(
  clients: TxClients,
  dryRun: boolean,
  target: RecallTarget,
): Promise<boolean> {
  const vault = await clients.publicClient.readContract({
    address: target.vaultFactory,
    abi: vaultFactoryAbi,
    functionName: "vaultOf",
    args: [target.market, target.owner],
  });
  if (vault === "0x0000000000000000000000000000000000000000") return false;

  const adapter = await clients.publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "adapter",
  });
  const venue = await clients.publicClient.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "venue",
  });
  const shares = await clients.publicClient.readContract({
    address: venue,
    abi: erc4626Abi,
    functionName: "balanceOf",
    args: [vault],
  });
  if (shares === 0n) return false;

  let assets: bigint;
  try {
    assets = await clients.publicClient.readContract({
      address: venue,
      abi: erc4626Abi,
      functionName: "previewRedeem",
      args: [shares],
    });
  } catch {
    assets = await clients.publicClient.readContract({
      address: venue,
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [shares],
    });
  }
  if (assets === 0n) return false;

  const data = encodeFunctionData({
    abi: vaultAbi,
    functionName: "publicExitAndRepay",
    args: [assets, shares],
  });
  await sendCall(
    clients,
    dryRun,
    `publicExitAndRepay vault=${vault} assets=${assets} shares=${shares}`,
    vault,
    data,
  );
  return true;
}
