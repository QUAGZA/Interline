# Interline V2 operator runbook

Operational duties for Anvil and Base Sepolia. Production mainnet is blocked until [V2_PRODUCTION_GATES.md](./V2_PRODUCTION_GATES.md) is satisfied.

## Roles (testnet)

| Role | Does | Does not |
|---|---|---|
| Curator | Create reviewed markets; approve optional restricted cap proposals | Sweep funds, set prices, borrow as a user |
| Guardian | Freeze new supply/borrow; start restricted recall with a reason | Seize healthy collateral; block repay |
| Mock operator | Update simulated feeds / venue pause / yield / loss | Exist as a production price authority |
| Keeper (optional) | Call public `liquidate` and `publicExitAndRepay` with its own gas/assets | Hold user keys or exclusive rights |
| Public liquidator | Same `liquidate` as the keeper | Liquidate a healthy position |

Rotate curator/guardian through the two-step transfer on factory/market. A curator rotation invalidates pending cap proposals from the old epoch.

## Freeze and recall

1. Guardian `setBorrowFrozen` / `setSupplyFrozen` as needed. Repay, add collateral, and withdraw (if cash exists) remain available.
2. Restricted only: `startRecall(reason)` — blocks new borrow and venue **entry**; owner exits and repay stay on. After `recallDeadline`, anyone may unwind venue shares **to the vault then repay**. After `recallClearableAt` (`deadline + recoveryDelay`) guardian may `clearRecall`.
3. Recall expiry is **not** a liquidation of healthy collateral.

## Simulated oracle

Manifests are `oracleMode: "simulated"`. Mock feeds must keep `updatedAt` fresh (≤ 3600s). A stale or down sequencer returns `UNAVAILABLE` — UI must not show a healthy HF. Never copy a Base mainnet sequencer address into testnet config.

To exercise liquidation locally, drop the mWETH mock answer until `debt > liquidationCapacity`, then call `liquidate` (or let the keeper do it).

## Venue incidents

`MockERC4626Venue.setPaused(true)` blocks new entry; withdraw/redeem paths are still the unwind route. Failed venue exits are **external** failures — distinguish them from Interline permission errors.

## Recovery

On collateral-exhausted write-off, suppliers claim from `MarketRecoveryEscrow` after recovered assets arrive. Do not send leftover vault mUSDC to the defaulted borrower while `writtenOffLiability` remains (`recoverIdleToEscrow`).

## Indexer

- Env allowlist only (RPC, `DATABASE_URL`, factory, start block).
- If lag is high, mark API degraded; do not serve stale totals as zero.
- After a reorg, the indexer rolls back by block hash/number, not by dropping the database.
- Restart must resume the cursor.

## Keeper

See [V2_LOCAL_AND_TESTNET_RUNBOOK.md](./V2_LOCAL_AND_TESTNET_RUNBOOK.md). Fund mUSDC + gas on the keeper address. `KEEPER_DRY_RUN=1` for a first pass. Treat keeper outages as “liquidations may be delayed,” not “positions are safe.”
