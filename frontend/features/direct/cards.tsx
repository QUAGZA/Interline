"use client";

import { EnsLabel } from "@/components/ens-label";

export function CounterpartyCard({
  role,
  address,
  you,
  explorerHref,
}: {
  role: "Lender" | "Borrower";
  address: string;
  you?: boolean;
  explorerHref?: string;
}) {
  return (
    <article className="border border-border/50 bg-card p-4 space-y-2 min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {role}
        {you ? " · You" : ""}
      </p>
      <p className="font-mono text-[28px] leading-none tracking-tight">
        <EnsLabel address={address} />
      </p>
      <div className="flex gap-3 font-mono text-[10px] uppercase tracking-widest">
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => navigator.clipboard.writeText(address)}
        >
          Copy {role.toLowerCase()} address
        </button>
        {explorerHref ? (
          <a href={explorerHref} className="hover:underline" target="_blank" rel="noreferrer">
            Explorer
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function MoneyMovementPreview({
  fromLabel,
  toLabel,
  note,
}: {
  fromLabel: string;
  toLabel: string;
  note: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs">
        {fromLabel} → {toLabel}
      </p>
      {note ? (
        <details>
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            How this works
          </summary>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">{note}</p>
        </details>
      ) : null}
    </div>
  );
}

export function NextActionPanel({ text }: { text: string }) {
  return (
    <div className="border border-accent/40 bg-card px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Next action</p>
      <p className="mt-1 font-mono text-sm">{text}</p>
    </div>
  );
}

export function AgreementLifecycleBadge({
  acceptance,
  credit,
  debt,
  recall,
}: {
  acceptance: string;
  credit: string;
  debt: string;
  recall: string;
}) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
      {acceptance} · {credit} · {debt} · {recall}
    </p>
  );
}
