"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { isAddress, parseEventLogs, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { PageHeader } from "@/components/ui/chrome";
import { MoneyMovementPreview } from "./cards";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine } from "@/features/transactions/tx-store";
import { DIRECT_APR_RAY, directFactoryAbi } from "@/lib/direct-abi";
import { directChainConfig } from "@/lib/catalog";
import { useCatalogChainId } from "@/lib/use-catalog-chain";
import { parseUsdc } from "@/lib/format";
import { toast } from "sonner";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";
import { errMsg } from "@/lib/errors";

const STEPS = ["Intent", "Counterparty", "Terms", "Policy", "Review"];

export function CreationWizard({ initialIntent }: { initialIntent?: string }) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useCatalogChainId();
  const publicClient = usePublicClient({ chainId });
  const tx = useTxMachine();
  const cfg = directChainConfig(chainId);

  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<"lend" | "borrow">(initialIntent === "borrow" ? "borrow" : "lend");
  const [counterparty, setCounterparty] = useState("");
  const [limit, setLimit] = useState("5000");
  const [aprPct, setAprPct] = useState("5");
  const [ackLtv, setAckLtv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ facility: Hex; url: string } | null>(null);

  const lender = (intent === "lend" ? address : (counterparty as Address | undefined)) as Address | undefined;
  const borrower = (intent === "borrow" ? address : (counterparty as Address | undefined)) as Address | undefined;
  const validParty = isAddress(counterparty) && address && counterparty.toLowerCase() !== address.toLowerCase();

  const aprRay = useMemo(() => {
    const bps = BigInt(Math.round(Number(aprPct || "0") * 100));
    return (bps * 10n ** 25n) / 10000n;
  }, [aprPct]);
  const createKey = actionKey({
    chainId,
    account: address ?? "disconnected",
    facility: cfg?.directFactory ?? "direct",
    action: "directCreate",
  });
  const createBusy = Boolean(pendingForKey(tx.records, createKey));
  const createRecord = latestForKey(tx.records, createKey);

  async function submit() {
    setError(null);
    if (!address || !walletClient || !publicClient || !cfg?.directFactory || !lender || !borrower) {
      setError("Connect a wallet on the catalog chain. Direct factory is not in the local manifest yet.");
      return;
    }
    if (walletChainId !== chainId) {
      setError(`Switch the wallet to chain ${chainId} before writing.`);
      return;
    }
    if (!ackLtv) {
      setError("Acknowledge that borrowing is capped at 80% of posted mWETH collateral.");
      return;
    }
    const key = actionKey({
      chainId,
      account: address,
      facility: cfg.directFactory,
      action: "directCreate",
    });
    if (pendingForKey(tx.records, key)) {
      setError("This create action is already waiting for a signature or confirmation.");
      return;
    }
    const id = newAttemptId(key);
    const amount = parseUsdc(limit);
    tx.upsert({
      id,
      kind: "directCreate",
      chainId,
      marketId: "direct",
      amountRaw: amount.toString(),
      spender: cfg.directFactory,
      tokenSymbol: "mUSDC",
      phase: "editing",
      updatedAt: Date.now(),
    });
    const terms = {
      lender,
      borrower,
      loanToken: cfg.loanToken,
      creditLimit: amount,
      aprRay: aprPct === "5" ? DIRECT_APR_RAY : aprRay,
      acceptanceLifetime: 7 * 24 * 60 * 60,
      borrowPeriod: 365 * 24 * 60 * 60,
      recallWindow: chainId === 31337 ? 300 : 3600,
      venue: cfg.venue,
      swapRouter: cfg.swapRouter,
      otherToken: cfg.otherToken,
    };
    try {
      const hash = await runMarketTx({
        id,
        patch: tx.patch,
        publicClient,
        walletClient,
        account: address,
        token: cfg.loanToken,
        spender: cfg.directFactory,
        amount: 0n,
        needsApprove: false,
        simulate: async () => {
          await publicClient.simulateContract({
            account: address,
            address: cfg.directFactory!,
            abi: directFactoryAbi,
            functionName: "createFacility",
            args: [terms],
          });
        },
        writeAction: async () =>
          walletClient.writeContract({
            address: cfg.directFactory!,
            abi: directFactoryAbi,
            functionName: "createFacility",
            args: [terms],
            account: address,
            chain: walletClient.chain,
          }),
      });
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const parsed = parseEventLogs({
        abi: directFactoryAbi,
        logs: receipt.logs,
        eventName: "FacilityCreated",
      });
      const facility = parsed[0]?.args.facility as Hex | undefined;
      if (facility) {
        const url = `${window.location.origin}/direct/${chainId}/${facility}`;
        setCreated({ facility, url });
        toast.success("Agreement created. Copy the link, then switch to the other wallet and open Direct lending.");
      } else {
        toast.success("Agreement created. The named counterparty still must accept.");
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (created) {
    return (
      <section className="px-4 md:px-6 py-10 max-w-3xl mx-auto space-y-6">
        <PageHeader
          kicker="Direct / New"
          title="SHARE THIS AGREEMENT"
          description="You already accepted. The named counterparty must Connect in this app on the same chain and accept. They can open Direct lending once connected, or use the link below."
        />
        <div className="border border-border/50 bg-card p-6 space-y-4 font-mono text-xs">
          <p className="break-all">{created.url}</p>
          <div className="flex flex-wrap gap-3 uppercase tracking-widest text-[10px]">
            <button
              type="button"
              className="border border-accent bg-accent px-4 py-2 text-accent-foreground"
              onClick={() => {
                void navigator.clipboard.writeText(created.url);
                toast.success("Copied. Switch to the other wallet and open Direct lending.");
              }}
            >
              Copy counterparty URL
            </button>
            <Link href={`/direct/${chainId}/${created.facility}`} className="border border-border px-4 py-2">
              Open agreement
            </Link>
            <Link href="/direct" className="border border-border px-4 py-2">
              Direct inbox
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 md:px-6 py-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        kicker="Direct / New"
        title="CREATE AGREEMENT"
        description="Five steps. Nothing is published until you review and send the create transaction. Roles apply only to this agreement."
      />
      <ol className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "text-accent" : "text-muted-foreground"}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-3">
          <button
            type="button"
            className={`block w-full border p-4 text-left ${intent === "lend" ? "border-accent" : "border-border"}`}
            onClick={() => setIntent("lend")}
          >
            <p className="font-mono text-sm">Lend to someone</p>
            <p className="font-mono text-xs text-muted-foreground">
              Connected wallet becomes the lender for this agreement only. You can still borrow in others.
            </p>
          </button>
          <button
            type="button"
            className={`block w-full border p-4 text-left ${intent === "borrow" ? "border-accent" : "border-border"}`}
            onClick={() => setIntent("borrow")}
          >
            <p className="font-mono text-sm">Borrow from someone</p>
            <p className="font-mono text-xs text-muted-foreground">
              Connected wallet becomes the borrower for this agreement only.
            </p>
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <label className="block space-y-2 font-mono text-xs">
          {intent === "lend" ? "Borrower's wallet address" : "Lender's wallet address"}
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value.trim())}
            className="w-full border border-border bg-background px-3 py-3 text-sm"
            placeholder="0x…"
          />
          {counterparty && !validParty ? (
            <p className="text-destructive">Enter a full checksum address that is not your own.</p>
          ) : null}
        </label>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 font-mono text-xs">
          <label>
            Credit limit (mUSDC)
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-3 text-sm"
            />
          </label>
          <label>
            Fixed borrow APR %
            <input
              value={aprPct}
              onChange={(e) => setAprPct(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-3 text-sm"
            />
          </label>
          <p className="text-muted-foreground">
            Defaults: 5,000 mUSDC, 5% APR, 7-day acceptance, 365-day borrowing period,{" "}
            {chainId === 31337 ? "5-minute" : "1-hour"} recall window. No origination fee. APR is fixed for this
            agreement — it does not follow pool utilization.
          </p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 font-mono text-xs">
          <p>
            Borrowed tokens go to this agreement&apos;s restricted vault. The borrower can use the approved venue. They
            are not sent to the borrower&apos;s personal wallet.
          </p>
          <label className="flex gap-2 items-start">
            <input type="checkbox" checked={ackLtv} onChange={(e) => setAckLtv(e.target.checked)} />
            <span>
              Borrowed amount cannot exceed 80% of posted mWETH collateral. Direct agreements are not liquidated; the
              lender still bears venue recovery risk.
            </span>
          </label>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 font-mono text-xs">
          <p>Lender {lender ? String(lender) : "—"}</p>
          <p>Borrower {borrower ? String(borrower) : "—"}</p>
          <p>
            Limit {limit} mUSDC · APR {aprPct}%
          </p>
          <MoneyMovementPreview
            fromLabel="Lender wallet"
            toLabel="Agreement contract, then restricted vault on borrow"
            note="The creator's transaction deploys the agreement and records their own acceptance. The named counterparty still must accept. Query parameters cannot set the spender or recipient."
          />
          {!isConnected ? (
            <Link href="/connect?return=/direct/new" className="inline-block border border-accent px-4 py-2">
              Connect to create
            </Link>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={createBusy}
              className="border border-accent bg-accent px-4 py-2 text-accent-foreground uppercase tracking-widest disabled:opacity-40"
            >
              {createBusy ? createRecord?.phase.replaceAll("_", " ") : "Create and accept these terms"}
            </button>
          )}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <div className="flex gap-3 font-mono text-[10px] uppercase">
        {step > 0 ? (
          <button type="button" className="border border-border px-3 py-2" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < 4 ? (
          <button
            type="button"
            className="border border-accent px-3 py-2"
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !validParty) || (step === 3 && !ackLtv)}
          >
            Continue
          </button>
        ) : null}
      </div>
    </section>
  );
}
