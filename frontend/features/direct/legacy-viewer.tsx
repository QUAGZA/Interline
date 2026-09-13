"use client";

import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { PageHeader } from "@/components/ui/chrome";
import { CounterpartyCard } from "./cards";
import { creditLineAbi } from "@/lib/abi";
import { TokenAmount } from "@/features/risk/health-display";

/** v0 CreditLine viewer. Display-only. CreditLine has no withdraw — never fake one. */
export function LegacyCreditLineViewer({ chainId, facility }: { chainId: number; facility: Address }) {
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: facility, abi: creditLineAbi, functionName: "lender", chainId },
      { address: facility, abi: creditLineAbi, functionName: "borrower", chainId },
      { address: facility, abi: creditLineAbi, functionName: "cap", chainId },
      { address: facility, abi: creditLineAbi, functionName: "drawn", chainId },
      { address: facility, abi: creditLineAbi, functionName: "rateBps", chainId },
      { address: facility, abi: creditLineAbi, functionName: "potBalance", chainId },
    ],
  });
  const lender = reads.data?.[0]?.result as Address | undefined;
  const borrower = reads.data?.[1]?.result as Address | undefined;
  const cap = (reads.data?.[2]?.result as bigint | undefined)?.toString() ?? "0";
  const drawn = (reads.data?.[3]?.result as bigint | undefined)?.toString() ?? "0";
  const rateBps = Number(reads.data?.[4]?.result ?? 0);
  const pot = (reads.data?.[5]?.result as bigint | undefined)?.toString() ?? "0";

  return (
    <section className="px-4 md:px-6 py-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        kicker="Direct / Legacy"
        title="V0 CREDIT LINE"
        description="Read-only viewer for the original CreditLine contract. Display-only rate. There is no withdraw on this contract."
      />
      <p className="font-mono text-xs text-muted-foreground">
        This is not a V2 direct facility. Cash cannot be withdrawn from v0 CreditLine — the contract has no withdraw
        function.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <CounterpartyCard role="Lender" address={lender ?? "0x0000000000000000000000000000000000000000"} />
        <CounterpartyCard role="Borrower" address={borrower ?? "0x0000000000000000000000000000000000000000"} />
      </div>
      <dl className="grid gap-2 font-mono text-xs">
        <div className="flex justify-between border-b border-border/30 py-2">
          <dt>Cap</dt>
          <dd>
            <TokenAmount raw={cap} decimals={6} symbol="mUSDC" />
          </dd>
        </div>
        <div className="flex justify-between border-b border-border/30 py-2">
          <dt>Drawn</dt>
          <dd>
            <TokenAmount raw={drawn} decimals={6} symbol="mUSDC" />
          </dd>
        </div>
        <div className="flex justify-between border-b border-border/30 py-2">
          <dt>Display-only rate</dt>
          <dd>{(rateBps / 100).toFixed(2)}%</dd>
        </div>
        <div className="flex justify-between border-b border-border/30 py-2">
          <dt>Contract cash (not withdrawable here)</dt>
          <dd>
            <TokenAmount raw={pot} decimals={6} symbol="mUSDC" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
