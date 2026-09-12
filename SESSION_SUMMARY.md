# Interline session summary

**Date:** 2026-09-11  
**Repo:** [QUAGZA/Interline](https://github.com/QUAGZA/Interline)  
**Commit:** `63b4606` on `main`  
**Source of truth:** `INTERLINE_ELABORATE_PRD(1).md`

This file records what happened in the build session: request, plan, implementation, demo, and git.

---

## 1. What was asked

1. Read the elaborate PRD and `env.example`, **plan**, then **build the entire Interline v0 project**.
2. Use **30 subagents** to go faster (later interpreted as a wave DAG of file owners, not 30 simultaneous writers on an empty repo).
3. **Pause**, then **continue**.
4. Continue again to run the **local Anvil demo** (eight PRD beats).
5. **Commit and push** all changes.

Non-goals from the PRD (not built): interest curves, liquidations, multi-lender pools, tokens/NFTs, ZK, AI agents, keepers, proxies, mainnet, credit scores, custodian backends.

---

## 2. Product in one sentence

A named, **bilateral credit facility** between two protocols: public cap and exposure, hashed cap negotiation, venue-locked use of funds, and a recall clock when the destination gets sick.

v0 is a local + testnet demo. Drawn USDC never goes to the borrower EOA.

---

## 3. Plan (locked decisions)

Work landed at **repo root** (`/workspaces/Interline`), not a nested `interline/` folder.

| Topic | Choice |
|---|---|
| Vault ↔ line | Two-step: deploy vault, deploy line, `vault.setLine` once |
| Cap hash | `keccak256(abi.encode(newCap, nonce, salt))` — hash only, never store `newCap` on propose |
| `enterTarget` | `(address target, uint256 amount)` — no user `bytes` / no `target.call` |
| Recall | Draws freeze immediately; after deadline only `repay` |
| Fast-forward | Anvil `evm_increaseTime` / `evm_mine`, not a contract function |
| MockSwap | 1:1 **raw** (no decimal normalization) |
| Demo params | Cap `2_000_000e6`, `rateBps = 500` (display), recall window **5 minutes** on Anvil |
| Frontend | Next.js 15, Tailwind v4, wagmi v3 / viem, injected (+ WalletConnect if project id set) |
| Indexer | Hono, read-only; **refuses to start if `PRIVATE_KEY` is set** |

---

## 4. What shipped

### Contracts (Foundry, Solidity 0.8.24)

- `src/CreditLine.sol` — pot, cap, draw, hashed propose/approve/execute, panic, venue pause, recall
- `src/BorrowerVault.sol` — sole holder of drawn USDC; repay, enter/exit allowlisted target, swap allowlisted token
- Mocks: USDC (6 dp), WETH, JUNK (not allowlisted), MockSwap, MockTarget
- `script/Deploy.s.sol` — Anvil #0 lender, #1 borrower, mint 10M USDC to lender
- `test/CreditLine.t.sol` — **24/24 passing** (`forge test -vv`)
- OpenZeppelin v5.2.0 + forge-std as git submodules under `lib/`

Security rules that were implemented: CEI, `ReentrancyGuard`, `SafeERC20`, custom errors, no proxy, no `delegatecall`, no sweep-to-EOA, `proposeCap` does not emit/store `newCap`, repay works while paused/in recall.

### Frontend (`frontend/`)

Single page, dark zinc + amber:

- **Board** (no wallet): cap, drawn, utilisation bar, pot, vault idle, exposure, pause/recall countdown, last 15 events
- **Ops** (connected): deposit, draw, repay, hashed cap form, enter/exit target, swap WETH, swap JUNK (must fail), panic, set venue paused, Anvil fast-forward
- Copy: *The new limit is hashed until both sides sign. Then it becomes public.*
- `npm run build` green

### Indexer (`server/`)

- `GET /health`, `GET /line`, `GET /events?limit=N`
- Boot assert: exit if `process.env.PRIVATE_KEY` is set

### Docs / env

- Root `README.md` — architecture, hash formula, Anvil key warning, eight demo beats, testnet notes
- `.env.example` and `env.example` (templates only)
- `script/demo_beats.sh` — scripted eight-beat check via `cast`

**Not committed:** `.env`, `frontend/.env.local`, `node_modules`, `.next`, `out/`, `cache/`, `broadcast/`.

---

## 5. Pause / continue

Implementation was paused after contracts + tests + Next scaffold, then resumed to finish UI, indexer, and README. A later “continue” ran the live Anvil demo.

---

## 6. Live demo (Anvil)

Deployed to local Anvil (`31337`). Eight PRD beats all passed via `script/demo_beats.sh`:

1. Deposit + draw **400,000** — cap still **2,000,000**
2. Propose cap **5,000,000** — board still 2M; hash stored
3. Both approve + execute — cap **5M**
4. Draw **1,000,000** into the vault (not an EOA)
5. Enter MockTarget + swap WETH — ok
6. Swap JUNK — reverted `TokenNotAllowed` / `BlockedSwap`
7. Lender `panic()` — draws freeze, recall starts
8. Warp +300s — enter locked; repay still works

Post-demo indexer snapshot:

| Field | Value |
|---|---|
| Cap | 5,000,000 USDC |
| Drawn | 1,300,000 USDC |
| Utilisation | 26% |
| Exposure (MockTarget) | 100,000 USDC |
| Draws paused / recall | true (deadline elapsed) |

UI was verified over HTTP (no MetaMask browser tools in this environment). Addresses were inlined in the client bundle from `frontend/.env.local`.

---

## 7. Git

```
63b4606  Add Interline v0: bilateral credit line, vault, UI, and indexer.
```

Pushed: `04c49cd..63b4606  main -> main`  
Remote: `https://github.com/QUAGZA/Interline`

Clone:

```bash
git clone --recurse-submodules https://github.com/QUAGZA/Interline
```

---

## 8. How to run locally

```bash
anvil   # terminal 1

export PATH="$PATH:$HOME/.foundry/bin"
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY

cp .env.example .env
cp .env.example frontend/.env.local
# paste printed NEXT_PUBLIC_* addresses

cd frontend && npm i && npm run dev   # http://localhost:3000
```

Two MetaMask profiles (Anvil keys are **public**, local only):

- Lender / Anvil #0: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Borrower / Anvil #1: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

Replay beats after a fresh deploy:

```bash
set -a && source .env && set +a
bash script/demo_beats.sh
```

---

## 9. What was not done

- Recording `docs/demo.mp4` (path documented in README; file absent)
- Clicking MetaMask in a real browser (no browser automation in this session)
- Base Sepolia / any testnet deploy
- 30 parallel file-owner subagents on the empty repo (contracts and UI were written in-process after scaffold; the 30-agent wave was planned then superseded by pause/continue)

---

## 10. Conversation timeline

| Step | What happened |
|---|---|
| Start | User pointed at PRD + `env.example`; asked to plan then build thoroughly |
| Plan | Plan written (repo layout, APIs, 30-agent waves, definition of done); user approved |
| Subagents | User asked for 30 subagents; plan used exclusive file ownership in waves |
| Wave 0–3 | Foundry install, OZ, contracts, 24 tests, deploy script, Next.js 15 scaffold |
| Pause | User paused; remaining work was UI, indexer, README |
| Continue | Board + Ops UI, Hono indexer, README; `forge test` and `npm run build` green |
| Continue again | Anvil deploy, env fill, eight beats, indexer `/line` live, UI HTTP check |
| Git | Commit `63b4606`, push `main` (secrets excluded) |
| This file | User asked for a conversation summary as a `.md` file |
