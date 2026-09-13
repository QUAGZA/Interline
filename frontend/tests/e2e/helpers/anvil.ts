import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { defineChain } from "viem";

export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

export type V2Market = {
  id: string;
  address: Address;
  deliveryMode: "wallet" | "restricted";
};

export type V2Manifest = {
  chainId: number;
  factory: Address;
  startBlock: number;
  faucet: Address;
  loanToken?: Address;
  collateralToken?: Address;
  vaultFactory?: Address;
  directFactory?: Address;
  venue?: Address;
  swapRouter?: Address;
  markets: V2Market[];
};

const RPC_CANDIDATES = [
  process.env.RPC_URL,
  "http://127.0.0.1:8555",
  "http://127.0.0.1:8546",
  "http://127.0.0.1:8545",
].filter((url): url is string => Boolean(url));

export function makeAnvilChain(rpcUrl: string) {
  return defineChain({
    id: 31337,
    name: "Anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export const anvilChain = makeAnvilChain(RPC_CANDIDATES[0] ?? "http://127.0.0.1:8545");

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

export const faucetAbi = parseAbi(["function drip()"]);

export const marketAbi = parseAbi([
  "function supply(uint256 assets, uint256 minSharesOut)",
  "function withdraw(uint256 assets, uint256 maxSharesBurn)",
  "function addCollateral(address owner, uint256 amount)",
  "function borrow(uint256 assets, uint256 maxDebtShares)",
  "function repay(address owner, uint256 maxAssets)",
  "function repayAll(address owner, uint256 maxAssets)",
  "function liquidate(address owner, uint256 exactDebtShares, uint256 exactCollateral, uint256 maxLoanAssetsIn, uint256 minCollateralOut)",
  "function accountedCash() view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function positionDebt(address owner) view returns (uint256)",
  "function debtSharesOf(address owner) view returns (uint256)",
  "function collateralOf(address owner) view returns (uint256)",
  "function healthOf(address owner) view returns (uint8, uint256, uint256, uint256, uint256, bool)",
  "function loanToken() view returns (address)",
  "function collateralToken() view returns (address)",
]);

export const vaultFactoryAbi = parseAbi([
  "function vaultOf(address market, address owner) view returns (address)",
]);

export function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "foundry.toml"))) return cwd;
  if (existsSync(resolve(cwd, "..", "foundry.toml"))) return resolve(cwd, "..");
  return resolve(cwd, "..");
}

export function loadManifest(): V2Manifest | undefined {
  const path = resolve(repoRoot(), "deployments", "31337", "v2.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as V2Manifest;
}

export async function rpcReady(url = anvilChain.rpcUrls.default.http[0]): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { result?: string };
    return body.result === "0x7a69";
  } catch {
    return false;
  }
}

async function getCode(url: string, address: Address): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, "latest"],
    }),
  });
  const body = (await res.json()) as { result?: string };
  return body.result ?? "0x";
}

/** Prefer an Anvil that actually has the V2 factory bytecode, not a stale 8545 node. */
export async function resolveAnvilRpc(): Promise<string | undefined> {
  const manifest = loadManifest();
  const ready: string[] = [];
  for (const url of RPC_CANDIDATES) {
    if (await rpcReady(url)) ready.push(url);
  }
  if (manifest?.factory) {
    for (const url of ready) {
      const code = await getCode(url, manifest.factory);
      if (code && code !== "0x") return url;
    }
    return undefined;
  }
  return ready[0];
}

export function accountAt(index: number) {
  return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
}

export function clientsFor(index: number, rpcUrl = anvilChain.rpcUrls.default.http[0]) {
  const account = accountAt(index);
  const chain = makeAnvilChain(rpcUrl);
  const transport = http(rpcUrl);
  return {
    account,
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

export async function send(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  request: { to: Address; data?: Hex; account: ReturnType<typeof accountAt> },
) {
  const hash = await walletClient.sendTransaction({
    account: request.account,
    to: request.to,
    data: request.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
  return hash;
}
