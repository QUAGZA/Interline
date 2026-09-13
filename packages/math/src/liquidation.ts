import { BPS, PRICE_SCALE } from "./constants.js";
import { mulDiv, mulDivCeil } from "./muldiv.js";
import { collateralValueLoan } from "./price.js";
import { repayAssetsPaid, repaySharesBurn } from "./shares.js";

/** Extra loan raw unit allowed when exact-collateral uses the floor bonus inverse. */
export const BONUS_INVERSE_SLACK_LOAN = 1n;

export type LiquidationQuote = {
  debtSharesBurned: bigint;
  loanAssetsIn: bigint;
  collateralOut: bigint;
  writesOff: boolean;
};

export function quoteLiquidation(args: {
  exactDebtShares: bigint;
  exactCollateral: bigint;
  ownerDebtShares: bigint;
  ownerCollateral: bigint;
  indexRay: bigint;
  scale36: bigint;
  bonusBps: bigint;
}): LiquidationQuote {
  const { exactDebtShares, exactCollateral, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps } = args;
  if ((exactDebtShares === 0n) === (exactCollateral === 0n)) throw new Error("InvalidQuoteMode");
  if (ownerDebtShares === 0n || scale36 === 0n) throw new Error("ZeroQuote");
  if (exactDebtShares > 0n) {
    return fromDebtShares(exactDebtShares, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
  }
  return fromCollateral(exactCollateral, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
}

export function quoteFullClose(args: {
  ownerDebtShares: bigint;
  ownerCollateral: bigint;
  indexRay: bigint;
  scale36: bigint;
  bonusBps: bigint;
}): LiquidationQuote {
  return quoteLiquidation({
    exactDebtShares: args.ownerDebtShares,
    exactCollateral: 0n,
    ...args,
  });
}

/** Tight `maxLoanAssetsIn` slippage bound for a 100% debt-share close. */
export function maxLoanAssetsIn(args: {
  ownerDebtShares: bigint;
  ownerCollateral: bigint;
  indexRay: bigint;
  scale36: bigint;
  bonusBps: bigint;
}): bigint {
  return quoteFullClose(args).loanAssetsIn;
}

/** Tight `minCollateralOut` slippage bound for a 100% debt-share close. */
export function minCollateralOut(args: {
  ownerDebtShares: bigint;
  ownerCollateral: bigint;
  indexRay: bigint;
  scale36: bigint;
  bonusBps: bigint;
}): bigint {
  return quoteFullClose(args).collateralOut;
}

export function slippageBounds(q: LiquidationQuote): { maxLoanAssetsIn: bigint; minCollateralOut: bigint } {
  return { maxLoanAssetsIn: q.loanAssetsIn, minCollateralOut: q.collateralOut };
}

/**
 * Upper bound on seized collateral value, in loan-token raw units.
 * `ceil(loanIn * (BPS + bonusBps) / BPS) + floor((scale36 - 1) / PRICE_SCALE)`,
 * plus `BONUS_INVERSE_SLACK_LOAN` (1) when `debtShareCapBound` is false.
 */
export function maxSeizedValueLoan(
  loanIn: bigint,
  scale36: bigint,
  bonusBps: bigint,
  debtShareCapBound: boolean,
): bigint {
  const valued = mulDivCeil(loanIn, BPS + bonusBps, BPS);
  const priceCeilSlack = scale36 === 0n ? 0n : (scale36 - 1n) / PRICE_SCALE;
  return valued + priceCeilSlack + (debtShareCapBound ? 0n : BONUS_INVERSE_SLACK_LOAN);
}

function collateralForRepay(loanIn: bigint, scale36: bigint, bonusBps: bigint): bigint {
  const valued = mulDivCeil(loanIn, BPS + bonusBps, BPS);
  return mulDivCeil(valued, PRICE_SCALE, scale36);
}

function fromDebtShares(
  exactDebtShares: bigint,
  ownerDebtShares: bigint,
  ownerCollateral: bigint,
  indexRay: bigint,
  scale36: bigint,
  bonusBps: bigint,
): LiquidationQuote {
  const shares = exactDebtShares > ownerDebtShares ? ownerDebtShares : exactDebtShares;
  const loanIn = repayAssetsPaid(shares, indexRay);
  let collat = collateralForRepay(loanIn, scale36, bonusBps);
  if (collat > ownerCollateral) collat = ownerCollateral;
  return {
    debtSharesBurned: shares,
    loanAssetsIn: loanIn,
    collateralOut: collat,
    writesOff: ownerDebtShares - shares > 0n && ownerCollateral === collat,
  };
}

function fromCollateral(
  exactCollateral: bigint,
  ownerDebtShares: bigint,
  ownerCollateral: bigint,
  indexRay: bigint,
  scale36: bigint,
  bonusBps: bigint,
): LiquidationQuote {
  const requested = exactCollateral > ownerCollateral ? ownerCollateral : exactCollateral;
  const loanValue = collateralValueLoan(requested, scale36);
  const maxAssets = mulDiv(loanValue, BPS, BPS + bonusBps);
  const shares = repaySharesBurn(maxAssets, ownerDebtShares, indexRay);
  if (shares === 0n) throw new Error("ZeroQuote");
  const loanIn = repayAssetsPaid(shares, indexRay);
  let collat = requested;
  // Remaining debt can cap burned shares below the budget implied by `requested`.
  // Recompute collateral from actual repayment + bonus so the liquidator cannot
  // keep the full request after paying only the leftover debt.
  if (shares === ownerDebtShares) {
    const collatFromRepay = collateralForRepay(loanIn, scale36, bonusBps);
    if (collatFromRepay < collat) collat = collatFromRepay;
  }
  return {
    debtSharesBurned: shares,
    loanAssetsIn: loanIn,
    collateralOut: collat,
    writesOff: ownerCollateral === collat && shares < ownerDebtShares,
  };
}
