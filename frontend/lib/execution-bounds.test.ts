import { describe, expect, it } from "vitest";
import {
  borrowDebtShares,
  debtFromShares,
  EXECUTION_TOLERANCE_BPS,
  maxBoundFromQuote,
  minBoundFromQuote,
  mintSupplyShares,
  withdrawSharesBurn,
} from "./execution-bounds";

describe("execution bounds from a quote", () => {
  it("haircuts minOut and raises maxIn by the tolerance", () => {
    const quoted = 1_000_000n;
    const slack = (quoted * EXECUTION_TOLERANCE_BPS) / 10_000n;
    expect(minBoundFromQuote(quoted)).toBe(quoted - slack);
    expect(maxBoundFromQuote(quoted)).toBe(quoted + slack);
    expect(minBoundFromQuote(quoted)).toBeGreaterThan(0n);
    expect(maxBoundFromQuote(quoted)).toBeLessThan(quoted * 2n);
  });

  it("does not collapse a tiny quote to zero", () => {
    expect(minBoundFromQuote(1n)).toBe(1n);
    expect(maxBoundFromQuote(1n)).toBe(2n);
  });

  it("quotes first supply shares and a withdraw burn", () => {
    const shares = mintSupplyShares(5_000n * 10n ** 6n, 0n, 0n);
    expect(shares).toBe(5_000n * 10n ** 6n * 10n ** 12n);
    const burn = withdrawSharesBurn(1_000n * 10n ** 6n, shares, 5_000n * 10n ** 6n);
    expect(burn).toBeGreaterThan(0n);
    expect(minBoundFromQuote(shares)).toBeLessThan(shares);
    expect(maxBoundFromQuote(burn)).toBeGreaterThan(burn);
  });

  it("quotes direct-style debt after a 6-decimal borrow instead of assets+1e18", () => {
    const index = 10n ** 27n;
    const assets = 1_000n * 10n ** 6n;
    const newShares = borrowDebtShares(assets, index);
    const debtAfter = debtFromShares(newShares, index);
    const maxDebtAfter = maxBoundFromQuote(debtAfter);
    expect(debtAfter).toBeGreaterThanOrEqual(assets);
    expect(maxDebtAfter).toBeLessThan(assets + 10n ** 18n);
    expect(maxDebtAfter - debtAfter).toBeLessThan(assets / 100n);
  });
});
