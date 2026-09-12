# Interline V2 risk and accounting

Canonical units and formulas match `src/v2/libraries/` and `packages/math`. Executable quotes use integer `mulDiv` / bigint only. `Number` is display-only after the exact result exists. Do not use `Math.pow` in quotes.

## Units

| Symbol | Value | Use |
|---|---|---|
| BPS | 10_000 | LTV, LT, bonus |
| WAD | 10^18 | Health factor, USD prices |
| RAY | 10^27 | Index and APR |
| YEAR | 31_536_000 | 365-day seconds |
| SUPPLY_SHARE_SCALE | 10^12 | Empty-market mint |
| DEBT_SHARE_SCALE | 10^27 | Debt share precision |
| DEBT_DENOMINATOR | 10^54 | `RAY * DEBT_SHARE_SCALE` |
| PRICE_SCALE | 10^36 | Loan raw units per collateral raw unit |

Ten-year dormancy at 100% APR stays inside uint256 for configured testnet balances (≤ 1e6 mUSDC). Limits are recorded on `InterestMath` NatSpec.

## Ledger

```text
C  accounted loan-token cash
Q  total scaled debt shares
I(t) projected borrow index
B(t) = ceil(Q * I(t) / DEBT_DENOMINATOR)
A(t) = C + B(t)          supplier assets
S    total internal supplier shares
s[u] supplier shares of wallet u
q[u] debt shares of borrower u
K[u] collateral raw units escrowed for u
D[u,t] = ceil(q[u] * I(t) / DEBT_DENOMINATOR)
```

Collateral, vault idle, adapter assets, and recovery escrow are **not** in `C`, `B`, or `A`. Direct token donations do not reprice shares; they appear as `unaccountedSurplus()` and cannot be borrowed or withdrawn through regular accounting. The UI tells users to call Supply.

Loan and collateral assets must differ. Transfers check deltas and reject fee-on-transfer.

## Supplier shares (not ERC-20, not ERC-4626)

Empty market (`S == 0` and `A == 0`): `minted = assetsIn * SUPPLY_SHARE_SCALE`.

Otherwise:

- supply exact assets: `floor(assetsIn * S / A_before)`
- withdraw exact assets: `ceil(assetsOut * S / A_before)`
- redeem exact shares: `floor(sharesBurn * A_before / S)`
- claim: `floor(s[u] * A_now / S)`

Reject zero-share supply. `maxWithdraw` / `maxRedeem` are limited by `C` and rounding. Never burn every share while performing debt remains.

**Net lending return** = current claim + withdrawals + recovery received/claimable − cash supplied. It can be negative after a loss. Do not label the whole figure “interest earned.”

## Borrow / repay

Borrow exact assets: `newDebtShares = ceil(assetsOut * DEBT_DENOMINATOR / I_now)`. Health and caps use post-action rounded owner debt, not “old debt + requested assets.”

Repay up to a budget: `sharesBurn = min(q_owner, floor(maxAssets * DEBT_DENOMINATOR / I_now))`, `assetsPaid = ceil(sharesBurn * I_now / DEBT_DENOMINATOR)`. Partial user repay must leave 0 or ≥ 10 mUSDC; liquidations and forced recoveries may leave dust. `repayAll` burns exact remaining owner shares; if those are all market shares, charge exact aggregate `B` and leave `Q == B == 0`.

Rounding surplus (0 or 1 loan base unit) stays in accounted cash. Emit actual paid, shares burned, and reduction. Third-party repay is allowed and grants no withdrawal rights.

Sum of individually rounded debts can exceed aggregate `B` by at most `numberOfDebtPositions - 1` base units.

## Rate curve (immutable per market)

Utilization `U = B / (C+B)` in RAY, 0 when assets are 0.

```text
U <= 0.80:  borrowAPR = 0.02 + 0.08 * U / 0.80
U  > 0.80:  borrowAPR = 0.10 + 0.90 * (U - 0.80) / 0.20
```

Reference: 0% → 2%, 40% → 6%, 80% → 10%, 90% → 55%, 100% → 100%. Protocol fee is 0 in V2.

Index: `ratePerSecondRay = floor(aprRay / YEAR)`, `I(t) = floor(epochIndex * rpow(RAY + rps, dt, RAY) / RAY)`.

Cash/debt-changing ops (supply, withdraw, redeem, borrow, repay, liquidate, write-off): project index under the old rate, apply the op, then start a new epoch only if APR changed. Views, `accrue()`, collateral add/remove, and venue entry/exit do **not** reset the epoch. Passing time grows debt under the frozen epoch rate. This is not continuous rate repricing.

**Borrow APR** is the headline borrower cost; APY is one-year compound growth of the current per-second rate. **Supply APY (est.)** is the one-year change in `A/S` with the current borrow rate frozen and no external cashflows (≈ utilization × one-year borrow growth). These are conditional estimates, not guarantees.

## Oracle and health

`quoteScale36 = floor(Pc * 10^(36 + dl - dc) / Pl)`.

- borrow capacity = collateral value in loan units × 70% (7000 bps)
- liquidation capacity = value × 80% (8000 bps)
- liquidation bonus = 5% (500 bps)
- close factor = up to 100% of eligible debt
- `liquidatable` iff `debt > liquidationCapacity` (`==` is still healthy)
- no debt → typed `NO_DEBT` (no numeric HF)
- invalid oracle → `UNAVAILABLE`, never a healthy number

Collateral removal with debt must leave debt inside **max LTV**, not merely above LT. Invalid oracle blocks borrow, collateral-with-debt removal, and price liquidation; repay and add-collateral remain available.

Caps (supply 1e6 mUSDC, borrow 8e5; restricted default position ceiling 25_000 mUSDC) never revert repay, liquidation, or withdrawal.

## Liquidation and write-off

Permissionless. Quote is exact debt shares **XOR** exact collateral. If collateral is exhausted and debt remains, write off `B`/`A` for that position, snapshot suppliers, mark defaulted, do not reopen. Restricted leftover borrowed funds cannot be swept to the borrower while recovery liability remains; later recoveries go to `MarketRecoveryEscrow`.

## Testnet fixture parameters (not production recommendations)

mUSDC = $1 simulated, mWETH = $2,000 simulated. Recall window 300s Anvil / 3600s Base Sepolia. Recovery delay 300s Anvil / 24h Base Sepolia. Mock feed freshness 3600s. Sequencer grace 3600s. Min new borrow / leftover partial debt: 10 mUSDC. Min new supply: 1 mUSDC.
