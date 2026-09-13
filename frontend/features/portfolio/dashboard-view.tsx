"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { OracleBanner, PageHeader, SourceBanner } from "@/components/ui/chrome";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { usePortfolioQuery } from "@/hooks/useV2Api";
import { V2_CHAINS } from "@/lib/chains";
import { formatUsdFromWad } from "@/lib/money";
import { minDec } from "@/lib/money";
import type { HealthCode, PortfolioDto } from "@/lib/api/types";
import type { DirectFacilityDto } from "@/features/direct/dto";

export function DashboardView() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto">
        <PageHeader
          kicker="03 / Dashboard"
          title="YOUR POSITIONS"
          description="Supplies and borrows stay in separate columns. Health is never blended across isolated markets."
          actions={<OracleBanner />}
        />
        <div className="border border-border/50 bg-card p-8 max-w-lg space-y-4">
          <p className="font-mono text-sm text-muted-foreground">
            Connect a wallet to load this address&apos;s supplies and borrows. Markets and the public desk stay readable
            without a wallet.
          </p>
          <Link
            href="/connect?return=/dashboard"
            className="inline-block border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent-foreground"
          >
            Connect
          </Link>
        </div>
      </section>
    );
  }

  return <ConnectedDashboard address={address} />;
}

function ConnectedDashboard({ address }: { address: `0x${string}` }) {
  const a = usePortfolioQuery(31337, address);
  const b = usePortfolioQuery(84532, address);
  const c = usePortfolioQuery(11155111, address);
  const portfolios = [a.data?.data, b.data?.data, c.data?.data].filter(Boolean) as PortfolioDto[];
  const usingStub = Boolean(
    [a, b, c].every((x) => x.data?.usingStub) && ![a, b, c].some((x) => x.data?.source === "rpc" || x.data?.source === "indexer"),
  );
  const stale = Boolean(a.data?.stale || b.data?.stale || c.data?.stale);
  const source = [a, b, c].some((x) => x.data?.source === "rpc")
    ? ("rpc" as const)
    : [a, b, c].some((x) => x.data?.source === "indexer")
      ? ("indexer" as const)
      : usingStub
        ? ("stub" as const)
        : undefined;

  const supplies = portfolios.flatMap((p) => p.supplies.map((s) => ({ ...s, chainId: p.chainId })));
  const borrows = portfolios.flatMap((p) => p.borrows.map((row) => ({ ...row, chainId: p.chainId })));
  const directLending = portfolios.flatMap((p) => (p.directLending ?? []).map((row) => ({ ...row, chainId: p.chainId })));
  const directBorrowing = portfolios.flatMap((p) => (p.directBorrowing ?? []).map((row) => ({ ...row, chainId: p.chainId })));
  const directRequests = portfolios.flatMap((p) => (p.directRequests ?? []).map((row) => ({ ...row, chainId: p.chainId })));

  const isolatedHfs = borrows.filter((x) => x.healthCode === "OK" && x.healthFactorWad).map((x) => x.healthFactorWad as string);
  const anyUnavailable = borrows.some((x) => x.healthCode === "UNAVAILABLE");
  const lowestWad = anyUnavailable ? null : minDec(isolatedHfs);
  const lowestCode: HealthCode | "NONE" = anyUnavailable
    ? "UNAVAILABLE"
    : borrows.length === 0
      ? "NONE"
      : isolatedHfs.length === 0
        ? "NO_DEBT"
        : "OK";

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-8">
      <PageHeader
        kicker="03 / Dashboard"
        title="YOUR POSITIONS"
        description="Each market keeps its own health factor. Direct agreements use the same 80% origination LTV and never enter that pool figure."
        actions={<OracleBanner />}
      />
      <SourceBanner usingStub={usingStub} stale={stale} source={source} />
      <div className="border border-border/50 bg-card px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Lowest isolated health</p>
        <div className="mt-2 text-lg">
          <HealthDisplay code={lowestCode} wad={lowestWad} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight mb-3">Supplies</h2>
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">
            Supply is not collateral. Withdrawable cash can be less than supplied.
          </p>
          {supplies.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">No supplies on Anvil, Base Sepolia, or Ethereum Sepolia.</p>
          ) : (
            <ul className="space-y-3">
              {supplies.map((s) => (
                <li key={`${s.chainId}-${s.marketId}`} className="border border-border/50 bg-card p-4 space-y-1">
                  <Link href={`/markets/${s.chainId}/${s.marketId}`} className="font-mono text-sm hover:text-accent">
                    {s.label}
                  </Link>
                  <p className="font-mono text-xs">
                    Supplied <TokenAmount {...s.assets} />
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Withdrawable <TokenAmount {...s.maxWithdraw} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight mb-3">Borrows</h2>
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">
            Collateral is listed separately from supply. Restricted borrows do not land on the EOA.
          </p>
          {borrows.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">No borrows on Anvil, Base Sepolia, or Ethereum Sepolia.</p>
          ) : (
            <ul className="space-y-3">
              {borrows.map((row) => (
                <li key={`${row.chainId}-${row.marketId}`} className="border border-border/50 bg-card p-4 space-y-1">
                  <Link
                    href={`/positions/${row.chainId}/${row.marketId}/${address}`}
                    className="font-mono text-sm hover:text-accent"
                  >
                    {row.label}
                  </Link>
                  <p className="font-mono text-xs">
                    Debt <TokenAmount {...row.debt} /> · Collateral USD {formatUsdFromWad(row.collateralUsdWad)}
                  </p>
                  <HealthDisplay code={row.healthCode} wad={row.healthFactorWad} liquidatable={row.liquidatable} />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {V2_CHAINS.find((c) => c.chainId === row.chainId)?.name} · {row.deliveryMode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DirectList
          title="Direct lending"
          empty="No direct lending agreements."
          rows={directLending}
          you="lender"
        />
        <DirectList
          title="Direct borrowing"
          empty="No direct borrowing agreements."
          rows={directBorrowing}
          you="borrower"
        />
      </div>
      <DirectList
        title="Pending requests"
        empty="No direct requests waiting on this wallet. Switch to the other wallet and Connect on Ethereum Sepolia, then open Direct lending."
        rows={directRequests}
        you="party"
      />
      <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-widest">
        <Link href="/dashboard/activity" className="text-accent">
          Activity
        </Link>
        <Link href="/dashboard/settings" className="text-accent">
          Settings
        </Link>
        <Link href={`/accounts/31337/${address}`} className="text-muted-foreground hover:text-foreground">
          Watch-only (Anvil)
        </Link>
        <Link href={`/accounts/11155111/${address}`} className="text-muted-foreground hover:text-foreground">
          Watch-only (Ethereum Sepolia)
        </Link>
      </div>
    </section>
  );
}

function DirectList({
  title,
  empty,
  rows,
  you,
}: {
  title: string;
  empty: string;
  rows: DirectFacilityDto[];
  you: "lender" | "borrower" | "party";
}) {
  return (
    <div>
      <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight mb-3">{title}</h2>
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        Overcollateralized restricted-use credit (max 80% LTV). Timelines below are repayment or recall, not
        liquidation.
      </p>
      {rows.length === 0 ? (
        <p className="font-mono text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={`${row.chainId}-${row.facility}`} className="border border-border/50 bg-card p-4 space-y-1">
              <Link href={`/direct/${row.chainId}/${row.facility}`} className="font-mono text-sm hover:text-accent">
                {you === "lender" ? "Lending to" : you === "borrower" ? "Borrowing from" : "Request with"}{" "}
                {you === "lender" ? row.borrower : row.lender}
              </Link>
              <p className="font-mono text-xs">
                Outstanding <TokenAmount raw={row.debtRaw} decimals={6} symbol="mUSDC" /> · Cash{" "}
                <TokenAmount raw={row.availableCashRaw} decimals={6} symbol="mUSDC" />
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                Repayment timeline {row.repaymentDueAt ?? "—"} · Recall timeline {row.recallDeadline ?? "not requested"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
