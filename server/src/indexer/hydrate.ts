import type { PublicClient } from "viem";
import { erc20Views, facilityViews, marketViews, oracleAbi } from "./abis.js";
import type { DirectFacilityRecord, Hex, MarketRecord, OracleStatus, PositionRecord } from "../domain.js";

const ORACLE_BY_CODE: OracleStatus[] = ["OK", "STALE", "SEQUENCER_DOWN", "INVALID", "UNAVAILABLE"];

function oracleFrom(code: number): OracleStatus {
  return ORACLE_BY_CODE[code] ?? "UNAVAILABLE";
}

export type HydrationPin = {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp: bigint;
};

export type HydrationResult<T> = {
  value: T;
  ok: boolean;
  error: string | null;
};

function failed<T>(value: T, error: unknown): HydrationResult<T> {
  return {
    value,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export async function hydrateMarketFromChain(
  client: PublicClient,
  market: MarketRecord,
  pin: HydrationPin,
): Promise<HydrationResult<MarketRecord>> {
  const address = market.address;
  const read = <T>(functionName: string, args?: readonly unknown[]) =>
    client.readContract({
      address,
      abi: marketViews,
      functionName: functionName as never,
      args: args as never,
      blockNumber: pin.blockNumber,
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
        blockNumber: pin.blockNumber,
      })) as string;
      collateralSymbol = (await client.readContract({
        address: collateralToken,
        abi: erc20Views,
        functionName: "symbol",
        blockNumber: pin.blockNumber,
      })) as string;
    } catch {
      // keep seeded symbols
    }

    let oracleStatus: OracleStatus = "UNAVAILABLE";
    let quoteScale36 = market.quoteScale36;
    let collateralUsdWad = market.collateralUsdWad;
    let loanUsdWad = market.loanUsdWad;
    try {
      const quote = (await client.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "quote",
        blockNumber: pin.blockNumber,
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
      value: {
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
      },
      ok: true,
      error: null,
    };
  } catch (error) {
    return failed({ ...market, oracleStatus: "UNAVAILABLE" }, error);
  }
}

export async function hydratePositionFromChain(
  client: PublicClient,
  market: MarketRecord,
  position: PositionRecord,
  pin: HydrationPin,
): Promise<HydrationResult<PositionRecord>> {
  const address = market.address;
  const owner = position.owner;
  try {
    const [supplyShares, debtShares, collateral, principal, defaulted, writtenOff] = await Promise.all([
      client.readContract({
        address,
        abi: marketViews,
        functionName: "supplySharesOf",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
      client.readContract({
        address,
        abi: marketViews,
        functionName: "debtSharesOf",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
      client.readContract({
        address,
        abi: marketViews,
        functionName: "collateralOf",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
      client.readContract({
        address,
        abi: marketViews,
        functionName: "principalOutstanding",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
      client.readContract({
        address,
        abi: marketViews,
        functionName: "defaulted",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
      client.readContract({
        address,
        abi: marketViews,
        functionName: "writtenOffLiability",
        args: [owner],
        blockNumber: pin.blockNumber,
      }),
    ]);
    return {
      value: {
        ...position,
        supplyShares: supplyShares as bigint,
        debtShares: debtShares as bigint,
        collateral: collateral as bigint,
        principalOutstanding: principal as bigint,
        defaulted: defaulted as boolean,
        writtenOffLiability: writtenOff as bigint,
      },
      ok: true,
      error: null,
    };
  } catch (error) {
    return failed(position, error);
  }
}

export async function hydrateFacilityFromChain(
  client: PublicClient,
  row: DirectFacilityRecord,
  pin: HydrationPin,
): Promise<HydrationResult<DirectFacilityRecord>> {
  const address = row.facility;
  try {
    const read = <T>(functionName: string) =>
      client.readContract({
        address,
        abi: facilityViews,
        functionName: functionName as never,
        blockNumber: pin.blockNumber,
      }) as Promise<T>;
    const [
      loanToken,
      lender,
      borrower,
      vault,
      termsHash,
      creditLimit,
      accountedCash,
      debtShares,
      principal,
      currentDebt,
      aprRay,
      acceptanceDeadline,
      activatedAt,
      borrowExpiry,
      repaymentDueAt,
      lenderAccepted,
      borrowerAccepted,
      declined,
      cancelled,
      ended,
      borrowingPaused,
      recallActive,
      recallDeadline,
      venue,
      swapRouter,
      otherToken,
      borrowPeriod,
      recallWindow,
    ] = await Promise.all([
      read<`0x${string}`>("loanToken"),
      read<`0x${string}`>("lender"),
      read<`0x${string}`>("borrower"),
      read<`0x${string}`>("vault"),
      read<`0x${string}`>("termsHash"),
      read<bigint>("creditLimit"),
      read<bigint>("accountedCash"),
      read<bigint>("debtShares"),
      read<bigint>("principalOutstanding"),
      read<bigint>("currentDebt"),
      read<bigint>("aprRay"),
      read<bigint>("acceptanceDeadline"),
      read<bigint>("activatedAt"),
      read<bigint>("borrowExpiry"),
      read<bigint>("repaymentDueAt"),
      read<boolean>("lenderAccepted"),
      read<boolean>("borrowerAccepted"),
      read<boolean>("declined"),
      read<boolean>("cancelled"),
      read<boolean>("ended"),
      read<boolean>("borrowingPaused"),
      read<boolean>("recallActive"),
      read<bigint>("recallDeadline"),
      read<`0x${string}`>("venue"),
      read<`0x${string}`>("swapRouter"),
      read<`0x${string}`>("otherToken"),
      read<bigint>("borrowPeriod"),
      read<bigint>("recallWindow"),
    ]);
    return {
      value: {
        ...row,
        asset: loanToken,
        lender,
        borrower,
        vault,
        termsHash: termsHash as DirectFacilityRecord["termsHash"],
        creditLimit,
        accountedCash,
        debtShares,
        principal,
        lastDebt: currentDebt,
        aprRay,
        acceptanceDeadline: BigInt(acceptanceDeadline),
        activatedAt: BigInt(activatedAt),
        borrowExpiry: BigInt(borrowExpiry),
        repaymentDueAt: BigInt(repaymentDueAt),
        lenderAccepted,
        borrowerAccepted,
        declined,
        cancelled,
        ended,
        borrowingPaused,
        recallActive,
        recallDeadline: BigInt(recallDeadline),
        venue,
        swapRouter,
        otherToken,
        borrowPeriod: BigInt(borrowPeriod),
        recallWindow: BigInt(recallWindow),
      },
      ok: true,
      error: null,
    };
  } catch (error) {
    return failed(row, error);
  }
}
