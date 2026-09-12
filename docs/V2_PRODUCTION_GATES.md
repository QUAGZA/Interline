# Interline V2 production gates

The Anvil / Base Sepolia application is **not** a production or mainnet release. Passing testnet tests does not authorize a mainnet option in the UI, a mainnet RPC default, or language that the protocol is audited or safe for real TVL.

Do not expose a mainnet network picker backed by simulated oracles, mock assets, or test curator keys.

## Must replace before any mainnet consideration

1. **Oracles** — live, chain-specific Chainlink (or equivalent) collateral/USD and loan/USD feeds with documented decimals and heartbeat. Sequencer feed must be the correct address for that chain, not a Base mainnet copy pasted onto another network.
2. **Assets** — real USDC/WETH (or the chosen pair), not `TestAsset` mUSDC/mWETH. Faucet and mock venue/router must not be reachable from production configs.
3. **Venues** — no `MockERC4626Venue` / `MockSwapRouter`. Any restricted venue is a separately reviewed integration with pause/failure handling tested against the live contract.
4. **Roles** — curator, guardian, and recovery registrar on multisig + timelock identities. No Anvil keys. No deployer EOA as perpetual guardian.
5. **Independent review** — contract + economic + operational review. This repository’s tests are not that review.
6. **Incident process** — recall window, recovery delay, and communication channel sized for mainnet, not 300s Anvil values.
7. **Indexer** — production Postgres, backup/restore, reorg handling proven, no `PRIVATE_KEY` in the runtime image, secrets via a real secret manager.
8. **Frontend** — no “simulated prices / testnet” copy on a screen that can spend mainnet assets; query keys still bind explicit chain ids.

## Explicitly out of V2 even after gates

Cross-collateral, cross-chain, unsecured credit, protocol token, native ETH wrapping, arbitrary user-listed assets, flash loans, leverage loops, automatic collateral swaps, email/SMS, passkeys, AA sponsorship, transferable supplier tokens.

## Status

**Mainnet: not ready.** Testnet only until every item above is done and recorded as a separate release decision.
