# Direct lending (1:1)

Bilateral overcollateralized credit sits **beside** pooled V2 markets. A facility is one lender and one borrower. Cash never enters `LendingMarket` accounted cash, supply shares, or utilization APR. Borrowing is capped at 80% of posted mWETH collateral (same origination LTV as the pool).

## Local

1. Anvil with `--disable-code-size-limit` (V2 via-IR bytecode).
2. `forge script script/DeployV2Local.s.sol:DeployV2Local --rpc-url http://127.0.0.1:8545 --broadcast --via-ir --optimizer-runs 1 --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --disable-code-size-limit`
3. Manifest fields: `directFactory`, `directLens`. No `lender` / `borrower` keys — any wallet that is a named party may create.
4. Anvil seed uses mnemonic indexes **#5 and #6** (not env parties): they create two facilities with roles reversed, fund, and borrow into the restricted vault.

Fresh wallets (not those indexes) can still create from `/direct/new`.

## Ethereum Sepolia

Same `script/DeployV2Testnet.s.sol` as Base Sepolia (`--rpc-url` for chain 11155111). Recall window 3600s, recovery delay 86400s. Header **Network** must persist `defaultChainId` so `/direct` and `/direct/new` write on Ethereum Sepolia, not Anvil. After deploy, `deployments/11155111/v2.json` lists `directFactory` / `directLens`. Faucet: `TestnetFaucet.drip()` for mUSDC/mWETH.

## Product rules

- Mutual `acceptTerms` before fund or borrow.
- Borrower posts mWETH with `addCollateral`. Origination and collateral withdrawal keep debt ≤ 80% of collateral value.
- Lender `fund` / `withdrawCash`. Borrower `borrow` sends mUSDC to the constructor-bound vault, not the EOA.
- Fixed APR via `InterestMath.projectIndex` (testnet default 5%). Never `borrowAprRay(util)`.
- No liquidate, no write-off. Price decline can take LTV above 80% until repay; recall remains the recovery path.
- Recall: lender `requestRepayment` once. After the deadline, public recover-to-vault-then-repay. Reverse unwind stays allowed.
- Cap domain: `CapProposal(facility, lender, borrower, newCap, nonce, validUntil, salt)` — both parties, not the pool curator hash.

## App

- Nav: **Direct lending** — `/direct`, `/direct/new`, `/direct/explore`, `/direct/{chainId}/{facility}`
- Header shows wallet + network only. Never a global LENDER/BORROWER badge.
- Desk tabs: Pool loans | Direct agreements.
- Dashboard shows pool supply, pool borrow, direct lending, and direct borrowing at once. Pool HF ignores direct rows.
- `/direct/legacy/{chainId}/{facility}` is the v0 `CreditLine` viewer. That contract has **no** `withdraw`. The UI must not invent one.

## Indexer

Watch `directFactory` plus discovered facilities and vaults. `GET /v1/direct-facilities`. Portfolio fields: `directLending`, `directBorrowing`, `directRequests`. Indexing `Funded` on a facility must not increment `markets.accounted_cash`.
