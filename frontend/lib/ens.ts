import { getAddress, isAddress, type Address } from "viem";

export type PartyInput =
  | { kind: "address"; address: Address }
  | { kind: "ens"; name: string }
  | { kind: "empty" }
  | { kind: "invalid" };

/** Parse a counterparty field as a checksum address or a mainnet ENS name. */
export function parsePartyInput(value: string): PartyInput {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "empty" };
  if (isAddress(trimmed, { strict: false })) {
    try {
      return { kind: "address", address: getAddress(trimmed) };
    } catch {
      return { kind: "invalid" };
    }
  }
  const name = normalizeEnsName(trimmed);
  if (name) return { kind: "ens", name };
  return { kind: "invalid" };
}

export function normalizeEnsName(value: string): string | null {
  const name = value.trim().toLowerCase();
  if (!name.endsWith(".eth") || name.length < 5) return null;
  if (name.includes(" ") || name.startsWith(".") || name.includes("..")) return null;
  const label = name.slice(0, -4);
  if (!label || label.startsWith("-") || label.endsWith("-")) return null;
  if (!/^[a-z0-9.-]+$/.test(label)) return null;
  return name;
}

export function resolvedPartyAddress(
  input: PartyInput,
  ensAddress: Address | undefined,
): Address | undefined {
  if (input.kind === "address") return input.address;
  if (input.kind === "ens" && ensAddress) {
    try {
      return getAddress(ensAddress);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
