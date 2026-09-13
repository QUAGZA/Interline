"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { HeaderMeta, PageHeader } from "@/components/ui/chrome";
import { HeroMetric } from "@/components/ui/hero-metric";
import { InfoTip } from "@/components/ui/info-tip";
import { HealthDisplay, TokenAmount } from "@/features/risk/health-display";
import { TestnetFaucetButton } from "@/features/testnet-faucet";
import { usePortfolioQuery } from "@/hooks/useV2Api";
import { useWalletCatalogBalances } from "@/hooks/useWalletCatalogBalances";
import { useCatalogChainId } from "@/lib/use-catalog-chain";
import { V2_CHAINS, chainName, isV2ChainId } from "@/lib/chains";
import { formatTokenAmount } from "@/lib/money";
import { formatUnixDate } from "@/lib/format";
import { EnsLabel } from "@/components/ens-label";
import { minDec } from "@/lib/money";
import type { HealthCode } from "@/lib/api/types";
import type { DirectFacilityDto } from "@/features/direct/dto";

export function DashboardView() {
  const { address, isConnected } = useAccount();
  const chainId = useCatalogChainId();

  if (!isConnected || !address) {
    return (
      <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto">
        <PageHeader
          kicker="03 / Dashboard"
          title="YOUR POSITIONS"
          description={`${chainName(chainId)} wallet view.`}
          actions={<HeaderMeta />}
        />
        <div className="border border-border/50 bg-card p-6 max-w-lg space-y-4">
          <p className="font-mono text-sm text-muted-foreground">Connect to see wallet mUSDC, mWETH, and positions.</p>
          <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest">
            <Link
              href="/connect?return=/dashboard"
              className="border border-accent bg-accent px-4 py-2 text-accent-foreground"
            >
              Connect
            </Link>
            <Link href="/markets" className="border border-border px-4 py-2">
              Markets
            </Link>
            <Link href="/direct" className="border border-border px-4 py-2">
              Direct lending
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return <ConnectedDashboard address={address} chainId={chainId} />;
}

function ConnectedDashboard({ address, chainId }: { address: `0x${string}`; chainId: ReturnType<typeof useCatalogChainId> }) {
  const q = usePortfolioQuery(chainId, address);
  const portfolio = q.data?.data;
  const balances = useWalletCatalogBalances(chainId);
  const supplies = portfolio?.supplies ?? [];
  const borrows = portfolio?.borrows ?? [];
  const directLending = portfolio?.directLending ?? [];
  const directBorrowing = portfolio?.directBorrowing ?? [];
  const directRequests = portfolio?.directRequests ?? [];

  const supplied = sumRaw(supplies.map((s) => s.assets.raw));
  const poolDebt = sumRaw(borrows.map((b) => b.debt.raw));
  const directDebt = sumRaw(directBorrowing.map((r) => r.debtRaw));
  const debt = poolDebt + directDebt;
  const collateral = sumRaw(borrows.map((b) => b.collateral.raw));

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

  const musdcZero = balances.ready && (balances.musdc === undefined || balances.musdc === 0n);

  return (
    <section className="px-4 md:px-6 py-10 max-w-6xl mx-auto space-y-6">
      <PageHeader
        kicker="03 / Dashboard"
        title="YOUR POSITIONS"
        description={chainName(chainId)}
        actions={<HeaderMeta usingStub={q.data?.usingStub} stale={q.data?.stale} source={q.data?.source} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <HeroMetric
          label="Wallet mUSDC"
          value={formatTokenAmount(balances.musdc ?? 0n, 6)}
          hint="Spendable Interline test mUSDC in this wallet. Not Circle USDC."
        />
        <HeroMetric
          label="Wallet mWETH"
          value={formatTokenAmount(balances.mweth ?? 0n, 18, undefined, 4)}
          hint="Spendable Interline test mWETH in this wallet."
        />
        <HeroMetric
          label="Supplied"
          value={<TokenAmount raw={supplied.toString()} decimals={6} />}
          hint="Pool share claim on this chain. Not wallet cash."
        />
        <HeroMetric
          label="Debt"
          value={<TokenAmount raw={debt.toString()} decimals={6} />}
          hint="Pool debt plus direct agreement debt on this chain."
        />
        <HeroMetric
          label="Collateral"
          value={<TokenAmount raw={collateral.toString()} decimals={18} digits={4} />}
          hint="mWETH posted as pool collateral. Direct posted collateral is per agreement."
        />
        <HeroMetric
          label="Lowest pool HF"
          value={<HealthDisplay code={lowestCode} wad={lowestWad} />}
          hint="Per isolated pool. Direct agreements are not in this number and are not liquidated on-chain."
        />
      </div>

      {directRequests.length > 0 ? (
        <Link
          href="/direct?filter=requests"
          className="inline-flex border border-accent px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-accent"
        >
          Attention · {directRequests.length} request{directRequests.length === 1 ? "" : "s"} awaiting response
        </Link>
      ) : null}

      {musdcZero ? (
        <div className="max-w-md">
          <TestnetFaucetButton chainId={chainId} compact />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
          <PositionBlock
            title="Pool supplies"
            emptyCta={{ href: `/markets?chainId=${chainId}`, label: "Supply a pool" }}
            empty={supplies.length === 0}
            zero={<TokenAmount raw="0" decimals={6} symbol="mUSDC" />}
          >
            {supplies.map((s) => (
                <li key={s.marketId} className="border border-border/50 bg-card p-4 space-y-2">
                <Link href={`/markets/${chainId}/${s.marketId}`} className="font-mono text-sm hover:text-accent">
                  {s.label}
                </Link>
                <p className="font-mono text-[28px] leading-none tabular-nums">
                  <TokenAmount {...s.assets} />
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Withdrawable <TokenAmount {...s.maxWithdraw} />
                </p>
                <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
                  <Link href={`/markets/${chainId}/${s.marketId}`} className="border border-accent px-2 py-1 text-accent">
                    Supply
                  </Link>
                  <Link href={`/markets/${chainId}/${s.marketId}`} className="border border-border px-2 py-1">
                    Withdraw
                  </Link>
                </div>
              </li>
            ))}
          </PositionBlock>
          <PositionBlock
            title="Pool borrows"
            emptyCta={{ href: `/markets?chainId=${chainId}`, label: "Borrow" }}
            empty={borrows.length === 0}
            zero={<TokenAmount raw="0" decimals={6} symbol="mUSDC" />}
          >
            {borrows.map((row) => (
              <li key={row.marketId} className="border border-border/50 bg-card p-4 space-y-2">
                <Link
                  href={`/positions/${chainId}/${row.marketId}/${address}`}
                  className="font-mono text-sm hover:text-accent"
                >
                  {row.label}
                </Link>
                <p className="font-mono text-[28px] leading-none tabular-nums">
                  <TokenAmount {...row.debt} />
                </p>
                <HealthDisplay code={row.healthCode} wad={row.healthFactorWad} liquidatable={row.liquidatable} />
                <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
                  <Link
                    href={`/positions/${chainId}/${row.marketId}/${address}`}
                    className="border border-accent px-2 py-1 text-accent"
                  >
                    Repay
                  </Link>
                  <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {row.deliveryMode}
                  </span>
                </div>
              </li>
            ))}
          </PositionBlock>
          <DirectList
            title="Direct lending"
            empty="Create agreement"
            emptyHref="/direct/new?intent=lend"
            rows={directLending}
            you="lender"
          />
          <DirectList
            title="Direct borrowing"
            empty="Request a line"
            emptyHref="/direct/new?intent=borrow"
            rows={directBorrowing}
            you="borrower"
          />
      </div>

      <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-widest">
        <Link href="/dashboard/activity" className="text-accent">
          Activity
        </Link>
        <Link href="/dashboard/settings" className="text-accent">
          Settings
        </Link>
        {V2_CHAINS.filter((c) => isV2ChainId(c.chainId)).map((c) => (
          <Link
            key={c.chainId}
            href={`/accounts/${c.chainId}/${address}`}
            className="text-muted-foreground hover:text-foreground"
          >
            Watch-only ({c.name})
          </Link>
        ))}
      </div>
    </section>
  );
}

function PositionBlock({
  title,
  empty,
  emptyCta,
  zero,
  children,
}: {
  title: string;
  empty: boolean;
  emptyCta: { href: string; label: string };
  zero: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h3>
      {empty ? (
        <div className="border border-border/50 bg-card p-4 space-y-3">
          <div className="font-mono text-[28px] leading-none tabular-nums">{zero}</div>
          <Link href={emptyCta.href} className="inline-block border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            {emptyCta.label}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">{children}</ul>
      )}
    </div>
  );
}

function DirectList({
  title,
  empty,
  emptyHref,
  rows,
  you,
}: {
  title: string;
  empty: string;
  emptyHref: string;
  rows: DirectFacilityDto[];
  you: "lender" | "borrower";
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {title}
        <InfoTip>
          Overcollateralized restricted-use credit at 80% LTV. Timelines are repayment or recall, not liquidation.
        </InfoTip>
      </h3>
      {rows.length === 0 ? (
        <div className="border border-border/50 bg-card p-4 space-y-3">
          <div className="font-mono text-[28px] leading-none tabular-nums">
            <TokenAmount raw="0" decimals={6} symbol="mUSDC" />
          </div>
          <Link href={emptyHref} className="inline-block border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            {empty}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={`${row.chainId}-${row.facility}`} className="border border-border/50 bg-card p-4 space-y-2">
              <Link href={`/direct/${row.chainId}/${row.facility}`} className="font-mono text-sm hover:text-accent">
                {you === "lender" ? "To" : "From"}{" "}
                <EnsLabel address={you === "lender" ? row.borrower : row.lender} />
              </Link>
              <p className="font-mono text-[28px] leading-none tabular-nums">
                <TokenAmount raw={row.debtRaw} decimals={6} symbol="mUSDC" />
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                Cash <TokenAmount raw={row.availableCashRaw} decimals={6} symbol="mUSDC" />
                {" · "}
                Due {formatUnixDate(row.repaymentDueAt)}
              </p>
              <Link
                href={`/direct/${row.chainId}/${row.facility}`}
                className="inline-block border border-accent px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sumRaw(raws: string[]): bigint {
  return raws.reduce((acc, raw) => {
    try {
      return acc + BigInt(raw);
    } catch {
      return acc;
    }
  }, 0n);
}
