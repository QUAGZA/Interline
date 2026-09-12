# Interline — Elaborate PRD + Coding-Agent Prompt + Env Guide

**Product:** Interline  
**Version:** v0 (hackathon first ship)  
**Date:** 2026-09-11  
**Category:** DeFi  
**One sentence:** A named, bilateral credit facility between two protocols: public cap and exposure, hashed cap negotiation, venue-locked use of funds, and a recall clock when the destination gets sick.

This document is the source of truth. If a coding agent invents features not listed here, reject them.

---

## 0. How to use this file

1. Fill `.env` from §8.  
2. Paste **§11 Coding-Agent Prompt** into Cursor / Claude Code / Codex as the first message.  
3. Attach this file.  
4. Do not add tokens, AI agents, ZK, mainnet, or interest curves.

---

## 1. Objective

### 1.1 Problem (why this is not “another lending app”)

Pooled money markets (Aave-style) cannot:

- show a single public fact “B will let A draw up to X, A has drawn Y, cash sits in Z”;
- keep a cap-raise private until both desks sign;
- stop drawn dollars entering a toxic venue;
- **recall** a facility when that venue pauses or depegs, without a multi-day governance vote;
- avoid repricing every innocent borrower on a shared book when one collateral dies.

April 2026 (Kelp/rsETH → shared-pool bad debt, frozen withdrawals, rates 3.5% → 14%, no loan recall) is the design constraint.

### 1.2 Goal of v0

Working local + one testnet demo:

1. Board: cap 2_000_000, drawn 400_000, exposure breakdown.  
2. Propose cap 5_000_000 — board still 2M; explorer shows a hash.  
3. Both sign, execute — board 5M.  
4. Draw 1M into vault (never an EOA).  
5. Swap/enter **allowlisted** target — ok.  
6. Touch **junk** target — revert, `BlockedSwap`.  
7. Flip venue paused / `panic()` — draws freeze, recall countdown starts.  
8. After clock (or admin `fastForward` on mock), vault can only repay, not enter new venues.

### 1.3 Non-goals

Interest compounding, liquidation engines, multi-lender pools, token launch, ZK encryption of proposals, mainnet, credit scores, AI risk agents, instant seizure of A’s unrelated treasury.

---

## 2. Roles

| Role | Key | Powers |
|---|---|---|
| Lender | `lender` address | `deposit`, `pause`, `unpause`, `panic`, `setVenuePaused`, `proposeCap`, `approveCap`, `executeCap`, set allowlists at open |
| Borrower | `borrower` address | `draw`, `repay`, `useFunds` on allowlisted targets, `proposeCap`, `approveCap`, `executeCap` |
| Public | none | read cap, drawn, pause, recall, exposure, events |
| Vault | `BorrowerVault` | only contract that may hold drawn USDC |

Two wallets in the demo = lender and borrower. Never one wallet for both in screenshots.

---

## 3. Product flows

### 3.1 Open

Deploy `CreditLine` with lender, borrower, asset, cap, `rateBps`, `expiry`, allowlisted tokens, allowlisted targets. Lender `deposit`s USDC into the line pot.

### 3.2 Draw

Borrower `draw(amount)` if not paused, not in recall, `drawn + amount <= cap`, pot has cash. USDC: pot → vault. `drawn += amount`.

### 3.3 Use

Vault may:

- `repay(amount)` always (even when paused or in recall);
- `enterTarget(target, extraData)` only if `allowedTargets[target]`, not in recall after deadline, not panicked beyond freeze rules;
- `swapAllowlisted(tokenOut, amountIn, minOut)` only if `allowedTokens[tokenOut]`.

No `sweep`, no `transfer` of USDC to an EOA, no arbitrary `call`.

### 3.4 Cap change (hashed)

```
proposalHash = keccak256(abi.encode(newCap, nonce, salt))
```

`proposeCap(hash)` stores hash, clears both approval flags. Does **not** store `newCap`.  
Each side `approveCap(hash)`.  
`executeCap(newCap, nonce, salt)` requires both flags + matching hash + `newCap >= drawn`. Then `cap = newCap`, clear proposal.

### 3.5 Circuit breaker + recall

Triggers (any):

- lender `panic()`;
- lender `setVenuePaused(target, true)` (demo stand-in for “Morpho market paused”);
- optional: stale oracle / depeg if wired later.

Effects:

- `pausedDraws = true` immediately;
- `recallDeadline = block.timestamp + RECALL_WINDOW` (v0: 1 hour on testnet, 5 minutes on Anvil via constructor arg);
- after deadline, `enterTarget` and `swapAllowlisted` revert; only `repay` works.

### 3.6 Exposure tape

Anyone can read:

- pot USDC;
- vault USDC;
- `drawn`;
- list of allowlisted targets and a recorded `exposure[target]` updated when entering/exiting (v0: track USDC sent to target; mock targets report 1:1).

Frontend board shows these numbers.

---

## 4. Architecture

```
frontend (Next.js App Router + Tailwind CSS + wagmi + viem)
    │
    ├─ read: CreditLine + Vault + events
    └─ write: wallet txs (no custodian backend)

contracts (Foundry, Solidity 0.8.24, via-ir optional)
    CreditLine.sol        pot, cap, draw, hashed proposal, panic/recall
    BorrowerVault.sol     holds drawn funds, allowlist, repay, enter/swap
    mocks/MockERC20.sol
    mocks/MockTarget.sol  pretend venue; pause flag
    mocks/MockSwap.sol    1:1 allowlisted token out
    script/Deploy.s.sol
```

**No privileged backend that holds keys.** Optional thin Node indexer is *read-only* (poll logs → JSON). v0 frontend may `eth_getLogs` / `watchContractEvent` directly.

---

## 5. Contract requirements (normative)

### 5.1 Security rules (non-negotiable)

1. Solidity `^0.8.24`. No unchecked math except in clearly safe increment of nonces.  
2. OpenZeppelin `ReentrancyGuard` on all value-moving functions.  
3. Checks → effects → interactions. Update `drawn` / flags **before** external `transfer`.  
4. `SafeERC20` for all token moves.  
5. No `delegatecall` to user-supplied addresses.  
6. No `tx.origin`.  
7. No arbitrary `call`/`callcode` from the vault. Only hardcoded function selectors on allowlisted targets (see below).  
8. Drawn funds **never** leave to `borrower` EOA.  
9. `proposeCap` must not emit or store `newCap`.  
10. `executeCap` must require `newCap >= drawn`.  
11. Lender cannot `pause` away `repay`.  
12. Approvals: vault/line should `forceApprove` or set-to-zero-then-set pattern if needed; prefer pulling via `transferFrom` after explicit `approve` from the owner contract, not from users mid-swap.  
13. Constructor sets immutable lender/borrower/asset; no `initialize` unless UUPS is explicitly out of scope (v0: **no proxies**).  
14. `RECALL_WINDOW` and cap units documented (USDC 6 decimals).  
15. Events for every state change.  
16. Custom errors, not string reverts.  
17. NatSpec on external functions.

### 5.2 `CreditLine`

```solidity
error NotLender();
error NotBorrower();
error NotParty();
error NotVault();
error Paused();
error InRecall();
error CapExceeded();
error InsufficientPot();
error ZeroAmount();
error HashMismatch();
error NotApproved();
error CapBelowDrawn();
error Expired();
error AlreadyOpen();

event LineOpened(address indexed lender, address indexed borrower, address asset, uint256 cap);
event Deposited(uint256 amount);
event Drawn(uint256 amount, uint256 drawnAfter);
event Repaid(uint256 amount, uint256 drawnAfter);
event PausedDraws(bool paused);
event Panicked(address indexed by, uint256 recallDeadline);
event VenuePausedSet(address indexed target, bool paused);
event CapProposed(bytes32 indexed hash, address indexed by);
event CapApproved(bytes32 indexed hash, address indexed by);
event CapChanged(uint256 oldCap, uint256 newCap);
event RecallStarted(uint256 deadline);
```

State:

- `address public immutable lender;`
- `address public immutable borrower;`
- `IERC20 public immutable asset;`
- `BorrowerVault public vault;`
- `uint256 public cap;`
- `uint256 public drawn;`
- `uint16 public immutable rateBps;`      // displayed only in v0
- `uint64 public immutable expiry;`
- `bool public drawsPaused;`
- `uint64 public recallDeadline;`         // 0 = inactive
- `bytes32 public proposalHash;`
- `bool public lenderApproved;`
- `bool public borrowerApproved;`
- `mapping(address => bool) public venuePaused;`
- `uint32 public immutable recallWindow;`

Functions (exact names):

- `constructor(lender, borrower, asset, cap, rateBps, expiry, recallWindow, allowedTokens[], allowedTargets[])`  
  deploys or accepts a vault; if deploying internally, watch constructor reentrancy — prefer deploy vault first, then line, then `vault.setLine(line)` once.
- `deposit(uint256 amount)` onlyLender  
- `draw(uint256 amount)` onlyBorrower  
- `onRepay(uint256 amount)` onlyVault  
- `pauseDraws()` / `unpauseDraws()` onlyLender (`unpause` forbidden if `block.timestamp < recallDeadline` unless `panic` cleared explicitly via `clearRecall()` onlyLender after deadline handling — keep simple: `unpauseDraws` allowed only if `recallDeadline == 0 || block.timestamp >= recallDeadline` and lender calls `clearRecall()` first)
- `panic()` onlyLender — sets drawsPaused, sets recallDeadline  
- `setVenuePaused(address target, bool paused)` onlyLender — if true, same as panic for draws + recall start if not already started  
- `proposeCap(bytes32 hash)` onlyParty  
- `approveCap(bytes32 hash)` onlyParty  
- `executeCap(uint256 newCap, uint256 nonce, bytes32 salt)` onlyParty  
- views: `utilizationBps()`, `recallActive()`, `potBalance()`

`draw` algorithm:

```
if (block.timestamp > expiry) revert Expired();
if (drawsPaused || recallActive()) revert Paused();
if (amount == 0) revert ZeroAmount();
if (drawn + amount > cap) revert CapExceeded();
if (asset.balanceOf(address(this)) < amount) revert InsufficientPot();
drawn += amount;                 // effects first
asset.safeTransfer(address(vault), amount);
emit Drawn(...);
```

### 5.3 `BorrowerVault`

```solidity
error NotLine();
error NotBorrower();
error TokenNotAllowed();
error TargetNotAllowed();
error RecallLocked();
error UnsafeTarget();

event RepaidFromVault(uint256 amount);
event EnteredTarget(address indexed target, uint256 amount);
event ExitedTarget(address indexed target, uint256 amount);
event SwapExecuted(address indexed tokenOut, uint256 amountIn, uint256 amountOut);
event BlockedSwap(address indexed tokenOut, uint256 amountIn);
event BlockedTarget(address indexed target, uint256 amount);
```

State:

- `CreditLine public line;`
- `mapping(address => bool) public allowedTokens;`
- `mapping(address => bool) public allowedTargets;`
- `mapping(address => uint256) public exposure;` // USDC-equivalent sent to target

**Allowed interaction with a target:** only `MockTarget.deposit(uint256)` / `MockTarget.withdraw(uint256)` in v0. Implement via:

```solidity
interface IAllowedVenue {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function paused() external view returns (bool);
}
```

Vault:

```
function enterTarget(address target, uint256 amount) external onlyBorrower nonReentrant {
    if (!allowedTargets[target]) revert TargetNotAllowed();
    if (line.recallActive() && block.timestamp >= line.recallDeadline()) revert RecallLocked();
    if (IAllowedVenue(target).paused() || line.venuePaused(target)) revert TargetNotAllowed();
    IERC20 asset = line.asset();
    exposure[target] += amount;
    asset.safeIncreaseAllowance(target, amount);
    IAllowedVenue(target).deposit(amount);
    emit EnteredTarget(target, amount);
}
```

Do **not** pass user `bytes extraData` into `target.call`. That is how vaults get drained.

`repay`:

```
drawn reduction via line.onRepay after transfer to line
exposure not required for idle vault USDC
```

`swapAllowlisted` uses `MockSwap.swap(tokenIn, tokenOut, amountIn, minOut)` only if `allowedTokens[tokenOut]`. If not allowed: emit `BlockedSwap` and revert.

### 5.4 Mocks

- `MockERC20` — name/symbol/decimals (USDC=6, WETH=18), `mint` **onlyOwner** (deployer).  
- `JunkToken` — same, not on allowlist.  
- `MockSwap` — 1:1 decimals-normalized or 1:1 raw for demo simplicity; document it.  
- `MockTarget` — holds USDC, `paused` flag, `deposit`/`withdraw`.

### 5.5 Tests (must exist, must pass)

File `test/CreditLine.t.sol` using two `vm.prank` actors + third stranger.

- `test_DrawUpToCap`  
- `test_DrawOverCapReverts`  
- `test_DrawWhenPausedReverts`  
- `test_DrawDuringRecallReverts`  
- `test_ProposeDoesNotChangeCap`  
- `test_ExecuteWithoutBothApprovalsReverts`  
- `test_ExecuteWrongSaltReverts`  
- `test_ExecuteUpdatesCap`  
- `test_ExecuteCapBelowDrawnReverts`  
- `test_StrangerCannotDraw`  
- `test_StrangerCannotPanic`  
- `test_SwapAllowlistedOk`  
- `test_SwapJunkReverts`  
- `test_EnterAllowlistedTargetOk`  
- `test_EnterUnknownTargetReverts`  
- `test_RepayReducesDrawn`  
- `test_RepayWorksWhenPaused`  
- `test_PanicStartsRecall`  
- `test_AfterRecallOnlyRepay`  
- `test_CannotSweepToBorrowerEoa` (expect vault has no such function; attempt `asset.transfer` from borrower on vault balance fails)

Invariant (optional Foundry invariant): `drawn <= cap`, `drawn == vault.idle + sum(exposure) + pending mock` as accounting allows.

---

## 6. Frontend requirements

### 6.1 Stack

Next.js 15 App Router, TypeScript, Tailwind CSS v4 (or v3), wagmi v2, viem, `@tanstack/react-query`.  
Wallet: **injected (MetaMask / Rabby) + WalletConnect v2**.  
App is a client-heavy page (`'use client'` for wallet hooks). No server actions that send txs. No backend custody. No server-side private keys.

### 6.2 Pages (can be one page with sections)

1. **Board** (no connect required)  
   Cap, drawn, utilisation bar, pot, vault idle, exposure per target, drawsPaused, recall deadline countdown, last 15 events.  
2. **Ops** (connected)  
   Role badge. Buttons: Deposit, Draw, Repay, Propose, Approve, Execute, Enter target, Swap WETH, Swap JUNK (must fail), Panic, Set venue paused.  
   Propose form: newCap (human USDC), nonce, salt (hex) → shows hash before send.

### 6.3 UX copy

“The new limit is hashed until both sides sign. Then it becomes public.”  
Never say ZK or dark pool.

### 6.4 Wallet setup in UI

- Connect / disconnect  
- Wrong-network banner with `switchChain`  
- Show truncated address + ENS name if set in env labels  
- Disable write buttons until correct chain

---

## 7. Thin backend (optional but include)

`server/` — Express or Hono, **read-only**:

- `GET /health`  
- `GET /line` — cached view of cap, drawn, recall, pot, vault, exposures  
- `GET /events` — last N parsed logs  

Uses `RPC_URL` only. **No `PRIVATE_KEY` on the server.** If `PRIVATE_KEY` is present in process.env on the server, refuse to start (assert).

v0 may skip running this and read from the browser RPC. Still generate the folder so the agent does not invent a custodian.

---

## 8. Environment

### 8.1 File: `.env.example`

Copy to `.env` and `frontend/.env.local`. Never commit filled `.env`. Next.js only exposes `NEXT_PUBLIC_*` to the browser.

```bash
################################################################################
# Interline local / testnet config
# Copy this file:
#   cp .env.example .env
#   cp .env.example frontend/.env.local
# Fill values. NEVER commit real keys. NEVER use a mainnet key.
################################################################################

# --- Chain ---
# 31337 = Anvil local
# 84532 = Base Sepolia (recommended testnet)
# 11155111 = Ethereum Sepolia
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
# Public testnet example (do not put secrets in the URL):
# RPC_URL=https://sepolia.base.org

# --- Deployer (Foundry / Cast only) ---
# Anvil account #0 default (PUBLIC, fine for local only):
# PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# For testnet: a FRESH throwaway key funded with test ETH. Not your main wallet.
PRIVATE_KEY=

# --- Optional second key for borrower in scripts (local Anvil #1) ---
# BORROWER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# --- After deploy, paste addresses ---
CREDIT_LINE_ADDRESS=
VAULT_ADDRESS=
USDC_ADDRESS=
WETH_ADDRESS=
JUNK_ADDRESS=
MOCK_SWAP_ADDRESS=
MOCK_TARGET_ADDRESS=

# --- Human labels (not on-chain required for v0) ---
NEXT_PUBLIC_LENDER_LABEL=lender.interline.eth
NEXT_PUBLIC_BORROWER_LABEL=borrower.interline.eth

# --- Frontend (Next.js exposes only NEXT_PUBLIC_*) ---
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CREDIT_LINE_ADDRESS=
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=
NEXT_PUBLIC_WETH_ADDRESS=
NEXT_PUBLIC_JUNK_ADDRESS=
NEXT_PUBLIC_MOCK_TARGET_ADDRESS=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
# Get a free id at https://cloud.walletconnect.com

# --- Optional read-only indexer ---
INDEXER_PORT=8787
# Do not set PRIVATE_KEY in the indexer environment.
```

### 8.2 Wallet setup guide (human)

**Local demo (safest)**

1. Install Foundry and Node 20+.  
2. `anvil` in a terminal (default 10 mnemonic accounts, 10k ETH each).  
3. MetaMask → Add network:  
   - Name: Anvil  
   - RPC: `http://127.0.0.1:8545`  
   - Chain ID: `31337`  
   - Symbol: ETH  
4. Import Anvil #0 as **Lender**:  
   `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`  
5. Import Anvil #1 as **Borrower** in a **second browser profile**:  
   `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`  
6. These keys are public. Use only on Anvil.  
7. `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY`  
8. Copy printed addresses into `.env` and `frontend/.env.local`.  
9. `cd frontend && npm i && npm run dev`  
   (Next.js on http://localhost:3000)  
10. Lender profile: deposit. Borrower profile: draw / propose. Switch profiles to approve.

**Testnet demo**

1. Create two **new** seed phrases. Write them on paper. Never use a wallet that has mainnet funds.  
2. Fund both with Base Sepolia ETH from a faucet.  
3. Put **only the deployer** key in `.env` `PRIVATE_KEY`.  
4. Deploy, mint mock USDC to lender inside the deploy script.  
5. WalletConnect project id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.  
6. Connect the two real wallets as lender/borrower matching constructor addresses.

**Hard rules**

- No mainnet `PRIVATE_KEY` in this repo.  
- No screenshots of seed phrases.  
- `.gitignore` must include `.env`, `.env.local`, `broadcast/` secrets, `cache/`.

---

## 9. Result expectations

- `forge test -vv` all green.  
- `npm run build` frontend green.  
- README: architecture, hash formula, addresses, demo script, security notes.  
- Demo video path in README matches §1.2.  
- No `.env` in git.

---

## 10. Development order

1. Foundry init, mocks, `CreditLine` + `BorrowerVault`, tests.  
2. Deploy script printing addresses.  
3. Frontend board + ops against Anvil.  
4. Panic / recall / blocked target wired to UI.  
5. README + `.env.example`.  
6. Only then optional indexer.

---

## 11. CODING-AGENT PROMPT (copy everything in this section)

```
You are implementing Interline v0 from scratch in this empty directory.

Read and obey the PRD file INTERLINE_ELABORATE_PRD.md if present. If not, this prompt is complete.

GOAL
Build a Foundry + Next.js + Tailwind + wagmi app: bilateral protocol credit line.
Public cap + drawn + exposure. Hashed cap proposals. Drawn USDC only in BorrowerVault.
Vault may repay, swap to allowlisted token via MockSwap, or enter allowlisted MockTarget.
Junk token / unknown target reverts with events. Lender panic() starts recall; after deadline only repay works.

STACK
- Contracts: Foundry, Solidity 0.8.24, OpenZeppelin Contracts (ReentrancyGuard, SafeERC20, IERC20)
- NO proxy, NO upgradeability, NO delegatecall to user addresses
- Frontend: Next.js 15 App Router, TypeScript, Tailwind CSS, wagmi v2, viem, TanStack Query
- UI: dark desk layout (zinc/neutral + one accent). Tailwind only. No CSS-in-JS.
- Optional server/: Hono or Express read-only indexer. MUST refuse to start if PRIVATE_KEY is set.

REPO LAYOUT
interline/
  foundry.toml
  remappings.txt
  src/CreditLine.sol
  src/BorrowerVault.sol
  src/interfaces/IAllowedVenue.sol
  src/mocks/MockERC20.sol
  src/mocks/MockSwap.sol
  src/mocks/MockTarget.sol
  src/mocks/JunkToken.sol
  script/Deploy.s.sol
  test/CreditLine.t.sol
  frontend/   (Next.js App Router + Tailwind)
    app/page.tsx
    app/layout.tsx
    app/providers.tsx
    lib/wagmi.ts
    lib/abi.ts
    tailwind.config.ts
    next.config.ts
  server/     (optional read-only)
  .env.example
  .gitignore
  README.md

SECURITY (fail the task if you violate these)
- Checks-effects-interactions; ReentrancyGuard on draw, repay, deposit, enterTarget, swapAllowlisted, executeCap
- SafeERC20
- proposeCap stores bytes32 only, never newCap
- hash = keccak256(abi.encode(newCap, nonce, salt))
- executeCap requires both approvals AND hash match AND newCap >= drawn
- draw sends USDC to vault only
- vault has no sweep/withdraw-to-EOA
- vault must NOT target.call(userBytes); only IAllowedVenue.deposit/withdraw
- custom errors
- immutable lender, borrower, asset
- repay works while draws are paused / recall active
- stranger cannot draw/panic/propose
- .gitignore: .env, .env.local, node_modules, out, cache, broadcast

CONSTRUCTOR / DEPLOY ORDER
1. Deploy MockERC20 USDC (6 decimals), WETH (18), JunkToken (18)
2. Deploy MockSwap, MockTarget
3. Deploy BorrowerVault with temporary dummy line address OR two-step:
   Prefer: deploy vault with line=address(0), deploy CreditLine passing vault, then vault.setLine(line) only once (onlyOnce).
4. CreditLine constructor sets allowlisted tokens [WETH] and targets [MockTarget]
5. Mint 10_000_000 * 1e6 USDC to lender
6. Log all addresses

FRONTEND
Next.js app in frontend/. create-next-app with Tailwind, App Router, no src/ dir required.
- app/layout.tsx wraps Providers (wagmi + query)
- app/page.tsx is a client page: board on top, ops below
- Network guard for NEXT_PUBLIC_CHAIN_ID
- Connect wallet (injected + WalletConnect if NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID set)
- Board reads contract state every block
- Ops: deposit, draw, repay, propose (show hash), approve, execute, enterTarget, swap WETH, swap JUNK, panic, setVenuePaused
- Use env addresses NEXT_PUBLIC_*
- Amounts: USDC input in human units, convert with 6 decimals
- Tailwind: readable numbers, utilisation bar, red state when recall/paused
- npm run dev and npm run build must work from frontend/

TESTS
Implement every test named in the PRD. All must pass with forge test.

README
How to install Foundry, anvil, deploy, fill env, run frontend.
Anvil private keys warning.
Demo script of 8 beats.
Hash formula.
Security assumptions (mocks, not audited, testnet only).

ENV
Write .env.example exactly as specified in the PRD.

Do not add extra tokens, NFTs, governance, keepers, or AI.
When done, run forge test and npm run build in frontend.
Fix until both pass.
```

---

## 12. Security assumptions (honest)

v0 is **not audited**. Mocks are not oracles. Anvil keys are public.  
Do not put real funds in these contracts.  
The safety claim of v0 is *structural*: no EOA sweep, no arbitrary call, hashed cap, recall freeze — not “safe for mainnet TVL.”

---

## 13. Definition of done

A reviewer can clone, `anvil`, deploy, fill env, open two browser profiles, and complete the eight demo beats without asking you a question.
