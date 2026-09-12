import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import { baseSepolia, sepolia } from "wagmi/chains";
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

const connectors = walletConnectProjectId
  ? [injected(), walletConnect({ projectId: walletConnectProjectId })]
  : [injected()];

function rpcFor(id: number): string {
  if (id === chainId) return rpcUrl;
  if (id === 84532) return "https://sepolia.base.org";
  if (id === 11155111) return "https://rpc.sepolia.org";
  return rpcUrl;
}

export const config = createConfig({
  chains: [anvil, baseSepolia, sepolia],
  connectors,
  transports: {
    [anvil.id]: http(rpcFor(anvil.id)),
    [baseSepolia.id]: http(rpcFor(baseSepolia.id)),
    [sepolia.id]: http(rpcFor(sepolia.id)),
  },
  ssr: true,
});
