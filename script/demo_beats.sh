#!/usr/bin/env bash
# Eight PRD demo beats against a live Anvil deploy.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

RPC=${RPC_URL:-http://127.0.0.1:8545}
LENDER_PK=${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
BORROWER_PK=${BORROWER_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
LINE=${CREDIT_LINE_ADDRESS:?}
VAULT=${VAULT_ADDRESS:?}
USDC=${USDC_ADDRESS:?}
WETH=${WETH_ADDRESS:?}
JUNK=${JUNK_ADDRESS:?}
TARGET=${MOCK_TARGET_ADDRESS:?}

cast_l() { cast send --rpc-url "$RPC" --private-key "$LENDER_PK" "$@"; }
cast_b() { cast send --rpc-url "$RPC" --private-key "$BORROWER_PK" "$@"; }
call() { cast call --rpc-url "$RPC" "$@" | awk '{print $1}'; }

assert_eq() {
  local got="$1" want="$2" msg="$3"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $msg: got $got want $want" >&2
    exit 1
  fi
  echo "OK   $msg = $got"
}

echo "=== Beat 1: deposit + draw 400_000; board cap 2M drawn 400k ==="
cast_l "$USDC" "approve(address,uint256)" "$LINE" 5000000000000
cast_l "$LINE" "deposit(uint256)" 2500000000000
cast_b "$LINE" "draw(uint256)" 400000000000
assert_eq "$(call "$LINE" "cap()(uint256)")" "2000000000000" "cap"
assert_eq "$(call "$LINE" "drawn()(uint256)")" "400000000000" "drawn after 400k"

echo "=== Beat 2: propose 5M — cap unchanged, hash stored ==="
NEWCAP=5000000000000
NONCE=1
SALT=0x0000000000000000000000000000000000000000000000000000000000000001
HASH=$(cast keccak "$(cast abi-encode "f(uint256,uint256,bytes32)" "$NEWCAP" "$NONCE" "$SALT")")
cast_b "$LINE" "proposeCap(bytes32)" "$HASH"
assert_eq "$(call "$LINE" "cap()(uint256)")" "2000000000000" "cap still 2M after propose"
assert_eq "$(call "$LINE" "proposalHash()(bytes32)")" "$HASH" "proposal hash"

echo "=== Beat 3: both approve + execute — cap 5M ==="
cast_b "$LINE" "approveCap(bytes32)" "$HASH"
cast_l "$LINE" "approveCap(bytes32)" "$HASH"
cast_b "$LINE" "executeCap(uint256,uint256,bytes32)" "$NEWCAP" "$NONCE" "$SALT"
assert_eq "$(call "$LINE" "cap()(uint256)")" "5000000000000" "cap 5M"

echo "=== Beat 4: draw 1M into vault ==="
cast_b "$LINE" "draw(uint256)" 1000000000000
assert_eq "$(call "$LINE" "drawn()(uint256)")" "1400000000000" "drawn 1.4M"
VAULT_IDLE=$(call "$USDC" "balanceOf(address)(uint256)" "$VAULT")
assert_eq "$VAULT_IDLE" "1400000000000" "vault idle USDC"

echo "=== Beat 5: enter allowlisted target + swap WETH ==="
cast_b "$VAULT" "enterTarget(address,uint256)" "$TARGET" 100000000000
assert_eq "$(call "$VAULT" "exposure(address)(uint256)" "$TARGET")" "100000000000" "exposure 100k"
cast_b "$VAULT" "swapAllowlisted(address,uint256,uint256)" "$WETH" 1000000 1000000
echo "OK   swap WETH"

echo "=== Beat 6: swap JUNK reverts ==="
if cast_b "$VAULT" "swapAllowlisted(address,uint256,uint256)" "$JUNK" 1000000 0 2>/tmp/junk_swap.err; then
  echo "FAIL junk swap should revert" >&2
  exit 1
fi
if ! grep -q "TokenNotAllowed\|0xa29c4986" /tmp/junk_swap.err; then
  echo "FAIL expected TokenNotAllowed, got:" >&2
  cat /tmp/junk_swap.err >&2
  exit 1
fi
echo "OK   junk swap reverted TokenNotAllowed"

echo "=== Beat 7: panic — draws freeze, recall starts ==="
cast_l "$LINE" "panic()"
assert_eq "$(call "$LINE" "drawsPaused()(bool)")" "true" "drawsPaused"
assert_eq "$(call "$LINE" "recallActive()(bool)")" "true" "recallActive"
if cast_b "$LINE" "draw(uint256)" 1 2>/tmp/draw_paused.err; then
  echo "FAIL draw during recall should revert" >&2
  exit 1
fi
echo "OK   draw during recall reverted"

echo "=== Beat 8: warp past recall — enter/swap locked, repay works ==="
cast rpc --rpc-url "$RPC" evm_increaseTime 300 >/dev/null
cast rpc --rpc-url "$RPC" evm_mine >/dev/null
if cast_b "$VAULT" "enterTarget(address,uint256)" "$TARGET" 1 2>/tmp/enter_locked.err; then
  echo "FAIL enter after deadline should revert" >&2
  exit 1
fi
echo "OK   enterTarget locked after deadline"
cast_b "$VAULT" "repay(uint256)" 100000000000
echo "OK   repay after deadline"
echo
echo "ALL EIGHT BEATS PASSED"
