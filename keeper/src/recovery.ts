import { encodeFunctionData, type Address } from "viem";
import { adapterAbi, directFacilityAbi, erc4626Abi, vaultAbi } from "./abi.js";
import { sendCall, type TxClients } from "./transactions.js";

export type DirectRecoveryTarget = {
  facility: Address;
};

function publicRecoveryOpen(now: bigint, repaymentDueAt: bigint, recallDeadline: bigint): boolean {
  if (recallDeadline > 0n && now > recallDeadline) return true;
  if (repaymentDueAt > 0n && now > repaymentDueAt) return true;
  return false;
}

/** Best-effort post-deadline venue exit, idle repay, then settleDefault. Not complete automatic protection. */
export async function recoverDirectIfOpen(
  clients: TxClients,
  dryRun: boolean,
  target: DirectRecoveryTarget,
): Promise<boolean> {
  const ended = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "ended",
  });
  if (ended) return false;

  const lenderAccepted = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "lenderAccepted",
  });
  const borrowerAccepted = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "borrowerAccepted",
  });
  if (!lenderAccepted || !borrowerAccepted) return false;

  const repaymentDueAt = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "repaymentDueAt",
  });
  const recallDeadline = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "recallDeadline",
  });
  const now = BigInt((await clients.publicClient.getBlock()).timestamp);
  if (!publicRecoveryOpen(now, repaymentDueAt, recallDeadline)) return false;

  const vault = await clients.publicClient.readContract({
    address: target.facility,
    abi: directFacilityAbi,
    functionName: "vault",
  });
  if (vault === "0x0000000000000000000000000000000000000000") return false;

  let attempted = false;

  const shares = await clients.publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "venueShares",
  });
  if (shares > 0n) {
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
    if (assets > 0n) {
      const data = encodeFunctionData({
        abi: directFacilityAbi,
        functionName: "recoverVenue",
        args: [assets, shares],
      });
      await sendCall(
        clients,
        dryRun,
        `recoverVenue facility=${target.facility} assets=${assets} shares=${shares}`,
        target.facility,
        data,
      );
      attempted = true;
    }
  }

  const idle = await clients.publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "idleLoan",
  });
  if (idle > 0n) {
    const data = encodeFunctionData({
      abi: directFacilityAbi,
      functionName: "repayFromVault",
      args: [idle],
    });
    await sendCall(
      clients,
      dryRun,
      `repayFromVault facility=${target.facility} idle=${idle}`,
      target.facility,
      data,
    );
    attempted = true;
  }

  if (await settleDefaultIfOpen(clients, dryRun, target.facility)) attempted = true;

  return attempted;
}

async function settleDefaultIfOpen(clients: TxClients, dryRun: boolean, facility: Address): Promise<boolean> {
  const debt = await clients.publicClient.readContract({
    address: facility,
    abi: directFacilityAbi,
    functionName: "currentDebt",
  });
  const posted = await clients.publicClient.readContract({
    address: facility,
    abi: directFacilityAbi,
    functionName: "collateralPosted",
  });
  if (debt === 0n || posted === 0n) return false;

  try {
    const preview = await clients.publicClient.readContract({
      address: facility,
      abi: directFacilityAbi,
      functionName: "previewSettlement",
    });
    if (preview[0] === 0n || preview[2] === 0n) {
      console.warn(`skip settleDefault ${facility}: preview has no seize/credit (oracle or quote)`);
      return false;
    }
  } catch (err) {
    console.warn(
      `skip settleDefault ${facility}: preview failed:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  try {
    const data = encodeFunctionData({
      abi: directFacilityAbi,
      functionName: "settleDefault",
    });
    await sendCall(clients, dryRun, `settleDefault facility=${facility} debt=${debt} posted=${posted}`, facility, data);
    return true;
  } catch (err) {
    console.warn(`settleDefault ${facility} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}
