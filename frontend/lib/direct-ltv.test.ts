import { describe, expect, it } from "vitest";
import { availableFromLtv, borrowCapacityUsdcRaw, requiredCollateralWei } from "./direct-ltv";

const WETH = 10n ** 18n;
const USDC = 10n ** 6n;
const wad = (usd: number) => BigInt(usd) * 10n ** 18n;

describe("direct LTV at a mainnet-style ETH/USD", () => {
  it("gives 80% of ETH USD as mUSDC per 1 mWETH when USDC is $1", () => {
    expect(borrowCapacityUsdcRaw(WETH, wad(2000), wad(1))).toBe(1600n * USDC);
    expect(borrowCapacityUsdcRaw(WETH, wad(3875), wad(1))).toBe(3100n * USDC);
  });

  it("inverts: collateral needed for a target debt matches the LTV cap", () => {
    const cap = borrowCapacityUsdcRaw(WETH, wad(3875), wad(1));
    expect(requiredCollateralWei(cap, wad(3875), wad(1))).toBe(WETH);
    expect(requiredCollateralWei(cap / 2n, wad(3875), wad(1))).toBe(WETH / 2n);
  });

  it("subtracts already-borrowed mUSDC from LTV headroom", () => {
    const cap = 3100n * USDC;
    expect(availableFromLtv(cap, 1000n * USDC)).toBe(2100n * USDC);
    expect(availableFromLtv(cap, cap)).toBe(0n);
    expect(availableFromLtv(cap, cap + 1n)).toBe(0n);
  });
});
