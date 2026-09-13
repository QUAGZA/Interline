"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, maxUint256, type PublicClient } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { MoneyMovementPreview } from "./cards";
import type { DirectFacilityDto } from "./dto";
import { LimitDialog } from "./limit-dialog";
import { borrowExpired, publicRecoveryOpen, recallRequested, rolesFor } from "./roles";
import { runMarketTx } from "@/features/transactions/run-tx";
import { useTxMachine, type TxKind } from "@/features/transactions/tx-store";
import { borrowerVaultAbi, directFacilityAbi } from "@/lib/direct-abi";
import { qk } from "@/lib/api/keys";
import { errMsg } from "@/lib/errors";
import { formatTokenUnits, formatUnits, formatUsdc, parseTokenInput, parseUsdc } from "@/lib/format";
import { directChainConfig } from "@/lib/catalog";
import { availableFromLtv, borrowCapacityUsdcRaw, requiredCollateralWei } from "@/lib/direct-ltv";
import { TxStatusList } from "@/features/transactions/tx-status";
import { deadlineIn, maxBoundFromQuote, minBoundFromQuote, quoteDirectBorrow, quoteVenueEnter } from "@/lib/execution-bounds";
import { actionKey, latestForKey, newAttemptId, pendingForKey } from "@/lib/tx-attempt";
import { TestnetFaucetButton } from "@/features/testnet-faucet";
import { pairOracleAbi, SimulatedOracleRefresh } from "@/features/simulated-oracle";
import { FocusDialog } from "@/components/focus-dialog";

export type DialogKind =
  | "fund"
  | "borrow"
  | "repay"
  | "withdraw"
  | "recall"
  | "limit"
  | "venue"
  | "collateral"
  | "removeCollateral"
  | "surplus"
  | "recover"
  | "settle"
  | null;

export function DirectActions({
  facility,
  open,
  onOpen,
  collateralPosted,
}: {
  facility: DirectFacilityDto;
  open: DialogKind;
  onOpen: (k: DialogKind) => void;
  collateralPosted?: bigint;
}) {
  const { address } = useAccount();
  const roles = rolesFor(facility, address);
  const snap = useVaultSnapshot(facility);
  const accepted = facility.lenderAccepted && facility.borrowerAccepted && !facility.ended;
  const thisAccepted = roles.isLender ? facility.lenderAccepted : roles.isBorrower ? facility.borrowerAccepted : false;
  const counterpartyAccepted = roles.isLender ? facility.borrowerAccepted : roles.isBorrower ? facility.lenderAccepted : false;
  const waitingOn = roles.isLender ? facility.borrower : roles.isBorrower ? facility.lender : undefined;
  const canAccept =
    roles.isCounterparty &&
    !thisAccepted &&
    !facility.declined &&
    !facility.cancelled &&
    !facility.ended;
  const canDeclineOrCancel =
    roles.isCounterparty && !accepted && !facility.declined && !facility.cancelled && !facility.ended;
  const debt = safeBig(facility.debtRaw);
  const recalled = snap.recallStarted;
  const paused = facility.borrowingPaused;
  const expired = borrowExpired(facility);
  const recovery = snap.recoveryOpen ?? publicRecoveryOpen(facility);
  const canResume = paused && !recalled && !expired;
  const canClearRecall = recalled && debt === 0n;
  const canSurplus = debt === 0n && (snap.idleLoan > 0n || snap.otherIdle > 0n);
  const canSettle =
    Boolean(address) &&
    accepted &&
    recovery &&
    debt > 0n &&
    (collateralPosted ?? 0n) > 0n;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        Vault idle {formatTokenUnits(snap.idleLoan, 6)} mUSDC · venue shares {formatTokenUnits(snap.venueShares, 6)} ·
        other {formatTokenUnits(snap.otherIdle, 18)} mWETH
      </p>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        {canAccept ? (
          <>
            <NoAmountAction facility={facility} kind="directAccept" label="Accept terms" fn="acceptTerms" extra={[facility.termsHash]} />
            <NoAmountAction facility={facility} kind="directDecline" label="Decline" fn="decline" extra={[]} />
          </>
        ) : null}
        {roles.isCounterparty && thisAccepted && !counterpartyAccepted && !facility.declined && !facility.cancelled ? (
          <p className="w-full font-mono text-[11px] text-muted-foreground">
            Waiting on {waitingOn?.slice(0, 6)}…{waitingOn?.slice(-4)} to accept.
          </p>
        ) : null}
        {canDeclineOrCancel ? (
          <NoAmountAction facility={facility} kind="directCancel" label="Cancel request" fn="cancelPending" extra={[]} />
        ) : null}
        {roles.isLender && accepted ? (
          <>
            <button type="button" className="border border-accent px-3 py-2" onClick={() => onOpen("fund")}>
              Fund agreement
            </button>
            <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("withdraw")}>
              Withdraw cash
            </button>
            {!recalled ? (
              <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("recall")}>
                Request repayment
              </button>
            ) : null}
            {!paused ? (
              <NoAmountAction facility={facility} kind="directPause" label="Pause new borrowing" fn="pauseNewBorrowing" extra={[]} />
            ) : null}
            {canResume ? (
              <NoAmountAction facility={facility} kind="directPause" label="Resume new borrowing" fn="resumeNewBorrowing" extra={[]} />
            ) : null}
            {canClearRecall ? (
              <NoAmountAction facility={facility} kind="directRecall" label="Clear recall" fn="clearRecall" extra={[]} />
            ) : null}
            {canSettle ? (
              <button type="button" className="border border-accent px-3 py-2" onClick={() => onOpen("settle")}>
                Settle posted collateral
              </button>
            ) : null}
            <NoAmountAction facility={facility} kind="directEnd" label="End agreement" fn="endAgreement" extra={[]} />
          </>
        ) : null}
        {roles.isBorrower && accepted ? (
          <>
            <button type="button" className="border border-accent px-3 py-2" onClick={() => onOpen("borrow")}>
              Borrow into vault
            </button>
            <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("collateral")}>
              Add collateral
            </button>
            <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("removeCollateral")}>
              Remove collateral
            </button>
            <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("repay")}>
              Repay
            </button>
            <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("venue")}>
              Use reviewed venue
            </button>
            {canSurplus ? (
              <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("surplus")}>
                Release surplus
              </button>
            ) : null}
          </>
        ) : null}
        {roles.isCounterparty && accepted ? (
          <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("limit")}>
            Limit request
          </button>
        ) : null}
        {accepted && address && !roles.isBorrower ? (
          <button type="button" className="border border-border px-3 py-2" onClick={() => onOpen("repay")}>
            Repay on behalf of borrower
          </button>
        ) : null}
        {accepted && address && recovery ? (
          <button type="button" className="border border-accent px-3 py-2" onClick={() => onOpen("recover")}>
            Public recovery
          </button>
        ) : null}
        {accepted && address && canSettle && !roles.isLender ? (
          <button type="button" className="border border-accent px-3 py-2" onClick={() => onOpen("settle")}>
            Settle posted collateral
          </button>
        ) : null}
      </div>
      {open === "fund" ? (
        <AmountDialog
          facility={facility}
          kind="directFund"
          title="Fund agreement"
          from="Lender wallet"
          to="Agreement contract (available facility cash)"
          note="This is this lender's money for this agreement. It is not a pool deposit and does not mint shares."
          needsApprove
          onClose={() => onOpen(null)}
          write={(assets) => ({ fn: "fund" as const, args: [assets] })}
        />
      ) : null}
      {open === "withdraw" ? (
        <AmountDialog
          facility={facility}
          kind="directWithdrawCash"
          title="Withdraw cash"
          from="Available facility cash"
          to="Lender wallet"
          note="Idle cash can leave while debt remains. Withdrawable cash is the accounted cash, not a share of a pool."
          needsApprove={false}
          onClose={() => onOpen(null)}
          write={(assets) => ({ fn: "withdrawCash" as const, args: [assets] })}
        />
      ) : null}
      {open === "borrow" ? (
        <AmountDialog
          facility={facility}
          kind="directBorrow"
          title="Borrow into vault"
          from="Available facility cash"
          to="Borrower's restricted vault"
          note="Tokens go to the borrower's restricted vault, not the EOA. Max is min of 80% LTV on posted mWETH minus current debt, idle facility cash, and credit-limit headroom."
          needsApprove={false}
          onClose={() => onOpen(null)}
          write={async (assets, { publicClient }) => {
            const quoted = await quoteDirectBorrow(publicClient, facility.facility, assets);
            return {
              fn: "borrow" as const,
              args: [assets, quoted.maxDebtAfter, deadlineIn(600)],
              preview: `Debt ${formatUsdc(quoted.debtBefore)} → ${formatUsdc(quoted.debtAfter)} mUSDC. Max debt after ${formatUsdc(quoted.maxDebtAfter)} (0.10% quote tolerance).`,
            };
          }}
        />
      ) : null}
      {open === "repay" ? (
        <RepayDialog facility={facility} idleLoan={snap.idleLoan} onClose={() => onOpen(null)} />
      ) : null}
      {open === "recall" ? <RecallDialog facility={facility} onClose={() => onOpen(null)} /> : null}
      {open === "limit" ? <LimitDialog facility={facility} onClose={() => onOpen(null)} /> : null}
      {open === "venue" ? <VenueDialog facility={facility} snap={snap} onClose={() => onOpen(null)} /> : null}
      {open === "surplus" ? <SurplusDialog facility={facility} snap={snap} onClose={() => onOpen(null)} /> : null}
      {open === "recover" ? <RecoverDialog facility={facility} snap={snap} canSettle={canSettle} onClose={() => onOpen(null)} /> : null}
      {open === "settle" ? <SettleDialog facility={facility} onClose={() => onOpen(null)} /> : null}
      {open === "collateral" ? (
        <CollateralDialog
          facility={facility}
          kind="directAddCollateral"
          title="Add collateral"
          remove={false}
          onClose={() => onOpen(null)}
        />
      ) : null}
      {open === "removeCollateral" ? (
        <CollateralDialog
          facility={facility}
          kind="directRemoveCollateral"
          title="Remove collateral"
          remove
          onClose={() => onOpen(null)}
        />
      ) : null}
    </div>
  );
}

function AmountDialog({
  facility,
  kind,
  title,
  from,
  to,
  note,
  needsApprove,
  onClose,
  write,
}: {
  facility: DirectFacilityDto;
  kind: TxKind;
  title: string;
  from: string;
  to: string;
  note: string;
  needsApprove: boolean;
  onClose: () => void;
  write: FacilityWriter;
}) {
  const [human, setHuman] = useState("");
  const { address } = useAccount();
  const loanBalance = useReadContract({
    address: facility.asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: facility.chainId,
    query: { enabled: Boolean(address) },
  });
  const walletMusdc = typeof loanBalance.data === "bigint" ? loanBalance.data : undefined;
  const isBorrow = kind === "directBorrow";
  const oracle = directChainConfig(facility.chainId)?.oracle;
  const available = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "availableToBorrow",
    chainId: facility.chainId,
    query: { enabled: isBorrow, refetchInterval: 8_000 },
  });
  const liveDebt = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "currentDebt",
    chainId: facility.chainId,
    query: { enabled: isBorrow, refetchInterval: 8_000 },
  });
  const posted = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "collateralPosted",
    chainId: facility.chainId,
    query: { enabled: isBorrow, refetchInterval: 8_000 },
  });
  const quote = useReadContract({
    address: oracle ?? undefined,
    abi: pairOracleAbi,
    functionName: "quote",
    chainId: facility.chainId,
    query: { enabled: isBorrow && Boolean(oracle), refetchInterval: 8_000 },
  });
  const maxRaw = typeof available.data === "bigint" ? available.data : undefined;
  const debtRaw = typeof liveDebt.data === "bigint" ? liveDebt.data : safeBig(facility.debtRaw);
  const postedRaw = typeof posted.data === "bigint" ? posted.data : 0n;
  const quoteOk = quote.data !== undefined && Number(quote.data.status) === 0;
  const ltvCap =
    quoteOk && quote.data
      ? borrowCapacityUsdcRaw(postedRaw, quote.data.collateralUsdWad, quote.data.loanUsdWad)
      : undefined;
  const ltvHeadroom = ltvCap !== undefined ? availableFromLtv(ltvCap, debtRaw) : undefined;
  let typedBorrow = 0n;
  try {
    typedBorrow = isBorrow && human.trim() ? parseUsdc(human) : 0n;
  } catch {
    typedBorrow = 0n;
  }
  const neededWei =
    quoteOk && quote.data && typedBorrow > 0n
      ? requiredCollateralWei(debtRaw + typedBorrow, quote.data.collateralUsdWad, quote.data.loanUsdWad)
      : undefined;

  function fillMax() {
    if (maxRaw === undefined) {
      toast.message("Still reading max borrow from the agreement.");
      return;
    }
    if (maxRaw === 0n) {
      toast.error(
        quoteOk
          ? "Max is 0. Add mWETH collateral, wait for idle facility cash, or repay some debt."
          : "Max is 0 until the simulated oracle is fresh. Push mainnet prices first.",
      );
      return;
    }
    setHuman(formatUnits(maxRaw, 6));
  }

  return (
    <FocusDialog title={title} onClose={onClose}>
      <p className="font-mono text-sm">{title}</p>
      <MoneyMovementPreview fromLabel={from} toLabel={to} note={note} />
      {kind === "directFund" ? (
        <div className="space-y-2 font-mono text-[11px] text-muted-foreground">
          <p>
            Wallet mUSDC: {walletMusdc === undefined ? "…" : `${formatTokenUnits(walletMusdc, 6)}`}
            <span className="ml-1 text-[10px] uppercase tracking-widest">not Circle USDC</span>
          </p>
          <TestnetFaucetButton chainId={facility.chainId} compact />
        </div>
      ) : null}
      {isBorrow ? (
        <SimulatedOracleRefresh
          chainId={facility.chainId}
          onRefreshed={() => {
            void available.refetch();
            void liveDebt.refetch();
            void posted.refetch();
            void quote.refetch();
          }}
        />
      ) : null}
      {isBorrow ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Posted {formatTokenUnits(postedRaw, 18)} mWETH · debt {formatUsdc(debtRaw)} mUSDC · cash{" "}
          {formatUsdc(safeBig(facility.availableCashRaw))} mUSDC
          {ltvHeadroom !== undefined ? ` · LTV headroom ${formatUsdc(ltvHeadroom)}` : ""}
          {". Max borrow "}
          {maxRaw === undefined ? "…" : `${formatUsdc(maxRaw)} mUSDC`}
          {" (on-chain min of LTV, cash, credit limit)."}
        </p>
      ) : null}
      <div className="flex gap-2">
        <input
          value={human}
          onChange={(e) => setHuman(e.target.value)}
          className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
          placeholder="Amount in mUSDC"
        />
        {isBorrow ? (
          <button
            type="button"
            className="shrink-0 border border-accent px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
            onClick={fillMax}
          >
            Max
          </button>
        ) : null}
      </div>
      {isBorrow && neededWei !== undefined ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          This size plus current debt needs {formatTokenUnits(neededWei, 18)} mWETH at 80% LTV
          {neededWei > postedRaw ? ` — short ${formatTokenUnits(neededWei - postedRaw, 18)} mWETH.` : "."}
        </p>
      ) : null}
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <WriteButton
          facility={facility}
          kind={kind}
          needsApprove={needsApprove}
          amountHuman={human}
          onDone={onClose}
          write={write}
        />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
    </FocusDialog>
  );
}

function RepayDialog({
  facility,
  idleLoan,
  onClose,
}: {
  facility: DirectFacilityDto;
  idleLoan: bigint;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const roles = rolesFor(facility, address);
  const [source, setSource] = useState<"wallet" | "vault">(roles.isBorrower && idleLoan > 0n ? "vault" : "wallet");
  const [human, setHuman] = useState("");
  const fromWallet = source === "wallet";
  const onBehalf = Boolean(address && !roles.isBorrower);

  return (
    <FocusDialog title="Repay" onClose={onClose}>
      <p className="font-mono text-sm">
        {onBehalf ? `Repay on behalf of ${facility.borrower}` : `Repay your agreement with ${facility.lender}`}
      </p>
      {onBehalf ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          You are repaying on behalf of the borrower. You receive no ownership or withdrawal rights.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        <button
          type="button"
          className={`border px-3 py-2 ${source === "wallet" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setSource("wallet")}
        >
          My wallet
        </button>
        <button
          type="button"
          className={`border px-3 py-2 ${source === "vault" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setSource("vault")}
          disabled={idleLoan === 0n && !roles.isBorrower && !publicRecoveryOpen(facility)}
        >
          Agreement vault
        </button>
      </div>
      <MoneyMovementPreview
        fromLabel={fromWallet ? "Connected wallet" : "Borrower vault idle mUSDC"}
        toLabel={`Agreement contract — then available for ${facility.lender.slice(0, 6)}… to withdraw`}
        note={
          fromWallet
            ? `Pulls mUSDC from the connected wallet via repayAssets. Vault idle is ${formatTokenUnits(idleLoan, 6)} mUSDC and is not used.`
            : `Calls repayFromVault. Uses vault idle only (${formatTokenUnits(idleLoan, 6)} mUSDC). Anyone may do this after public recovery; the borrower may do it earlier.`
        }
      />
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder="Max mUSDC to apply"
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <WriteButton
          facility={facility}
          kind="directRepay"
          needsApprove={fromWallet}
          amountHuman={human}
          onDone={onClose}
          write={(assets) =>
            fromWallet
              ? { fn: "repayAssets" as const, args: [assets] }
              : { fn: "repayFromVault" as const, args: [assets] }
          }
        />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
    </FocusDialog>
  );
}

function CollateralDialog({
  facility,
  kind,
  title,
  remove,
  onClose,
}: {
  facility: DirectFacilityDto;
  kind: TxKind;
  title: string;
  remove: boolean;
  onClose: () => void;
}) {
  const [human, setHuman] = useState("");
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const cfg = directChainConfig(facility.chainId);
  const key = actionKey({
    chainId: facility.chainId,
    account: address ?? "disconnected",
    facility: facility.facility,
    action: kind,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function submit() {
    if (!isConnected || !address) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== facility.chainId) {
      toast.error(`Switch the wallet to chain ${facility.chainId} before writing.`);
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    if (!publicClient || !walletClient || !cfg?.otherToken) {
      toast.error("No client or collateral token for this chain.");
      return;
    }
    const amount = parseTokenInput(human, 18);
    if (amount <= 0n) {
      toast.error("Enter an amount.");
      return;
    }
    const fn = remove ? "removeCollateral" : "addCollateral";
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind,
      chainId: facility.chainId,
      marketId: facility.facility,
      amountRaw: amount.toString(),
      spender: facility.facility,
      tokenSymbol: "mWETH",
      phase: "editing",
      updatedAt: Date.now(),
    });
    await runMarketTx({
      id,
      patch: tx.patch,
      publicClient,
      walletClient,
      account: address,
      token: cfg.otherToken,
      spender: facility.facility,
      amount,
      needsApprove: !remove,
      simulate: async () => {
        await publicClient.simulateContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: fn,
          args: [amount],
        });
      },
      writeAction: () =>
        walletClient.writeContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: fn,
          args: [amount],
          chain: walletClient.chain,
        }),
    });
    await qc.invalidateQueries({ queryKey: qk.directFacility(facility.chainId, facility.facility) });
    onClose();
  }

  return (
    <FocusDialog title={title} onClose={onClose}>
      <p className="font-mono text-sm">{title}</p>
      <MoneyMovementPreview
        fromLabel={remove ? "Posted mWETH on this agreement" : "Borrower wallet"}
        toLabel={remove ? "Borrower wallet" : "Posted as collateral on this agreement"}
        note="Debt after this action cannot exceed 80% of remaining collateral value. Venue mWETH in the vault is not collateral."
      />
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder="Amount in mWETH"
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <button
          type="button"
          disabled={busy}
          className="border border-accent bg-accent px-3 py-2 text-accent-foreground disabled:opacity-40"
          onClick={() => void submit()}
        >
          {busy ? record?.phase.replaceAll("_", " ") : "Confirm"}
        </button>
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
      {record ? <TxStatusList records={[record]} /> : null}
    </FocusDialog>
  );
}

function RecallDialog({ facility, onClose }: { facility: DirectFacilityDto; onClose: () => void }) {
  return (
    <FocusDialog title="Request repayment" onClose={onClose}>
      <p className="font-mono text-sm">Request repayment</p>
      <MoneyMovementPreview
        fromLabel="No immediate transfer"
        toLabel="Borrower must return funds to the vault, then repay"
        note="Recall can be requested once. New borrowing and venue entry stop. Repay and reverse unwind stay open. This is not a liquidation."
      />
      <NoAmountAction facility={facility} kind="directRecall" label="Request repayment" fn="requestRepayment" extra={[1]} />
      <button type="button" className="border border-border px-3 py-2 font-mono text-[10px] uppercase" onClick={onClose}>
        Close
      </button>
    </FocusDialog>
  );
}

function VenueDialog({
  facility,
  snap,
  onClose,
}: {
  facility: DirectFacilityDto;
  snap: VaultSnap;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"enter" | "exit" | "redeem" | "swap">("enter");
  const [human, setHuman] = useState("");
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const cfg = directChainConfig(facility.chainId);

  useEffect(() => {
    if (!publicClient || (mode !== "enter" && mode !== "exit" && mode !== "redeem")) {
      setLivePreview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const amount = parseTokenInput(human, 6);
        if (amount <= 0n) {
          if (!cancelled) setLivePreview(null);
          return;
        }
        if (mode === "enter") {
          if (!cfg?.venue) return;
          const quoted = await quoteVenueEnter(publicClient, cfg.venue, amount);
          if (!cancelled) {
            setLivePreview(
              `Venue shares out ${quoted.sharesOut.toString()}. Min shares ${quoted.minSharesOut.toString()} (0.10% quote tolerance).`,
            );
          }
          return;
        }
        if (mode === "exit") {
          const quoted = await quoteVenueExit(publicClient, cfg?.venue, amount);
          if (!cancelled) setLivePreview(quoted.preview);
          return;
        }
        const quoted = await quoteVenueRedeem(publicClient, cfg?.venue, amount);
        if (!cancelled) setLivePreview(quoted.preview);
      } catch {
        if (!cancelled) setLivePreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg?.venue, human, mode, publicClient]);

  const copy =
    mode === "enter"
      ? {
          title: "Deploy to reviewed venue",
          from: "Vault idle mUSDC",
          to: "Reviewed ERC-4626 venue",
          note: "Only the vault owner (borrower) can enter. JUNK and untyped tokens are not offered here. Recall blocks new entry.",
          placeholder: "Idle mUSDC to deposit",
        }
      : mode === "exit"
        ? {
            title: "Withdraw from venue",
            from: "Venue receipt shares",
            to: "Vault idle mUSDC",
            note: "Owner exit. Loan tokens return to the vault. Repay is a separate action unless you use public recovery.",
            placeholder: "mUSDC assets to withdraw",
          }
        : mode === "redeem"
          ? {
              title: "Redeem venue shares",
              from: `Venue shares (${formatTokenUnits(snap.venueShares, 6)})`,
              to: "Vault idle mUSDC",
              note: "Burns the entered share amount. Follow with Repay if you intend to return funds to the lender.",
              placeholder: "Shares to redeem",
            }
          : {
              title: "Reverse swap into mUSDC",
              from: "Vault mWETH (other token)",
              to: "Vault idle mUSDC",
              note: "Reverse unwind stays allowed during recall. Forward loan→other is blocked while recall is active.",
              placeholder: "mWETH to sell",
            };

  return (
    <FocusDialog title="Use reviewed venue" onClose={onClose}>
      <p className="font-mono text-sm">{copy.title}</p>
      <p className="font-mono text-[11px] text-muted-foreground">
        Idle {formatTokenUnits(snap.idleLoan, 6)} mUSDC · shares {formatTokenUnits(snap.venueShares, 6)} · other{" "}
        {formatTokenUnits(snap.otherIdle, 18)} mWETH
      </p>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        {(["enter", "exit", "redeem", "swap"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`border px-3 py-2 ${mode === m ? "border-accent text-accent" : "border-border"}`}
            onClick={() => setMode(m)}
          >
            {m === "enter" ? "Enter" : m === "exit" ? "Exit" : m === "redeem" ? "Redeem" : "Reverse swap"}
          </button>
        ))}
      </div>
      <MoneyMovementPreview fromLabel={copy.from} toLabel={copy.to} note={copy.note} />
      {livePreview ? <p className="font-mono text-[11px] text-muted-foreground">{livePreview}</p> : null}
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder={copy.placeholder}
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <VaultWriteButton
          facility={facility}
          label={mode === "enter" ? "Enter venue" : mode === "exit" ? "Exit venue" : mode === "redeem" ? "Redeem shares" : "Reverse swap"}
          amountHuman={human}
          decimals={mode === "swap" ? 18 : 6}
          onDone={onClose}
          write={async (amount, { publicClient }) => {
            if (mode === "enter") {
              if (!cfg?.venue) throw new Error("No reviewed venue is configured for this chain.");
              const quoted = await quoteVenueEnter(publicClient, cfg.venue, amount);
              return {
                fn: "enterVenue",
                args: [amount, quoted.minSharesOut],
                preview: `Venue shares out ${quoted.sharesOut.toString()}. Min shares ${quoted.minSharesOut.toString()} (0.10% quote tolerance).`,
              };
            }
            if (mode === "exit") {
              const quoted = await quoteVenueExit(publicClient, cfg?.venue, amount);
              return { fn: "exitVenue", args: [amount, quoted.maxShares], preview: quoted.preview };
            }
            if (mode === "redeem") {
              const quoted = await quoteVenueRedeem(publicClient, cfg?.venue, amount);
              return { fn: "redeemVenue", args: [amount, quoted.minAssets], preview: quoted.preview };
            }
            return {
              fn: "swap",
              args: [
                cfg?.otherToken ?? facility.asset.address,
                facility.asset.address,
                amount,
                0n,
                deadlineIn(600),
              ],
            };
          }}
        />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
    </FocusDialog>
  );
}

function SurplusDialog({
  facility,
  snap,
  onClose,
}: {
  facility: DirectFacilityDto;
  snap: VaultSnap;
  onClose: () => void;
}) {
  const cfg = directChainConfig(facility.chainId);
  const [token, setToken] = useState<"loan" | "other">("loan");
  const [human, setHuman] = useState("");
  const tokenAddr = token === "loan" ? facility.asset.address : cfg?.otherToken;
  const decimals = token === "loan" ? 6 : 18;
  const available = token === "loan" ? snap.idleLoan : snap.otherIdle;

  return (
    <FocusDialog title="Release surplus" onClose={onClose}>
      <p className="font-mono text-sm">Release settled surplus</p>
      <MoneyMovementPreview
        fromLabel="Borrower vault"
        toLabel="Borrower wallet"
        note="Requires no outstanding debt. Releases idle loan or other tokens after repayment. This is not a lender withdrawal."
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <button
          type="button"
          className={`border px-3 py-2 ${token === "loan" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setToken("loan")}
        >
          mUSDC ({formatTokenUnits(snap.idleLoan, 6)})
        </button>
        <button
          type="button"
          className={`border px-3 py-2 ${token === "other" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setToken("other")}
        >
          mWETH ({formatTokenUnits(snap.otherIdle, 18)})
        </button>
      </div>
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder={`Amount (available ${formatTokenUnits(available, decimals)})`}
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <VaultWriteButton
          facility={facility}
          label="Release surplus"
          amountHuman={human}
          decimals={decimals}
          onDone={onClose}
          write={(amount) => ({ fn: "releaseSurplus", args: [tokenAddr ?? facility.asset.address, amount] })}
        />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
    </FocusDialog>
  );
}

function RecoverDialog({
  facility,
  snap,
  canSettle,
  onClose,
}: {
  facility: DirectFacilityDto;
  snap: VaultSnap;
  canSettle: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"vault" | "venue" | "swap">("vault");
  const [human, setHuman] = useState("");
  const open = snap.recoveryOpen ?? publicRecoveryOpen(facility);

  return (
    <FocusDialog title="Public recovery" onClose={onClose}>
      <p className="font-mono text-sm">Public recovery</p>
      {!open ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Public recovery is not open yet. The borrower can still exit the venue as owner and repay from vault idle.
          After the effective due time, anyone may run the actions below. An unavailable venue can delay recovery. This
          is not a liquidation.
        </p>
      ) : (
        <p className="font-mono text-[11px] text-muted-foreground">
          Eligible now: repay vault idle, recover venue into the vault then repay, or reverse-unwind other tokens.
          {canSettle
            ? " Posted mWETH can be settled at the oracle against remaining debt; residual returns to the borrower."
            : " Posted collateral is not seized unless settlement is eligible."}
        </p>
      )}
      <p className="font-mono text-[11px] text-muted-foreground">
        Idle {formatTokenUnits(snap.idleLoan, 6)} mUSDC · shares {formatTokenUnits(snap.venueShares, 6)} · other{" "}
        {formatTokenUnits(snap.otherIdle, 18)} mWETH
      </p>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        <button
          type="button"
          className={`border px-3 py-2 ${mode === "vault" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setMode("vault")}
        >
          Vault idle repay
        </button>
        <button
          type="button"
          className={`border px-3 py-2 ${mode === "venue" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setMode("venue")}
        >
          Recover venue
        </button>
        <button
          type="button"
          className={`border px-3 py-2 ${mode === "swap" ? "border-accent text-accent" : "border-border"}`}
          onClick={() => setMode("swap")}
        >
          Reverse unwind
        </button>
      </div>
      <MoneyMovementPreview
        fromLabel={mode === "vault" ? "Vault idle mUSDC" : mode === "venue" ? "Venue shares" : "Vault mWETH"}
        toLabel="Agreement cash (then lender withdraw)"
        note={
          mode === "vault"
            ? "repayFromVault uses idle loan tokens only. It does not exit the venue."
            : mode === "venue"
              ? "recoverVenue exits shares into the vault and then repays if debt remains. Fails if the venue cannot withdraw."
              : "recoverSwap sells other tokens for mUSDC and then repays if debt remains."
        }
      />
      <input
        value={human}
        onChange={(e) => setHuman(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder={mode === "swap" ? "mWETH in" : "mUSDC amount"}
      />
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <WriteButton
          facility={facility}
          kind={mode === "vault" ? "directRepay" : "directVenue"}
          needsApprove={false}
          amountHuman={human}
          decimals={mode === "swap" ? 18 : 6}
          onDone={onClose}
          write={async (assets, { publicClient }) => {
            if (mode === "vault") return { fn: "repayFromVault" as const, args: [assets] };
            if (mode === "venue") {
              const cfg = directChainConfig(facility.chainId);
              const quoted = await quoteVenueExit(publicClient, cfg?.venue, assets);
              return { fn: "recoverVenue" as const, args: [assets, quoted.maxShares], preview: quoted.preview };
            }
            return {
              fn: "recoverSwap" as const,
              args: [assets, 0n, deadlineIn(600)],
            };
          }}
        />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
      {canSettle ? (
        <div className="border border-border/40 p-3 space-y-2">
          <p className="font-mono text-[11px] text-muted-foreground">
            After the unified recovery deadline, anyone may settle posted mWETH. The lender receives collateral value up
            to remaining debt; leftover mWETH returns to the borrower. Remaining debt stays if collateral is short. This
            is not a pool liquidation.
          </p>
          <NoAmountAction facility={facility} kind="directRecall" label="Settle posted collateral" fn="settleDefault" extra={[]} />
        </div>
      ) : null}
    </FocusDialog>
  );
}

function SettleDialog({ facility, onClose }: { facility: DirectFacilityDto; onClose: () => void }) {
  const preview = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "previewSettlement",
    chainId: facility.chainId,
  });
  const quote = preview.data as readonly [bigint, bigint, bigint] | undefined;

  return (
    <FocusDialog title="Settle posted collateral" onClose={onClose}>
      <p className="font-mono text-sm">Settle posted collateral</p>
      <MoneyMovementPreview
        fromLabel="Posted mWETH on this agreement"
        toLabel={`${facility.lender.slice(0, 6)}… (up to remaining debt) · residual to ${facility.borrower.slice(0, 6)}…`}
        note="Only after public recovery (timestamp > unified deadline). Converts posted mWETH at the accepted oracle. Unused collateral returns to the borrower. No write-off if value is short."
      />
      {quote ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Quote: {formatTokenUnits(quote[0], 18)} mWETH to lender · {formatTokenUnits(quote[1], 18)} residual to
          borrower · {formatTokenUnits(quote[2], 6)} mUSDC debt credit
        </p>
      ) : null}
      <div className="flex gap-2 font-mono text-[10px] uppercase">
        <NoAmountAction facility={facility} kind="directRecall" label="Settle default" fn="settleDefault" extra={[]} />
        <button type="button" className="border border-border px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
    </FocusDialog>
  );
}

function NoAmountAction({
  facility,
  kind,
  label,
  fn,
  extra,
}: {
  facility: DirectFacilityDto;
  kind: TxKind;
  label: string;
  fn: "acceptTerms" | "decline" | "cancelPending" | "pauseNewBorrowing" | "resumeNewBorrowing" | "endAgreement" | "requestRepayment" | "clearRecall" | "settleDefault";
  extra: readonly unknown[];
}) {
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const key = actionKey({
    chainId: facility.chainId,
    account: address ?? "disconnected",
    facility: facility.facility,
    action: `${kind}-${fn}`,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function run() {
    if (!address || !publicClient || !walletClient) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== facility.chainId) {
      toast.error(`Switch the wallet to chain ${facility.chainId} before writing.`);
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind,
      chainId: facility.chainId,
      marketId: facility.facility,
      amountRaw: "0",
      spender: facility.facility,
      tokenSymbol: "mUSDC",
      phase: "editing",
      updatedAt: Date.now(),
    });
    try {
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
        await publicClient.simulateContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: fn,
          args: extra as never,
        });
      },
      writeAction: () =>
        walletClient.writeContract({
          account: address,
          address: facility.facility,
          abi: directFacilityAbi,
          functionName: fn,
          args: extra as never,
          chain: walletClient.chain,
        }),
    });
      await qc.invalidateQueries({ queryKey: qk.directFacility(facility.chainId, facility.facility) });
      await qc.invalidateQueries({ queryKey: qk.directFacilities(facility.chainId, address, "either") });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <button type="button" disabled={busy} className="border border-border px-3 py-2 disabled:opacity-40" onClick={() => void run()}>
      {busy ? record?.phase.replaceAll("_", " ") : label}
    </button>
  );
}

type FacilityWriteFn = "fund" | "withdrawCash" | "borrow" | "repayAssets" | "repayFromVault" | "recoverVenue" | "recoverSwap";
type WriteResult<T extends string> = { fn: T; args: readonly unknown[]; preview?: string };
type FacilityWriter = (
  assets: bigint,
  ctx: { publicClient: PublicClient },
) => WriteResult<FacilityWriteFn> | Promise<WriteResult<FacilityWriteFn>>;

function WriteButton({
  facility,
  kind,
  needsApprove,
  amountHuman,
  decimals = 6,
  onDone,
  write,
}: {
  facility: DirectFacilityDto;
  kind: TxKind;
  needsApprove: boolean;
  amountHuman: string;
  decimals?: number;
  onDone: () => void;
  write: FacilityWriter;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const key = actionKey({
    chainId: facility.chainId,
    account: address ?? "disconnected",
    facility: facility.facility,
    action: kind,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function submit() {
    if (!isConnected || !address) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== facility.chainId) {
      toast.error(`Switch the wallet to chain ${facility.chainId} before writing.`);
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    if (!publicClient || !walletClient) {
      toast.error("No client for this chain.");
      return;
    }
    const amount = decimals === 6 ? parseUsdc(amountHuman) : parseTokenInput(amountHuman, decimals);
    if (amount <= 0n) {
      toast.error("Enter an amount.");
      return;
    }
    const call = await write(amount, { publicClient });
    setPreview(call.preview ?? null);
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind,
      chainId: facility.chainId,
      marketId: facility.facility,
      amountRaw: amount.toString(),
      spender: facility.facility,
      tokenSymbol: facility.asset.symbol,
      phase: "editing",
      updatedAt: Date.now(),
    });
    try {
      await runMarketTx({
        id,
        patch: tx.patch,
        publicClient,
        walletClient,
        account: address,
        token: facility.asset.address,
        spender: facility.facility,
        amount,
        needsApprove,
        simulate: async () => {
          await publicClient.simulateContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: call.fn,
            args: call.args as never,
          });
        },
        writeAction: () =>
          walletClient.writeContract({
            account: address,
            address: facility.facility,
            abi: directFacilityAbi,
            functionName: call.fn,
            args: call.args as never,
            chain: walletClient.chain,
          }),
      });
      await qc.invalidateQueries({ queryKey: qk.directFacility(facility.chainId, facility.facility) });
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-2">
      {preview ? <p className="font-mono text-xs text-muted-foreground normal-case tracking-normal">{preview}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="border border-accent bg-accent px-3 py-2 text-accent-foreground disabled:opacity-40"
        onClick={() => void submit()}
      >
        {busy ? record?.phase.replaceAll("_", " ") : "Confirm"}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}

function VaultWriteButton({
  facility,
  label,
  amountHuman,
  decimals,
  onDone,
  write,
}: {
  facility: DirectFacilityDto;
  label: string;
  amountHuman: string;
  decimals: number;
  onDone: () => void;
  write: (
    amount: bigint,
    ctx: { publicClient: PublicClient },
  ) =>
    | WriteResult<"enterVenue" | "exitVenue" | "redeemVenue" | "swap" | "releaseSurplus">
    | Promise<WriteResult<"enterVenue" | "exitVenue" | "redeemVenue" | "swap" | "releaseSurplus">>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: facility.chainId });
  const { data: walletClient } = useWalletClient();
  const tx = useTxMachine();
  const qc = useQueryClient();
  const key = actionKey({
    chainId: facility.chainId,
    account: address ?? "disconnected",
    facility: facility.facility,
    action: `directVenue-${label}`,
  });
  const record = latestForKey(tx.records, key);
  const busy = Boolean(pendingForKey(tx.records, key));

  async function submit() {
    if (!address || !publicClient || !walletClient) {
      toast.message("Connect a wallet to submit this action.");
      return;
    }
    if (walletChainId !== facility.chainId) {
      toast.error(`Switch the wallet to chain ${facility.chainId}.`);
      return;
    }
    if (busy) {
      toast.message("This action is already waiting for a signature or confirmation.");
      return;
    }
    const amount = parseTokenInput(amountHuman, decimals);
    if (amount <= 0n) {
      toast.error("Enter an amount.");
      return;
    }
    const call = await write(amount, { publicClient });
    setPreview(call.preview ?? null);
    const id = newAttemptId(key);
    tx.upsert({
      id,
      kind: "directVenue",
      chainId: facility.chainId,
      marketId: facility.facility,
      amountRaw: amount.toString(),
      spender: facility.vault,
      tokenSymbol: decimals === 6 ? "mUSDC" : "mWETH",
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
      spender: facility.vault,
      amount,
      needsApprove: false,
      simulate: async () => {
        await publicClient.simulateContract({
          account: address,
          address: facility.vault,
          abi: borrowerVaultAbi,
          functionName: call.fn,
          args: call.args as never,
        });
      },
      writeAction: () =>
        walletClient.writeContract({
          account: address,
          address: facility.vault,
          abi: borrowerVaultAbi,
          functionName: call.fn,
          args: call.args as never,
          chain: walletClient.chain,
        }),
    });
    await qc.invalidateQueries({ queryKey: qk.directFacility(facility.chainId, facility.facility) });
    onDone();
  }

  return (
    <div className="space-y-2">
      {preview ? <p className="font-mono text-xs text-muted-foreground normal-case tracking-normal">{preview}</p> : null}
      <button
        type="button"
        disabled={busy}
        className="border border-accent px-3 py-2 disabled:opacity-40"
        onClick={() => void submit()}
      >
        {busy ? record?.phase.replaceAll("_", " ") : label}
      </button>
      {record ? <TxStatusList records={[record]} /> : null}
    </div>
  );
}

type VaultSnap = {
  idleLoan: bigint;
  venueShares: bigint;
  otherIdle: bigint;
  recallStarted: boolean;
  recoveryOpen?: boolean;
};

function useVaultSnapshot(facility: DirectFacilityDto): VaultSnap {
  const cfg = directChainConfig(facility.chainId);
  const idle = useReadContract({
    address: facility.vault,
    abi: borrowerVaultAbi,
    functionName: "idleLoan",
    chainId: facility.chainId,
    query: { enabled: facility.vault !== "0x0000000000000000000000000000000000000000" },
  });
  const shares = useReadContract({
    address: facility.vault,
    abi: borrowerVaultAbi,
    functionName: "venueShares",
    chainId: facility.chainId,
    query: { enabled: facility.vault !== "0x0000000000000000000000000000000000000000" },
  });
  const reason = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "recallReasonHash",
    chainId: facility.chainId,
  });
  const recoveryDue = useReadContract({
    address: facility.facility,
    abi: directFacilityAbi,
    functionName: "publicRecoveryDeadline",
    chainId: facility.chainId,
  });
  const other = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(cfg?.otherToken) },
    contracts: cfg?.otherToken
      ? [
          {
            address: cfg.otherToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [facility.vault],
            chainId: facility.chainId,
          },
        ]
      : [],
  });
  return {
    idleLoan: (idle.data as bigint | undefined) ?? 0n,
    venueShares: (shares.data as bigint | undefined) ?? 0n,
    otherIdle: (other.data?.[0]?.result as bigint | undefined) ?? 0n,
    recallStarted:
      reason.data !== undefined
        ? recallRequested(reason.data as `0x${string}`)
        : Boolean(facility.recallDeadline),
    recoveryOpen:
      recoveryDue.data !== undefined
        ? recoveryDue.data !== 0n && BigInt(Math.floor(Date.now() / 1000)) > recoveryDue.data
        : undefined,
  };
}

const erc4626PreviewAbi = [
  {
    type: "function",
    name: "previewWithdraw",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "previewRedeem",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function quoteVenueExit(client: PublicClient, venue: `0x${string}` | undefined, assets: bigint) {
  if (!venue) {
    return { maxShares: maxUint256, preview: "No venue configured — submitting with an unbounded share cap." };
  }
  const sharesBurn = await client.readContract({
    address: venue,
    abi: erc4626PreviewAbi,
    functionName: "previewWithdraw",
    args: [assets],
  });
  const maxShares = maxBoundFromQuote(sharesBurn);
  return {
    maxShares,
    preview: `Shares burned ${sharesBurn.toString()} → max ${maxShares.toString()} (0.10% quote tolerance).`,
  };
}

async function quoteVenueRedeem(client: PublicClient, venue: `0x${string}` | undefined, shares: bigint) {
  if (!venue) {
    return { minAssets: 0n, preview: "No venue configured — submitting with min assets 0." };
  }
  const assetsOut = await client.readContract({
    address: venue,
    abi: erc4626PreviewAbi,
    functionName: "previewRedeem",
    args: [shares],
  });
  const minAssets = minBoundFromQuote(assetsOut);
  return {
    minAssets,
    preview: `Assets out ${assetsOut.toString()} → min ${minAssets.toString()} (0.10% quote tolerance).`,
  };
}

function safeBig(raw: string) {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}
