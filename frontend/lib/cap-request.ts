import { getAddress, hashTypedData, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

export const CAP_REQUEST_VERSION = 1 as const;
export const CAP_REQUEST_KIND = "interline-direct-cap-request" as const;

const HexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const DecString = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const capRequestSchema = z.object({
  version: z.literal(CAP_REQUEST_VERSION),
  kind: z.literal(CAP_REQUEST_KIND),
  chainId: z.number().int().positive(),
  facility: HexAddress,
  lender: HexAddress,
  borrower: HexAddress,
  newCap: DecString,
  nonce: DecString,
  validUntil: DecString,
  salt: Bytes32,
  digest: Bytes32,
});

export type CapRequest = z.infer<typeof capRequestSchema>;

export type CapRequestContext = {
  chainId: number;
  facility: string;
  lender: string;
  borrower: string;
};

export type PendingCapOnchain = {
  digest: Hex;
  nonce: bigint;
  validUntil: bigint;
};

export const CAP_PROPOSAL_TYPES = {
  CapProposal: [
    { name: "facility", type: "address" },
    { name: "lender", type: "address" },
    { name: "borrower", type: "address" },
    { name: "newCap", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "salt", type: "bytes32" },
  ],
} as const;

export function randomCapSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`) as Hex;
}

export function localCapDigest(args: {
  chainId: number;
  facility: Address;
  lender: Address;
  borrower: Address;
  newCap: bigint;
  nonce: bigint;
  validUntil: bigint;
  salt: Hex;
}): Hex {
  return hashTypedData({
    domain: {
      name: "InterlineDirectFacility",
      version: "2",
      chainId: args.chainId,
      verifyingContract: args.facility,
    },
    types: CAP_PROPOSAL_TYPES,
    primaryType: "CapProposal",
    message: {
      facility: args.facility,
      lender: args.lender,
      borrower: args.borrower,
      newCap: args.newCap,
      nonce: args.nonce,
      validUntil: args.validUntil,
      salt: args.salt,
    },
  });
}

export function buildCapRequest(args: {
  chainId: number;
  facility: Address;
  lender: Address;
  borrower: Address;
  newCap: bigint;
  nonce: bigint;
  validUntil: bigint;
  salt: Hex;
}): CapRequest {
  const digest = localCapDigest(args);
  return {
    version: CAP_REQUEST_VERSION,
    kind: CAP_REQUEST_KIND,
    chainId: args.chainId,
    facility: getAddress(args.facility),
    lender: getAddress(args.lender),
    borrower: getAddress(args.borrower),
    newCap: args.newCap.toString(),
    nonce: args.nonce.toString(),
    validUntil: args.validUntil.toString(),
    salt: args.salt,
    digest,
  };
}

export function serializeCapRequest(request: CapRequest): string {
  return `${JSON.stringify(request, null, 2)}\n`;
}

function sameAddr(a: string, b: string): boolean {
  return isAddress(a) && isAddress(b) && getAddress(a) === getAddress(b);
}

function digestFromRequest(request: CapRequest): Hex {
  return localCapDigest({
    chainId: request.chainId,
    facility: request.facility as Address,
    lender: request.lender as Address,
    borrower: request.borrower as Address,
    newCap: BigInt(request.newCap),
    nonce: BigInt(request.nonce),
    validUntil: BigInt(request.validUntil),
    salt: request.salt as Hex,
  });
}

export function parseCapRequestJson(raw: string): { ok: true; value: CapRequest } | { ok: false; reasons: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reasons: ["Import a version 1 limit request before reviewing terms."] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reasons: ["Limit request JSON is not valid."] };
  }
  const result = capRequestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reasons: ["Request is not a version 1 Interline direct limit request. Import the downloaded file, not a hand-edited blob."],
    };
  }
  return { ok: true, value: result.data };
}

/** Reasons that block propose / approve / execute. Never describes the request as encrypted. */
export function capRequestMismatches(request: CapRequest, context: CapRequestContext): string[] {
  const reasons: string[] = [];
  if (request.chainId !== context.chainId) {
    reasons.push(`Chain does not match this agreement (request ${request.chainId}, open ${context.chainId}).`);
  }
  if (!sameAddr(request.facility, context.facility)) {
    reasons.push("Facility does not match the agreement you have open.");
  }
  if (!sameAddr(request.lender, context.lender) || !sameAddr(request.borrower, context.borrower)) {
    reasons.push("Named parties do not match this agreement's lender and borrower.");
  }
  if (reasons.length > 0) return reasons;

  const recomputed = digestFromRequest(request);
  if (recomputed.toLowerCase() !== request.digest.toLowerCase()) {
    reasons.push(
      "Digest does not match a local recompute from the displayed new cap, nonce, expiry, salt, chain, and facility.",
    );
  }
  return reasons;
}

export function pendingCapMismatches(request: CapRequest, pending: PendingCapOnchain | null): string[] {
  if (!pending || pending.digest === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return ["No pending on-chain limit commitment matches this request."];
  }
  const reasons: string[] = [];
  if (pending.digest.toLowerCase() !== request.digest.toLowerCase()) {
    reasons.push("On-chain pending commitment digest does not match this request.");
  }
  if (pending.nonce !== BigInt(request.nonce)) {
    reasons.push(`On-chain pending nonce does not match this request (on-chain ${pending.nonce}, request ${request.nonce}).`);
  }
  if (pending.validUntil !== BigInt(request.validUntil)) {
    reasons.push("On-chain pending expiry does not match this request.");
  }
  return reasons;
}

export function reviewCapRequest(
  raw: string,
  context: CapRequestContext,
  pending: PendingCapOnchain | null,
): {
  request: CapRequest | null;
  reviewBlockers: string[];
  approveBlockers: string[];
} {
  const parsed = parseCapRequestJson(raw);
  if (!parsed.ok) {
    return { request: null, reviewBlockers: parsed.reasons, approveBlockers: parsed.reasons };
  }
  const reviewBlockers = capRequestMismatches(parsed.value, context);
  const approveBlockers = [...reviewBlockers, ...pendingCapMismatches(parsed.value, pending)];
  return { request: parsed.value, reviewBlockers, approveBlockers };
}

export function isBytes32(value: string): value is Hex {
  return isHex(value) && value.length === 66;
}
