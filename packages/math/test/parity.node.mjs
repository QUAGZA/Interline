import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const repo = join(pkg, "..", "..");
const require = createRequire(join(repo, "package.json"));
const tsc = require.resolve("typescript/bin/tsc");
const out = mkdtempSync(join(tmpdir(), "interline-math-"));
const buildConfig = join(pkg, "tsconfig.build.json");

const compile = spawnSync(process.execPath, [tsc, "-p", buildConfig, "--outDir", out], {
  stdio: "inherit",
  windowsHide: true,
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const math = await import(pathToFileURL(join(out, "index.js")).href);
const golden = JSON.parse(readFileSync(join(here, "golden-vectors.json"), "utf8"));
const g = (key) => BigInt(golden[key]);

const {
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
  maxSeizedValueLoan,
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
} = math;

assert.equal(borrowAprRay(0n), g("apr0"));
assert.equal(borrowAprRay(4n * 10n ** 26n), g("apr40"));
assert.equal(borrowAprRay(KINK_RAY), g("apr80"));
assert.equal(borrowAprRay(9n * 10n ** 26n), g("apr90"));
assert.equal(borrowAprRay(RAY), g("apr100"));
assert.equal(BASE_APR_RAY, g("apr0"));
assert.equal(APR_AT_KINK_RAY, g("apr80"));

assert.equal(rpow(0n, 0n, RAY), RAY);
assert.equal(rpow(0n, 5n, RAY), 0n);
assert.equal(rpow(RAY, 100n, RAY), RAY);
assert.equal(rpow(RAY + 1n, 2n, RAY), g("rpowRayPlus1Exp2"));
assert.equal(rpow(RAY + 1n, 10n, RAY), g("rpowRayPlus1Exp10"));

assert.equal(ratePerSecondRay(RAY), g("rpsMax"));
assert.equal(projectIndex(RAY, RAY, 0n, 1n), g("idx1sMax"));
assert.equal(projectIndex(RAY, RAY, 0n, YEAR), g("idx1yMax"));
assert.equal(projectIndex(RAY, BASE_APR_RAY, 0n, YEAR), g("idx1yBase"));
const index = projectIndex(RAY, RAY, 0n, YEAR * 10n);
assert.equal(index, g("idx10yMax"));
assert.equal(debtFromShares(g("maxDebtShares800k"), index), g("debt10yMaxCaps"));
assert.equal(200_000n * 10n ** 6n + g("debt10yMaxCaps"), g("assets10yMaxCaps"));
assert.equal(index < RAY * 1_000_000n, true);

assert.equal(borrowApyGrowthRay(APR_AT_KINK_RAY), g("borrowApyGrowth10pct"));
assert.equal(supplyAprRay(APR_AT_KINK_RAY, KINK_RAY), g("supplyApr80"));
assert.equal(supplyApyEstGrowthRay(APR_AT_KINK_RAY, KINK_RAY), g("supplyApyGrowth80"));
assert.equal(utilizationRay(0n, 0n), 0n);
assert.equal(utilizationRay(100n, 100n), RAY / 2n);

assert.equal(mintSupplyShares(1_000_000n, 0n, 0n), g("emptyMint1e6"));
assert.equal(mintSupplyShares(1_000_000n, 0n, 0n), 1_000_000n * SUPPLY_SHARE_SCALE);
assert.equal(mintSupplyShares(100n, 1000n, 300n), g("floorSupply"));
assert.equal(withdrawSharesBurn(100n, 1000n, 300n), g("ceilWithdraw"));
assert.equal(redeemAssetsOut(333n, 1000n, 300n), 99n);

const shares = borrowDebtShares(1_000_000n, RAY);
assert.equal(debtFromShares(shares, RAY) >= 1_000_000n, true);
const repayIndex = RAY + 12345n;
const q = 999_999_999_999n;
assert.equal(repayAssetsPaid(q, repayIndex), debtFromShares(q, repayIndex));

assert.equal(maxRedeemShares(1000n, 1000n, 300n, 100n, 0n), 336n);
assert.equal(maxWithdrawAssets(1000n, 1000n, 300n, 100n, 0n), 100n);
assert.equal(maxRedeemShares(1000n, 1000n, 300n, 300n, 1n), 999n);
assert.equal(maxWithdrawAssets(1000n, 1000n, 300n, 300n, 1n), 299n);

assert.equal(BPS, g("bps"));
assert.equal(WAD, g("wad"));
assert.equal(PRICE_SCALE, g("priceScale"));
assert.equal(DEBT_DENOMINATOR, g("debtDenominator"));
const scale = quoteScale36(2000n * 10n ** 18n, 10n ** 18n, 18, 6);
assert.equal(scale, g("wethUsdcScale"));
assert.equal(collateralValueLoan(10n ** 18n, scale), g("wethUsdcValue1"));
assert.equal(borrowCapacity(g("wethUsdcValue1"), 7000n), g("ltv70of2000e6"));
assert.equal(borrowCapacity(g("wethUsdcValue1"), DEFAULT_LTV_BPS), g("lt80of2000e6"));
assert.equal(liquidationCapacity(g("wethUsdcValue1"), 8000n), g("lt80of2000e6"));
assert.equal(liquidationCapacity(g("wethUsdcValue1"), DEFAULT_LT_BPS), 1_800_000_000n);
assert.equal(healthFactorWad(g("lt80of2000e6"), g("ltv70of2000e6")), g("hf1400on1600"));
const cap = 100n * 10n ** 6n;
assert.equal(healthFactorWad(cap, cap), 10n ** 18n);
assert.equal(isLiquidatable(cap, cap), false);
assert.equal(isLiquidatable(cap + 1n, cap), true);
assert.equal(originationAllowed(cap, cap), true);
assert.equal(evaluateHealth(cap, 0n, true).code, "NO_DEBT");
assert.equal(evaluateHealth(cap, 0n, true).healthFactorWad, null);
assert.equal(evaluateHealth(cap, cap + 1n, false).code, "UNAVAILABLE");
assert.equal(evaluateHealth(cap, cap, true).liquidatable, false);

const liqShares = borrowDebtShares(100n * 10n ** 6n, RAY);
assert.equal(liqShares, g("liq100e6Shares"));
const a = quoteLiquidation({
  exactDebtShares: liqShares,
  exactCollateral: 0n,
  ownerDebtShares: liqShares,
  ownerCollateral: 10n ** 18n,
  indexRay: RAY,
  scale36: scale,
  bonusBps: 500n,
});
assert.equal(a.loanAssetsIn, g("liq100e6LoanIn"));
assert.equal(a.collateralOut, g("liq100e6CollatOut"));
const args = {
  ownerDebtShares: liqShares,
  ownerCollateral: 10n ** 18n,
  indexRay: RAY,
  scale36: scale,
  bonusBps: 500n,
};
assert.equal(maxLoanAssetsIn(args), a.loanAssetsIn);
assert.equal(minCollateralOut(args), a.collateralOut);
const b = quoteLiquidation({
  exactDebtShares: 0n,
  exactCollateral: a.collateralOut,
  ownerDebtShares: liqShares,
  ownerCollateral: 10n ** 18n,
  indexRay: RAY,
  scale36: scale,
  bonusBps: 500n,
});
assert.equal(b.debtSharesBurned > 0n, true);

const a01Scale = quoteScale36(1550n * 10n ** 18n, 10n ** 18n, 18, 6);
const a01Shares = borrowDebtShares(1_400n * 10n ** 6n, RAY);
const a01Args = {
  ownerDebtShares: a01Shares,
  ownerCollateral: 10n ** 18n,
  indexRay: RAY,
  scale36: a01Scale,
  bonusBps: 500n,
};
const a01Debt = quoteLiquidation({ exactDebtShares: a01Shares, exactCollateral: 0n, ...a01Args });
const a01Col = quoteLiquidation({ exactDebtShares: 0n, exactCollateral: 10n ** 18n, ...a01Args });
assert.equal(a01Col.debtSharesBurned, a01Shares);
assert.equal(a01Col.loanAssetsIn, a01Debt.loanAssetsIn);
assert.equal(a01Col.collateralOut, a01Debt.collateralOut);
assert.equal(a01Col.collateralOut < 10n ** 18n, true);
assert.equal(a01Col.writesOff, false);
assert.equal(
  collateralValueLoan(a01Col.collateralOut, a01Scale) <=
    maxSeizedValueLoan(a01Col.loanAssetsIn, a01Scale, 500n, true),
  true,
);

const insolventScale = quoteScale36(1000n * 10n ** 18n, 10n ** 18n, 18, 6);
const insolventCol = quoteLiquidation({
  exactDebtShares: 0n,
  exactCollateral: 10n ** 18n,
  ownerDebtShares: a01Shares,
  ownerCollateral: 10n ** 18n,
  indexRay: RAY,
  scale36: insolventScale,
  bonusBps: 500n,
});
assert.equal(insolventCol.writesOff, true);
assert.equal(insolventCol.collateralOut, 10n ** 18n);
assert.equal(insolventCol.debtSharesBurned < a01Shares, true);
assert.equal(
  collateralValueLoan(insolventCol.collateralOut, insolventScale) <=
    maxSeizedValueLoan(insolventCol.loanAssetsIn, insolventScale, 500n, false),
  true,
);

const ids = [];
const values = [];
writeCheckpoint(ids, values, 0n, 99n);
assert.equal(ids.length, 0);
writeCheckpoint(ids, values, 1n, 10n);
writeCheckpoint(ids, values, 1n, 11n);
assert.equal(values[0], 10n);
writeCheckpoint(ids, values, 3n, 20n);
assert.equal(findUpperBound(ids, 1n), 0);
assert.equal(findUpperBound(ids, 2n), 1);
assert.equal(findUpperBound(ids, 3n), 1);
assert.equal(findUpperBound(ids, 4n), 2);
assert.equal(valueAt(ids, values, 1n, 3n, 99n), 10n);
assert.equal(valueAt(ids, values, 2n, 3n, 99n), 20n);
assert.equal(valueAt(ids, values, 3n, 3n, 99n), 20n);

let threw = false;
try {
  projectIndex(RAY, BASE_APR_RAY, 10n, 9n);
} catch (err) {
  threw = err instanceof Error && err.message === "InvalidTime";
}
assert.equal(threw, true);

console.log("packages/math node parity: all golden vectors passed");
