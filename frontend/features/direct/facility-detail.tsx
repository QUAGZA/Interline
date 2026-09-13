"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { HeaderMeta, PageHeader } from "@/components/ui/chrome";
import { HeroMetric } from "@/components/ui/hero-metric";
import { WorkspaceSplit } from "@/features/layout/workspace-split";
import { TokenAmount } from "@/features/risk/health-display";
import { TestnetPanel } from "@/features/testnet-panel";
import { useDirectFacilityQuery, useEventsQuery } from "@/hooks/useV2Api";
import { useWalletCatalogBalances } from "@/hooks/useWalletCatalogBalances";
import { AgreementLifecycleBadge, CounterpartyCard, NextActionPanel } from "./cards";
import { DirectActions, type DialogKind } from "./actions";
import type { DirectFacilityDto } from "./dto";
import { nextActionText, rolesFor } from "./roles";
import { borrowerVaultAbi, directFacilityAbi } from "@/lib/direct-abi";
import { formatTokenUnits, formatUnixDate, shortAddr } from "@/lib/format";
import type { Address } from "viem";
import { toast } from "sonner";

const TABS = ["overview", "terms", "funds", "limits", "activity", "contract"] as const;
type Tab = (typeof TABS)[number];

export function FacilityDetail({ chainId, facility }: { chainId: number; facility: Address }) {
  const search = useSearchParams();
  const tabParam = (search.get("tab") ?? "overview").toLowerCase();
  const actionParam = search.get("action");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "overview";
  const { address } = useAccount();
  const q = useDirectFacilityQuery(chainId, facility);
  const onchain = useOnchainFacility(chainId, facility, !q.data?.data);
  const dto = q.data?.data ?? onchain;
  const posted = useReadContract({
    address: facility,
    abi: directFacilityAbi,
    functionName: "collateralPosted",
    chainId,
  });
  const [open, setOpen] = useState<DialogKind>(actionToDialog(actionParam));
  const vaultIdle = useReadContract({
    address: dto?.vault,
    abi: borrowerVaultAbi,
    functionName: "idleLoan",
    chainId,
    query: { enabled: Boolean(dto?.vault) },
  });
  const vaultShares = useReadContract({
    address: dto?.vault,
    abi: borrowerVaultAbi,
    functionName: "venueShares",
    chainId,
    query: { enabled: Boolean(dto?.vault) },
  });
  const balances = useWalletCatalogBalances(chainId);

  if (!dto) {
    return (
      <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto">
        <PageHeader size="page" kicker="Direct" title="AGREEMENT" description="Loading or not yet indexed." />
      </section>
    );
  }

  const roles = rolesFor(dto, address);
  const yourRole = roles.isLender ? "You are the lender" : roles.isBorrower ? "You are the borrower" : "Observer";
  const collateralPosted = posted.data;

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-5">
      <PageHeader
        size="page"
        kicker="Direct lending"
        title="AGREEMENT"
        description={`${yourRole} · ${shortAddr(facility)}`}
        actions={
          <HeaderMeta
            usingStub={q.data?.usingStub}
            stale={q.data?.stale}
            source={q.data?.source ?? (onchain ? "rpc" : undefined)}
            extra={<ShareFacilityLink chainId={chainId} facility={facility} />}
          />
        }
      />
      <WorkspaceSplit
        main={
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric label="Credit limit" value={<TokenAmount raw={dto.creditLimitRaw} decimals={6} />} />
              <HeroMetric
                label="Facility cash"
                value={<TokenAmount raw={dto.availableCashRaw} decimals={6} />}
                hint="Lender cash in this contract — not a pool share."
              />
              <HeroMetric label="Outstanding" value={<TokenAmount raw={dto.debtRaw} decimals={6} />} />
              <HeroMetric
                label="Posted mWETH"
                value={collateralPosted !== undefined ? formatTokenUnits(collateralPosted, 18) : "—"}
                hint="Borrowing is capped at 80% of posted mWETH. Direct agreements are not liquidated on-chain; recall is the recovery path."
                subline={`Due ${formatUnixDate(dto.repaymentDueAt)}`}
              />
            </div>
            <AgreementRelationshipHeader dto={dto} address={address} />
            <nav className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
              {TABS.map((t) => (
                <Link
                  key={t}
                  href={`/direct/${chainId}/${facility}?tab=${t}`}
                  className={`border px-3 py-2 ${tab === t ? "border-accent text-accent" : "border-border"}`}
                >
                  {t === "funds" ? "Funds" : t === "limits" ? "Limits" : t === "contract" ? "Contract" : t}
                </Link>
              ))}
            </nav>
            {tab === "overview" ? <Overview dto={dto} collateralPosted={posted.data} /> : null}
            {tab === "terms" ? <Terms dto={dto} /> : null}
            {tab === "funds" ? <Funds dto={dto} idleLoan={vaultIdle.data} venueShares={vaultShares.data} /> : null}
            {tab === "limits" ? (
              <p className="font-mono text-xs text-muted-foreground">Prepare a new limit, export it, both approve, then apply.</p>
            ) : null}
            {tab === "activity" ? <FacilityActivity chainId={chainId} facility={facility} /> : null}
            {tab === "contract" ? (
              <dl className="grid gap-2 font-mono text-xs">
                <Row k="Facility" v={dto.facility} />
                <Row k="Vault" v={dto.vault} />
                <Row k="Terms hash" v={dto.termsHash} />
                <Row k="Loan token" v={dto.asset.address} />
              </dl>
            ) : null}
          </>
        }
        rail={
          <>
            <NextActionPanel
              text={nextActionText({
                facility: dto,
                roles,
                idleLoan: vaultIdle.data,
                venueShares: vaultShares.data,
                collateralPosted: posted.data,
                recallStarted: Boolean(dto.recallDeadline),
              })}
            />
            <p className="font-mono text-[11px] text-muted-foreground">
              Wallet {formatTokenUnits(balances.musdc, 6)} mUSDC · {formatTokenUnits(balances.mweth, 18)} mWETH
            </p>
            <TestnetPanel chainId={chainId} />
            <DirectActions facility={dto} open={open} onOpen={setOpen} collateralPosted={posted.data} />
          </>
        }
      />
    </section>
  );
}

function AgreementRelationshipHeader({ dto, address }: { dto: DirectFacilityDto; address?: string }) {
  const roles = rolesFor(dto, address);
  return (
    <div className="space-y-3">
      <AgreementLifecycleBadge
        acceptance={
          dto.ended
            ? "ENDED"
            : dto.declined
              ? "DECLINED"
              : dto.cancelled
                ? "CANCELLED"
                : dto.lenderAccepted && dto.borrowerAccepted
                  ? "ACCEPTED"
                  : "PENDING"
        }
        credit={dto.borrowingPaused ? "PAUSED" : BigInt(dto.availableCashRaw) > 0n ? "AVAILABLE" : "UNFUNDED"}
        debt={BigInt(dto.debtRaw) > 0n ? "OUTSTANDING" : "NO_DEBT"}
        recall={dto.recallDeadline ? "RECALL" : "NONE"}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <CounterpartyCard role="Lender" address={dto.lender} you={roles.isLender} />
        <CounterpartyCard role="Borrower" address={dto.borrower} you={roles.isBorrower} />
      </div>
    </div>
  );
}

function Overview({ dto, collateralPosted }: { dto: DirectFacilityDto; collateralPosted?: bigint }) {
  return (
    <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
      <Row k="Accrued interest" v={`${formatTokenUnits(BigInt(dto.accruedInterestRaw), 6)} mUSDC`} />
      <Row k="Fixed APR" v={aprPct(dto.fixedAprRay)} />
      <Row k="Repayment" v={formatUnixDate(dto.repaymentDueAt)} />
      <Row k="Recall" v={dto.recallDeadline ? formatUnixDate(dto.recallDeadline) : "Not requested"} />
      <Row
        k="Posted collateral"
        v={collateralPosted !== undefined ? `${formatTokenUnits(collateralPosted, 18)} mWETH` : "—"}
      />
    </dl>
  );
}

function Terms({ dto }: { dto: DirectFacilityDto }) {
  return (
    <dl className="grid gap-2 font-mono text-xs max-w-xl">
      <Row k="Lender" v={dto.lender} />
      <Row k="Borrower" v={dto.borrower} />
      <Row k="Credit limit" v={`${dto.creditLimitRaw} base units`} />
      <Row k="Borrowing cost" v={`${aprPct(dto.fixedAprRay)} APR`} />
      <Row k="Acceptance deadline" v={formatUnixDate(dto.acceptanceDeadline)} />
      <Row k="Borrow expiry" v={formatUnixDate(dto.borrowExpiry)} />
    </dl>
  );
}

function Funds({
  dto,
  idleLoan,
  venueShares,
}: {
  dto: DirectFacilityDto;
  idleLoan?: bigint;
  venueShares?: bigint;
}) {
  return (
    <dl className="grid gap-2 font-mono text-xs max-w-xl">
      <Row k="Vault idle" v={idleLoan !== undefined ? `${formatTokenUnits(idleLoan, 6)} mUSDC` : "—"} />
      <Row k="Venue shares" v={venueShares !== undefined ? formatTokenUnits(venueShares, 6) : "—"} />
      <Row k="Vault" v={dto.vault} />
    </dl>
  );
}

function FacilityActivity({ chainId, facility }: { chainId: number; facility: string }) {
  const events = useEventsQuery(chainId, facility);
  const items = events.data?.data.items ?? [];
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={`${e.txHash}-${e.logIndex}`} className="border border-border/40 p-3 font-mono text-xs">
          <span className="uppercase tracking-widest text-[10px] text-muted-foreground">{e.product ?? "DIRECT"}</span>
          <p className="mt-1">
            {e.name} · {e.detail}
          </p>
        </li>
      ))}
      {items.length === 0 ? <p className="font-mono text-sm text-muted-foreground">No indexed events yet.</p> : null}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/30 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-all text-right">{v}</dd>
    </div>
  );
}

function aprPct(ray: string) {
  try {
    const pct = (Number(BigInt(ray) / 10n ** 23n) / 100).toFixed(2);
    return `${pct}%`;
  } catch {
    return "—";
  }
}

function ShareFacilityLink({ chainId, facility }: { chainId: number; facility: Address }) {
  const path = `/direct/${chainId}/${facility}`;
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
      <span className="break-all">{path}</span>
      <button
        type="button"
        className="border border-border px-2 py-1 uppercase tracking-widest text-[10px]"
        onClick={() => {
          const url = `${window.location.origin}${path}`;
          void navigator.clipboard.writeText(url);
          toast.success("Copied. Switch to the other wallet and open Direct lending.");
        }}
      >
        Copy link
      </button>
    </div>
  );
}

function actionToDialog(action: string | null): DialogKind {
  if (
    action === "fund" ||
    action === "borrow" ||
    action === "repay" ||
    action === "withdraw" ||
    action === "recall" ||
    action === "limit" ||
    action === "venue" ||
    action === "collateral" ||
    action === "removeCollateral" ||
    action === "surplus" ||
    action === "recover" ||
    action === "settle"
  ) {
    return action;
  }
  return null;
}

function useOnchainFacility(chainId: number, facility: Address, enabled: boolean): DirectFacilityDto | null {
  const reads = useReadContracts({
    allowFailure: true,
    query: { enabled },
    contracts: [
      { address: facility, abi: directFacilityAbi, functionName: "lender", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "borrower", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "vault", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "loanToken", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "termsHash", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "creditLimit", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "accountedCash", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "currentDebt", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "principalOutstanding", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "aprRay", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "lenderAccepted", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "borrowerAccepted", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "declined", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "cancelled", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "ended", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "borrowingPaused", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "acceptanceDeadline", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "activatedAt", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "borrowExpiry", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "repaymentDueAt", chainId },
      { address: facility, abi: directFacilityAbi, functionName: "recallDeadline", chainId },
    ],
  });
  return useMemo(() => {
    const r = reads.data;
    if (!r || r.some((x) => x.status !== "success")) return null;
    const num = (i: number) => (r[i]!.result as bigint).toString(10);
    const addr = (i: number) => r[i]!.result as Address;
    const flag = (i: number) => r[i]!.result as boolean;
    const principal = num(8);
    const debt = num(7);
    const interest = BigInt(debt) > BigInt(principal) ? (BigInt(debt) - BigInt(principal)).toString(10) : "0";
    return {
      product: "DIRECT",
      protocolVersion: "interline-direct-v2",
      chainId,
      facility,
      lender: addr(0),
      borrower: addr(1),
      vault: addr(2),
      asset: { address: addr(3), symbol: "mUSDC", decimals: 6 },
      termsHash: r[4]!.result as `0x${string}`,
      lenderAccepted: flag(10),
      borrowerAccepted: flag(11),
      declined: flag(12),
      cancelled: flag(13),
      ended: flag(14),
      acceptanceDeadline: num(16),
      activatedAt: num(17) === "0" ? null : num(17),
      borrowExpiry: num(18) === "0" ? null : num(18),
      repaymentDueAt: num(19) === "0" ? null : num(19),
      creditLimitRaw: num(5),
      availableCashRaw: num(6),
      principalRaw: principal,
      debtRaw: debt,
      accruedInterestRaw: interest,
      fixedAprRay: num(9),
      recallDeadline: num(20) === "0" ? null : num(20),
      borrowingPaused: flag(15),
      collateralization: "OVERCOLLATERALIZED_80",
      healthFactorWad: null,
      priceLiquidatable: false,
    };
  }, [reads.data, chainId, facility]);
}
