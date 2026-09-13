"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FocusDialog } from "@/components/focus-dialog";
import { MoneyMovementPreview } from "./cards";
import type { DirectFacilityDto } from "./dto";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine } from "@/features/transactions/tx-store";
import { TxStatusList } from "@/features/transactions/tx-status";
import { directFacilityAbi } from "@/lib/direct-abi";
import { qk } from "@/lib/api/keys";
import { formatUsdc, parseUsdc } from "@/lib/format";
import {
  buildCapRequest,
  localCapDigest,
  randomCapSalt,
  reviewCapRequest,
  serializeCapRequest,
  type CapRequest,
  type PendingCapOnchain,
} from "@/lib/cap-request";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";

export function LimitDialog({ facility, onClose }: { facility: DirectFacilityDto; onClose: () => void }) {
  const [newCap, setNewCap] = useState("8000");
  const [preimage, setPreimage] = useState("");
  const [pending, setPending] = useState<PendingCapOnchain | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const key = actionKey({
    chainId: facility.chainId,
    account: address ?? "disconnected",
    facility: facility.facility,
    action: "directCap",
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  const context = useMemo(
    () => ({
      chainId: facility.chainId,
      facility: facility.facility,
      lender: facility.lender,
      borrower: facility.borrower,
    }),
    [facility.borrower, facility.chainId, facility.facility, facility.lender],
  );
  const reviewed = useMemo(() => reviewCapRequest(preimage, context, pending), [context, pending, preimage]);

  async function refreshPending() {
    if (!publicClient) return;
    const [digest, nonce, validUntil] = await Promise.all([
      publicClient.readContract({ address: facility.facility, abi: directFacilityAbi, functionName: "pendingCapDigest" }),
      publicClient.readContract({ address: facility.facility, abi: directFacilityAbi, functionName: "pendingCapNonce" }),
      publicClient.readContract({ address: facility.facility, abi: directFacilityAbi, functionName: "pendingCapValidUntil" }),
    ]);
    setPending({ digest, nonce, validUntil });
  }

  useEffect(() => {
    void refreshPending();
  }, [facility.facility, publicClient]);

  async function prepare() {
    if (!publicClient) return;
    const nonce = await publicClient.readContract({
      address: facility.facility,
      abi: directFacilityAbi,
      functionName: "capNonce",
    });
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
    const salt = randomCapSalt();
    const cap = parseUsdc(newCap);
    if (cap <= 0n) {
      toast.error("Enter a new limit greater than zero.");
      return;
    }
    const request = buildCapRequest({
      chainId: facility.chainId,
      facility: facility.facility,
      lender: facility.lender,
      borrower: facility.borrower,
      newCap: cap,
      nonce,
      validUntil,
      salt,
    });
    const onchain = (await publicClient.readContract({
      address: facility.facility,
      abi: directFacilityAbi,
      functionName: "hashCapProposal",
      args: [cap, nonce, validUntil, salt],
    })) as Hex;
    if (onchain.toLowerCase() !== request.digest.toLowerCase()) {
      toast.error("Local digest does not match the facility hash. Do not share this request.");
      return;
    }
    setPreimage(serializeCapRequest(request));
    toast.message("Limit request prepared. Download the file and send it to the named counterparty.");
  }

  function downloadRequest() {
    if (!reviewed.request || reviewed.reviewBlockers.length > 0) {
      toast.error(reviewed.reviewBlockers[0] ?? "Prepare or import a valid request before downloading.");
      return;
    }
    const blob = new Blob([serializeCapRequest(reviewed.request)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interline-direct-cap-request-v1-${facility.facility.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPreimage(reader.result);
    };
    reader.readAsText(file);
  }

  async function run(kind: "propose" | "approve" | "execute" | "cancel") {
    if (!address || !publicClient || !walletClient) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== facility.chainId) {
      toast.error(`Switch the wallet to chain ${facility.chainId}.`);
      return;
    }
    if (busy) {
      toast.message("This limit action is already waiting for a signature or confirmation.");
      return;
    }
    const { request, reviewBlockers, approveBlockers } = reviewCapRequest(preimage, context, pending);
    const blockers = kind === "approve" || kind === "execute" ? approveBlockers : reviewBlockers;
    if (!request || blockers.length > 0) {
      toast.error(blockers[0] ?? "Import a matching version 1 limit request first.");
      return;
    }
    const recomputed = localCapDigest({
      chainId: request.chainId,
      facility: getAddress(request.facility) as Address,
      lender: getAddress(request.lender) as Address,
      borrower: getAddress(request.borrower) as Address,
      newCap: BigInt(request.newCap),
      nonce: BigInt(request.nonce),
      validUntil: BigInt(request.validUntil),
      salt: request.salt as Hex,
    });
    if (recomputed.toLowerCase() !== request.digest.toLowerCase()) {
      toast.error("Digest does not match the displayed terms. Approval is disabled.");
      return;
    }
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind: "directCap",
      chainId: facility.chainId,
      marketId: facility.facility,
      amountRaw: request.newCap,
      spender: facility.facility,
      tokenSymbol: "mUSDC",
      phase: "editing",
      updatedAt: Date.now(),
    });
    await runMarketTx({
      id,
      patch: tx.patch,
      publicClient,
      walletClient,
      account: address,
      token: facility.asset.address,
      spender: facility.facility,
      amount: 0n,
      needsApprove: false,
      simulate: async () => {
        if (kind === "propose") {
          await publicClient.simulateContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "proposeCap",
            args: [request.digest as Hex, BigInt(request.nonce), BigInt(request.validUntil)],
          });
          return;
        }
        if (kind === "approve") {
          await publicClient.simulateContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "approveCap",
            args: [request.digest as Hex],
          });
          return;
        }
        if (kind === "cancel") {
          await publicClient.simulateContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "cancelCap",
            args: [request.digest as Hex],
          });
          return;
        }
        await publicClient.simulateContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: "executeCap",
          args: [BigInt(request.newCap), BigInt(request.nonce), BigInt(request.validUntil), request.salt as Hex],
        });
      },
      writeAction: () => {
        if (kind === "propose") {
          return walletClient.writeContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "proposeCap",
            args: [request.digest as Hex, BigInt(request.nonce), BigInt(request.validUntil)],
            chain: walletClient.chain,
          });
        }
        if (kind === "approve") {
          return walletClient.writeContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "approveCap",
            args: [request.digest as Hex],
            chain: walletClient.chain,
          });
        }
        if (kind === "cancel") {
          return walletClient.writeContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: "cancelCap",
            args: [request.digest as Hex],
            chain: walletClient.chain,
          });
        }
        return walletClient.writeContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: "executeCap",
          args: [BigInt(request.newCap), BigInt(request.nonce), BigInt(request.validUntil), request.salt as Hex],
          chain: walletClient.chain,
        });
      },
    });
    await qc.invalidateQueries({ queryKey: qk.directFacility(facility.chainId, facility.facility) });
    await refreshPending();
  }

  const approveDisabled = busy || reviewed.approveBlockers.length > 0;
  const proposeDisabled = busy || reviewed.reviewBlockers.length > 0;

  return (
    <FocusDialog title="Limit request" onClose={onClose}>
      <p className="font-mono text-sm">Limit request</p>
      <p className="font-mono text-xs text-muted-foreground">
        Either named party proposes a new credit limit. Both must approve. APR and parties stay the same. The downloaded
        file is a versioned commitment request — a digest of the terms, not a secret payload.
      </p>
      <MoneyMovementPreview
        fromLabel="No cash moves on propose or approve"
        toLabel="Credit limit updates only after both parties approve and apply"
        note="If you lose the request file, cancel the pending limit and prepare a new one. The counterparty's downloaded copy is the recovery file."
      />
      <label className="block font-mono text-xs">
        New limit (mUSDC)
        <input
          value={newCap}
          onChange={(e) => setNewCap(e.target.value)}
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase">
        <button type="button" className="border border-accent px-3 py-2" onClick={() => void prepare()}>
          Prepare
        </button>
        <button type="button" className="border border-border px-3 py-2" onClick={downloadRequest}>
          Download request
        </button>
        <button
          type="button"
          className="border border-border px-3 py-2"
          onClick={() => {
            void navigator.clipboard.writeText(preimage);
            toast.message("Copied the version 1 limit request.");
          }}
        >
          Copy
        </button>
        <button type="button" className="border border-border px-3 py-2" onClick={() => fileRef.current?.click()}>
          Import file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="border border-border px-3 py-2 disabled:opacity-40"
          disabled={proposeDisabled}
          onClick={() => void run("propose")}
        >
          Propose
        </button>
        <button
          type="button"
          className="border border-accent px-3 py-2 disabled:opacity-40"
          disabled={approveDisabled}
          title={reviewed.approveBlockers[0]}
          onClick={() => void run("approve")}
        >
          Approve
        </button>
        <button
          type="button"
          className="border border-border px-3 py-2 disabled:opacity-40"
          disabled={approveDisabled}
          title={reviewed.approveBlockers[0]}
          onClick={() => void run("execute")}
        >
          Apply
        </button>
        <button
          type="button"
          className="border border-border px-3 py-2 disabled:opacity-40"
          disabled={proposeDisabled}
          onClick={() => void run("cancel")}
        >
          Cancel pending
        </button>
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
      <CapReview request={reviewed.request} approveBlockers={reviewed.approveBlockers} reviewBlockers={reviewed.reviewBlockers} />
      <textarea
        value={preimage}
        onChange={(e) => setPreimage(e.target.value)}
        className="w-full h-28 border border-border bg-background px-2 py-2 font-mono text-[10px]"
        placeholder="Imported version 1 limit request appears here"
      />
      {record ? <TxStatusList records={[record]} /> : null}
    </FocusDialog>
  );
}

function CapReview({
  request,
  reviewBlockers,
  approveBlockers,
}: {
  request: CapRequest | null;
  reviewBlockers: string[];
  approveBlockers: string[];
}) {
  if (!request) {
    return (
      <div className="border border-border/40 bg-background/40 px-3 py-3 space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Review before approval</p>
        <p className="font-mono text-xs text-destructive">{reviewBlockers[0] ?? "Prepare or import a request to review decoded terms."}</p>
      </div>
    );
  }
  const blockers = approveBlockers.length > 0 ? approveBlockers : reviewBlockers;
  return (
    <div className="border border-border/40 bg-background/40 px-3 py-3 space-y-1 font-mono text-xs">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Review before approval</p>
      <p>New limit: {formatUsdc(BigInt(request.newCap))} mUSDC ({request.newCap} raw)</p>
      <p>Lender: {request.lender}</p>
      <p>Borrower: {request.borrower}</p>
      <p>
        Chain {request.chainId} · facility {request.facility}
      </p>
      <p>
        Nonce {request.nonce} · expires {new Date(Number(request.validUntil) * 1000).toISOString()}
      </p>
      <p className="break-all">Salt {request.salt}</p>
      <p className="break-all">Digest {request.digest}</p>
      {blockers.length > 0 ? (
        <ul className="text-destructive space-y-1">
          {blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p>Decoded terms match the local digest and the pending on-chain commitment.</p>
      )}
    </div>
  );
}
