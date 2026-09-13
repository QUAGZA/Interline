"use client";

import { shortAddr } from "@/lib/format";
import { useMainnetEnsName } from "@/hooks/useMainnetEns";
import { cn } from "@/lib/utils";

/** Primary ENS name when one exists, plus the checksum short address. */
export function EnsLabel({
  address,
  className,
  nameClassName,
  addrClassName,
}: {
  address?: string;
  className?: string;
  nameClassName?: string;
  addrClassName?: string;
}) {
  const { data: name } = useMainnetEnsName(address);
  if (!address) return <span className={className}>—</span>;
  if (!name) {
    return (
      <span className={className} title={address}>
        {shortAddr(address)}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)} title={address}>
      <span className={nameClassName}>{name}</span>
      <span className={cn("text-muted-foreground", addrClassName)}>{shortAddr(address)}</span>
    </span>
  );
}
