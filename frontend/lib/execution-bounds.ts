import type { Address, PublicClient } from "viem";

export const EXECUTION_TOLERANCE_BPS = 10n;
export const BPS_DENOM = 10_000n;
const SUPPLY_SHARE_SCALE = 10n ** 12n;
const DEBT_DENOMINATOR = 10n ** 54n;

export const marketQuoteAbi = [
  { type: "function", name: "accountedCash", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupplyShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalDebtShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "indexNow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplySharesOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "debtSharesOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const facilityQuoteAbi = [
  { type: "function", name: "debtShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "indexNow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentDebt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const erc4626QuoteAbi = [
  { type: "function", name: "convertToShares", stateMutability: "view", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

function mulDiv(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("div0");
  return (x * y) / d;
}

function mulDivCeil(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("div0");
  if (x === 0n || y === 0n) return 0n;
  return (x * y + d - 1n) / d;
}

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

/** Haircut a quoted output so the submitted minOut still passes ordinary index drift. */
export function minBoundFromQuote(quoted: bigint): bigint {
  if (quoted === 0n) return 0n;
  const slack = (quoted * EXECUTION_TOLERANCE_BPS) / BPS_DENOM;
  const cut = slack > 0n ? slack : 0n;
  const next = quoted - cut;
  return next > 0n ? next : 1n;
}

/** Raise a quoted max-in/max-debt so one tick of interest does not revert Slippage. */
export function maxBoundFromQuote(quoted: bigint): bigint {
  if (quoted === 0n) return 0n;
  const slack = (quoted * EXECUTION_TOLERANCE_BPS) / BPS_DENOM;
  return quoted + (slack > 0n ? slack : 1n);
}

export type PoolSupplyQuote = {
  sharesBefore: bigint;
  sharesAfter: bigint;
  sharesOut: bigint;
  minSharesOut: bigint;
};

export type PoolWithdrawQuote = {
  sharesBefore: bigint;
  sharesAfter: bigint;
  sharesBurn: bigint;
  maxSharesBurn: bigint;
};

export type PoolBorrowQuote = {
  debtSharesBefore: bigint;
  newDebtShares: bigint;
  debtSharesAfter: bigint;
  maxDebtShares: bigint;
};

export type DirectBorrowQuote = {
  debtBefore: bigint;
  debtAfter: bigint;
  maxDebtAfter: bigint;
};

export type VenueEnterQuote = {
  sharesOut: bigint;
  minSharesOut: bigint;
};

type Reader = Pick<PublicClient, "readContract">;

export async function quotePoolSupply(
  client: Reader,
  market: Address,
  owner: Address,
  assets: bigint,
): Promise<PoolSupplyQuote> {
  const [cash, totalShares, index, totalDebtShares, sharesBefore] = await Promise.all([
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "accountedCash" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "totalSupplyShares" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "indexNow" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "totalDebtShares" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "supplySharesOf", args: [owner] }),
  ]);
  const assetsBefore = cash + debtFromShares(totalDebtShares, index);
  const sharesOut = mintSupplyShares(assets, totalShares, assetsBefore);
  return {
    sharesBefore,
    sharesOut,
    sharesAfter: sharesBefore + sharesOut,
    minSharesOut: minBoundFromQuote(sharesOut),
  };
}

export async function quotePoolWithdraw(
  client: Reader,
  market: Address,
  owner: Address,
  assets: bigint,
): Promise<PoolWithdrawQuote> {
  const [cash, totalShares, index, totalDebtShares, sharesBefore] = await Promise.all([
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "accountedCash" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "totalSupplyShares" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "indexNow" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "totalDebtShares" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "supplySharesOf", args: [owner] }),
  ]);
  const assetsBefore = cash + debtFromShares(totalDebtShares, index);
  const sharesBurn = withdrawSharesBurn(assets, totalShares, assetsBefore);
  return {
    sharesBefore,
    sharesBurn,
    sharesAfter: sharesBefore > sharesBurn ? sharesBefore - sharesBurn : 0n,
    maxSharesBurn: maxBoundFromQuote(sharesBurn),
  };
}

export async function quotePoolBorrow(
  client: Reader,
  market: Address,
  owner: Address,
  assets: bigint,
): Promise<PoolBorrowQuote> {
  const [index, debtSharesBefore] = await Promise.all([
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "indexNow" }),
    client.readContract({ address: market, abi: marketQuoteAbi, functionName: "debtSharesOf", args: [owner] }),
  ]);
  const newDebtShares = borrowDebtShares(assets, index);
  return {
    debtSharesBefore,
    newDebtShares,
    debtSharesAfter: debtSharesBefore + newDebtShares,
    maxDebtShares: maxBoundFromQuote(newDebtShares),
  };
}

export async function quoteDirectBorrow(client: Reader, facility: Address, assets: bigint): Promise<DirectBorrowQuote> {
  const [debtShares, index] = await Promise.all([
    client.readContract({ address: facility, abi: facilityQuoteAbi, functionName: "debtShares" }),
    client.readContract({ address: facility, abi: facilityQuoteAbi, functionName: "indexNow" }),
  ]);
  const debtBefore = debtFromShares(debtShares, index);
  const newShares = borrowDebtShares(assets, index);
  const debtAfter = debtFromShares(debtShares + newShares, index);
  return {
    debtBefore,
    debtAfter,
    maxDebtAfter: maxBoundFromQuote(debtAfter),
  };
}

export async function quoteVenueEnter(client: Reader, venue: Address, assets: bigint): Promise<VenueEnterQuote> {
  const sharesOut = await client.readContract({
    address: venue,
    abi: erc4626QuoteAbi,
    functionName: "convertToShares",
    args: [assets],
  });
  return { sharesOut, minSharesOut: minBoundFromQuote(sharesOut) };
}

export function deadlineIn(seconds: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}
