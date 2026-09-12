import { describe, expect, it } from "vitest";
import golden from "./golden-vectors.json";
import {
  APR_AT_KINK_RAY,
  BASE_APR_RAY,
  BPS,
  DEBT_DENOMINATOR,
  DEFAULT_LT_BPS,
  DEFAULT_LTV_BPS,
  KINK_RAY,
  PRICE_SCALE,
  RAY,
  SUPPLY_SHARE_SCALE,
  WAD,
  YEAR,
  borrowAprRay,
  borrowApyGrowthRay,
  borrowCapacity,
  borrowDebtShares,
  collateralValueLoan,
  debtFromShares,
  evaluateHealth,
  findUpperBound,
  healthFactorWad,
  isLiquidatable,
  liquidationCapacity,
  maxLoanAssetsIn,
  maxRedeemShares,
  maxWithdrawAssets,
  minCollateralOut,
  mintSupplyShares,
  originationAllowed,
  projectIndex,
  quoteLiquidation,
  quoteScale36,
  ratePerSecondRay,
  redeemAssetsOut,
  repayAssetsPaid,
  rpow,
  supplyAprRay,
  supplyApyEstGrowthRay,
  utilizationRay,
  valueAt,
  withdrawSharesBurn,
  writeCheckpoint,
} from "../src/index.js";

const g = (key: keyof typeof golden): bigint => BigInt(golden[key]);

describe("InterestMath twins", () => {
  it("matches kinked APR reference points", () => {
    expect(borrowAprRay(0n)).toBe(g("apr0"));
    expect(borrowAprRay(4n * 10n ** 26n)).toBe(g("apr40"));
    expect(borrowAprRay(KINK_RAY)).toBe(g("apr80"));
    expect(borrowAprRay(9n * 10n ** 26n)).toBe(g("apr90"));
    expect(borrowAprRay(RAY)).toBe(g("apr100"));
    expect(BASE_APR_RAY).toBe(g("apr0"));
    expect(APR_AT_KINK_RAY).toBe(g("apr80"));
  });

  it("rpow identities and golden exponents", () => {
    expect(rpow(0n, 0n, RAY)).toBe(RAY);
    expect(rpow(0n, 5n, RAY)).toBe(0n);
    expect(rpow(RAY, 100n, RAY)).toBe(RAY);
    expect(rpow(RAY + 1n, 2n, RAY)).toBe(g("rpowRayPlus1Exp2"));
    expect(rpow(RAY + 1n, 10n, RAY)).toBe(g("rpowRayPlus1Exp10"));
  });

  it("index goldens and ten-year max-rate dormancy", () => {
    expect(ratePerSecondRay(RAY)).toBe(g("rpsMax"));
    expect(projectIndex(RAY, RAY, 0n, 1n)).toBe(g("idx1sMax"));
    expect(projectIndex(RAY, RAY, 0n, YEAR)).toBe(g("idx1yMax"));
    expect(projectIndex(RAY, BASE_APR_RAY, 0n, YEAR)).toBe(g("idx1yBase"));
    const index = projectIndex(RAY, RAY, 0n, YEAR * 10n);
    expect(index).toBe(g("idx10yMax"));
    expect(debtFromShares(g("maxDebtShares800k"), index)).toBe(g("debt10yMaxCaps"));
    expect(200_000n * 10n ** 6n + g("debt10yMaxCaps")).toBe(g("assets10yMaxCaps"));
    expect(index < RAY * 1_000_000n).toBe(true);
  });

  it("supply APY estimate at kink", () => {
    expect(borrowApyGrowthRay(APR_AT_KINK_RAY)).toBe(g("borrowApyGrowth10pct"));
    expect(supplyAprRay(APR_AT_KINK_RAY, KINK_RAY)).toBe(g("supplyApr80"));
    expect(supplyApyEstGrowthRay(APR_AT_KINK_RAY, KINK_RAY)).toBe(g("supplyApyGrowth80"));
  });

  it("utilization identity", () => {
    expect(utilizationRay(0n, 0n)).toBe(0n);
    expect(utilizationRay(100n, 100n)).toBe(RAY / 2n);
  });

  it("rejects reverse time", () => {
    expect(() => projectIndex(RAY, BASE_APR_RAY, 10n, 9n)).toThrow("InvalidTime");
  });
});

describe("ShareMath twins", () => {
  it("empty-market mint and floor/ceil", () => {
    expect(mintSupplyShares(1_000_000n, 0n, 0n)).toBe(g("emptyMint1e6"));
    expect(mintSupplyShares(1_000_000n, 0n, 0n)).toBe(1_000_000n * SUPPLY_SHARE_SCALE);
    expect(mintSupplyShares(100n, 1000n, 300n)).toBe(g("floorSupply"));
    expect(withdrawSharesBurn(100n, 1000n, 300n)).toBe(g("ceilWithdraw"));
    expect(redeemAssetsOut(333n, 1000n, 300n)).toBe(99n);
  });

  it("borrow ceil / repay-all", () => {
    const shares = borrowDebtShares(1_000_000n, RAY);
    expect(debtFromShares(shares, RAY) >= 1_000_000n).toBe(true);
    const index = RAY + 12345n;
    const q = 999_999_999_999n;
    const paid = repayAssetsPaid(q, index);
    expect(paid).toBe(debtFromShares(q, index));
  });

  it("maxRedeem / maxWithdraw inverse plus claimant guard", () => {
    expect(maxRedeemShares(1000n, 1000n, 300n, 100n, 0n)).toBe(336n);
    expect(maxWithdrawAssets(1000n, 1000n, 300n, 100n, 0n)).toBe(100n);
    expect(maxRedeemShares(1000n, 1000n, 300n, 300n, 1n)).toBe(999n);
    expect(maxWithdrawAssets(1000n, 1000n, 300n, 300n, 1n)).toBe(299n);
  });
});

describe("Price and liquidation twins", () => {
  it("mWETH/mUSDC quote, LTV/LT, HF boundary", () => {
    expect(BPS).toBe(g("bps"));
    expect(WAD).toBe(g("wad"));
    expect(PRICE_SCALE).toBe(g("priceScale"));
    expect(DEBT_DENOMINATOR).toBe(g("debtDenominator"));
    const scale = quoteScale36(2000n * 10n ** 18n, 10n ** 18n, 18, 6);
    expect(scale).toBe(g("wethUsdcScale"));
    expect(collateralValueLoan(10n ** 18n, scale)).toBe(g("wethUsdcValue1"));
    expect(borrowCapacity(g("wethUsdcValue1"), DEFAULT_LTV_BPS)).toBe(g("ltv70of2000e6"));
    expect(liquidationCapacity(g("wethUsdcValue1"), DEFAULT_LT_BPS)).toBe(g("lt80of2000e6"));
    expect(healthFactorWad(g("lt80of2000e6"), g("ltv70of2000e6"))).toBe(g("hf1400on1600"));
    const cap = 100n * 10n ** 6n;
    expect(healthFactorWad(cap, cap)).toBe(10n ** 18n);
    expect(isLiquidatable(cap, cap)).toBe(false);
    expect(isLiquidatable(cap + 1n, cap)).toBe(true);
    expect(originationAllowed(cap, cap)).toBe(true);
    expect(evaluateHealth(cap, 0n, true).code).toBe("NO_DEBT");
    expect(evaluateHealth(cap, 0n, true).healthFactorWad).toBe(null);
    expect(evaluateHealth(cap, cap + 1n, false).code).toBe("UNAVAILABLE");
    expect(evaluateHealth(cap, cap, true).liquidatable).toBe(false);
  });

  it("both liquidation quote modes and slippage bounds", () => {
    const scale = quoteScale36(2000n * 10n ** 18n, 10n ** 18n, 18, 6);
    const shares = borrowDebtShares(100n * 10n ** 6n, RAY);
    expect(shares).toBe(g("liq100e6Shares"));
    const a = quoteLiquidation({
      exactDebtShares: shares,
      exactCollateral: 0n,
      ownerDebtShares: shares,
      ownerCollateral: 10n ** 18n,
      indexRay: RAY,
      scale36: scale,
      bonusBps: 500n,
    });
    expect(a.loanAssetsIn).toBe(g("liq100e6LoanIn"));
    expect(a.collateralOut).toBe(g("liq100e6CollatOut"));
    const args = {
      ownerDebtShares: shares,
      ownerCollateral: 10n ** 18n,
      indexRay: RAY,
      scale36: scale,
      bonusBps: 500n,
    };
    expect(maxLoanAssetsIn(args)).toBe(a.loanAssetsIn);
    expect(minCollateralOut(args)).toBe(a.collateralOut);
    const b = quoteLiquidation({
      exactDebtShares: 0n,
      exactCollateral: a.collateralOut,
      ownerDebtShares: shares,
      ownerCollateral: 10n ** 18n,
      indexRay: RAY,
      scale36: scale,
      bonusBps: 500n,
    });
    expect(b.debtSharesBurned > 0n).toBe(true);
  });
});

describe("SupplyShareSnapshots twins", () => {
  it("findUpperBound / valueAt match Solidity semantics", () => {
    const ids: bigint[] = [];
    const values: bigint[] = [];
    writeCheckpoint(ids, values, 0n, 99n);
    expect(ids.length).toBe(0);
    writeCheckpoint(ids, values, 1n, 10n);
    writeCheckpoint(ids, values, 1n, 11n);
    expect(values[0]).toBe(10n);
    writeCheckpoint(ids, values, 3n, 20n);
    expect(findUpperBound(ids, 1n)).toBe(0);
    expect(findUpperBound(ids, 2n)).toBe(1);
    expect(findUpperBound(ids, 3n)).toBe(1);
    expect(findUpperBound(ids, 4n)).toBe(2);
    expect(valueAt(ids, values, 1n, 3n, 99n)).toBe(10n);
    expect(valueAt(ids, values, 2n, 3n, 99n)).toBe(20n);
    expect(valueAt(ids, values, 3n, 3n, 99n)).toBe(20n);
    expect(() => valueAt(ids, values, 0n, 3n, 99n)).toThrow("SnapshotZero");
    expect(() => valueAt(ids, values, 4n, 3n, 99n)).toThrow("SnapshotTooNew");
  });
});
