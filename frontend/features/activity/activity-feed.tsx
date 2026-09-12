"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { PageHeader, SourceBanner } from "@/components/ui/chrome";
import { useEventsQuery } from "@/hooks/useV2Api";
import { useOptionalTxMachine } from "@/features/transactions/tx-store";
import { TxStatusList } from "@/features/transactions/tx-status";
import { shortAddr } from "@/lib/format";
import { defaultV2ChainId } from "@/lib/config";

export function ActivityFeed() {
  const { address } = useAccount();
  const events = useEventsQuery(defaultV2ChainId, address);
  const tx = useOptionalTxMachine();
  const items = events.data?.data.items ?? [];

  return (
    <section className="px-4 md:px-6 py-10 max-w-4xl mx-auto space-y-8">
      <PageHeader
        kicker="Dashboard / Activity"
        title="ACTIVITY"
        description="Indexed market events plus in-session transaction status. Session rows are keyed per operation."
      />
      <SourceBanner usingStub={events.data?.usingStub} />
      {tx && tx.records.length > 0 ? <TxStatusList records={tx.records} /> : null}
      <ul className="space-y-3">
        {items.map((e) => (
          <li key={`${e.txHash}-${e.logIndex}`} className="border border-border/50 bg-card p-4">
            <div className="flex justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{e.name}</span>
              <span>block {e.blockNumber}</span>
            </div>
            <p className="mt-2 font-mono text-sm">{e.detail}</p>
            {e.marketId ? (
              <Link href={`/markets/${e.chainId}/${e.marketId}`} className="mt-2 inline-block font-mono text-[11px] text-accent">
                {e.marketId.startsWith("0x") ? shortAddr(e.marketId) : e.marketId}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="font-mono text-sm text-muted-foreground">No events yet.</p> : null}
    </section>
  );
}
