import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { parsePartyInput, resolvedPartyAddress, normalizeEnsName } from "./ens";

const SAMPLE = "0xd4bdfb5d999c223ce2f896b0394dc1f62a247f37";

describe("parsePartyInput", () => {
  it("accepts a hex address and checksums it", () => {
    const parsed = parsePartyInput(SAMPLE);
    expect(parsed).toEqual({ kind: "address", address: getAddress(SAMPLE) });
  });

  it("accepts a mainnet ens name", () => {
    expect(parsePartyInput("Vitalik.eth")).toEqual({ kind: "ens", name: "vitalik.eth" });
    expect(normalizeEnsName("alice.eth")).toBe("alice.eth");
  });

  it("rejects junk", () => {
    expect(parsePartyInput("")).toEqual({ kind: "empty" });
    expect(parsePartyInput("not a name")).toEqual({ kind: "invalid" });
    expect(parsePartyInput(".eth")).toEqual({ kind: "invalid" });
  });

  it("uses the ens resolution when the input is a name", () => {
    const vitalik = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const resolved = resolvedPartyAddress({ kind: "ens", name: "vitalik.eth" }, vitalik);
    expect(resolved).toBe(getAddress(vitalik));
  });
});
