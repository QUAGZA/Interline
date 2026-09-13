# Interline V2 architecture

Interline V2 is an isolated, permissionless lending application. Any wallet can supply, post collateral, borrow, repay, and withdraw inside a selected market. Users sign their own transactions. The indexer/API never holds participant keys. An optional keeper may call the same public liquidation and recall-exit functions anyone else can call.

This document describes the running system. Economics live in [V2_RISK_AND_ACCOUNTING.md](./V2_RISK_AND_ACCOUNTING.md). HTTP reads live in [V2_API.md](./V2_API.md). Local, Base Sepolia, and Ethereum Sepolia steps live in [V2_LOCAL_AND_TESTNET_RUNBOOK.md](./V2_LOCAL_AND_TESTNET_RUNBOOK.md). Mainnet is a separately gated milestone — see [V2_PRODUCTION_GATES.md](./V2_PRODUCTION_GATES.md).

## Processes

```text
Wallet  --signs own txs-->  LendingMarket (isolated pool)
Factory --creates-->        LendingMarket
Market  --wallet mode-->    owner EOA
Market  --restricted-->     BorrowerVaultV2 --> typed venue adapter / swap router
Oracle  --quote-->          Market (simulated feeds on Anvil / Base Sepolia / Ethereum Sepolia)
Market/Vault events -->     Indexer --> PostgreSQL 16 --> public /v1 API --> Next.js app
Optional keeper -->         public liquidate() / publicExitAndRepay()
```

| Process | Role | Keys |
|---|---|---|
| `frontend/` | Next 15 App Router, wagmi 3 / viem. Public reads. Wallet writes. | None (browser wallet) |
| `server/` | Durable indexer + Hono `/v1` | RPC, DB, factory, start block only. Refuses `PRIVATE_KEY` / `BORROWER_PRIVATE_KEY` |
| `keeper/` | Optional loop for public liquidations and post-deadline recall exits | `KEEPER_PRIVATE_KEY` only — dedicated funded key, no exclusive rights |
| PostgreSQL 16 | Indexer checkpoint, positions, events | Compose `compose.yaml` |
| Anvil / Base Sepolia / Ethereum Sepolia RPC | Chain | Deployer key for scripts only |

## On-chain layout (`src/v2/`)

- `MarketFactory` — curator-only listing of reviewed markets; participation is still permissionless.
- `LendingMarket` — one loan token, one collateral token, immutable risk/rate config, internal (non-ERC-20) supplier shares. No proxy.
- `MarketLens` — aggregated views; does not mutate state.
- `BorrowerVaultFactory` / `BorrowerVaultV2` — constructor-bound owner + market. Restricted borrows never mint to the owner EOA.
- `ERC4626VenueAdapter` — typed deposit/withdraw/redeem against one venue. No `call` / user bytes.
- `MarketRecoveryEscrow` — write-off snapshots; later recoveries go to suppliers, not the defaulted borrower.
- `ChainlinkPairOracle` — collateral/USD + loan/USD + sequencer. Test manifests set `oracleMode: "simulated"`.
- Mocks: `TestAsset` (mUSDC 6 dp, mWETH 18 dp), mock feeds, `TestnetFaucet`, `MockERC4626Venue`, `MockSwapRouter`.

Legacy `CreditLine` / `BorrowerVault` remain for the v0 suite. Do not mix v0 Sepolia leftovers into V2 markets.

## Delivery modes

| Mode | Borrow destination | Recall |
|---|---|---|
| Wallet | Position owner’s wallet | Not used |
| Restricted | Owner’s `BorrowerVaultV2` | Guardian starts a window; exits/repay always allowed; after deadline anyone may `publicExitAndRepay` into the vault then repay. Deadline does not seize healthy collateral. |

Borrowed loan tokens are pool debt. They are never also counted as pool-owned collateral. Supplier shares are not collateral.

## Deployments

Each environment writes `deployments/{chainId}/v2.json` (schema: `deployments/schema.json`):

- Anvil `31337` — `script/DeployV2Local.s.sol` (recall 300s, recovery delay 300s, faucet seed).
- Base Sepolia `84532` — `script/DeployV2Testnet.s.sol` (recall 3600s, recovery delay 24h).
- Ethereum Sepolia `11155111` — same `DeployV2Testnet` (recall 3600s, recovery delay 24h). Public L1 testnet; EIP-170 applies.

Manifests include factory, start block, two markets (wallet + restricted), faucet, and `oracleMode: "simulated"`. They do not enumerate permitted lenders/borrowers.

Generate TypeScript ABIs from Foundry `out/` only:

```bash
C:/Users/ACER/.foundry/bin/forge.exe build
npm run export:abis
```

Do not hand-copy ABI JSON into `packages/protocol`.

## Application routes (target)

Public without a wallet: `/`, `/markets`, `/markets/[chainId]/[marketId]`, `/desk`, `/positions/...`, `/accounts/...`. `/dashboard` shows an empty state when disconnected. `/connect` is an optional return URL, not a gate for public pages.

Public reads bind `chainId` from the route or manifest, not from `useAccount().chainId`. After a write: wait for the receipt, then refetch market, position, and allowance.

## Isolation boundary (what is true)

Market A cannot spend Market B’s cash or collateral. A loss in A changes only A’s supplier claims and recovery records. Isolation does **not** remove shared oracle, curator/guardian, asset-correlation, or infrastructure risk. Do not describe any pool as risk-free.

## Accessibility (verification notes)

Wave 6 application chrome is supposed to provide: keyboard access to primary nav and actions, focus trapping in dialogs, `prefers-reduced-motion` (disable scramble/noise on financial controls), and usable layout at 320px (tables collapse to cards; labeled mobile menu). Playwright coverage lives in `frontend/tests/e2e/accessibility.spec.ts`. Remaining product gaps are listed in the Wave 7 verification report, not claimed as done.
