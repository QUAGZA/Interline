# Audit reproduction results — 13 September 2026

These are demonstrations of existing defects. PASS means the bad behavior was observed and asserted. It is not a security or release certification.

## Frozen Solidity runs

Source: `solidity-source-snapshot.zip`. Compiler: Solidity 0.8.24, via-IR, optimizer enabled, runs 1. Dependency revisions are in the archive metadata. No deployed network or live user funds were used.

Pool suite: four assertions passed in the completed pool run. The direct test was subsequently separated into its own file to correct its Foundry prank setup and validate it independently. Pool assertions were unchanged by that separation.

```text
[PASS] test_AUDIT_CuratorChangesCapWithoutBorrowerConsent()
[PASS] test_AUDIT_ExactCollateralSeizesMoreThanFivePercentBonus()
[PASS] test_AUDIT_RecoveryExceedsWrittenOffDebtAndNeverClears()
[PASS] test_AUDIT_SiblingProposalExecutesAfterNonceConsumed()
```

Final direct-only run:

```text
Solc 0.8.24 finished in 241.00s
Compiler run successful!
Ran 1 test for test/audit/DirectReviewReproduction.t.sol:DirectAuditReproductions
[PASS] test_AUDIT_RecallCanDelayEarlierMaturityRecovery() (gas: 5686545)
1 tests passed, 0 failed, 0 skipped
```

## TypeScript coordinator/forecast checks

Command: `npx tsx tools/audit-reproductions.ts`.

```text
AUDIT confirmed: 365-day UI classifies 1330d 22h as within horizon
AUDIT confirmed: failed transfer simulation prevents first approval from being requested
```

## Indexer crash/retry check

Command: `npm run test -w interline-indexer -- tests/audit-reproductions.test.ts`.

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The test persists a Supplied event, throws before persisting its newly discovered position, retries, and verifies the position is still missing even though the index cursor advances.

## Baseline boundaries

Initial API suite: 17 passed. Initial math golden vectors: passed. Initial frontend lint: zero errors, one warning. Initial frontend type check: no diagnostics. Server/keeper type checks failed as described in the report. Default Foundry compilation failed with Stack too deep. The full optimized live-working-tree compilation was stopped when superseded by the frozen review; no full-suite pass is claimed. Complete connected-wallet browser acceptance was not run.
