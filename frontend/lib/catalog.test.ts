import { describe, expect, it } from "vitest";
import {
  catalogById,
  directChainConfig,
  isLiveTokenAddress,
  withCatalogTokens,
} from "./catalog";

const FAKE_USDC = "0x0000000000000000000000000000000000000011" as const;
const FAKE_WETH = "0x0000000000000000000000000000000000000018" as const;

describe("catalog live tokens", () => {
  it("stamps Sepolia manifest loan/collateral onto a writable DTO", () => {
    const listed = catalogById(11155111, "usdc-weth-wallet");
    const cfg = directChainConfig(11155111);
    expect(listed?.writable).toBe(true);
    expect(isLiveTokenAddress(cfg?.loanToken)).toBe(true);
    expect(isLiveTokenAddress(cfg?.otherToken)).toBe(true);
    expect(isLiveTokenAddress(FAKE_USDC)).toBe(false);

    const stamped = withCatalogTokens({
      chainId: 11155111,
      marketId: "usdc-weth-wallet",
      address: listed!.address,
      writable: true,
      loan: { address: FAKE_USDC, symbol: "mUSDC", decimals: 6, testAsset: true as const },
      collateral: { address: FAKE_WETH, symbol: "mWETH", decimals: 18, testAsset: true as const },
    });
    expect(stamped.loan.address.toLowerCase()).toBe(cfg!.loanToken.toLowerCase());
    expect(stamped.collateral.address.toLowerCase()).toBe(cfg!.otherToken.toLowerCase());
    expect(stamped.loan.address.toLowerCase()).not.toBe(FAKE_USDC.toLowerCase());
  });

  it("leaves Base Sepolia fixtures alone when the catalog has no live market", () => {
    const listed = catalogById(84532, "usdc-weth-wallet");
    expect(listed?.writable).toBe(false);
    const stamped = withCatalogTokens({
      chainId: 84532,
      marketId: "usdc-weth-wallet",
      address: listed?.address ?? FAKE_USDC,
      writable: false,
      loan: { address: FAKE_USDC, symbol: "mUSDC", decimals: 6, testAsset: true as const },
      collateral: { address: FAKE_WETH, symbol: "mWETH", decimals: 18, testAsset: true as const },
    });
    expect(stamped.loan.address).toBe(FAKE_USDC);
  });
});
