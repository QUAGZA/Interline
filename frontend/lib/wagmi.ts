import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/connectors/injected";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { baseSepolia, mainnet, sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { chainId, rpcUrl, walletConnectProjectId } from "./env";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [chainId === 31337 ? rpcUrl : "http://127.0.0.1:8545"] },
  },
});

export const appChains = [anvil, sepolia, baseSepolia, mainnet] as const;

export function rpcFor(id: number): string {
  if (id === chainId) return rpcUrl;
  if (id === 84532) return "https://sepolia.base.org";
  if (id === 11155111) return "https://ethereum-sepolia-rpc.publicnode.com";
  if (id === 31337) return "http://127.0.0.1:8545";
  if (id === 1) return "https://ethereum.publicnode.com";
  return rpcUrl;
}

export function transport(id: number) {
  return http(rpcFor(id), {
    timeout: 12_000,
    retryCount: 1,
    batch: true,
  });
}

export const appTransports = {
  [anvil.id]: transport(anvil.id),
  [sepolia.id]: transport(sepolia.id),
  [baseSepolia.id]: transport(baseSepolia.id),
  [mainnet.id]: transport(mainnet.id),
} as const;

function appConnectors() {
  const connectors = [injected()];
  if (walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: "Interline",
          description: "Pooled and direct credit",
          url: "https://interline.app",
          icons: [],
        },
      }),
    );
  }
  return connectors;
}

/** Injected MetaMask/Rabby by default. WalletConnect (Ledger Live) when a project id is set. */
export const config = createConfig({
  chains: appChains,
  connectors: appConnectors(),
  transports: appTransports,
  ssr: true,
  pollingInterval: chainId === 31337 ? 2_000 : 12_000,
});
