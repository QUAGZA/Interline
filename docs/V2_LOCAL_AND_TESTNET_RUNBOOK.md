# Interline V2 local and testnet runbook

Target environments: **Anvil 31337**, **Base Sepolia 84532**, and **Ethereum Sepolia 11155111**. v0 leftover addresses on Ethereum Sepolia are not V2 markets — deploy V2 separately. This runbook does not make a mainnet claim.

Forge: `C:/Users/ACER/.foundry/bin/forge.exe`. Node 24 LTS.

## 0. Prerequisites

```bash
git submodule update --init --recursive
npm install
C:/Users/ACER/.foundry/bin/forge.exe build
npm run export:abis
```

Copy `.env.example` → `.env` and `frontend/.env.local`. Do not commit secrets. Anvil keys are public — local only.

PostgreSQL 16:

```bash
docker compose up -d postgres
```

## 1. Anvil

Terminal A:

```bash
anvil --chain-id 31337 --disable-code-size-limit
```

V2 via-IR bytecode exceeds EIP-170; Anvil must disable the cap. Terminal B — deploy two markets, seed suppliers (#2, #3) and a borrower (#4) on both modes, plus direct facilities (#5 lends to #6, #6 lends to #5). Compile/script flags: `--via-ir --optimizer-runs 1 --disable-code-size-limit`.

```bash
C:/Users/ACER/.foundry/bin/forge.exe script script/DeployV2Local.s.sol:DeployV2Local --rpc-url http://127.0.0.1:8545 --broadcast --via-ir --optimizer-runs 1 --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --disable-code-size-limit
C:/Users/ACER/.foundry/bin/forge.exe script script/VerifyV2Deployment.s.sol --rpc-url http://127.0.0.1:8545
```

If Forge aborts after simulation with `Failed to decode constructor arguments contract=TestAsset`, replay the broadcast JSON (no key; unlocked RPC):

```bash
node --experimental-strip-types tools/replay-anvil-broadcast.ts http://127.0.0.1:8545
```

This writes `deployments/31337/v2.json` (and a frontend public copy). Frontend V2 routes should read that manifest, not `NEXT_PUBLIC_CREDIT_LINE_ADDRESS`.

Faucet: any wallet calls `TestnetFaucet.drip()` (cooldown 1h) for test mUSDC / mWETH. These are **not** redeemable USDC/ETH.

## 2. Indexer / API (optional for pool + direct writes)

The app can read live markets, positions, portfolio, and direct agreements from the catalog RPC when `/v1` is down. **Postgres + indexer are not required** for two-wallet Sepolia drip / supply / borrow / accept.

To serve history and the public desk from the indexer:

```bash
# server must not see PRIVATE_KEY
docker compose up -d postgres
set INDEXER_PORT=8787
set RPC_URL=http://127.0.0.1:8545
set DATABASE_URL=postgres://interline:interline@127.0.0.1:5432/interline
npm run dev:api
```

Ethereum Sepolia indexer (optional):

```bash
set RPC_URL_11155111=https://ethereum-sepolia-rpc.publicnode.com
set CHAIN_ID=11155111
set INDEXER_PORT=8787
set DATABASE_URL=postgres://interline:interline@127.0.0.1:5432/interline
npm run dev:api
```

Frontend `NEXT_PUBLIC_API_URL` still defaults to `http://127.0.0.1:8787`. If that port is closed, the UI banner says **on-chain reads (indexer offline)** and uses MarketLens / DirectFacilityLens plus the `deployments/{chainId}/v2.json` manifest. Do not expect typed-fixture token addresses (`0x…0011`) on writable catalogs.

Confirm `GET /health` and `GET /v1/markets?chainId=31337` only when the API is running. Restart the indexer: it must resume from the cursor, not scan genesis.

## 3. App

```bash
npm run dev:frontend
```

Open `http://localhost:3000`. Public `/markets` and `/desk` must work **disconnected**. Connect any funded Anvil account (not only env-labeled lender/borrower) to supply and borrow.

MetaMask Anvil: RPC `http://127.0.0.1:8545`, chain id `31337`. Import a **fresh** Anvil account to prove permissionless participation.

## 4. Optional keeper

Dedicated key (example Anvil #9). Not `PRIVATE_KEY`, not a user wallet permission.

```bash
set KEEPER_PRIVATE_KEY=<dedicated anvil key>
set RPC_URL=http://127.0.0.1:8545
set CHAIN_ID=31337
set API_URL=http://127.0.0.1:8787
npm run keeper
```

`KEEPER_DRY_RUN=1` logs intended liquidate / `publicExitAndRepay` calls without sending. Anyone else can send the same transactions.

## 5. Public testnets (Base Sepolia and Ethereum Sepolia)

Use a **throwaway** deployer key funded with test ETH on the target chain. Guardian may be `GUARDIAN_ADDRESS`. Recall 1h, recovery delay 24h. No participant allowlist. Compile with `--via-ir --optimizer-runs 1`. Do **not** pass `--disable-code-size-limit` — EIP-170 is live on these networks.

Factories un-nest `new` into `MarketDeployer`, `VaultDeployer`, and `DirectFacilityDeployer` so runtime bytecode stays under 24,576 bytes.

```bash
# Base Sepolia
C:/Users/ACER/.foundry/bin/forge.exe script script/DeployV2Testnet.s.sol:DeployV2Testnet --rpc-url https://sepolia.base.org --broadcast --via-ir --optimizer-runs 1

# Ethereum Sepolia (actual L1 testnet, chain 11155111)
# FOUNDRY_PROFILE=sepolia strips CBOR metadata so MarketDeployer stays under EIP-170.
# --non-interactive skips the near-limit contract-size prompt. Do not pass --disable-code-size-limit.
C:/Users/ACER/.foundry/bin/forge.exe script script/DeployV2Testnet.s.sol:DeployV2Testnet --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --slow --non-interactive --via-ir --optimizer-runs 1

C:/Users/ACER/.foundry/bin/forge.exe script script/VerifyV2Deployment.s.sol:VerifyV2Deployment --rpc-url https://ethereum-sepolia-rpc.publicnode.com --via-ir
```

Writes `deployments/{chainId}/v2.json` with live addresses. Point frontend `NEXT_PUBLIC_V2_CHAIN_ID=11155111` (or `84532`) and a matching public RPC. Indexer: `RPC_URL_11155111` / `CHAIN_ID=11155111`. Simulated prices still apply — every market page must say **Simulated prices / testnet**. Mock feeds go **stale after 1 hour**; use **Refresh simulated prices** in the app (permissionless `setAnswer` on the mock feeds) before borrow. Do not redeploy Sepolia for this.

Faucet: any wallet calls `TestnetFaucet.drip()` on the deployed faucet (cooldown 1h) for test **mUSDC / mWETH**. These are not redeemable USDC/ETH. The market page has a **Drip test tokens** button; both wallets need a drip before supply/borrow.

Two-wallet happy path without the indexer: connect each wallet in this app on **Ethereum Sepolia**, drip, Wallet A supplies, Wallet B posts collateral and borrows under 80% LTV, repay-max fills outstanding debt. Create a direct agreement naming the other wallet; that wallet opens `/direct` (inbox) or the copied `/direct/11155111/{facility}` URL and accepts. The creator already accepted at create — they will see Waiting, not a second Accept.

## 6. Tests (verification)

```bash
C:/Users/ACER/.foundry/bin/forge.exe test --match-path test/CreditLine.t.sol --summary
C:/Users/ACER/.foundry/bin/forge.exe test --via-ir --match-path test/v2 --summary
npm run test:math
npm run test:api
npm run test:e2e
```

Direct lending local flow: see `docs/V2_DIRECT_LENDING.md`. Playwright DL-01–10 live in `frontend/tests/e2e/direct.spec.ts`.

Playwright Anvil flows need Anvil + V2 deploy + frontend (and API if the desk is indexer-backed). See `frontend/tests/e2e`.

## 7. Operator lab (not customer UI)

v0 Ops extras (JUNK swap, Anvil warp, hash salt `0x01`) belong in developer tests / a local lab, not the customer desk.
