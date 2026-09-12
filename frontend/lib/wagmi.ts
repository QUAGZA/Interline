import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/connectors/injected";
import { baseSepolia, sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { chainId, rpcUrl } from "./env";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [chainId === 31337 ? rpcUrl : "http://127.0.0.1:8545"] },
  },
});

const connectors = [injected()];

function rpcFor(id: number): string {
  if (id === chainId) return rpcUrl;
  if (id === 84532) return "https://sepolia.base.org";
  if (id === 11155111) return "https://ethereum-sepolia-rpc.publicnode.com";
  return rpcUrl;
}

function transport(id: number) {
  return http(rpcFor(id), {
    timeout: 12_000,
    retryCount: 1,
    batch: true,
  });
}

export const config = createConfig({
  chains: [anvil, baseSepolia, sepolia],
  connectors,
  transports: {
    [anvil.id]: transport(anvil.id),
    [baseSepolia.id]: transport(baseSepolia.id),
    [sepolia.id]: transport(sepolia.id),
  },
  ssr: true,
  pollingInterval: chainId === 31337 ? 2_000 : 12_000,
});
