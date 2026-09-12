# Interline V2 — Direct Lending (1:1) Extension PRD

## 1. Required outcome and precedence

Keep the original bilateral lender-to-borrower product as an active, first-class section of Interline, alongside the new pooled markets. **Direct Lending must not be deleted, hidden as a legacy-only demo, or implemented by routing an individual agreement through a pool.**

This extension is intended to be passed directly to the coding agent with `INTERLINE_V2_OPEN_MARKET_IMPLEMENTATION_PLAN.md`. It supplies the direct-product requirements and overrides any earlier statement that original 1:1 lending is only a legacy viewer or that a wallet has one exclusive global role.

The complete main plan is the sibling file in `docs/`. A root-level copy of the main plan may be an earlier snapshot. In particular, any older blanket exclusion of unsecured loans applies to pools, not to the original bilateral-credit feature preserved here. Do not delete or undo concurrent implementation; assess existing V2 code against this extension and add the missing direct functionality.

Implementation repository: `E:/Projects/Coding and AI/InterlineV2/Interline/`. Continue the active `frontend/` app. Preserve existing user work and the Interline dark/orange visual identity. This is a product specification, not a claim that the described V2 functionality already exists.

### 1.1 Non-negotiable requirements

1. One direct facility has exactly one lender and one borrower, named by their on-chain wallet/contract-wallet addresses.
2. The money belongs to that facility's lender; no pool suppliers, shared reserve, pool receipt shares, or curator-as-lender substitution.
3. Any wallet can create a proposed agreement with another wallet. No lender/borrower addresses in deployment or frontend environment determine eligibility.
4. The specified counterparty explicitly accepts the agreement before funding/borrowing starts.
5. One wallet can lend in Facility A and borrow in Facility B at the same time, while also supplying and borrowing from pools.
6. Roles are calculated per agreement from on-chain addresses. The header does not brand the entire account “Lender” or “Borrower.”
7. Before every transaction, explain who supplies the funds, who benefits/owes repayment, which contract actually receives tokens, and which chain is involved.
8. Keep original direct-credit differentiators: public facility limit/debt/exposure, optional hash-hidden limit changes, restricted use of drawn funds, lender-controlled risk pause/recall, and repayment during incidents.
9. Add the missing lender withdrawal route for newly deployed direct facilities. Never fabricate such a route for immutable legacy contracts that lack it.
10. Direct facilities are independently funded and independently repayable; neither their gains nor their losses change pool supplier accounting.

### 1.2 Financial default for the preserved product

The original direct facility is counterparty credit without separately posted collateral. Preserve that model as **Unsecured direct credit with restricted use of funds**. Restricting where borrowed money goes is not the same as posting independent collateral.

Therefore the initial direct product has no price-based collateral health factor and no automatic collateral liquidation. Its risk panel shows outstanding debt, lender identity, vault/venue exposure, recoverability, repayment due date, and recall. Display “Health factor: Not applicable — this agreement has no posted collateral” where comparison with pool loans requires clarity.

Do not calculate a fake health factor by dividing borrowed vault assets by the debt that created them. Do not imply collateral in a pool protects a separate direct agreement. An optional collateralized direct-credit product can be specified later; it is not silently added here.

For new direct V2 contracts, charge actual agreed fixed APR with compound accrual using the shared interest math. Default APR is 5% for testnet examples. This improves the old display-only rate while keeping bilateral terms distinct from variable pool utilization rates. No interest is retroactively invented for old v0 facilities.

Borrowed direct funds continue to enter a restricted borrower vault, as in the original PRD. “Direct” means the lender/borrower relationship and funding source, not an unrestricted transfer to the borrower's personal wallet. Both identities and actual custody must be visible.

## 2. Problems demonstrated by the supplied screenshots

The three supplied screenshots show the present lender-side console. They establish these usability problems; they do not establish the connected borrower's actual screen or prove an on-chain failure.

| Observed UI | Why it is confusing | Required replacement |
|---|---|---|
| Global LENDER badge next to one address | Suggests a permanent account role; omits the other party | Wallet account header plus role contextual to each agreement |
| Huge PUBLIC DESK / THE DESK headings | Pushes meaningful relationship and action information down | Compact agreement title, counterparty cards, next action above the fold |
| Cap / Drawn / Pot / Vault idle metrics | Uses implementation terms before explaining ownership | Credit limit / Amount borrowed / Available facility cash / Borrower vault balance |
| Shared amount input with Deposit, Draw, Repay | The same amount appears to apply to unrelated money movements | Separate action dialogs, each with source/destination and signer |
| No prominent lender and borrower cards | Neither party can confidently identify the relationship | Always-visible “Lender” and “Borrower” identities with Your role |
| Raw nonce, salt, hash, Propose/Approve/Execute | Requires cryptographic knowledge for an ordinary limit change | Request/review/approve/apply workflow with generated internals |
| Enter target / Exit target | Does not explain the venue, asset, or effect on debt | Deploy to [venue] / Withdraw from [venue], with a money-flow preview |
| Panic / Set venue paused / Clear recall | Consequences and affected parties are unclear | Pause new borrowing / Request repayment, with impact and deadline |
| Swap JUNK (must fail) in customer operations | A developer test is presented as a financial action | Remove from customer screens; retain in automated tests/lab |
| Rate (display) beside financial balances | Could be mistaken for actually accruing interest | Explicit legacy label; new agreements show real agreed APR and accrued interest |
| Header controls overlap content at scroll positions | Obscures information and actions | Shared application chrome and consistent stacking/layout |

Do not solve these problems only by renaming buttons. The page must introduce the relationship, state, monetary context, and next action before showing advanced controls.

## 3. Product vocabulary and global account model

Use **Direct lending** in primary navigation and **Direct agreement** for an individual facility. “Facility” may appear in technical details and documentation; ordinary action copy uses agreement, credit limit, available funds, borrow, repay, and withdraw.

Global account object contains the wallet address and connection state, not `role: lender | borrower`. Derive independent capabilities:

```ts
interface DirectRoles {
  isLender: boolean;
  isBorrower: boolean;
  isCounterparty: boolean;
}

function rolesFor(facility, connectedAddress): DirectRoles {
  // compare normalized, verified on-chain addresses
}
```

For one agreement, require `lender != borrower`; self-agreements are rejected. Across agreements, both capabilities may be true for the same wallet. A wallet's portfolio may simultaneously contain lender and borrower rows. Do not implement `if (isLender) ... else if (isBorrower)` across the entire application.

Dashboard filters **All**, **I'm lending**, and **I'm borrowing** filter records; they do not switch authorization, connect a different wallet, or mutate a global role. A lender view may preview borrower-facing public information but cannot sign as the borrower.

Public profile views are explicitly read-only. Watching someone else's address does not change the signing account. ENS/resolved names are optional secondary labels; checksum addresses remain visible and are the authorization source. A locally saved nickname says “Your label”; an environment-provided label must never masquerade as a verified ENS name.

## 4. Navigation, routes, and integration with pools

### 4.1 Entry points

Add **Direct lending** to the shared primary navigation, with the same prominence as Supply/Borrow/Public desk. The main dashboard includes direct lending and direct borrowing summaries simultaneously. The public desk has distinct Pool loans and Direct agreements tabs.

Do not bury 1:1 agreements under Advanced settings, the operator page, a development feature flag, or a deprecated URL. The legacy viewer is a separate compatibility concern.

| Route | Purpose |
|---|---|
| `/direct` | Connected wallet's direct agreement workspace, plus public browsing entry; anonymous users can explore |
| `/direct/new` | Create a lending offer or borrowing request for a specific address |
| `/direct/explore` | Public directory of created/active direct agreements, filtered by status/party |
| `/direct/[chainId]/[facility]` | Agreement detail; same canonical URL for both parties and observers |
| `/direct/[chainId]/[facility]?action=fund` | Open a recognized action dialog after state/capability validation |
| `/direct/[chainId]/[facility]?tab=terms` | Deep link to public agreed terms |
| `/direct/legacy/[chainId]/[facility]` | Explicit v0 viewer/actions actually supported by that contract |

Query parameters only request UI context. They cannot define counterparties, token spender, recipient, approval amount, or financial terms that override contract state. Unknown actions are ignored or rejected safely.

### 4.2 Direct workspace layout

```text
Direct lending                         [Create agreement]
Lend directly to another wallet, or borrow from a named lender.

[You are lending: N agreements] [You are borrowing: M agreements]
[Available cash as lender] [You owe] [Needs your response]

[All] [I'm lending] [I'm borrowing] [Requests awaiting response]
[Search counterparty / agreement] [Chain] [Status]

Agreement      Your role     Counterparty    Credit limit    Outstanding    Next action
Studio line    Lending      Borrower Bob    5,000 mUSDC     1,200 mUSDC    View / Fund
Treasury line  Borrowing    Lender Carol    3,000 mUSDC       800 mUSDC    View / Repay
```

Always label who the counterparty is: “Borrower” on lending rows, “Lender” on borrowing rows. If a wallet has both types, show both. Different tokens must not be summed as raw numbers; USD conversion is optional and marked partial/unavailable when prices are missing.

New wallet empty state offers **Offer a credit line** and **Request a credit line**, with a third **Explore pool borrowing** link. It does not ask the user to permanently select a role.

## 5. Creating and accepting an agreement

### 5.1 Creation wizard

Use five compact steps, with a progress indicator and Back buttons. Preserve nonsecret draft fields on intentional navigation; do not publish or transact until review is complete.

**Step 1 — What do you want to do?**

- “Lend to someone”: connected wallet becomes the specified lender.
- “Borrow from someone”: connected wallet becomes the specified borrower.

This applies only to the agreement being created. Supporting copy: “You can also take the other role in different agreements.”

**Step 2 — Who is the counterparty?**

Require a full valid address. Show resolved checksum address, optional verified name, chain context, and whether it is an EOA or contract when retrievable. A contract address is not automatically invalid; contract-wallet parties can accept through their wallet. Reject zero address and the creator's own address. Do not accept a guessed or partially entered address.

Field label depends on intent: **Borrower's wallet address** or **Lender's wallet address**. Explain that only this address can accept the counterparty role. No wallet private key, seed phrase, or environment change is requested.

**Step 3 — Agree the financial terms.**

Fields: supported loan asset (initially mUSDC), credit limit, fixed APR, acceptance deadline, borrowing period, and a descriptive agreement label. The label is optional local display metadata by default, not identity verification.

Defaults: 5,000 mUSDC limit; 5% fixed borrow APR; request valid seven days; borrowing period 365 days after activation; no origination fee; no protocol fee; 1-hour Base Sepolia recall window/5-minute Anvil window. These are explicit testnet defaults, fully shown on review. Credit limit and APR are editable within supported bounds, never silently preaccepted.

Validation: limit 1–1,000,000 mUSDC; APR 0–100%; acceptance lifetime 1 hour–7 days; borrowing period 1–365 days; recall window chosen from 1/6/24/72 hours on Base Sepolia, default 1 hour. Anvil has an additional 5-minute fixture option. User-selectable shorter recall must be disclosed prominently to both parties. All amount/rate conversions use shared exact math.

**Step 4 — Where can borrowed money go?**

Initial direct product: **Restricted borrower vault**, selected and clearly explained. Choose the reviewed simulated venue policy available on that chain. Display allowed venue names/contracts, permitted tokens/swaps, custody flow, exit limitations, and recall behavior. This is an agreement-bound immutable policy, not arbitrary addresses pasted by a borrower.

Show: “Borrowed tokens go to your agreement's vault. The borrower can use the approved venues. They are not sent directly to the borrower's personal wallet.”

Show separate acknowledgement: “This agreement has no posted collateral. The lender bears borrower and venue recovery risk.” This is a concrete product term, not a generic warning buried below the action.

**Step 5 — Review and create.**

Show lender and borrower cards, financial terms, policy, timestamps/durations, source/destination flow, lender undrawn-cash withdrawal right, and what the other party must do. Primary button is **Create and accept these terms**. The creator's transaction deploys the agreement and records its own acceptance; the named counterparty still must accept.

After receipt show **Awaiting [counterparty address]**, a copyable canonical agreement link, and **View agreement**. Do not automatically email, message, or notify another person. The user can share the link through their chosen channel. The app does not claim the invitation was delivered merely because a link exists.

### 5.2 Counterparty acceptance

Opening the link shows public terms and both parties without connecting. A disconnected viewer sees **Connect to respond**. A connected unrelated wallet sees “This request is addressed to [address]. Connected wallet [address] can view but cannot accept.” Offer Switch wallet without hiding the terms.

The actual counterparty sees **Accept terms** and **Decline request**. Acceptance displays the exact terms hash/version being accepted. Expired, cancelled, or already superseded requests cannot be accepted. Changed terms require a new request; neither creator nor counterparty can mutate the displayed terms after someone accepted.

Only after both accept does the agreement activate. Activation sets the borrowing expiry and repayment due date from the accepted borrowing-period duration. The lender may then fund. Borrowing is disabled until cash is available.

An acceptance notification is an on-chain state update, not a wallet signature granting token transfer permission. Funding requires its own explicit token allowance/transaction.

### 5.3 Request lifecycle

```text
Created + creator accepted -> Awaiting counterparty
Awaiting counterparty -> Accepted/active, Declined, Cancelled, or Expired
Accepted/active -> Funding and revolving borrowing operations
```

Either named party can cancel a pending request. Decline records the intended counterparty's decision. No money is accepted before activation, so pending cancellation has no refund ambiguity. Unsolicited direct token transfers are not funding and are not counted as lender cash.

## 6. Agreement detail: relationship first

### 6.1 Required above-the-fold layout

```text
Direct agreement · [label or short facility address]     [Base Sepolia · Testnet]
Your role in this agreement: Lender                     [Copy link]

LENDER                                      BORROWER
You · 0xABCD...1234                          Bob (verified name, if available)
[full address / copy / explorer]             0x9876...DEFA [copy / explorer]

You are providing a credit line to this borrower.
Funding is held in this agreement. Borrowed funds go to the borrower's restricted vault.

[Credit limit] [Available facility cash] [Borrower owes] [Fixed borrow APR]

[State: Active / awaiting funds / paused / recall / overdue]
[Next action appropriate to your role]       [Secondary action]
```

For the borrower, the introductory sentence becomes **“You borrow from [lender identity]. You repay this agreement, and the lender can withdraw the repayment.”** Show “Your role: Borrower” only within this agreement. An observer sees “Public agreement view” and no misleading “You” labels.

Below summary, display a money-flow strip:

```text
Lender wallet -> Agreement cash -> Borrower vault -> Approved venue
Lender wallet <- Agreement cash <- Repayment      <- Venue exit / borrower top-up
```

Each node expands to its full address and role. The lender must never mistake the pool contract, agreement escrow, borrower EOA, and borrower vault for the same recipient.

### 6.2 Main tabs

**Overview:** relationship, balances, next steps, risk/repayment dates, recent actions.

**Terms:** immutable parties/asset/APR/policy, active credit limit, dates, recall rights, undrawn-cash withdrawal rule, and a clear unsecured-credit explanation.

**Funds & venues:** agreement cash, borrower-vault idle balances, venue receipts, current estimates, withdrawable estimates, failed exits, and where funds actually moved.

**Limit requests:** optional hash-hidden limit change workflow, with visible approval progress.

**Activity:** who initiated each action, amount, source/destination, transaction status, explorer, and resulting balance/debt.

**Contract details:** addresses, ABI/version/config hash, technical identifiers. Raw nonce/salt/calldata never appear in the primary action path.

### 6.3 Lender action panel

Primary actions by state:

| State | Primary | Secondary |
|---|---|---|
| Awaiting lender acceptance | Accept terms | Decline |
| Active, no cash | Fund agreement | Review terms |
| Active, funded | Add funds | Withdraw available cash |
| Pending borrower limit request | Review limit request | Existing funding actions |
| New borrowing needs stopping | Pause new borrowing | Request repayment |
| Recall active | View repayment/recovery | Recover eligible vault funds after deadline |
| Debt zero, cash remains | Withdraw available cash | End agreement |
| Debt zero, cash zero, no vault exposure | End agreement | View history |
| Overdue/unrecovered | Request/view recovery | View counterparty and debt; no fictional liquidation |

Show the borrower's current debt next to withdrawal controls to explain why lent-out funds are unavailable. A lender cannot withdraw the borrower's vault assets through a generic Withdraw button.

### 6.4 Borrower action panel

| State | Primary | Secondary |
|---|---|---|
| Awaiting borrower acceptance | Accept terms | Decline |
| Active, no lender cash | Waiting for lender funding | Copy agreement link |
| Active, funded and within limit | Borrow into vault | View approved venues |
| Outstanding debt | Repay | Borrow more if eligible |
| Vault has idle funds | Deploy to approved venue | Repay from vault |
| Venue exposure exists | Withdraw from venue | View exposure |
| Recall active | Repay / withdraw venue funds | View deadline and recovery state |
| Debt zero | Return remaining vault assets | View available future borrowing or end request |
| Borrowing expired | Repay outstanding amount | View repayment date |

Do not display lender-only incident buttons as enabled operations on the borrower's screen. Public terms may explain those rights. Preserve the distinction between “Unavailable because your role does not allow this” and “Unavailable because the agreement has no cash.”

## 7. Exact money-movement dialogs

### 7.1 Fund agreement — lender

Title **Fund your agreement with [borrower]**. Display signer/lender wallet, borrower identity, token, credit limit, current agreement cash, planned addition, and new available cash.

Money movement: **From your wallet → this agreement contract**. Supporting text: “The borrower can draw available funds into their approved vault under the agreed limit. Funding does not transfer tokens directly to their personal wallet.”

Show exact approval spender = this direct facility. Do not reuse a pool's spender. After approval receipt, simulate and submit funding. Success says “Agreement funded with X mUSDC; [borrower] can now borrow up to Y, subject to the remaining limit.” It does not say a borrower already received the amount.

### 7.2 Borrow — borrower

Title **Borrow from [lender]**. Show named lender, agreement, borrower, actual receiving vault, available cash, remaining limit, exact amount, fixed APR, post-debt, projected interest, repayment due date, and recall rights.

Money movement: **[Lender]'s agreement cash → your restricted vault**. Primary button **Borrow X mUSDC into vault**. Success links to Manage vault and Repay. If cash is zero, show “Your lender has not funded this agreement” or “All current facility cash is in use,” whichever the state supports.

### 7.3 Repay — borrower or third-party payer

Title **Repay your agreement with [lender]**. Source selector **My wallet** / **Agreement vault** when that vault contains repayable loan tokens. A third-party payer is labeled “You are repaying on behalf of [borrower]” and never receives ownership rights.

Money movement: **Selected source → agreement contract → available for [lender] to withdraw**. The immediate recipient is the agreement, not the lender EOA. Show debt principal, accrued interest, actual maximum payment budget, post-debt, and remaining funds at source.

Full repay uses the shared bounded interest-buffer/receipt flow. Unused budget is not transferred. A successful repayment is distinct from the lender's later withdrawal.

### 7.4 Withdraw available cash — lender

Title **Withdraw available funds**. Show lender wallet recipient, agreement cash, debt still owed, and requested amount. Max equals accounted cash. Do not display nominal outstanding debt as available cash.

Supporting text: “Withdrawing undrawn cash reduces what the borrower can draw. It does not change the agreed credit limit or cancel existing debt.” This right is disclosed at agreement acceptance, not introduced later.

### 7.5 Venue actions — borrower

**Deploy to [venue]** shows amount from borrower vault, venue identity, receipt shares, allowed policy, estimated value, and withdrawal conditions. **Withdraw from [venue]** shows receipt shares returned and loan tokens expected in the vault. Follow with a separate Repay action or an explicit combined Withdraw and repay contract method; no ambiguous success message.

Forward swaps are limited to approved token outputs; reverse swaps reduce loan-token exposure and remain allowed by Interline during recall. Both directions show token decimals, conversion/minimum received, and actual fixed recipient. No JUNK test action appears.

### 7.6 Pause and request repayment — lender

**Pause new borrowing** explains that existing debt continues to accrue and repayment stays open. It does not mean money was returned. **Resume new borrowing** is disabled while recall is active or borrowing has expired.

**Request repayment** shows borrower identity, outstanding debt, recoverable vault balance, deployed venue value/availability, recall window and exact deadline. Text: “New borrowing and new venue deployments stop immediately. After the deadline, anyone can execute supported recovery actions. An unavailable venue can delay recovery. This agreement has no collateral to liquidate automatically.”

Use a focused review dialog and an explicit consequential button, not an unexplained red Panic tile. An accidental click opening the dialog must not send a transaction.

## 8. New direct-facility contracts

### 8.1 Modules

```text
src/v2/direct/
  DirectFacilityFactory.sol
  DirectCreditFacility.sol
  DirectFacilityLens.sol
  interfaces/IDirectCreditFacility.sol

test/v2/direct/
  CreationAndAcceptance.t.sol
  FundingAndWithdrawal.t.sol
  BorrowingAndInterest.t.sol
  DirectRecall.t.sol
  DirectCapNegotiation.t.sol
  DirectInvariants.t.sol

frontend/features/direct/
  agreement-list/
  creation-wizard/
  agreement-detail/
  counterparty/
  actions/
  limit-requests/
  queries/
```

Reuse reviewed math, token helpers, transaction infrastructure, and adapter mechanisms from the main plan. Share code through explicit interfaces; do not reuse a pool's actual cash, supplier shares, oracle-based health checks, curator identity, or loss ledger.

Direct vaults bind to a direct-specific controller interface. A small common `ICreditController` can expose owner, loan asset, draw/deploy status, recall deadline, live debt, recovery obligation, and typed repayment collection. Both market and direct facility implement that interface without pretending a direct facility is a pool.

### 8.2 Factory and acceptance

`createFacility(terms)` is permissionless for a caller that equals one specified party. Require distinct nonzero lender/borrower addresses, supported token/policy, bounded terms, and valid acceptance lifetime. Deploy the facility and its vault atomically, with immutable parties and terms hash. Record the creator's explicit acceptance.

The factory can validate reviewed assets/adapters, but its curator cannot approve the loan on the lender's behalf. Directory listing is not a substitute for the actual lender/borrower accepting terms.

`acceptTerms(termsHash)` checks caller is the remaining party and the request is still pending/unexpired. When both accepted, set activated timestamp, borrowing expiry, and repayment due date. Decline/cancel/expiry prevents activation permanently. No `fund` or `borrow` before activation.

Fixed terms: lender, borrower, token, agreed fixed APR, borrowing-period duration, recall-window duration, and venue/swap policy. Initial cap is public. Later cap change is bilateral and hash-hidden as Section 11 specifies. Parties and APR cannot be silently edited by cap execution.

### 8.3 Financial state

```text
C = accounted direct-facility loan-token cash
Q = the single borrower's scaled debt shares
D(t) = ceil(Q * fixedRateIndex(t) / DEBT_DENOMINATOR)
P = principal outstanding
L = current agreed credit limit

Lender nominal claim = C + D(t)
Immediately withdrawable = C
Available to borrow = min(C, exact debt-rounded headroom under L)
```

Use the main plan's fixed-point constants, epoch compound calculation, debt precision, principal/interest allocation, transfer-delta verification, and bounded full repayment. The APR stays fixed for the agreement; it does not depend on funding utilization. Adding cash does not reprice debt or create interest for idle cash.

Lender money is not represented by pool shares or an ERC-20 token. There is one lender ledger per facility. Interest on the borrower's debt is a nominal receivable until repaid; show it separately from cash actually returned. Do not label the lender's full credit limit as deposited assets, lent principal, or guaranteed earnings.

Interest may carry debt above the cap. That blocks further draws but does not revert repayment or fabricate collateral liquidation. New draw checks use exact post-debt under the index. Full repayment clears Q and accrued debt.

### 8.4 Required direct methods

| Method | Authorization / semantics |
|---|---|
| `createFacility(terms)` | Factory; caller must be one specified party |
| `acceptTerms(hash)` | Named unaccepted party |
| `decline()` | Named counterparty while pending |
| `cancelPending()` | Either named party while pending |
| `fund(assets)` | Lender only; transfer lender loan tokens into C |
| `withdrawCash(assets)` | Lender only; reduce C and send to lender |
| `borrow(assets, maxDebtAfter, deadline)` | Borrower only; active, unexpired, unpaused, cash/limit checks; send to vault |
| `repayAssets(maxAssets)` | Any payer; pay borrower debt without rights transfer |
| `repayAll(maxAssets)` | Any payer; bounded full debt payment |
| `repayFromVault(maxAssets)` | Borrower, or public recovery caller when permitted |
| `pauseNewBorrowing()` | Lender; does not pause repay |
| `resumeNewBorrowing()` | Lender; only with no active recall and before expiry |
| `requestRepayment(reasonCode)` | Lender; sets recall once and freezes new risk |
| `triggerRecallFromVenue(venueId)` | Public; objective configured venue condition |
| `recoverVenue(...)` / `recoverSwap(...)` | Borrower or public after deadline; fixed recipients |
| `clearRecall()` | Lender only after debt is zero and configured incident state cleared |
| `proposeCap(hash, nonce, validUntil)` | Either actual party |
| `approveCap(hash)` | Each actual party approves separately |
| `cancelCap(hash)` | Either party; invalidates nonce |
| `executeCap(newCap, nonce, validUntil, salt)` | Either after both approvals and validation |
| `releaseVaultSurplus(token, amount)` | Borrower through vault/controller; debt zero |
| `endAgreement()` | Lender; requires zero debt, zero agreement cash, and all registered vault/venue balances cleared |

No `liquidate` method is exposed for the unsecured direct product. No public `recognizeBadDebt` method from pooled collateral logic is reused: zero collateral is normal for this product and is not permission to erase all debt.

### 8.5 Asset conservation and forgiveness boundary

Funding increases C; withdrawal reduces C; borrowing reduces C and increases D; repayment increases C and reduces D; interest increases the nominal D. Rounding surplus remains the lender's accounted claim and is emitted separately where necessary.

Vault losses do not automatically erase the borrower's obligation. The borrower may repay from external wallet funds. An unrecoverable facility stays visibly outstanding/overdue until repaid; no UI operator button declares nominal debt recovered.

Debt forgiveness, negotiated impairment settlements, claim transfers, debt sales, and legal enforcement are outside this first direct extension. Do not implement a silent write-off that releases residual vault assets. Such a feature requires explicit agreed treatment of recovery rights and an additional specification.

## 9. Dates, recall, overdue debt, and closure

Acceptance expiry concerns whether a pending request can be accepted. Borrowing expiry starts at activation plus the agreed duration. It ends further draws and is also the default full-repayment due date, clearly shown to both parties. A recall can make repayment due earlier.

Effective due time is the earlier of the agreed repayment due date and a nonzero recall deadline. Interest continues at the fixed APR after that time; no additional penalty APR is introduced. A healthy/unhealthy HF classification is inapplicable because there is no posted collateral.

At borrowing expiry with debt outstanding, apply the same risk-reducing restrictions as recall: no additional draw/entry/forward swap; owner exits/repay allowed; public bounded recovery becomes available when the effective due time is reached. Implement this from timestamps, not a UI timer requiring a server to toggle the contract.

Use orthogonal display state:

```text
Acceptance: PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED
Credit: UNFUNDED | AVAILABLE | FULLY_DRAWN | PAUSED | ENDED
Debt: NO_DEBT | OUTSTANDING | OVERDUE
Recall: NONE | IN_WINDOW | RECOVERY_OPEN
Venue: AVAILABLE | ENTRY_PAUSED | EXIT_UNAVAILABLE | QUOTE_UNAVAILABLE
```

Examples: “Active · Borrower owes 800 mUSDC”; “Recall · 42 minutes left to repay”; “Overdue · 800 mUSDC remains; venue withdrawal unavailable.” Do not collapse these into “Defaulted = automatically liquidated.”

Repeated recalls cannot extend the first active deadline. Repayment and safe exits are never disabled by the facility after the deadline. External venues may still fail; display the actual result and preserve the debt. The lender cannot use recall to seize unrelated borrower wallet assets.

Closure sequence: borrower exits venues, repays live debt, retrieves legitimate residual vault assets; lender withdraws all agreement cash; lender ends the agreement. If an allowed venue or token balance remains, explain the prerequisite. Dust from directly donated unaccounted tokens is not used to permanently block closure; registered-accounted position balances determine completion, with unsupported donations separately reported.

An ended agreement cannot be reactivated. Repaid but unended agreements can be reused until borrowing expiry with the same parties/terms. Create a new agreement for a new borrower, lender, rate, or policy.

## 10. Direct risk and interest projections

Replace pooled health cards with:

- Amount the borrower owes, split into principal and accrued interest.
- Fixed agreed APR and daily/monthly interest estimates at current debt.
- Amount due at the agreed date, conditional on no intervening repayments/draws.
- Recall deadline and what becomes recoverable after it.
- Idle vault loan tokens and current venue value/withdrawal availability.
- Funding concentration: one named lender, one named borrower.
- Explicit “No posted collateral / no automatic collateral liquidation” status.

Projection reuses exact fixed-rate compound math and returns no-debt/unavailable/valid states. Dates use block time for financial calculation and local time plus timezone for display. Never describe projected interest as a guaranteed lender payout.

Do not show a liquidation countdown for direct unsecured agreements. Show **Repayment timeline** and **Recall timeline**. These remain separate from the pooled dashboard's **Liquidation scenarios**. A combined portfolio page labels each card by product and risk mechanism.

For the lender, “Estimated receivable” and “Cash available to withdraw” are distinct. If venue value is below debt, show the shortfall as a recovery/exposure indicator, not automatic proof that the borrower cannot repay from other funds. Conversely, venue value above debt does not guarantee withdrawal availability.

## 11. Bilateral limit negotiation UX and commitment rules

Primary action: **Request a new credit limit**. Either party can propose. Show current agreed limit, requested limit, outstanding debt, and a short explanation that both parties must approve.

The workflow is **Prepare request → Publish commitment → Other party reviews → Both approvals recorded → Apply agreed limit**. Keep explicit progress labels such as “Waiting for borrower approval” or “Ready to apply.” Do not expose three unexplained Propose/Approve/Execute buttons simultaneously.

Commitment domain:

```text
typeHash, chainId, directFacilityAddress,
lenderAddress, borrowerAddress, newCap, nonce, validUntil, salt
```

The parties are the actual lender and borrower, never a pool curator. Generate a cryptographically random 32-byte salt. Nonces are monotonically consumed/invalidated. Only a hash and nonsecret proposal metadata appear publicly before execution. Replacing/cancelling clears approvals; execution requires matching domain, both parties, active unexpired nonce, and cap >= current accrued debt.

Use the same local export/import preimage mechanism as the main plan. A copied canonical agreement link does not contain the secret proposed amount/salt. A party without the preimage cannot meaningfully review the amount; the UI asks for the exported proposal file rather than suggesting blind hash approval. The file is validated against chain, facility, both addresses, active commitment, and expiry before showing an approval action.

Copy: “The proposed amount is hidden on-chain until applied. The parties can see the amount when sharing the proposal. It becomes public in the execution transaction.” Do not describe this as ZK, encryption of all negotiation, or hiding the counterparty relationship.

Applying a higher limit does not fund the agreement. After execution, the borrower may still need the lender to deposit cash. A lower limit cannot be below accrued debt and never destroys an existing obligation.

## 12. Frontend components and interaction rules

### 12.1 Required reusable components

- `CounterpartyCard`: role label, You badge where applicable, full/checksum address affordance, optional verified name/local-label provenance, copy/explorer.
- `AgreementRelationshipHeader`: lender/borrower cards, current wallet context, product/chain, clear relationship sentence.
- `MoneyMovementPreview`: business source, actual token source, contract destination, ultimate beneficiary/creditor; direction arrows and text alternatives.
- `AgreementSummary`: agreed cap, funded cash, nominal debt, principal/interest, fixed APR, dates.
- `NextActionPanel`: deterministic state/capability-derived primary and secondary actions.
- `AgreementLifecycleBadge`: orthogonal acceptance/credit/debt/recall states.
- `DirectTermsReview`: exact accepted terms/version/hash and immutable disclosures.
- `DirectFundDialog`, `DirectBorrowDialog`, `DirectRepayDialog`, `DirectWithdrawDialog`, `DirectRecallDialog`.
- `DirectLimitRequestTimeline`: proposal preparation, approvals, execution, expiry/cancel.
- `DirectExposurePanel`: vault/venues, actual/estimated value and withdrawal condition.
- `DirectInterestProjection`: fixed-rate debt timeline, no HF/liquidation output.

All dialogs use the main transaction state machine, receipt handling, explicit-chain queries, form validation, and accessibility primitives. Do not create a second global transaction controller for the direct section.

### 12.2 Responsive layout

At desktop, lender/borrower cards sit side by side with a textual relationship between them. At mobile, stack Lender then Borrower and place “Your role in this agreement” above both. Both identities remain available before the first monetary action; never hide the counterparty exclusively in an overflow menu.

Metric cards use two columns on small screens and four on wide screens. Action panel stacks under relationship/summary and stays reachable. Tabs collapse to an accessible selection control or horizontally navigable labeled list; content must not require precision hover.

Follow the main plan's 16px form text, 14px data text, at least 44px controls, focus states, contrast, and reduced motion. Source/destination arrows need text equivalents for screen readers. Copy controls announce which address was copied, not merely “Copied.”

### 12.3 Wording replacement table

| Old wording | Direct product wording |
|---|---|
| Deposit | Fund agreement / Add funds |
| Draw | Borrow into vault |
| Pot | Available facility cash |
| Drawn | Principal borrowed; current total appears as Amount owed |
| Vault idle | Available in borrower vault |
| Hashed cap | Credit limit requests |
| Execute | Apply agreed limit |
| Panic | Request repayment |
| Pause draws | Pause new borrowing |
| Enter target | Deploy to [venue name] |
| Exit target | Withdraw from [venue name] |
| Rate (display) | Fixed borrow APR for V2; explicitly Display-only demo rate for v0 |

Names are contextual: on the borrower screen “You owe [lender]”; on the lender screen “[Borrower] owes this agreement”; on public screens “[Borrower] owes [lender] through this agreement.” The actual repayment destination remains the facility contract in all cases.

## 13. Direct data model, API, indexing, and dashboard totals

### 13.1 Direct DTO

```ts
interface DirectExposureDto {
  kind: 'IDLE_LOAN_TOKEN' | 'PERMITTED_TOKEN' | 'VENUE';
  vault: Address;
  adapter: Address | null;
  venue: Address | null;
  token: Address;
  tokenDecimals: number;
  tokenBalanceRaw: RawInteger;
  receiptSharesRaw: RawInteger | null;
  estimatedLoanValueRaw: RawInteger | null;
  withdrawableLoanAssetsRaw: RawInteger | null;
  valuationStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
  exitStatus: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  asOfBlock: RawInteger;
  priceUpdatedAt: number | null;
}

interface DirectFacilityDto {
  product: 'DIRECT';
  protocolVersion: 'interline-direct-v2';
  chainId: number;
  facility: Address;
  lender: Address;
  borrower: Address;
  vault: Address;
  asset: { address: Address; symbol: string; decimals: number };
  termsHash: Hash;
  lenderAccepted: boolean;
  borrowerAccepted: boolean;
  acceptanceDeadline: number;
  activatedAt: number | null;
  borrowExpiry: number | null;
  repaymentDueAt: number | null;
  creditLimitRaw: RawInteger;
  availableCashRaw: RawInteger;
  principalRaw: RawInteger;
  debtRaw: RawInteger;
  accruedInterestRaw: RawInteger;
  fixedAprRay: RawInteger;
  recallDeadline: number | null;
  ended: boolean;
  collateralization: 'UNSECURED_RESTRICTED_USE';
  healthFactorWad: null;
  priceLiquidatable: false;
  exposure: DirectExposureDto[];
  snapshot: SnapshotMeta;
}
```

Public DTO does not contain a global role. Role/action capabilities are derived for the connected account from verified state, with contract enforcement on every write. Underlying numeric values are strings with the same unit conventions as the main plan.

### 13.2 API endpoints

- `GET /v1/direct-facilities`: chain, party, role=lender/borrower/either, acceptance/debt/recall/status, cursor, sort, limit.
- `GET /v1/direct-facilities/:chainId/:facility`: full public agreement/terms/exposure snapshot.
- `GET /v1/direct-facilities/:chainId/:facility/events`: paginated meaningful action history.
- `GET /v1/direct-facilities/:chainId/:facility/history`: debt, cash, actual interest epochs, exposure history with provenance.
- Existing account portfolio endpoint adds `directLending`, `directBorrowing`, and `directRequests` arrays and separate totals.

No API creates signatures, accepts terms on behalf of a party, sends private proposal material, or changes debt. Creation/acceptance/funding are wallet-signed contract operations.

### 13.3 Database and event additions

Add `direct_facilities`, `direct_terms`, `direct_acceptances`, `direct_cashflows`, `direct_cap_proposals`, `direct_recall_episodes`, and `direct_history`. Reuse chain/block/log/checkpoint infrastructure and asset metadata. Index `(chain_id,lender)`, `(chain_id,borrower)`, acceptance status, outstanding debt, and last activity.

Events include facility created, terms accepted, request declined/cancelled, activated, funded, cash withdrawn, borrowed, repaid, borrowing paused/resumed, recall started/cleared, limit proposal lifecycle, and agreement ended. Each event exposes actor and actual amounts. Vault/adapter events are linked to their direct controller through factory registration.

Discover direct facilities and their vaults in their creation block. Apply the same reorg/idempotency/snapshot rules as pools. Generate direct ABIs from Foundry artifacts; do not overload old CreditLine ABI calls by name similarity.

### 13.4 Portfolio aggregation

Display separate subtotals:

- Pool supply claims and pool collateral/debt, as in the main plan.
- Direct lending cash available.
- Direct lending principal/interest receivable, explicitly nominal/unsecured.
- Direct borrowing debt owed.
- Requests awaiting the wallet's acceptance/limit approval.

Do not sum direct nominal receivables into instantly withdrawable assets. Do not add borrower-vault gross exposure to lender receivable and present the sum as new protocol value. A dollar aggregate with unavailable asset prices is partial. Pool HF calculations ignore direct assets/debt entirely because those are not cross-collateralized.

Activity rows contain `product: POOL | DIRECT` and the appropriate identity. Direct borrowing says from a named lender; pooled borrowing says from a named pool. Direct funding does not appear as pooled Supply.

## 14. Error handling and compatibility

Required direct-specific errors: wrong party, same-party creation, invalid terms, request expired/cancelled, not both accepted, no lender cash, agreed limit exceeded, borrowing expired, lender-paused, active recall, insufficient vault funds, external venue withdrawal failure, private proposal preimage mismatch, wrong chain/facility/counterparties, outstanding debt prevents closure, outstanding registered exposure prevents closure.

Each error includes a next step without promising something the contract cannot do. Examples: “Your lender needs to fund this agreement”; “Only 400 mUSDC is currently available”; “Connect the borrower wallet to borrow”; “Repayment remains available while new borrowing is paused.”

Original v0 deployments remain version-labeled. They retain fixed deployed counterparties and display-only rate semantics. Do not show a v2 Withdraw button on a v0 contract without a supported function. No automatic pot migration is promised. A new direct factory does not alter the immutable parties or assets of an existing deployment.

The active product defaults to v2 creation and clear agreement screens. Preserve v0 compatibility without forcing new users through its raw OpsPanel. Customer routes do not include mock failures/time travel.

## 15. Security and authorization acceptance criteria

1. A stranger cannot accept, fund as lender, borrow, pause, withdraw cash, change limits, or end someone else's direct facility.
2. Third-party repayments cannot redirect funds or make the payer a party.
3. A creator cannot name an unrelated pair and accept for them; caller must equal one specified party.
4. A facility cannot become active without both named parties' acceptance.
5. Term changes after acceptance require a fresh agreement, except the explicitly bilateral cap mechanism.
6. Private limit hashes are chain/facility/party bound and nonce protected.
7. Factory/vault/adapter initialization is atomic and cannot be claimed by another transaction.
8. Reentrancy, malicious return values, unexpected balances, and allowance leftovers are tested on direct flows as well as pools.
9. A lender cannot seize unrelated borrower assets, withdraw nonexistent cash, or block repayment.
10. Recall cannot permanently disable Interline venue exits; external exit failures remain distinguishable.
11. Pool cash/debt/share accounting never changes because a direct agreement is funded, borrowed, recalled, or loses venue value.
12. No environment key or configured demo role grants participant access in new direct facilities.
13. Browser query parameters, local labels, and watched-address routes never alter on-chain authorization or transaction recipients.
14. No automatic loss write-off unlocks a borrower's restricted assets while debt remains.

## 16. Detailed tests and user acceptance

### 16.1 Core contract cases

- Alice creates a lending offer to Bob; Alice accepted, Bob pending; funding/borrowing before Bob accepts reverts.
- Bob connects, verifies terms, accepts; Carol cannot accept as Bob.
- Bob creates a borrowing request to Carol; Bob accepted, Carol pending; Carol can accept as lender.
- Zero/self/corrupt-party addresses rejected; contract-wallet parties remain supported through actual calls.
- Request cancellation, decline, exact expiry boundary, and acceptance after cancellation/expiry.
- Lender funds, borrower borrows to vault, repays from wallet/vault, lender withdraws cash.
- Repeated draw/repay cycles, fixed-rate accrual, zero APR, full repayment buffer, final debt dust, interest above cap.
- Lender withdraws idle cash while debt remains; borrower availability shrinks correctly; neither party's nominal debt is silently cancelled.
- Same wallet lender in one direct facility and borrower in another, with concurrent pool positions.
- Multiple facilities for the same pair maintain separate cash, terms, vaults, and indexes.
- Recall before/at/after deadline; repeated request cannot extend it; healthy-collateral seizure is impossible because no direct liquidation path exists.
- Borrowing expiry and due-time behavior computed from block timestamps without a keeper state toggle.
- External venue pause/loss; repayment still allowed; debt remains outstanding; no false write-off/closure.
- Bilateral cap hash/approval/execute with wrong chain, address, party, nonce, salt, expired request, and cap below current debt.
- Closing only after debt, cash, and registered exposure clear; ended facilities cannot reopen.

### 16.2 Exact UI acceptance scenarios

**DL-01 — A lender can identify the borrower.** Alice opens a direct agreement. Before scrolling to advanced details, she sees “You are lending to Bob,” Bob's authoritative address, her own lender address, agreement chain, cash available, and amount Bob owes. Funding review shows Alice wallet -> agreement contract, plus Bob's eventual vault.

**DL-02 — A borrower can identify the lender.** Bob opens the same URL. He sees “You borrow from Alice,” Alice's address, his borrower role for this agreement, current cash, credit limit, APR, receiving vault, and repayment destination. The page never calls a pool curator his lender.

**DL-03 — Both roles at once.** Bob lends to Carol and borrows from Alice while supplying/borrowing in pools. Dashboard shows all four categories without reconnecting or choosing a permanent role. “I'm lending” filters only direct rows where Bob is lender; “I'm borrowing” filters only those where he is borrower.

**DL-04 — No invented recipient.** Every Fund/Borrow/Repay/Withdraw dialog displays actual on-chain source/destination roles. The final wallet transaction spender/target matches those verified addresses. Changing URL query fields cannot replace them.

**DL-05 — Human limit negotiation.** A party enters a new limit, shares/imports a proposal, reviews identities and amount, approves, and applies after both approvals. No manual salt/nonce input is required. The active limit remains unchanged until execution.

**DL-06 — Missing lender funding.** Accepted borrower sees “Waiting for lender funding,” identifies the lender, and can copy the agreement link. No phantom borrowing capacity is inferred from credit limit alone.

**DL-07 — Distressed agreement.** Recall shows who requested it, amount owed, deadline, allowed repayment/exit actions, and unavailable venue state if relevant. There is no fake HF, guaranteed recovery, or misleading liquidate button.

**DL-08 — Fresh arbitrary parties.** Two newly generated test wallets create/accept/fund/borrow/repay/withdraw without editing `.env`, importing an operator key, or deploying a new global app instance.

**DL-09 — Responsive clarity.** On a 390px phone and at 200% zoom, both party identities and the next action are understandable; no fixed header overlaps them. Keyboard/screen-reader users can review source/destination and dismiss dialogs.

**DL-10 — Legacy honesty.** An imported v0 agreement shows real supported state, fixed counterparties, and display-only rate; the UI does not offer nonexistent withdrawals. New creation clearly uses v2.

### 16.3 Usability review protocol

Give a tester each role with no explanation of contract terminology. Ask them to identify their counterparty, say where Fund/Borrow/Repay sends tokens, find immediately withdrawable funds, explain the credit limit versus cash, and identify their next action during recall. Pass only when each task is completed from visible interface copy without reading raw addresses in developer tools or guessing what Pot/Draw/Target means.

Perform this with one lender-only wallet, one borrower-only wallet, and one wallet with mixed roles. Retain screenshots of desktop/mobile and the failed-data state for review. Treat incorrect counterparty or money-flow understanding as a release-blocking UX defect, not a cosmetic issue.

## 17. Implementation order and completion definition

1. Add direct product types, factory/acceptance contracts, and shared-controller boundary before frontend integration.
2. Implement direct funding/withdrawal/debt/interest/repayment and unit/invariant tests.
3. Integrate direct vaults, policy, recall/expiry, safe exits, and cap negotiation.
4. Add direct ABI generation, manifest entries, indexed events, read APIs, portfolio grouping, and reorg tests.
5. Build Direct workspace and creation/acceptance wizard with CounterpartyCard and MoneyMovementPreview first.
6. Build role-aware agreement detail/actions, limit timeline, interest/repayment timeline, and exposure pages.
7. Integrate global Dashboard/Public desk/Activity without exclusive account roles or mixed financial totals.
8. Execute direct E2E, mixed-role E2E, real-wallet smoke tests, accessibility, and usability protocol.
9. Document local/testnet setup and direct-specific operator/user limitations; retain explicit legacy compatibility.

The extension is complete only when a fresh pair of wallets can create, mutually accept, fund, draw into a restricted vault, use approved venues, repay, withdraw the lender's cash, and end an agreement; both users can identify the counterparty and custody path throughout; and another agreement can reverse their roles without changing account configuration.

Do not satisfy this extension with a link to the old OpsPanel, static UI mockups, hardcoded demo parties, pool-backed “direct” balances, or a global role selector. The intended product is one portal supporting pooled lending and real bilateral agreements, with clear per-agreement identity and authority.

## 18. Relationship to research and original requirements

This extension is primarily an original Interline product/implementation specification grounded in the existing `CreditLine`/`BorrowerVault` code, the original PRD, the current frontend, and the three supplied screenshots. Shared wallet, accessibility, transaction, and indexing requirements use the sources cited in the main implementation plan.

Aave-like task clarity is a layout reference, not an assertion that Aave itself provides these exact bilateral facilities. Keep claims about improved usability concrete and testable. Original unsecured direct credit and new collateralized pools have different risk and repayment mechanisms; the application must make that distinction visible while allowing the same wallet to use both.

### Copyable coding-agent handoff

> Read `docs/INTERLINE_V2_OPEN_MARKET_IMPLEMENTATION_PLAN.md` and `docs/INTERLINE_V2_DIRECT_LENDING_EXTENSION_PRD.md` in `E:/Projects/Coding and AI/InterlineV2/Interline/`. Implement the direct-lending extension alongside the pooled application, preserving existing work. Do not remove 1:1 lending or route its funds through pools. Any wallet must be able to create a bilateral request with a specific counterparty, both parties must accept, and roles must be determined per agreement. The same wallet can lend in some agreements and borrow in others while also holding pool positions. Make the lender, borrower, actual vault/contract recipients, financial terms, and next action understandable before every transaction. Follow the specified contract accounting, non-custodial wallet flow, indexing, mixed-role dashboard, accessible layouts, and acceptance tests. Keep unsecured direct-credit timelines distinct from collateralized pool health/liquidation. Report implemented behavior, exact tests run, and any unmet acceptance criteria; do not describe a legacy link or static mockup as completed direct lending.
