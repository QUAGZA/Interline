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
  markets: V2Market[];
};

export const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "http://127.0.0.1:8545"] } },
});

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

export function accountAt(index: number) {
  return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
}

export function clientsFor(index: number) {
  const account = accountAt(index);
  const transport = http(anvilChain.rpcUrls.default.http[0]);
  return {
    account,
    publicClient: createPublicClient({ chain: anvilChain, transport }),
    walletClient: createWalletClient({ account, chain: anvilChain, transport }),
  };
}

export async function send(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  request: { to: Address; data?: Hex; account: ReturnType<typeof accountAt> },
) {
  const hash = await walletClient.sendTransaction({
    chain: anvilChain,
    account: request.account,
    to: request.to,
    data: request.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
  return hash;
}
