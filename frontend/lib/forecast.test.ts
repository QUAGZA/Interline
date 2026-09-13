import { describe, expect, it } from "vitest";
import { RAY, YEAR, debtFromShares, isLiquidatable, projectIndex } from "@interline/math";
import {
  FROZEN_ASSUMPTIONS,
  HORIZON_SECONDS,
  liquidationScenario,
  projectScenarioDebt,
} from "./forecast";

const APR_5 = 5n * 10n ** 25n;
const DEBT_100 = 100_000_000n;
const SHARES_100 = DEBT_100 * RAY;

function base(overrides: Partial<Parameters<typeof liquidationScenario>[0]> = {}) {
  return {
    healthCode: "OK" as const,
    liquidatable: false,
    oracleStatus: "ok" as const,
    debtShares: SHARES_100.toString(),
    epochIndexRay: RAY.toString(),
    epochAprRay: APR_5.toString(),
    epochTimestamp: "1",
    recordedTimestamp: "1",
    liquidationCapacityRaw: "120000000",
    ...overrides,
  };
}

describe("horizon constant", () => {
  it("is 365 days in seconds, not 365 years", () => {
    expect(HORIZON_SECONDS).toBe(YEAR);
    expect(HORIZON_SECONDS).toBe(365n * 86400n);
    expect(HORIZON_SECONDS).not.toBe(365n * YEAR);
  });
});

describe("audit reproduction (100 debt / 120 cap / 5% APR)", () => {
  it("does not classify a multi-year crossing as within the 365-day horizon", () => {
    const forecast = liquidationScenario(base());
    expect(forecast.kind).toBe("not-in-horizon");
    expect(forecast.firstLiquidatableSecond).toBeNull();
    expect(forecast.assumptions).toContain("frozen");
  });
});

describe("edge cases", () => {
  it("returns no-debt when shares are zero", () => {
    const forecast = liquidationScenario(base({ healthCode: "NO_DEBT", debtShares: "0" }));
    expect(forecast.kind).toBe("no-debt");
    expect(forecast.firstLiquidatableSecond).toBeNull();
  });

  it("returns not-in-horizon when APR is zero and the position is not eligible", () => {
    const forecast = liquidationScenario(base({ epochAprRay: "0" }));
    expect(forecast.kind).toBe("not-in-horizon");
    expect(forecast.firstLiquidatableSecond).toBeNull();
    expect(forecast.assumptions).toMatch(/zero/i);
  });

  it("returns unavailable when the oracle is invalid", () => {
    const forecast = liquidationScenario(
      base({ healthCode: "UNAVAILABLE", oracleStatus: "unavailable" }),
    );
    expect(forecast.kind).toBe("unavailable");
    expect(forecast.firstLiquidatableSecond).toBeNull();
  });

  it("returns unknown when the oracle is stale", () => {
    const forecast = liquidationScenario(base({ oracleStatus: "stale" }));
    expect(forecast.kind).toBe("unknown");
    expect(forecast.firstLiquidatableSecond).toBeNull();
  });

  it("returns unknown when projection inputs are missing", () => {
    const forecast = liquidationScenario(base({ debtShares: "" }));
    expect(forecast.kind).toBe("unknown");
  });

  it("returns unknown when the recorded timestamp is before the epoch", () => {
    const forecast = liquidationScenario(base({ recordedTimestamp: "0", epochTimestamp: "10" }));
    expect(forecast.kind).toBe("unknown");
  });
});

describe("contract inequality", () => {
  it("treats equality with capacity as not liquidatable at the horizon", () => {
    const atHorizon = projectScenarioDebt({
      debtShares: SHARES_100,
      epochIndexRay: RAY,
      epochAprRay: APR_5,
      epochTimestamp: 1n,
      recordedTimestamp: 1n,
      dt: HORIZON_SECONDS,
    });
    const equal = liquidationScenario(base({ liquidationCapacityRaw: atHorizon.toString() }));
    expect(isLiquidatable(atHorizon, atHorizon)).toBe(false);
    expect(equal.kind).toBe("not-in-horizon");
    expect(equal.firstLiquidatableSecond).toBeNull();

    const over = liquidationScenario(base({ liquidationCapacityRaw: (atHorizon - 1n).toString() }));
    expect(over.kind).toBe("within-horizon");
    expect(over.firstLiquidatableSecond).not.toBeNull();
    const dt = over.firstLiquidatableSecond!;
    expect(dt <= HORIZON_SECONDS).toBe(true);
    const debtAt = projectScenarioDebt({
      debtShares: SHARES_100,
      epochIndexRay: RAY,
      epochAprRay: APR_5,
      epochTimestamp: 1n,
      recordedTimestamp: 1n,
      dt,
    });
    expect(isLiquidatable(debtAt, atHorizon - 1n)).toBe(true);
    if (dt > 0n) {
      const before = projectScenarioDebt({
        debtShares: SHARES_100,
        epochIndexRay: RAY,
        epochAprRay: APR_5,
        epochTimestamp: 1n,
        recordedTimestamp: 1n,
        dt: dt - 1n,
      });
      expect(isLiquidatable(before, atHorizon - 1n)).toBe(false);
    }
  });

  it("projects from shares, index, epoch, and one recorded timestamp", () => {
    const epochTs = 1_000n;
    const recorded = 1_000n + 3_600n;
    const dt = 86_400n;
    const fromHelper = projectScenarioDebt({
      debtShares: SHARES_100,
      epochIndexRay: RAY,
      epochAprRay: APR_5,
      epochTimestamp: epochTs,
      recordedTimestamp: recorded,
      dt,
    });
    const index = projectIndex(RAY, APR_5, epochTs, recorded + dt);
    expect(fromHelper).toBe(debtFromShares(SHARES_100, index));
  });

  it("marks already-eligible when debt already exceeds capacity", () => {
    const forecast = liquidationScenario(base({ liquidationCapacityRaw: "1", liquidatable: true }));
    expect(forecast.kind).toBe("already-eligible");
    expect(forecast.firstLiquidatableSecond).toBe(0n);
  });

  it("finds a crossing inside 365 days when capacity sits just above current debt", () => {
    const forecast = liquidationScenario(base({ liquidationCapacityRaw: "104000000" }));
    expect(forecast.kind).toBe("within-horizon");
    expect(forecast.firstLiquidatableSecond).not.toBeNull();
    expect(forecast.firstLiquidatableSecond! <= HORIZON_SECONDS).toBe(true);
    expect(forecast.firstLiquidatableSecond! > 0n).toBe(true);
    expect(forecast.assumptions).toBe(FROZEN_ASSUMPTIONS);
  });
});
