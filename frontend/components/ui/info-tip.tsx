"use client";

import type { ReactNode } from "react";

export function InfoTip({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        className="ml-1 inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center border border-border font-mono text-[9px] leading-none text-muted-foreground [&::-webkit-details-marker]:hidden"
        aria-label={label ?? "More information"}
      >
        ?
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-64 border border-border bg-background px-3 py-2 text-left font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground shadow-lg">
        {children}
      </div>
    </details>
  );
}
