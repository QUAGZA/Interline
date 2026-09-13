import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import { lendingMarketAbi } from "./abi-market";
import { directFacilityAbi } from "./direct-abi";
import { decodeRevert, faucetAbi } from "./errors";

describe("decodeRevert", () => {
  it("maps pool InsufficientCash", () => {
    const data = encodeErrorResult({ abi: lendingMarketAbi, errorName: "InsufficientCash" });
    expect(decodeRevert({ data })).toMatch(/cash/i);
  });

  it("maps AlreadyDecided and Cooldown", () => {
    expect(decodeRevert({ data: encodeErrorResult({ abi: directFacilityAbi, errorName: "AlreadyDecided" }) })).toMatch(
      /already accepted/i,
    );
    expect(decodeRevert({ data: encodeErrorResult({ abi: faucetAbi, errorName: "Cooldown" }) })).toMatch(/cooldown/i);
  });
});
