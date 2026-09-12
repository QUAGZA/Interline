import { DEBT_DENOMINATOR, SUPPLY_SHARE_SCALE } from "./constants.js";
import { mulDiv, mulDivCeil } from "./muldiv.js";

export function mintSupplyShares(assetsIn: bigint, totalShares: bigint, assetsBefore: bigint): bigint {
  if (assetsIn === 0n) throw new Error("ZeroAmount");
  let sharesOut: bigint;
  if (totalShares === 0n && assetsBefore === 0n) {
    sharesOut = assetsIn * SUPPLY_SHARE_SCALE;
  } else {
    if (totalShares === 0n || assetsBefore === 0n) throw new Error("InvalidShareState");
    sharesOut = mulDiv(assetsIn, totalShares, assetsBefore);
  }
  if (sharesOut === 0n) throw new Error("ZeroShares");
  return sharesOut;
}

export function withdrawSharesBurn(assetsOut: bigint, totalShares: bigint, assetsBefore: bigint): bigint {
  if (assetsOut === 0n) throw new Error("ZeroAmount");
  if (totalShares === 0n || assetsBefore === 0n) throw new Error("InvalidShareState");
  return mulDivCeil(assetsOut, totalShares, assetsBefore);
}

export function redeemAssetsOut(sharesBurn: bigint, totalShares: bigint, assetsBefore: bigint): bigint {
  if (sharesBurn === 0n) throw new Error("ZeroAmount");
  if (totalShares === 0n || assetsBefore === 0n) throw new Error("InvalidShareState");
  return mulDiv(sharesBurn, assetsBefore, totalShares);
}

export function supplierClaim(shares: bigint, totalShares: bigint, assetsNow: bigint): bigint {
  if (shares === 0n || totalShares === 0n || assetsNow === 0n) return 0n;
  return mulDiv(shares, assetsNow, totalShares);
}

export function borrowDebtShares(assetsOut: bigint, indexRay: bigint): bigint {
  if (assetsOut === 0n) throw new Error("ZeroAmount");
  if (indexRay === 0n) throw new Error("InvalidShareState");
  return mulDivCeil(assetsOut, DEBT_DENOMINATOR, indexRay);
}

export function debtFromShares(shares: bigint, indexRay: bigint): bigint {
  if (shares === 0n) return 0n;
  if (indexRay === 0n) throw new Error("InvalidShareState");
  return mulDivCeil(shares, indexRay, DEBT_DENOMINATOR);
}

export function repaySharesBurn(maxAssets: bigint, ownerShares: bigint, indexRay: bigint): bigint {
  if (maxAssets === 0n || ownerShares === 0n) return 0n;
  if (indexRay === 0n) throw new Error("InvalidShareState");
  const shares = mulDiv(maxAssets, DEBT_DENOMINATOR, indexRay);
  return shares > ownerShares ? ownerShares : shares;
}

export function repayAssetsPaid(sharesBurn: bigint, indexRay: bigint): bigint {
  if (sharesBurn === 0n) return 0n;
  if (indexRay === 0n) throw new Error("InvalidShareState");
  return mulDivCeil(sharesBurn, indexRay, DEBT_DENOMINATOR);
}

export function maxRedeemShares(
  ownedShares: bigint,
  totalShares: bigint,
  assets: bigint,
  cash: bigint,
  performingDebt: bigint,
): bigint {
  if (ownedShares === 0n || totalShares === 0n || assets === 0n) return 0n;
  let limited = ownedShares;
  let payout = mulDiv(limited, assets, totalShares);
  if (payout > cash) {
    const num = (cash + 1n) * totalShares;
    limited = (num - 1n) / assets;
    if (limited > ownedShares) limited = ownedShares;
    while (limited > 0n && mulDiv(limited, assets, totalShares) > cash) limited -= 1n;
    while (limited < ownedShares && mulDiv(limited + 1n, assets, totalShares) <= cash) limited += 1n;
  }
  if (limited === totalShares && performingDebt > 0n && limited > 0n) {
    limited -= 1n;
    while (limited > 0n && mulDiv(limited, assets, totalShares) > cash) limited -= 1n;
  }
  return limited;
}

export function maxWithdrawAssets(
  ownedShares: bigint,
  totalShares: bigint,
  assets: bigint,
  cash: bigint,
  performingDebt: bigint,
): bigint {
  if (ownedShares === 0n || totalShares === 0n || assets === 0n || cash === 0n) return 0n;
  let amount = supplierClaim(ownedShares, totalShares, assets);
  if (amount > cash) amount = cash;
  if (performingDebt > 0n) {
    const capKeepClaimant = mulDiv(totalShares - 1n, assets, totalShares);
    if (amount > capKeepClaimant) amount = capKeepClaimant;
  }
  while (amount > 0n) {
    const burn = mulDivCeil(amount, totalShares, assets);
    const burnsAllWithDebt = burn === totalShares && performingDebt > 0n;
    if (burn <= ownedShares && !burnsAllWithDebt) break;
    amount -= 1n;
  }
  return amount;
}
