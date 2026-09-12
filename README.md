# Interline

A named, bilateral credit facility between two protocols: public cap and exposure, hashed cap negotiation, venue-locked use of funds, and a recall clock when the destination gets sick.

v0 is a local + testnet demo. It is **not** a pooled money market, a token, an AI risk agent, or a ZK dark pool.

## Architecture

```
frontend (Next.js App Router + Tailwind + wagmi + viem)
    │  read: CreditLine + Vault + events
    │  write: wallet txs only (no custodian backend)
    │
contracts (Foundry, Solidity 0.8.24)
    CreditLine.sol        pot, cap, draw, hashed proposal, panic/recall
    BorrowerVault.sol     holds drawn USDC, allowlist, repay, enter/swap
    mocks/                USDC, WETH, JUNK, MockSwap (1:1 raw), MockTarget
    script/Deploy.s.sol
    │
server/ (optional, read-only Hono indexer — refuses to start if PRIVATE_KEY is set)
```

Drawn USDC never goes to the borrower EOA. The vault has no sweep and does not `call` user bytes.

## Hash formula

```
proposalHash = keccak256(abi.encode(newCap, nonce, salt))
```

`newCap` is in USDC **base units** (6 decimals). `proposeCap` stores the hash only — it does not store or emit `newCap`. Both parties `approveCap(hash)`, then either party `executeCap(newCap, nonce, salt)`. Execute requires both approvals, a matching hash, and `newCap >= drawn`.

Copy shown in the UI: *The new limit is hashed until both sides sign. Then it becomes public.*

## Security notes

- **Not audited.** Mocks are not oracles. Do not put real funds in these contracts.
- Anvil private keys below are **public**. Use them only on Anvil. Never on a wallet that holds mainnet funds.
- Safety claim of v0 is structural: no EOA sweep, no arbitrary call, hashed cap, recall freeze — not “safe for mainnet TVL.”
- MockSwap is **1:1 raw** (no decimal normalization). 1 USDC base unit (`1e0` of 6-dp) swaps for 1 WETH wei.
- After the recall deadline, `enterTarget` / `exitTarget` / `swapAllowlisted` revert. Only `repay` of idle vault USDC works. Unwind during the window.
- Testnet / local only. No mainnet `PRIVATE_KEY` in this repo.

## Install

Need **Foundry** and **Node 20+**.

```bash
# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# OpenZeppelin + forge-std (git submodules under lib/)
git submodule update --init --recursive
# or, if lib/ is empty:
# forge install foundry-rs/forge-std --no-commit
# forge install OpenZeppelin/openzeppelin-contracts@v5.2.0 --no-commit

# Frontend
cd frontend && npm i && cd ..

# Optional indexer
cd server && npm i && cd ..
```

## Local demo

1. Start Anvil (10 public mnemonic accounts, 10k ETH each):

```bash
anvil
```

2. MetaMask → Add network:

   - Name: Anvil
   - RPC: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Symbol: ETH

3. Import **Anvil #0 as Lender** (public, local only):

   `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

4. Import **Anvil #1 as Borrower** in a **second browser profile**:

   `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

5. Deploy (Anvil #0 is the deployer/lender):

```bash
export PATH="$PATH:$HOME/.foundry/bin"
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY
```

6. Copy printed addresses into `.env` and `frontend/.env.local` (`cp .env.example .env` first). Fill every `NEXT_PUBLIC_*` address. Do not commit filled env files.

7. Frontend:

```bash
cd frontend && npm run dev
```

Open http://localhost:3000. Lender profile: deposit. Borrower profile: draw / propose. Switch profiles to approve.

A scripted check of the same eight beats (cast, two Anvil keys):

```bash
set -a && source .env && set +a
bash script/demo_beats.sh
```

### Eight demo beats

1. Board: cap `2,000,000`, drawn `0` then `400,000` after a draw, exposure breakdown.
2. Propose cap `5,000,000` — board still `2M`; explorer / event tape shows a hash.
3. Both sign, execute — board `5M`.
4. Draw `1,000,000` into the vault (never an EOA).
5. Enter allowlisted MockTarget / swap WETH — ok.
6. Swap JUNK — reverts, `BlockedSwap`.
7. Lender Panic or Set venue paused — draws freeze, recall countdown starts (5 minutes on Anvil).
8. Fast-forward (Anvil button or `cast rpc evm_increaseTime 300` + `evm_mine`). Vault can only repay, not enter new venues.

## Tests and build

```bash
forge test -vv
cd frontend && npm run build
```

## Optional indexer

Read-only. Uses `RPC_URL` only. **Refuses to start if `PRIVATE_KEY` is set.**

```bash
cd server
npm i
# do not export PRIVATE_KEY
RPC_URL=http://127.0.0.1:8545 \
CREDIT_LINE_ADDRESS=0x... \
VAULT_ADDRESS=0x... \
USDC_ADDRESS=0x... \
MOCK_TARGET_ADDRESS=0x... \
INDEXER_PORT=8787 \
npm start
```

- `GET /health`
- `GET /line`
- `GET /events?limit=15`

The v0 UI reads the chain from the browser RPC. The indexer is optional.

## Testnet (Base Sepolia)

1. Two **new** seed phrases. Never a wallet with mainnet funds.
2. Fund both with Base Sepolia ETH.
3. Put **only the deployer** key in `.env` `PRIVATE_KEY`.
4. Deploy, then paste addresses into `frontend/.env.local`.
5. Set `NEXT_PUBLIC_CHAIN_ID=84532` and `NEXT_PUBLIC_RPC_URL=https://sepolia.base.org`.
6. Optional: WalletConnect project id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
7. Connect the two real wallets matching constructor lender/borrower.

## Demo video

Path: `docs/demo.mp4` (record the eight beats when you have two browser profiles).

## Addresses after deploy

Deploy logs:

- `CREDIT_LINE_ADDRESS` / `NEXT_PUBLIC_CREDIT_LINE_ADDRESS`
- `VAULT_ADDRESS` / `NEXT_PUBLIC_VAULT_ADDRESS`
- `USDC_ADDRESS` / `NEXT_PUBLIC_USDC_ADDRESS`
- `WETH_ADDRESS` / `NEXT_PUBLIC_WETH_ADDRESS`
- `JUNK_ADDRESS` / `NEXT_PUBLIC_JUNK_ADDRESS`
- `MOCK_SWAP_ADDRESS`
- `MOCK_TARGET_ADDRESS` / `NEXT_PUBLIC_MOCK_TARGET_ADDRESS`

Default demo params: cap `2_000_000e6`, `rateBps = 500` (display only), `recallWindow = 5 minutes`, expiry `now + 365 days`. Allowlisted: WETH swap out, MockTarget venue. Junk is deployed and **not** allowlisted.
