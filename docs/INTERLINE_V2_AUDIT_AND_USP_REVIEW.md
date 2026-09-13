# Interline V2 — implementation audit and product differentiation review

**Review date:** 13 September 2026. **Target:** `E:/Projects/Coding and AI/InterlineV2/Interline`. **Git base:** `caf1c5a`, plus substantial uncommitted implementation work. This is the V2 project named in the conversation, not the older repository at `E:/Projects/Coding and AI/Interline`.

**Verdict:** Interline has a meaningful prototype of isolated lending markets plus named bilateral credit agreements. It does not yet support a credible claim of being a generally better Aave. Its strongest potential product is a credit-agreement workspace where lenders and borrowers negotiate permitted uses of capital, see the same funds/recovery ledger, and can execute a bounded exit process. Several financial-correctness and transaction-flow defects need fixing before expanding the feature set.

This report separates implemented behavior, reproduced defects, design gaps, and proposed positioning. PRDs were read as product context, not as instructions to perform their embedded coding prompts or as proof that their claims are true. No application or contract fixes were applied during this review. Audit-only reproduction files and this report were added.

## 1. Scope, evidence, and changing-source caveat

Reviewed the V2 lending market, factories, vault, adapter, recovery escrow, interest/share/liquidation libraries, oracle wrapper, direct facility and lens, transaction coordinator, pool/direct action components, position/dashboard presentation, forecast code, API/indexer/persistence, keeper, package configuration, and existing tests.

The working tree changed during review. In particular, direct lending changed from unsecured credit to an 80% origination-LTV collateral requirement, including constructor/factory changes. Some accompanying frontend and documentation changes arrived later. This report does not assume that an earlier test run validates later changes.

Evidence:

- `audit-2026-09-13/source-hashes.json`: SHA-256 inventory of 182 source/test files captured during review. Timestamps make later changes identifiable.
- A frozen Solidity copy was created at `C:/Users/ACER/AppData/Local/Temp/interline-audit-20260913` to test without chasing ongoing edits. Its contract source includes the newly introduced direct collateral requirement.
- `test/audit/ReviewReproductions.t.sol` and `test/audit/DirectReviewReproduction.t.sol` (repository-relative paths): local Solidity demonstrations of defective behavior.
- `audit-2026-09-13/solidity-source-snapshot.zip`: frozen Solidity source/config/tests for reproducing the findings; restore the repository's OpenZeppelin and forge-std dependencies at the remapped paths before running it.
- `tools/audit-reproductions.ts`: forecast and transaction-order demonstrations.
- `server/tests/audit-reproductions.test.ts`: indexer crash/retry demonstration.

**The reproduction tests assert the current bad behavior. A passing reproduction proves the defect; it does not certify correctness.** Convert these assertions into prevention/regression assertions as each issue is fixed.

Scope limits: this is an engineering review, not an independent security certification. No production transactions were sent. Existing browser tests were inspected but a complete connected-wallet browser run was not performed. No proof of production liquidity, actual venue yield, deployed-bytecode equivalence, multisig operations, or economic profitability is claimed. Legacy v0 is retained but was not re-audited to the same depth as V2.

## 2. What is implemented well

1. **Participation is no longer inherently one hardcoded wallet pair.** Pool balances and debts are keyed by wallet; the direct factory creates facilities for different named pairs. The remaining v0 deployment environment variables are not evidence that V2 is restricted to those demo identities.
2. **Roles are contextual.** The header identifies wallet/network; direct facilities identify their lender and borrower. One wallet can lend in one facility, borrow in another, and hold pool supply/debt simultaneously.
3. **Bilateral cash and pooled liquidity are separate accounting systems.** Direct funding does not mint pool shares or change a pooled utilization rate.
4. **Restricted vault initialization is materially stronger than v0.** Owner/controller are constructor-bound. The vault exposes typed operations, not unrestricted arbitrary calls.
5. **Custody boundaries are explicit in contracts.** Pool collateral is separate from borrowed vault assets. The code does not count borrowed money twice as additional collateral or pool assets.
6. **Pool accounting uses integer arithmetic and explicit shares.** Ignoring unsolicited token transfers in accounted cash avoids a common donation/share-price manipulation surface. Transfer-delta checks reject unsupported transfer behavior at market boundaries.
7. **Oracle failure has an explicit status.** The oracle wrapper validates feed positivity/age and sequencer conditions; the pool gates risk-increasing actions. Debt-free collateral withdrawal does not need a valid price.
8. **Recall and liquidation are different mechanisms.** A healthy pooled borrower is not liquidated solely because a recall deadline passed. Owner venue exits/reverse swaps remain exposed during recall.
9. **Historical recovery claims are an intentional feature.** Supplier snapshots exist so late recoveries can reach the suppliers who bore a write-off rather than whichever suppliers happen to hold shares later. The payout boundary still needs the correction in A04.
10. **Receipt checking has improved.** The shared transaction coordinator waits for approval and action receipts and checks reverted status. Its ordering is nevertheless wrong for a fresh allowance, as A02 explains.
11. **There is a real test and indexing foundation.** This is substantially beyond the original single-facility demo. The remaining work is correctness and complete user journeys, not simply adding more metric cards.

## 3. Findings at a glance

Severity reflects the prototype's behavior and consequences if funded; it is not a claim that mainnet funds are currently at risk. “High” includes meaningful incorrect value transfers, missing recovery rights, and blocked core workflows. “Medium” includes misleading risk information, operational failure, or negotiation defects with narrower preconditions.

| ID | Severity | Finding | Evidence type |
|---|---|---|---|
| A01 | High | Exact-collateral liquidation can seize excess borrower collateral | Solidity reproduction |
| A02 | High | Fresh wallets cannot reach ERC-20 approval in normal action flow | Coordinator reproduction + contract transfer behavior |
| A03 | High/Medium | Pooled cap negotiation lacks borrower consent and nonce invalidation; proposal is public | Solidity reproductions + calldata inspection |
| A04 | High | Recovery can overpay suppliers and permanently lock borrower surplus | Solidity reproduction |
| A05 | High design gap | New direct collateral has no lender settlement/seizure route when repayment fails | Contract inspection |
| A06 | Medium | Direct recall can postpone an earlier maturity recovery deadline | Solidity reproduction |
| A07 | Medium | “365-day” forecast searches 365 years and is not contract-exact | Executed TypeScript reproduction |
| A08 | High | Indexer crash can permanently lose a newly discovered position | Executed crash/retry reproduction |
| A09 | Medium | API snapshots mix blocks and can conceal hydration failures | Code inspection |
| A10 | High usability | Core repay/exit/release paths are missing from normal portal controls | Component/call-site inspection |
| A11 | Medium | Direct cap import can misrepresent the amount being approved | Code inspection |
| A12 | Medium | Keeper coverage and liquidation execution are incomplete | Code inspection |
| A13 | Medium | New pool/vault activity in a discovery batch can be skipped | Code inspection |
| A14 | High release blocker | Factories exceed ordinary deployment size limits; default compilation/type checking also fail | Executed commands and compiled bytecode |
| A15 | Medium hardening | Execution bounds, account changes, and pending-action isolation need strengthening | Code inspection |
| A16 | Improvement | Accessibility, fixture fallback, and test assertions need stronger acceptance criteria | Code/test inspection |

## 4. Detailed findings and required fixes

### A01 — Exact-collateral liquidation can take too much collateral

**Location:** `src/v2/libraries/LiquidationMath.sol:100`, especially the assignment to `q.collateralOut` at line 116; used by `LendingMarket.liquidate`.

`_fromCollateral` derives a repayment budget from the caller's requested collateral. `repaySharesBurn` caps burned debt shares at the borrower's remaining debt. When that cap applies, the function still transfers the entire requested collateral. It does not reduce the collateral to match the smaller actual repayment.

Example reproduced using the market fixture:

1. Borrower posts 1 WETH priced at $2,000 and borrows 1,400 USDC.
2. WETH falls to $1,550. At the frozen fixture's 90% liquidation threshold, capacity is $1,395, so the position is eligible. The pool parameters also changed during the review; the archived fixture is authoritative for this example.
3. Liquidator requests all 1 WETH in exact-collateral mode.
4. The contract caps repayment at the remaining 1,400 USDC debt, but gives the liquidator the entire $1,550 of collateral.
5. The configured 5% bonus should correspond to about $1,470 of collateral. Instead, the liquidator receives $80 more than that amount, and the borrower loses the residual collateral.

This is not merely permissive 100% debt closure. Closing all debt and confiscating all collateral are different things.

**Fix:** when the remaining debt caps repayment, recompute collateral output from the actual debt repayment and configured bonus, or reject an exact-collateral request that cannot preserve its defined exchange ratio. Update Solidity and TypeScript quote logic together. Specify rounding bounds in raw units.

**Acceptance:** fuzz both quote modes over solvent-but-liquidatable and insolvent positions; collateral value seized must not exceed actual repayment plus the permitted bonus and documented rounding tolerance. Verify residual collateral remains withdrawable by the borrower after a full debt close. Tests must exercise both quote modes, not just exact debt shares.

### A02 — Approval is requested after a simulation that already needs approval

**Location:** `frontend/features/transactions/run-tx.ts:28`; pool callers in `features/markets/market-actions.tsx`; direct callers in `features/direct/actions.tsx`.

The coordinator first calls the action's `simulateContract`, then reads allowance and requests approval. Supply, collateral deposit, direct funding, and wallet repayment execute ERC-20 `transferFrom`. A new wallet with zero allowance fails simulation before the code ever asks that wallet to approve.

The audit harness supplies a simulation failure corresponding to insufficient allowance and verifies that both allowance reads and wallet writes remain zero. Existing protocol tests preapprove directly, which bypasses this frontend defect.

**Fix:** separate validation/preview from executable simulation. Validate amount, chain, account, spender, balance, and expected result first. Obtain any required approval and await its receipt. Then simulate the actual action against approved state, refresh the account/chain and quote, and submit. If simulating before approval is required for preview, use a supported, narrowly scoped simulation override and still simulate again after approval; do not silently ignore arbitrary errors.

**Acceptance:** actual UI journeys with fresh wallets and zero allowances for supply, collateral, direct funding, and repay. Also test approval rejection, approval replacement/cancellation, action revert, account switch, chain switch, and repeat actions after an exact allowance has been consumed.

### A03 — Pooled cap negotiations do not implement mutual private agreement

**Location:** `src/v2/LendingMarket.sol:487–520` by function: `proposeCap`, `approveCap`, `executeCap`.

Three separate problems:

- **No required borrower consent.** The curator can propose for any borrower and approve its own proposal. Execution requires only those flags. The curator can therefore change a limit without a borrower transaction. This defeats the intended bilateral borrower/curator agreement. It does not itself bypass collateral requirements.
- **Sibling proposals survive nonce consumption.** Proposal creation validates `nonce == capNonce[owner]`; execution does not. Create and approve two different digests at nonce 0, execute the first, then execute the second still at nonce 0. Both succeed. The existing replay test only retries the same cleared digest, so it misses this case.
- **No proposal confidentiality.** `proposeCap` accepts `newCap` and `salt` directly in public transaction calldata. Hashing them afterward does not conceal them until execution.

**Fix:** store only the commitment and public metadata at proposal time; use separate borrower and curator authorization; enforce the current nonce at execution; bind approvals to chain, market, borrower, curator identity/epoch, exact terms, and expiry; define cancellation and replacement semantics. Reject a new cap below live debt if that is the product rule. Use explicit emergency borrowing freezes for unilateral safety controls instead of disguising them as negotiated amendments.

**Acceptance:** curator-only proposal/approval cannot execute; borrower-only approval cannot execute; sibling old-nonce proposals fail; cancelled, expired, wrong-chain, old-curator, and modified-preimage requests fail. A transaction input inspection must show no concealed amount/salt before reveal.

### A04 — Recoveries have no debt ceiling or completed-recovery transition

**Locations:** `BorrowerVaultV2.sol:203–227`, `MarketRecoveryEscrow.sol:89–117`, and `LendingMarket.sol:_writeOff/recoveryObligation`.

After write-off, the vault sends **all** idle loan tokens into the recovery escrow. The escrow increases recovered assets without capping them at `debtWritten`. No callback decreases `writtenOffLiability`, and `defaulted` remains true. `releaseSurplus` remains blocked even after enough assets have been recovered.

Reproduction: a restricted loan has 1,400 USDC still idle in its vault; a collateral loss causes a partial liquidation and write-off of only the remaining shortfall. Recovering the vault transfers all 1,400 USDC to historical suppliers, including value above that shortfall. The same written-off obligation remains afterward.

**Fix:** define a settlement waterfall. Recover only the remaining enforceable liability, account for previous recoveries and any explicitly agreed costs, and route excess to a borrower-surplus balance. Separate a permanent historical default record from an outstanding recoverable amount. A historical default must not itself prohibit returning assets after settlement. Decide how accidental future transfers to a settled vault are returned. Block risk-increasing vault operations while a default obligation remains; current `entryBlocked()` only considers market recall.

**Acceptance:** total recovery distributions do not exceed the episode's authorized claim; repeated partial recoveries reconcile; former suppliers retain their proper shares; new suppliers do not gain old claims; borrower excess becomes releasable; a cleared recall does not re-enable risk-taking on an unresolved defaulted vault.

### A05 — Direct collateral is locked but not available to satisfy unpaid debt

**Locations:** latest direct contract `addCollateral`, `removeCollateral`, `_requireDebtWithinLtv`, `endAgreement`, and recovery methods.

The direct contract gained posted mWETH collateral and an 80% origination/withdrawal LTV check during review. It still explicitly has no liquidation or write-off mechanism. Its recall methods recover assets from the **borrower vault**; posted collateral resides in the **facility** and has no route to settle the lender's unpaid loan.

Consequently, a borrower can owe money after venue losses or refusal to repay while valuable posted collateral remains inaccessible to the lender. A price decrease or interest accrual above the origination limit does not trigger any collateral settlement. “Overcollateralized” at origination therefore does not establish enforceable lender recovery in this implementation.

This is a missing product rule and value-recovery path, not a recommendation to automatically seize healthy collateral on every recall. The original direct extension specified unsecured agreements; the implementation now follows a different model. The canonical PRD, acceptance summary, lens/API schemas, deployment version, and UI copy must agree on which product exists.

**Recommended decision:** define a distinct collateralized direct template with an explicit, mutually accepted default/settlement policy. State collateral ownership, thresholds, maturity/default conditions, notice/grace, settlement pricing, maximum lender recovery, borrower excess, oracle failure behavior, and who may execute. Retain an unsecured template only if deliberately supported and clearly labeled. Do not share one ambiguous label between the two.

**Acceptance:** if an agreement becomes unpaid after its contractual default process, demonstrate how posted collateral actually repays the lender and how residual collateral returns to the borrower. Also demonstrate that a recall alone cannot activate a settlement condition the borrower never accepted. Bind the relevant collateral/oracle/settlement policy into the accepted terms, not only into undocumented contract behavior.

### A06 — Direct recovery uses inconsistent deadline calculations

**Locations:** `DirectCreditFacility.sol:recallDeadline`, `_effectiveDue`; `BorrowerVaultV2.sol:_requirePublicDeRisk`.

The facility's `_effectiveDue()` takes the earlier contractual maturity or recall deadline. Its public `recallDeadline()` instead returns the recall deadline whenever a recall exists. The vault uses the latter.

If the lender recalls 100 seconds before maturity with a 300-second recall window, the facility recognizes recovery at maturity, but its vault rejects public venue exit/reverse-swap recovery until the later recall deadline. A recall can thus delay those recovery operations past an already agreed earlier deadline. Idle repayment through the controller's `repayFromVault` remains possible; the defect does not block every repayment route. `recoverVenue` also appears to admit a borrower before public recovery is open, but delegates to a vault method that still requires public-recovery timing; borrowers must use their owner exit method instead.

**Fix:** expose one authoritative effective-recovery timestamp and use it in the facility, vault, lens, API, keeper, and interface. Keep owner-initiated repayment and safe exits usable before public recovery opens. Specify boundary behavior at exact equality.

### A07 — Forecast horizon and arithmetic are misleading

**Locations:** `frontend/lib/forecast.ts:30,42`; `features/risk/liquidation-scenario.tsx`.

`YEAR` is 31,536,000 seconds. `HORIZON = 365n * YEAR` is 365 years, while the UI repeatedly calls it a 365-day horizon. The executed example starts with 100 units of debt, 120 of liquidation capacity, and 5% APR. It reports **1,330 days and 22 hours** as within the supposed 365-day horizon.

The implementation also grows an already rounded debt amount with floor rounding. Contract debt is derived from debt shares and the projected borrow index with its own rounding and epoch. The comment “contract-identical” and “first liquidatable second” promise more precision than this implementation supports.

**Fix:** use one year in seconds for the 365-day horizon; consume the shared math package; project from debt shares, index, epoch, and one recorded block timestamp. Clearly label frozen-price/frozen-rate scenarios. Show unknown when source data is stale, and distinguish interest-only scenarios from price stress. Avoid presenting an exact real-world liquidation date.

**Acceptance:** no crossing by day 365 gives “not within horizon”; crossing exactly at a boundary follows the contract inequality; no debt, zero APR, invalid oracle, changing epochs, and near-threshold rounding all match independently checked vectors. This feature should eventually suggest quantified repayment/collateral actions, not just display a clock.

### A08 — Indexer commits events and projections independently

**Locations:** `server/src/indexer/run.ts:154–180`; `server/src/db/store.ts`; PostgreSQL store insert/upsert methods.

The indexer persists an event before persisting the resulting market/position rows. On retry, `insertEvent` returns false for that event, and `applyEvent` is skipped. A crash between those writes can therefore make a discovered wallet disappear permanently from derived state even though its event remains stored and the cursor later advances.

The new audit test reproduces this: insert a supply event, fail position persistence, retry the same range, and observe that the cursor reaches block 1 while the supplier position list is empty. Hydrating known positions cannot discover a position that never reached the position table. The stored event makes explicit rebuild possible; the issue is that normal retry does not perform that repair, so omission can persist indefinitely without it or later activity.

**Fix:** commit event records, all derived state, block references, auxiliary direct data, and cursor advancement in one database transaction per committed range/block. Alternatively use a durable event journal with an independent projection checkpoint and deterministic idempotent replay. Do not use event insertion success as the sole permission to update projections. Serialize writers per chain.

**Acceptance:** inject failure after every persistence step, restart, and compare the final state to a clean replay. Run against real PostgreSQL as well as the in-memory store. Include direct facility discovery and snapshots, not only market cash.

### A09 — Hydration reads latest state but labels it with the indexed block

**Locations:** `server/src/indexer/hydrate.ts`; `run.ts:184–220`; `api/serialize.ts:freshnessOf`.

Hydration calls lack an explicit block number. The indexer may process a historical range ending at `to`, then read much newer market state from the RPC's latest head, and publish it with `lastBlock = to`. Reads within a `Promise.all` can also span different heads. This breaks the claimed snapshot relationship and can mix incompatible debt, cash, collateral, and price values.

Hydration catches sometimes return the old object. The indexer can still clear its error and update its timestamp. `freshnessOf` does not expose the cursor's failure detail, so an apparently current response need not mean the financial fields were refreshed successfully.

**Fix:** pin all state/price reads to one verified block, expose its number/hash/time, and commit those values together. Separate last successful hydration time from last attempted poll time. Return field/source availability and indexer errors explicitly. Do not silently retain a previous `OK` risk state when its refresh failed. Choose a finality policy and document how unfinalized data/reorgs appear.

### A10 — The normal interface does not complete the lending lifecycle

**Locations:** `features/positions/position-view.tsx:90–91`, `features/markets/market-actions.tsx`, `features/direct/actions.tsx`, `features/direct/facility-detail.tsx`.

For pooled owners, `MarketActions` exposes supply/withdraw and add-collateral/borrow. The repay component is rendered only for a connected **non-owner**. There is no active V2 owner `repayAll` or `removeCollateral` call site in the inspected feature flow. A borrower can open a position but cannot close it normally through that screen.

Direct lending exposes venue **entry**, but the inspected dialog has no venue exit/redeem, reverse swap, vault-idle repay, or surplus release action. Its repayment copy says “wallet (or vault idle)” while the submitted function is `repayAssets`, which pulls from the connected wallet. This can leave borrowed funds in the vault and force an unnecessary outside-wallet repayment. The interface also lacks matching resume/clear-recall paths for exposed pause/recall operations.

Direct collateral controls were added during review; they do not solve the missing vault exit/repayment paths above. Do not interpret this report as a request to remove those newer collateral controls.

**Fix:** build complete workflows before more cards. Pool owner: repay partial/full, add/remove collateral, withdraw/redeem supply. Direct borrower: view vault idle/shares/redeemable value, enter, exit, repay from chosen source, release settled surplus. Lender: fund, withdraw idle cash, pause/resume, recall/clear only in eligible states. Public recovery: show eligible actions and actual limitations. Recovery claimant: claim historical recoveries.

Each action should identify “from”, “to”, amount, asset, addresses, resulting debt/collateral, and remaining cash. In direct lending, name the actual counterparty; in pooled lending, state that the counterparty is pooled liquidity rather than inventing a single matching lender.

**Acceptance:** one person completes supply → withdraw and collateral → borrow → repay → remove collateral without an explorer or second wallet. Two fresh named wallets complete create → accept → fund → collateral if required → borrow → venue enter → exit → vault repay → withdraw → surplus release → close. Test swapped roles in a second agreement.

### A11 — Imported cap requests are not cryptographically matched to their displayed terms

**Location:** `features/direct/actions.tsx:LimitDialog` (around lines 430 onward in the later live source).

The code parses imported JSON with a TypeScript assertion. Approval submits `parsed.digest` without recomputing it from displayed `newCap`, nonce, expiry, salt, chain, and facility. A counterparty can provide a file whose human-facing fields describe one amount while its digest commits to another. The contract verifies execution against the digest, not what the other party was led to believe they approved.

The salt is derived from facility, nonce, and `Date.now()`, which is guessable, not a cryptographically random secret. Hashing predictable inputs does not create strong confidentiality.

**Fix:** schema-validate imports; require matching chain/facility/parties; locally recompute and compare the digest; fetch and match the pending on-chain commitment; display decoded financial terms on a review screen before approval. Generate 32 random bytes with a cryptographically secure generator. Make export an actual downloadable versioned request plus copy support. Define recovery when a user loses the preimage. Never call this encrypted negotiation.

**Acceptance:** tampered amount, salt, facility, chain, nonce, expiry, or digest disables approval with a precise explanation. Manual JSON must not be the normal counterparty workflow.

### A12 — Keeper is a partial testnet helper, not complete automatic protection

**Locations:** `keeper/src/index.ts:positionsFromApi/tick/main`, `liquidations.ts:38,69`, `recalls.ts`.

- API position discovery ignores `nextCursor`. If a market already has some owners in the first page, the log fallback is not used for its missing owners. Page size is controlled by the API, not the requested `limit=100`.
- The keeper only handles pooled markets. The new direct recovery lifecycle has no corresponding discovery/execution loop here.
- Recall recovery exits venue shares only. It does not systematically repay already idle vault cash, unwind other tokens, or recover post-write-off assets independently of an active recall.
- Full-debt liquidation uses exact quote bounds. Interest accrued between preview, approval, and the action can make `maxLoanAssetsIn` insufficient. In an insolvent position the full-debt route can also pay more than the collateral is worth; there is no profitability/rational-cost check.
- `setInterval` can start overlapping ticks when one tick runs longer than the poll period.

**Fix:** cursor-complete discovery, durable per-chain progress, one in-flight tick, re-quote after approval, bounded permissible drift, economic checks for liquidations, and explicit separate work queues for idle repay, venue exit, swap unwind, and historical recovery. Add direct facilities deliberately. Permissionless callable functions do not mean a dependable operator is running them.

**Acceptance:** more than one API page, RPC failure, stuck transaction, quote drift, gas cost above incentive, partially illiquid venue, direct maturity, and unresolved default all have tested behavior. Report what was attempted, recovered, remaining, and blocked.

### A13 — Same-range discovery is incomplete for pooled deployments

**Location:** `server/src/indexer/run.ts:watchedAddresses` and its second log query for `discovered` facilities.

The initial log address list contains previously known contracts. The second query backfills newly discovered **direct** facilities and their vaults, but not newly created pooled markets or borrower vaults. If a factory creates a pool and users act on it within the same fetched range, those new market-address logs can be missed when the cursor advances. Latest-state hydration can restore some aggregate values but cannot enumerate unknown suppliers/borrowers or rebuild omitted activity.

**Fix:** iteratively discover and query all registered contract classes within the same bounded range, then merge/de-duplicate/sort logs by block/transaction/log index before projection. Or process blocks with creation-aware discovery. Persist provenance so untrusted contracts cannot masquerade as registered markets.

**Acceptance:** pool creation + supply + collateral + borrow + new-vault venue use in a single block and in one multi-block range produce complete positions/events; repeat after crash and reorg.

### A14 — Reproducible builds, type checks, and ordinary deployment need work

The default `forge test --summary` fails with **Stack too deep**. The root Foundry profile does not declare `via_ir`; runbooks instead rely on command-line flags. Server type checking reports nullable-chain-ID errors in the API. Keeper type checking reports `.ts` import-extension configuration errors in `packages/protocol/src/index.ts`.

The direct-lending runbook explicitly asks for Anvil's `--disable-code-size-limit`. Measured frozen-source runtime bytecode under Solidity 0.8.24, via-IR, optimizer runs 1 is **27,600 bytes for MarketFactory** and **31,077 bytes for DirectFacilityFactory**. Both exceed the ordinary 24,576-byte EIP-170 runtime limit. This is a confirmed deployment blocker under standard EVM limits, not merely a speculative size concern. A successful disabled-limit deployment is not a Base Sepolia deployment acceptance test. [EIP-170](https://eips.ethereum.org/EIPS/eip-170).

**Fix:** commit one supported compiler profile and package scripts; type-check all workspaces in CI; set size budgets; split factory/deployer responsibilities or redesign deployment if embedded creation bytecode makes factories oversized. Any use of clones/initializers needs atomic initialization and a fresh security review. Do not “fix” deployment merely by disabling limits.

`npm audit --omit=dev` also reports **one high and one moderate affected package entry**, involving transitive PostCSS through Next. This is dependency exposure, not a demonstrated remote exploit in Interline. Inspect whether attacker-controlled CSS/source maps can reach the affected processing paths; plan compatible patches and rerun build/security checks. The suggested automatic fix crosses a Next major version, so do not run a blind force-upgrade. Advisory references: [source-map file disclosure](https://github.com/advisories/GHSA-6g55-p6wh-862q), [path traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849).

### A15 — Contract parameters exist but frontend protection is weak

Pool supply passes `minSharesOut = 0`; withdrawal/borrow pass maximum integer bounds. Direct venue entry passes zero minimum shares, and direct borrowing uses `assets + 10^18` as `maxDebtAfter` for a six-decimal loan asset—effectively an enormous ceiling rather than a user-reviewed resulting debt.

The coordinator checks wallet state through its callers before starting, but does not revalidate account/chain after a potentially long approval wait. Several direct action IDs are shared by action kind or facility without a unique attempt ID, and direct confirm buttons do not consistently suppress repeated pending submissions. Generic “error” also conflates rejection, replacement, RPC uncertainty, and confirmed revert.

**Fix:** derive meaningful tolerances from a fresh quote; display before/after results; revalidate wallet identity/network between stages; use per-attempt IDs keyed by chain/account/facility/action; track replacements; retain pending transactions after navigation/reload; prevent duplicate signing. Public recovery swaps need protocol-enforced economic bounds before replacing the mock router with a real AMM: an arbitrary caller choosing `minOut=0` is not a protection policy.

### A16 — Readability and accessibility need workflow-level validation

The new navigation and named counterparty cards improve on the screenshots. However, direct Terms still expose internal units such as raw credit-limit units and “APR ray”; dense 10–11px uppercase monospace remains common; direct dialogs are plain `role="dialog"` containers rather than a complete focus-managed modal flow. Next-action panels often list generic options rather than derive the one valid next action from acceptance, maturity, collateral, liquidity, pause, recall, and wallet state.

The accessibility suite checks `wcag2a` only, disables two rules on the landing page, and its dialog test returns without actually opening/trapping focus when no dialog is present. The reduced-motion test verifies the browser preference, not that application animations stop. These tests do not establish WCAG AA contrast, usable financial dialogs, or reduced motion behavior.

API failures can fall back to labeled sample data. The source badge and write blocking are useful, but a financial product should preserve last-known real data with explicit stale/error state rather than replace a user's portfolio with a plausible demo portfolio. Keep demo mode a deliberate choice.

**Fix:** normal-size financial text, sentence case labels, asset-aware formatting, focus-managed dialogs, inline validation, state-specific next actions, and AA accessibility checks on the actual borrower/lender workflows. Include mobile views with long addresses, large balances, errors, and wallet prompts. Prefer “Borrowing cost: 5% APR” to a raw integer encoding.

### Additional scale and operational improvements

The public position endpoint loads positions into application memory, fetches cursors repeatedly, serializes/sorts them, and then slices a page. The indexer also rehydrates all known positions on each processed range. Move filtering/pagination to indexed SQL queries, cache each chain's cursor once per request, batch pinned reads, and hydrate touched positions with a deliberate reconciliation schedule. Pagination ordered by changing debt should carry a snapshot/version or use a stable key so positions do not disappear or repeat between pages.

Permissionless direct creation also needs an inbox model: strangers can name a wallet as a proposed counterparty without that wallet accepting. Separate unsolicited requests from accepted exposure; add local dismissal/filtering and never imply that receiving a proposal means endorsing the other party. Keep public on-chain facts accessible.

Separate pool accounting isolates claims, but markets can share a venue, oracle, router, implementation, or guardian. Show these common dependencies and concentration explicitly. Do not portray separate pool addresses as independent economic risk when they all depend on the same external protocol.

## 5. Product comparison: what is actually different from Aave?

The original PRD's broad statements about what “Aave-style” systems cannot do are too strong for current positioning. Aave V4 is live on Ethereum, and its Hub/Spoke architecture supports differentiated market configurations. The comparison must include that architecture, not only an older V2 explainer. [Aave V4 launch](https://aave.com/blog/aave-v4-live-ethereum).

| Capability | Interline implementation | Differentiation assessment |
|---|---|---|
| Anyone connects a wallet and supplies/borrows | Supported architecture; fresh-approval bug blocks normal flow | Baseline DeFi usability, not a USP |
| One wallet can supply and borrow | Supported through separate balances and contextual roles | Baseline capability, not a USP |
| Dashboard, collateral value, debt, health | Present for pools | Necessary UX; no exclusive advantage |
| Isolated one-loan/one-collateral markets | Present | Real architectural choice; already offered by Morpho |
| Bounded risk exposure per market | Separate pools and caps | Aave V4 also has market-specific risk and credit-line exposure limits |
| Pool borrow APR | Utilization curve | Conventional mechanism |
| Collateral earns pool supply interest | Posted collateral is separate escrow, not supplier shares | Simpler separation, but an economic disadvantage for assets that could otherwise earn supply interest |
| Named 1:1 facility alongside pools | Separate factory and contract accounting | Useful product distinction from the ordinary Aave user journey; not unique credit infrastructure |
| Fixed negotiated direct APR | Direct contract, fixed per agreement | Potential customer value; fixed-rate lending itself is not novel |
| Borrowed funds forced into typed vault operations | Implemented with simulated venue/router | More distinctive relative to ordinary wallet borrowing; overlaps strongly with Gearbox |
| Explicit lender recall and recovery timeline | Implemented but with deadline/UX/keeper gaps | Promising workflow distinction; not guaranteed recovery |
| Historical supplier recovery ledger | Snapshot mechanism, incorrect recovery ceiling | Useful trust/accounting feature once corrected |
| Private cap negotiation | Direct commitment exists; weak import/salt UX; pool leaks terms | Cannot currently be sold as reliable confidentiality |
| Liquidation forecast | Interest-only scenario, horizon bug | Potential UX enhancement, currently defective; not predictive protection |
| Safer, cheaper, higher yield, more accessible than Aave | No comparative evidence | Do not claim these yet |

Morpho already provides isolated, immutable, one-collateral/one-loan markets and permissionless market creation. Isolation alone cannot establish Interline's uniqueness. [Morpho market documentation](https://docs.morpho.org/learn/concepts/blue/).

Aave V4 allows Spokes with different collateral/risk parameters to draw bounded asset credit lines from Hubs. Interline's separate cash accounting can provide a simpler isolation explanation, but must acknowledge its tradeoff: fragmented liquidity. It also retains shared dependency risks from code, oracle, token, venue, and operators. [Aave market structures](https://aave.com/blog/unlimited-lending-market-structures).

Aave already supports credit delegation through debt-token approvals and borrowing on behalf of a delegator. That differs from Interline's separately funded agreement, but means “Aave cannot enable named-party credit” is an inaccurate blanket claim. [Aave utilities: credit delegation](https://github.com/aave/aave-utilities#credit-delegation).

Gearbox is an especially important comparator. It has credit accounts, purpose-specific adapters, restricted execution, and solvency checks. Calling Interline's restricted vault a wholly new invention would be misleading. [Gearbox adapters and integrations](https://docs.gearbox.finance/core/adapters-integrations).

Wildcat provides borrower-created credit markets with lender permissions and withdrawal/repayment processes. Relationship credit and repayment cycles already have competitors too. [Wildcat lender flows](https://docs.wildcat.finance/using-wildcat/day-to-day-usage/lenders).

These sources establish overlap, not an exhaustive search proving that no competitor has a particular workflow. The recommendation below is a positioning hypothesis to validate, not a claim of patent-like novelty or an existing moat.

## 6. Recommended tangible USP

**Proposed positioning: “Interline lets two on-chain treasuries agree not just how much to lend, but exactly where the money may go—and gives both sides the same verifiable plan for getting it back.”**

Short product description: **Programmable treasury credit agreements with visible use of funds and executable recovery workflows.**

The target customer is a DAO/protocol treasury, credit manager, or smaller professional on-chain team lending to a named strategy operator. Their problem is coordinating negotiated terms, approved use, collateral if any, changing exposure, repayments, and incident response across chat, spreadsheets, explorer links, and bespoke contracts.

Your initial promise should be operational clarity and verifiable controls. Do not promise superior yield, loss prevention, or universally lower collateral. A restricted venue can still lose money or refuse withdrawals.

### 6.1 The product experience that could make this valuable

1. **A human-readable agreement page.** “Treasury A offers Operator B 100,000 USDC at 5% APR until this date. Only these uses are permitted. These are the withdrawal, collateral, recall, and settlement rules.” Both approve exactly the same version.
2. **A permission policy tied to the agreement.** Approved venue addresses, assets, methods, maximum exposures, and economic bounds are explicit and enforced. Changes require the agreed authorization process; emergency controls may restrict risk without silently widening permissions.
3. **A shared money map.** Separate available lender cash, drawn principal, interest, vault idle, deployed assets, redeemable value, posted collateral, and recovery claims. Every value links to its contract source and block. Never mix cost basis with currently recoverable value.
4. **One coherent repayment workspace.** Show what can repay now, what must be withdrawn first, what requires a swap, what is delayed by a venue, what debt remains, and who can execute each step. Make the sequence executable with reviewed bounds and receipts.
5. **Amendments with a readable audit trail.** Old terms, proposed terms, each party's approval, activation time, and cancellation are clear. The user does not manipulate nonce/salt JSON.
6. **Supplier/lender settlement transparency.** In pools, historical suppliers can inspect and claim recoveries correctly. In direct agreements, no unrelated liquidity provider inherits the counterparty's loss.

This is a more focused product than “Aave with extra features.” The strongest demo is a complete agreement lifecycle and an incident recovery drill, not another market table.

### 6.2 Make the advantage measurable

Proposed validation targets, not current achievements:

| Outcome | Initial validation target |
|---|---|
| Understand an agreement | At least 8 of 10 target users identify lender, borrower, money destination, cost, and repayment rule without help |
| Fresh-wallet completion | At least 90% complete a scripted agreement lifecycle without an explorer or developer intervention |
| Incident response | An operator can identify idle, immediately withdrawable, delayed, and impaired assets within two minutes |
| Recovery correctness | Every scenario reconciles principal, interest, collateral, recovered funds, supplier claims, and borrower residuals |
| Reduced manual work | Pilot teams demonstrate fewer external spreadsheets/explorer steps versus their present process |
| Customer demand | At least three relevant teams agree to a testnet pilot; at least two request continued use for a recurring credit workflow |
| Willingness to pay | Test a clearly disclosed software/service fee with actual target customers; do not infer willingness from dashboard praise |

If teams only want anonymous leverage and the best available rate, Aave/Morpho/Gearbox may already be a better fit. If they need tailored counterparty agreements and traceable repayment operations, Interline has a credible narrower opportunity.

### 6.3 The economic question you must answer

In a restricted pool, the borrower posts separate collateral, pays interest, and can deploy borrowed funds only through the permitted venue/router. The collateral itself is not generating supplier yield in this model. The restricted strategy needs enough benefit to justify financing cost, opportunity cost of collateral, gas, liquidity constraints, and venue risk.

Adding posted collateral to direct lending increases that question's importance. Aave's documented supply flow allows eligible supplied assets to earn interest and serve as collateral; Interline's separate posted-collateral escrow does not provide that supply yield. This is a tangible tradeoff, not an automatic improvement. [Aave supplying documentation](https://aave.com/help/supplying/supply-tokens).

An ordinary treasury needing to pay salaries or a supplier cannot use a vault that only enters a DeFi venue. Do not market the current contract as general working-capital financing or invoice finance; those use cases would need different recipient/payment policies and recovery design.

Before adding assets, choose one useful strategy workflow and demonstrate its economics with conservative assumptions. For example, a named protocol-approved capital deployment with a negotiated credit term and explicit unwind process. Real venue support, redemption behavior, and customer demand must be established before selling it.

An alternative worth testing is Interline as an agreement/operations layer integrating existing lending infrastructure. That could reduce the burden of building generic pool liquidity and risk infrastructure. It does not eliminate the need to audit your own vaults, policies, and settlement logic. Keep this as a strategic option rather than an unrequested rewrite.

## 7. Implementation priorities for the next agent

### P0 — Correct money movements and recoverability

1. Fix A01's liquidation exchange ratio in both math implementations.
2. Fix A02's approval/action sequence and add actual fresh-wallet UI coverage.
3. Fix pooled cap consent, nonce invalidation, and commitment confidentiality.
4. Add capped recovery settlement and borrower residual release.
5. Resolve the direct collateral/default model and implement enforceable settlement if collateralized.
6. Unify recovery deadlines; test exact boundaries and overlapping maturity/recall.
7. Make indexer event/projection/cursor persistence atomic and reads block-pinned.
8. Establish a deployable, reproducible compiler profile and clean workspace type checks.

**Exit evidence:** independent regression tests for each defect, coherent terms/API/ABI/UI versions, ordinary-limit local deployments, and complete cash/debt/collateral reconciliation. Do not count the audit's defect-confirming assertions as regressions.

### P1 — Complete the ordinary borrower and lender journeys

1. Implement the missing owner repayment, collateral removal, vault exit, source-selectable repayment, recovery claim, resume, and surplus flows.
2. Show state-derived next actions, not all contract methods at once.
3. Replace raw encodings with token amounts, percentages, dates, and full reviewable addresses.
4. Fix forecast horizon and contract parity; use explicit stale/unknown states.
5. Validate cap requests and replace manual JSON with a guided versioned agreement flow.
6. Add robust pending/replacement/account-switch handling and meaningful execution tolerances.
7. Run connected-wallet mobile and accessibility acceptance tests.

**Exit evidence:** both parties can finish the agreement and recover/release every legitimate remaining asset using only the portal.

### P2 — Prove the proposed USP

1. Interview 8–10 treasury/credit operators about their existing agreement and incident-response workflow.
2. Select one supported deployment mandate and venue integration.
3. Add a policy/permissions summary and same-block exposure/recovery ledger.
4. Add real adapter fork tests, partial/redemption-delay scenarios, and oracle/economic bounds.
5. Pilot the full lifecycle with three teams and compare task completion against their current workflow.
6. Choose whether to invest in standalone pools, direct agreements, or integrations based on that evidence.

### P3 — Production readiness, after validation

Independent contract/economic review; verified deployment artifacts; governed operator keys and role transfer drills; caps appropriate to actual liquidity; reliable monitoring/keepers; incident runbooks; real RPC/indexer recovery exercises; supported-asset restrictions; dependency maintenance; explicit fees if introduced; and deployment limits enforced in CI. These are release requirements for the chosen product, not reasons to add unrelated features today.

## 8. Validation log

Initial working-tree checks:

| Check | Observed result |
|---|---|
| `forge test --summary` using the installed Foundry executable | Failed: Stack too deep under default profile |
| `npm run test:api` | 6 files / 17 tests passed before the new audit reproduction |
| `npm run test:math` | All checked-in Node golden vectors passed |
| `npm run lint -w frontend` | Zero errors; one unused-import warning at that scan |
| `npx tsc --noEmit -p frontend/tsconfig.json` | No diagnostics in the initial chained run |
| `npx tsc --noEmit -p server/tsconfig.json` | Failed: seven nullable chain-ID argument diagnostics |
| `npx tsc --noEmit -p keeper/tsconfig.json` | Failed: two TS5097 import-extension diagnostics |
| `npm audit --omit=dev --json` | 2 affected package entries: 1 high, 1 moderate; reachability not proven |
| `npx tsx tools/audit-reproductions.ts` | Both defect demonstrations confirmed |
| API audit reproduction only | 1 test passed, confirming loss of position discovery after crash/retry |
| Frozen Solidity pool reproductions | 4 passed: excess collateral seizure, unilateral cap change, sibling nonce reuse, excess recovery/permanent obligation |
| Frozen Solidity direct reproduction | 1 passed: later recall deadline blocks earlier-maturity public venue recovery |

The full optimized working-tree suite was started, but its long-running compilation was superseded and stopped after the source changed. No full-suite pass is claimed. Five Solidity defect demonstrations passed across the completed frozen-source runs; two TypeScript demonstrations and one indexer crash demonstration also confirmed their defects. The initial TypeScript checks are not claims about later edits. A fresh full acceptance run must follow fixes against an immutable release candidate.

Compiled frozen-source bytecode, Solidity 0.8.24, optimizer enabled, runs 1, via-IR:

| Contract | Runtime bytes | Creation bytes | Ordinary 24,576-byte runtime limit |
|---|---:|---:|---|
| LendingMarket | 20,508 | 22,624 | Within |
| MarketFactory | 27,600 | 27,807 | Exceeds by 3,024 |
| BorrowerVaultFactory | 11,647 | 11,933 | Within |
| BorrowerVaultV2 | 6,657 | 10,250 | Within |
| DirectCreditFacility | 15,775 | 28,136 | Within |
| DirectFacilityFactory | 31,077 | 31,638 | Exceeds by 6,501 |

Runtime and creation limits are distinct; a creation size above 24,576 bytes is not by itself an EIP-170 violation. The factory failures here follow from their runtime sizes. No network deployment was attempted as part of the audit.

Reproduction commands from the project root, or from the extracted frozen Solidity snapshot for the contract checks:

```powershell
& 'C:\Users\ACER\.foundry\bin\forge.exe' test --via-ir --optimizer-runs 1 --match-path 'test/audit/*.t.sol' -vv
npx tsx tools/audit-reproductions.ts
npm run test -w interline-indexer -- tests/audit-reproductions.test.ts
```

The ZIP includes compiler metadata, source hashes, and the dependency Git revisions. It intentionally excludes environment files and private keys. The TypeScript reproductions are supplied in the project, not in the Solidity ZIP. Test corrections during the audit adjusted a changed fixture threshold and Foundry prank setup; they did not change protocol code to make the defects appear.

### Why passing tests missed the problems

- Protocol-flow browser test files often send transactions through clients and preapprove tokens; they do not prove that the actual portal handles a fresh allowance.
- The pool invariant handler liquidates by debt shares, leaving the exact-collateral case unexercised.
- The handler advances time but does not refresh prices after long warps. The 3,600-second oracle freshness window can make many subsequent risk operations unavailable; broad `try/catch` handling then hides lack of meaningful action coverage. Track successful actions and assert coverage floors.
- Some invariants restate the implementation's own getters, for example supplier assets equals cash plus aggregate debt, rather than independently accounting for external value transfers.
- Existing replay tests check retrying one cleared cap digest, not two approved sibling digests sharing a nonce.
- API tests passing does not imply atomic PostgreSQL recovery; the crash injection demonstrates the missing guarantee.
- Math golden-vector parity only covers the supplied vectors. Both languages can share the same conceptual error, and the frontend forecast has a separate implementation.

## 9. Claims to use and claims to retire

**Accurate today:** “Interline is building public isolated markets and direct credit agreements in one portal, with wallet-specific positions, typed restricted-use vaults, and explicit recall/recovery mechanisms.”

**Good target after fixes and pilots:** “Agree where borrowed capital may go, see where it is now, and execute the agreed repayment process from one shared workspace.”

**Do not use without new evidence:** “better than Aave,” “prevents bad debt,” “guaranteed recall,” “risk-free restricted lending,” “private until execution” for the current pooled proposal, “automatic liquidation protection,” or “any collateral/any venue supported.”

The PRD's specific incident narrative and rate figures are not established by this review and should not be reused as verified marketing facts. The real engineering merit is in the enforceable agreement and settlement experience; it does not require exaggerated competitor claims.
