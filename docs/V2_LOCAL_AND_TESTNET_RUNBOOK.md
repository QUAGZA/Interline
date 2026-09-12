# Interline V2 local and testnet runbook

Target environments: **Anvil 31337** and **Base Sepolia 84532**. Ethereum Sepolia leftovers from v0 are not V2 markets. This runbook does not make a mainnet claim.

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
anvil --chain-id 31337
```

Terminal B — deploy two markets, seed suppliers (#2, #3) and a borrower (#4) on both modes:

```bash
set PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
C:/Users/ACER/.foundry/bin/forge.exe script script/DeployV2Local.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key %PRIVATE_KEY%
C:/Users/ACER/.foundry/bin/forge.exe script script/VerifyV2Deployment.s.sol --rpc-url http://127.0.0.1:8545
```

This writes `deployments/31337/v2.json` (and a frontend public copy). Frontend V2 routes should read that manifest, not `NEXT_PUBLIC_CREDIT_LINE_ADDRESS`.

Faucet: any wallet calls `TestnetFaucet.drip()` (cooldown 1h) for test mUSDC / mWETH. These are **not** redeemable USDC/ETH.

## 2. Indexer / API

```bash
# server must not see PRIVATE_KEY
set INDEXER_PORT=8787
set RPC_URL=http://127.0.0.1:8545
set DATABASE_URL=postgres://interline:interline@127.0.0.1:5432/interline
npm run dev:api
```

Confirm `GET /health` and `GET /v1/markets?chainId=31337`. Restart the indexer: it must resume from the cursor, not scan genesis.

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

## 5. Base Sepolia

Use a **throwaway** deployer key funded with test ETH. Guardian may be `GUARDIAN_ADDRESS`. Recall 1h, recovery delay 24h. No participant allowlist.

```bash
C:/Users/ACER/.foundry/bin/forge.exe script script/DeployV2Testnet.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
```

Writes `deployments/84532/v2.json`. Point frontend `NEXT_PUBLIC_CHAIN_ID=84532` and a Base Sepolia RPC. Simulated prices still apply — every market page must say **Simulated prices / testnet**.

## 6. Tests (verification)

```bash
C:/Users/ACER/.foundry/bin/forge.exe test --match-path test/CreditLine.t.sol --summary
C:/Users/ACER/.foundry/bin/forge.exe test --match-path test/v2 --summary
npm run test:math
npm run test:api
npm run test:e2e
```

Playwright Anvil flows need Anvil + V2 deploy + frontend (and API if the desk is indexer-backed). See `frontend/tests/e2e`.

## 7. Operator lab (not customer UI)

v0 Ops extras (JUNK swap, Anvil warp, hash salt `0x01`) belong in developer tests / a local lab, not the customer desk.
