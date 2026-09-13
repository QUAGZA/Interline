"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { HeaderMeta, PageHeader } from "@/components/ui/chrome";
import { HeroMetric } from "@/components/ui/hero-metric";
import { InfoTip } from "@/components/ui/info-tip";
import { TokenAmount } from "@/features/risk/health-display";
import { useDirectFacilitiesQuery } from "@/hooks/useV2Api";
import { useCatalogChainId } from "@/lib/use-catalog-chain";
import { rolesFor } from "./roles";
import { EnsLabel } from "@/components/ens-label";
import { shortAddr } from "@/lib/format";
import type { DirectFacilityDto } from "./dto";

export function DirectWorkspace({ filter: filterProp }: { filter?: "lending" | "borrowing" | "requests" | "explore" }) {
  const search = useSearchParams();
  const fromQuery = search.get("filter");
  const filter =
    filterProp ??
    (fromQuery === "lending" || fromQuery === "borrowing" || fromQuery === "requests" ? fromQuery : undefined);
  const { address } = useAccount();
  const chainId = useCatalogChainId();
  const q = useDirectFacilitiesQuery(
    {
      chainId,
      party: filter === "explore" ? undefined : address,
      role: filter === "lending" ? "lender" : filter === "borrowing" ? "borrower" : "either",
    },
    filter === "explore" || Boolean(address),
  );
  const rows = q.data?.data ?? [];
  const usingStub = q.data?.usingStub;

  const lending = rows.filter((r) => address && rolesFor(r, address).isLender);
  const borrowing = rows.filter((r) => address && rolesFor(r, address).isBorrower);
  const pending = rows.filter((r) => !(r.lenderAccepted && r.borrowerAccepted) && !r.declined && !r.cancelled && !r.ended);
  const pendingIds = new Set(pending.map((r) => r.facility.toLowerCase()));
  const listed =
    filter === "lending"
      ? lending
      : filter === "borrowing"
        ? borrowing
        : filter === "explore"
          ? rows
          : rows.filter((r) => !pendingIds.has(r.facility.toLowerCase()));

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-5">
      <PageHeader
        kicker="04 / Direct lending"
        title="DIRECT LENDING"
        description="Named-counterparty credit."
        actions={
          <HeaderMeta
            usingStub={usingStub}
            stale={q.data?.stale}
            source={q.data?.source}
            extra={
              <Link
                href="/direct/new"
                className="border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent-foreground"
              >
                Create agreement
              </Link>
            }
          />
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroMetric
          label="Lending"
          value={String(lending.length)}
          hint="Roles are per agreement — not a global badge."
        />
        <HeroMetric label="Borrowing" value={String(borrowing.length)} />
        <HeroMetric
          label="Cash as lender"
          value={<TokenAmount raw={sum(lending.map((x) => x.availableCashRaw))} decimals={6} />}
        />
        <HeroMetric
          label="You owe"
          value={<TokenAmount raw={sum(borrowing.map((x) => x.debtRaw))} decimals={6} />}
        />
      </div>
      {pending.length > 0 ? (
        <p className="font-mono text-xs text-accent">{pending.length} request{pending.length === 1 ? "" : "s"} awaiting response</p>
      ) : null}
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        <Tab href="/direct" active={!filter}>
          All
        </Tab>
        <Tab href="/direct?filter=lending" active={filter === "lending"}>
          I&apos;m lending
        </Tab>
        <Tab href="/direct?filter=borrowing" active={filter === "borrowing"}>
          I&apos;m borrowing
        </Tab>
        <Tab href="/direct?filter=requests" active={filter === "requests"}>
          Requests
        </Tab>
        <Tab href="/direct/explore" active={filter === "explore"}>
          Explore
        </Tab>
      </div>
      {!filter || filter === "requests" ? (
        <div className="space-y-3">
          <h2 className="flex items-center font-[var(--font-bebas)] text-2xl tracking-tight">
            Inbox
            <InfoTip>Inbox for this connected wallet. The other party must also Connect here on the same chain.</InfoTip>
          </h2>
          {pending.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <FacilityTable rows={pending} address={address} />
          )}
        </div>
      ) : null}
      {filter === "requests" ? null : listed.length === 0 ? (
        filter === "explore" || pending.length === 0 ? (
        <div className="border border-border/50 bg-card p-6 space-y-4 max-w-lg">
          <p className="font-mono text-[28px] leading-none tabular-nums">0</p>
          <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest">
            {!address ? (
              <Link href="/connect?return=/direct" className="border border-accent px-3 py-2">
                Connect
              </Link>
            ) : (
              <>
                <Link href="/direct/new?intent=lend" className="border border-accent px-3 py-2">
                  Offer a credit line
                </Link>
                <Link href="/direct/new?intent=borrow" className="border border-border px-3 py-2">
                  Request a credit line
                </Link>
              </>
            )}
            <Link href="/markets" className="border border-border px-3 py-2">
              Pool borrowing
            </Link>
          </div>
        </div>
        ) : null
      ) : (
        <FacilityTable rows={listed} address={address} />
      )}
    </section>
  );
}

function FacilityTable({ rows, address }: { rows: DirectFacilityDto[]; address?: string }) {
  return (
    <div className="overflow-x-auto border border-border/40">
      <table className="w-full text-left font-mono text-xs">
        <thead className="border-b border-border/40 text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="p-3">Agreement</th>
            <th className="p-3">Your role</th>
            <th className="p-3">Counterparty</th>
            <th className="p-3">Credit limit</th>
            <th className="p-3">Outstanding</th>
            <th className="p-3">Next</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const r = rolesFor(row, address);
            const counterparty = r.isLender ? row.borrower : row.lender;
            const roleLabel = r.isLender ? "Lending" : r.isBorrower ? "Borrowing" : "Observer";
            const waiting =
              r.isLender && row.lenderAccepted && !row.borrowerAccepted
                ? `Waiting on counterparty`
                : r.isBorrower && row.borrowerAccepted && !row.lenderAccepted
                  ? `Waiting on counterparty`
                  : r.isCounterparty && ((r.isLender && !row.lenderAccepted) || (r.isBorrower && !row.borrowerAccepted))
                    ? "Needs your response"
                    : "View";
            return (
              <tr key={row.facility} className="border-b border-border/30">
                <td className="p-3">{shortAddr(row.facility)}</td>
                <td className="p-3">{roleLabel}</td>
                <td className="p-3">
                  {r.isLender ? "Borrower" : r.isBorrower ? "Lender" : "Parties"}{" "}
                  <EnsLabel address={counterparty} />
                </td>
                <td className="p-3">
                  <TokenAmount raw={row.creditLimitRaw} decimals={6} symbol="mUSDC" />
                </td>
                <td className="p-3">
                  <TokenAmount raw={row.debtRaw} decimals={6} symbol="mUSDC" />
                </td>
                <td className="p-3">
                  <Link href={`/direct/${row.chainId}/${row.facility}`} className="text-accent">
                    {waiting}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={`border px-3 py-2 ${active ? "border-accent text-accent" : "border-border"}`}>
      {children}
    </Link>
  );
}

function sum(raws: string[]): string {
  return raws.reduce((a, b) => (BigInt(a) + BigInt(b)).toString(10), "0");
}
