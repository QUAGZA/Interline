import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const dynamic = "force-dynamic";

const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as const;
const USDC_USD_FEED = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6" as const;

const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const RPCS = [
  "https://ethereum.publicnode.com",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
];

function usdFrom8(answer: bigint): number {
  return Number(answer) / 1e8;
}

async function readAnswer8(url: string, feed: typeof ETH_USD_FEED | typeof USDC_USD_FEED): Promise<bigint> {
  const client = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 8_000 }) });
  const round = await client.readContract({
    address: feed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  });
  const answer = round[1];
  if (answer <= 0n) throw new Error(`Invalid ${feed} answer`);
  return answer;
}

async function chainlinkPair(): Promise<{ ethAnswer8: bigint; usdcAnswer8: bigint }> {
  let last: unknown;
  for (const url of RPCS) {
    try {
      const [ethAnswer8, usdcAnswer8] = await Promise.all([
        readAnswer8(url, ETH_USD_FEED),
        readAnswer8(url, USDC_USD_FEED),
      ]);
      return { ethAnswer8, usdcAnswer8 };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Chainlink mainnet feeds unavailable");
}

async function coingeckoFallback(): Promise<{ ethAnswer8: bigint; usdcAnswer8: bigint }> {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin&vs_currencies=usd", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const body = (await res.json()) as { ethereum?: { usd?: number }; "usd-coin"?: { usd?: number } };
  const eth = body.ethereum?.usd;
  const usdc = body["usd-coin"]?.usd;
  if (!eth || eth <= 0 || !usdc || usdc <= 0) throw new Error("CoinGecko missing ETH/USDC");
  return {
    ethAnswer8: BigInt(Math.round(eth * 1e8)),
    usdcAnswer8: BigInt(Math.round(usdc * 1e8)),
  };
}

export async function GET() {
  try {
    let ethAnswer8: bigint;
    let usdcAnswer8: bigint;
    let source = "chainlink-mainnet";
    try {
      const pair = await chainlinkPair();
      ethAnswer8 = pair.ethAnswer8;
      usdcAnswer8 = pair.usdcAnswer8;
    } catch {
      const pair = await coingeckoFallback();
      ethAnswer8 = pair.ethAnswer8;
      usdcAnswer8 = pair.usdcAnswer8;
      source = "coingecko";
    }
    return NextResponse.json({
      ethAnswer8: ethAnswer8.toString(),
      usdcAnswer8: usdcAnswer8.toString(),
      ethUsd: usdFrom8(ethAnswer8),
      usdcUsd: usdFrom8(usdcAnswer8),
      source,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "eth-usd unavailable" }, { status: 502 });
  }
}
