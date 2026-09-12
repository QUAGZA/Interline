# Interline V2 public API

Read-only Hono API in `server/`. It indexes factory/market/vault logs into PostgreSQL and serves `/v1`. It does not sign transactions. Boot must refuse `PRIVATE_KEY` and `BORROWER_PRIVATE_KEY`.

Amounts are **decimal strings of integer base units** (bigint), plus token decimals. Never JSON numbers for money. Each payload includes `freshness` (block number/hash/lag) and oracle status where a quote is involved.

Base URL (local): `http://127.0.0.1:8787`. Zod sources of truth: `packages/api-types`.

## Health

| Method | Path | Body |
|---|---|---|
| GET | `/health` | `{ ok, db, service: "interline-indexer" }` |
| GET | `/health/lag` | `{ ok, chains[] }` with start/indexed/head/`lagBlocks` |
| GET | `/v1/health` | Same as `/health/lag` |

Lag is a **degraded** signal, not silent zero balances.

## Catalog and markets

| Method | Path | Body |
|---|---|---|
| GET | `/v1/chains` | `{ chains[] }` — 31337, 84532 |
| GET | `/v1/markets` | `{ markets: MarketSummary[] }` optional `chainId` |
| GET | `/v1/markets/:chainId/:marketId` | `{ market }` |

`marketId` is the manifest id (`usdc-weth-wallet`, `usdc-weth-restricted`) or the market address. Fields include pair, delivery mode, RAY-scaled APR/APY growth, cash/debt/shares, utilization, freeze/recall/terminal, caps, LTV/LT/bonus, `oracleStatus`, `oracleMode: "simulated"`, freshness.

## Positions and accounts

| Method | Path | Body |
|---|---|---|
| GET | `/v1/positions` | `{ positions, nextCursor, limit: 25 }` filters: `chainId`, `marketId`, `cursor` |
| GET | `/v1/positions/:chainId/:marketId/:owner` | `{ position }` |
| GET | `/v1/accounts/:chainId/:address/portfolio` | Watch-only supplies + borrows |
| GET | `/v1/events` | `{ events, nextCursor }` — `chainId`, `marketId`, `cursor`, `limit` |

An **active loan** is `projectedDebt > 0`, keyed `(chainId, market, owner)`. Sort is by debt. Page size is 25.

Position fields: `projectedDebt`, `principalOutstanding`, `debtShares`, `collateral`, `collateralValueLoan`, `supplyShares`, `supplyAssets`, `maxWithdraw`, `healthCode`, `healthFactorWad`, `liquidatable`, `defaulted`, `writtenOffLiability`, `vault`, `freshness`. HF is **per market**, never blended.

## Encoding

- Addresses: `0x`-prefixed hex.
- Integers: base-10 strings (`"1000000"` for 1 mUSDC).
- `oracleStatus`: `OK | STALE | SEQUENCER_DOWN | INVALID | UNAVAILABLE`.
- `healthCode`: `NO_DEBT | OK | UNAVAILABLE`.
- `deliveryMode`: `wallet | restricted`.

Frontend Query keys include `chainId`, `marketId`, and `account` independently of the connected wallet chain.

## Indexer behavior

- Start from `startBlock` in `deployments/{chainId}/v2.json`.
- Unique `(chainId, txHash, logIndex)`.
- Bounded log ranges; reorg rollback; durable cursor (survives restart without genesis rescan).
- Allowlisted env: RPC, DB, factory, start block. No participant keys.

## Errors

JSON error objects with 4xx for bad ids. Do not render RPC failures as zero.
