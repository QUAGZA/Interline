/**
 * Replay DeployV2Local broadcast JSON onto a local Anvil via unlocked eth_sendTransaction.
 * Forge --broadcast aborts after via-IR TestAsset constructor decode; this lands the same txs
 * without a private key. Local Anvil only (chain 31337).
 *
 *   node --experimental-strip-types tools/replay-anvil-broadcast.ts [rpcUrl]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROADCAST = resolve(ROOT, "broadcast/DeployV2Local.s.sol/31337/run-latest.json");
const MANIFEST = resolve(ROOT, "deployments/31337/v2.json");
const RPC = process.argv[2] ?? process.env.RPC_URL ?? "http://127.0.0.1:8555";

type BroadcastTx = {
  transactionType: string;
  contractName?: string;
  contractAddress?: string;
  function?: string;
  transaction: { from: string; to?: string | null; gas: string; input: string };
};

type BroadcastFile = { transactions: BroadcastTx[] };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

function checksum(addr: string): string {
  return addr.startsWith("0x") ? (`0x${addr.slice(2)}` as string) : addr;
}

async function main() {
  const chainId = await rpc<string>("eth_chainId", []);
  if (chainId !== "0x7a69") throw new Error(`expected chain 31337, got ${chainId} at ${RPC}`);

  const file = JSON.parse(readFileSync(BROADCAST, "utf8")) as BroadcastFile;
  const created = new Map<string, string>();
  const markets: string[] = [];

  for (const [i, item] of file.transactions.entries()) {
    const tx = item.transaction;
    const from = tx.from;
    await rpc("anvil_impersonateAccount", [from]);
    const payload: Record<string, string> = {
      from,
      data: tx.input,
      gas: tx.gas,
    };
    if (tx.to) payload.to = tx.to;
    const hash = await rpc<string>("eth_sendTransaction", [payload]);
    let receipt: { status: string; contractAddress?: string; logs?: { address: string; topics?: string[] }[] } | null =
      null;
    for (let n = 0; n < 40; n++) {
      receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!receipt || receipt.status !== "0x1") {
      throw new Error(`tx ${i} ${item.contractName ?? item.function} reverted ${hash}`);
    }
    if (item.transactionType === "CREATE" && receipt.contractAddress) {
      created.set(item.contractName ?? `create-${i}`, checksum(receipt.contractAddress));
    }
    console.log(`${i + 1}/${file.transactions.length} ${item.transactionType} ${item.contractName ?? item.function} ${hash}`);
  }

    const factory = created.get("MarketFactory");
  if (factory) {
    markets.length = 0;
    const countHex = await rpc<string>("eth_call", [{ to: factory, data: "0xec979082" }, "latest"]);
    const count = Number(BigInt(countHex));
    for (let i = 0; i < count; i++) {
      const data = `0xf3c54006${i.toString(16).padStart(64, "0")}`;
      const addr = await rpc<string>("eth_call", [{ to: factory, data }, "latest"]);
      markets.push(checksum(`0x${addr.slice(-40)}`));
    }
  }

  const wallet = markets[0];
  const restricted = markets[1];
  const manifest = {
    chainId: 31337,
    factory: created.get("MarketFactory"),
    vaultFactory: created.get("BorrowerVaultFactory"),
    recoveryEscrow: created.get("MarketRecoveryEscrow"),
    lens: created.get("MarketLens"),
    directFactory: created.get("DirectFacilityFactory"),
    directLens: created.get("DirectFacilityLens"),
    startBlock: 0,
    oracleMode: "simulated",
    faucet: created.get("TestnetFaucet"),
    loanToken: created.get("TestAsset"),
    collateralToken: file.transactions.find((t, idx) => t.contractName === "TestAsset" && idx > 0)?.contractAddress,
    swapRouter: created.get("MockSwapRouter"),
    venue: created.get("MockERC4626Venue"),
    curator: file.transactions[0]?.transaction.from,
    guardian: file.transactions[0]?.transaction.from,
    markets: [
      {
        id: "usdc-weth-wallet",
        address: wallet,
        label: "mUSDC / mWETH - Wallet",
        deliveryMode: "wallet",
        loanSymbol: "mUSDC",
        collateralSymbol: "mWETH",
        oracle: created.get("ChainlinkPairOracle"),
      },
      {
        id: "usdc-weth-restricted",
        address: restricted,
        label: "mUSDC / mWETH - Restricted",
        deliveryMode: "restricted",
        loanSymbol: "mUSDC",
        collateralSymbol: "mWETH",
        oracle: created.get("ChainlinkPairOracle"),
      },
    ],
  };

  const testAssets = file.transactions.filter((t) => t.contractName === "TestAsset").map((t) => t.contractAddress);
  if (testAssets[0]) manifest.loanToken = testAssets[0];
  if (testAssets[1]) manifest.collateralToken = testAssets[1];

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${MANIFEST}`);
  console.log(`factory ${manifest.factory} wallet ${wallet} restricted ${restricted}`);
  console.log(`directFactory ${manifest.directFactory} directLens ${manifest.directLens}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
