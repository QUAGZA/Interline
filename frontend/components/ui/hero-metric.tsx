"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export function HeroMetric({
  label,
  value,
  hint,
  subline,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  subline?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 border border-border/50 bg-card px-3 py-3", className)}>
      <p className="flex items-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
        {hint ? <InfoTip>{hint}</InfoTip> : null}
      </p>
      <div className="mt-2 font-mono text-[28px] leading-none tracking-tight tabular-nums md:text-[32px] [&_span]:text-[inherit] [&_span]:leading-[inherit]">
        {value}
      </div>
      {subline ? <div className="mt-2 font-mono text-[11px] text-muted-foreground">{subline}</div> : null}
    </div>
  );
}
