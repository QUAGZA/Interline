import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildCapRequest,
  capRequestMismatches,
  localCapDigest,
  parseCapRequestJson,
  pendingCapMismatches,
  randomCapSalt,
  reviewCapRequest,
  serializeCapRequest,
} from "./cap-request";

const facility = getAddress("0x1111111111111111111111111111111111111111") as Address;
const lender = getAddress("0x2222222222222222222222222222222222222222") as Address;
const borrower = getAddress("0x3333333333333333333333333333333333333333") as Address;
const ctx = { chainId: 31337, facility, lender, borrower };

function sample(overrides: Partial<Parameters<typeof buildCapRequest>[0]> = {}) {
  return buildCapRequest({
    chainId: 31337,
    facility,
    lender,
    borrower,
    newCap: 8_000n * 10n ** 6n,
    nonce: 0n,
    validUntil: 1_800_000_000n,
    salt: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...overrides,
  });
}

describe("cap request digest", () => {
  it("recomputes the same digest from displayed terms", () => {
    const req = sample();
    expect(
      localCapDigest({
        chainId: req.chainId,
        facility: req.facility as Address,
        lender: req.lender as Address,
        borrower: req.borrower as Address,
        newCap: BigInt(req.newCap),
        nonce: BigInt(req.nonce),
        validUntil: BigInt(req.validUntil),
        salt: req.salt as Hex,
      }),
    ).toBe(req.digest);
    expect(capRequestMismatches(req, ctx)).toEqual([]);
  });

  it("uses 32 cryptographically random bytes for salt", () => {
    const a = randomCapSalt();
    const b = randomCapSalt();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(b).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("tampered limit requests", () => {
  it("rejects a tampered amount", () => {
    const req = { ...sample(), newCap: (80_000n * 10n ** 6n).toString() };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Digest does not match/);
  });

  it("rejects a tampered salt", () => {
    const req = { ...sample(), salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Digest does not match/);
  });

  it("rejects a tampered facility", () => {
    const req = { ...sample(), facility: getAddress("0x4444444444444444444444444444444444444444") };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Facility does not match/);
  });

  it("rejects a tampered chain", () => {
    const req = { ...sample(), chainId: 84532 };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Chain does not match/);
  });

  it("rejects a tampered nonce", () => {
    const req = { ...sample(), nonce: "1" };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Digest does not match/);
  });

  it("rejects a tampered expiry", () => {
    const req = { ...sample(), validUntil: "1800000001" };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Digest does not match/);
  });

  it("rejects a tampered digest", () => {
    const req = { ...sample(), digest: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Digest does not match/);
  });

  it("rejects mismatched parties", () => {
    const req = { ...sample(), lender: getAddress("0x5555555555555555555555555555555555555555") };
    expect(capRequestMismatches(req, ctx).join(" ")).toMatch(/Named parties/);
  });

  it("rejects approve when pending on-chain digest differs", () => {
    const req = sample();
    const reasons = pendingCapMismatches(req, {
      digest: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      nonce: 0n,
      validUntil: 1_800_000_000n,
    });
    expect(reasons.join(" ")).toMatch(/pending commitment digest/);
  });

  it("disables approval for a self-consistent file that is not the pending commitment", () => {
    const honest = sample();
    const bait = sample({ newCap: 80_000n * 10n ** 6n });
    const reviewed = reviewCapRequest(serializeCapRequest(bait), ctx, {
      digest: honest.digest as Hex,
      nonce: 0n,
      validUntil: 1_800_000_000n,
    });
    expect(reviewed.reviewBlockers).toEqual([]);
    expect(reviewed.approveBlockers.join(" ")).toMatch(/pending commitment digest/);
  });

  it("rejects non-schema JSON", () => {
    const parsed = parseCapRequestJson(JSON.stringify({ digest: "0x01", newCap: "8000" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons[0]).toMatch(/version 1/);
  });
});
