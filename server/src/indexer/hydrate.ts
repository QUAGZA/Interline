import type { PublicClient } from "viem";
import { erc20Views, marketViews, oracleAbi } from "./abis.js";
import type { MarketRecord, OracleStatus, PositionRecord } from "../domain.js";

const ORACLE_BY_CODE: OracleStatus[] = ["OK", "STALE", "SEQUENCER_DOWN", "INVALID", "UNAVAILABLE"];

function oracleFrom(code: number): OracleStatus {
  return ORACLE_BY_CODE[code] ?? "UNAVAILABLE";
}

export async function hydrateMarketFromChain(
  client: PublicClient,
  market: MarketRecord,
): Promise<MarketRecord> {
  const address = market.address;
  const read = <T>(functionName: string, args?: readonly unknown[]) =>
    client.readContract({
      address,
      abi: marketViews,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;

  try {
    const [
      loanToken,
      collateralToken,
      loanDecimals,
      collateralDecimals,
      deliveryMode,
      oracle,
      accountedCash,
      totalDebtShares,
      totalSupplyShares,
      epochIndexRay,
      epochTimestamp,
      epochAprRay,
      supplyCap,
      borrowCap,
      maxLtvBps,
      liquidationThresholdBps,
      liquidationBonusBps,
      defaultPositionCap,
      supplyFrozen,
      borrowFrozen,
      terminal,
      recallActive,
      recallDeadline,
      unaccountedSurplus,
    ] = await Promise.all([
      read<`0x${string}`>("loanToken"),
      read<`0x${string}`>("collateralToken"),
      read<number>("loanDecimals"),
      read<number>("collateralDecimals"),
      read<number>("deliveryMode"),
      read<`0x${string}`>("oracle"),
      read<bigint>("accountedCash"),
      read<bigint>("totalDebtShares"),
      read<bigint>("totalSupplyShares"),
      read<bigint>("epochIndexRay"),
      read<bigint>("epochTimestamp"),
      read<bigint>("epochAprRay"),
      read<bigint>("supplyCap"),
      read<bigint>("borrowCap"),
      read<number>("maxLtvBps"),
      read<number>("liquidationThresholdBps"),
      read<number>("liquidationBonusBps"),
      read<bigint>("defaultPositionCap"),
      read<boolean>("supplyFrozen"),
      read<boolean>("borrowFrozen"),
      read<boolean>("marketTerminal"),
      read<boolean>("recallActive"),
      read<bigint>("recallDeadline"),
      read<bigint>("unaccountedSurplus"),
    ]);

    let loanSymbol = market.loanSymbol;
    let collateralSymbol = market.collateralSymbol;
    try {
      loanSymbol = (await client.readContract({
        address: loanToken,
        abi: erc20Views,
        functionName: "symbol",
      })) as string;
      collateralSymbol = (await client.readContract({
        address: collateralToken,
        abi: erc20Views,
        functionName: "symbol",
      })) as string;
    } catch {
      // keep seeded symbols
    }

    let oracleStatus = market.oracleStatus;
    let quoteScale36 = market.quoteScale36;
    let collateralUsdWad = market.collateralUsdWad;
    let loanUsdWad = market.loanUsdWad;
    try {
      const quote = (await client.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "quote",
      })) as {
        collateralUsdWad: bigint;
        loanUsdWad: bigint;
        quoteScale36: bigint;
        status: number;
      };
      oracleStatus = oracleFrom(Number(quote.status));
      quoteScale36 = quote.quoteScale36;
      collateralUsdWad = quote.collateralUsdWad;
      loanUsdWad = quote.loanUsdWad;
    } catch {
      oracleStatus = "UNAVAILABLE";
    }

    return {
      ...market,
      loanToken,
      collateralToken,
      loanDecimals: Number(loanDecimals),
      collateralDecimals: Number(collateralDecimals),
      deliveryMode: Number(deliveryMode) === 1 ? "restricted" : "wallet",
      oracle,
      accountedCash,
      totalDebtShares,
      totalSupplyShares,
      epochIndexRay,
      epochTimestamp: BigInt(epochTimestamp),
      epochAprRay,
      supplyCap,
      borrowCap,
      maxLtvBps: Number(maxLtvBps),
      liquidationThresholdBps: Number(liquidationThresholdBps),
      liquidationBonusBps: Number(liquidationBonusBps),
      defaultPositionCap,
      supplyFrozen,
      borrowFrozen,
      terminal,
      recallActive,
      recallDeadline: BigInt(recallDeadline),
      unaccountedSurplus,
      loanSymbol,
      collateralSymbol,
      oracleStatus,
      quoteScale36,
      collateralUsdWad,
      loanUsdWad,
    };
  } catch {
    return market;
  }
}

export async function hydratePositionFromChain(
  client: PublicClient,
  market: MarketRecord,
  position: PositionRecord,
): Promise<PositionRecord> {
  const address = market.address;
  const owner = position.owner;
  try {
    const [supplyShares, debtShares, collateral, principal, defaulted, writtenOff] = await Promise.all([
      client.readContract({ address, abi: marketViews, functionName: "supplySharesOf", args: [owner] }),
      client.readContract({ address, abi: marketViews, functionName: "debtSharesOf", args: [owner] }),
      client.readContract({ address, abi: marketViews, functionName: "collateralOf", args: [owner] }),
      client.readContract({ address, abi: marketViews, functionName: "principalOutstanding", args: [owner] }),
      client.readContract({ address, abi: marketViews, functionName: "defaulted", args: [owner] }),
      client.readContract({ address, abi: marketViews, functionName: "writtenOffLiability", args: [owner] }),
    ]);
    return {
      ...position,
      supplyShares: supplyShares as bigint,
      debtShares: debtShares as bigint,
      collateral: collateral as bigint,
      principalOutstanding: principal as bigint,
      defaulted: defaulted as boolean,
      writtenOffLiability: writtenOff as bigint,
    };
  } catch {
    return position;
  }
}
