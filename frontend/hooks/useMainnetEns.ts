"use client";

import { isAddress, type Address } from "viem";
import { useEnsAddress, useEnsName } from "wagmi";

/** Reverse-resolve a mainnet primary name. Catalog chain (Sepolia/Anvil) is ignored. */
export function useMainnetEnsName(address?: string) {
  const ready = Boolean(address && isAddress(address, { strict: false }));
  return useEnsName({
    address: ready ? (address as Address) : undefined,
    chainId: 1,
    query: { enabled: ready },
  });
}

/** Forward-resolve a mainnet ENS name to an address. */
export function useMainnetEnsAddress(name?: string | null) {
  const ready = Boolean(name);
  return useEnsAddress({
    name: name ?? undefined,
    chainId: 1,
    query: { enabled: ready },
  });
}
