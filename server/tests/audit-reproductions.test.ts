import { expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Address, type PublicClient } from "viem";
import { MemoryStore } from "../src/db/memory.js";
import { freshnessOf } from "../src/api/serialize.js";
import { indexOnce } from "../src/indexer/run.js";
import type { ChainConfig } from "../src/domain.js";
import type { IndexerEnv } from "../src/env.js";

const HASH = `0x${"01".repeat(32)}` as const;
const MARKET = "0x00000000000000000000000000000000000000a1" as Address;
const OWNER = "0x00000000000000000000000000000000000000b1" as Address;
const FACTORY = "0x00000000000000000000000000000000000000f1" as Address;
const VAULT_FACTORY = "0x00000000000000000000000000000000000000f2" as Address;
const NEW_MARKET = "0x00000000000000000000000000000000000000a2" as Address;
const NEW_VAULT = "0x00000000000000000000000000000000000000c8" as Address;
const DIRECT_FACTORY = "0x00000000000000000000000000000000000000f3" as Address;
const FACILITY = "0x00000000000000000000000000000000000000d1" as Address;
const LENDER = "0x00000000000000000000000000000000000000d2" as Address;
const BORROWER = "0x00000000000000000000000000000000000000d3" as Address;
const FACILITY_VAULT = "0x00000000000000000000000000000000000000d4" as Address;
const LOAN = "0x00000000000000000000000000000000000000c1" as Address;
const COLLATERAL = "0x00000000000000000000000000000000000000c2" as Address;

const suppliedAbi = parseAbi([
  "event Supplied(address indexed supplier, uint256 assets, uint256 shares, uint256 cashAfter, uint256 assetsAfter)",
]);
const marketCreatedAbi = parseAbi([
  "event MarketCreated(address indexed market, address indexed loanToken, address indexed collateralToken, uint8 deliveryMode)",
]);
const collateralAbi = parseAbi(["event CollateralAdded(address indexed owner, address indexed from, uint256 amount)"]);
const borrowedAbi = parseAbi([
  "event Borrowed(address indexed owner, uint256 assets, uint256 shares, address destination, uint256 debtAfter)",
]);
const vaultCreatedAbi = parseAbi([
  "event VaultCreated(address indexed market, address indexed owner, address vault)",
]);
const enteredAbi = parseAbi(["event EnteredVenue(uint256 assets, uint256 shares)"]);
const facilityCreatedAbi = parseAbi([
  "event FacilityCreated(address indexed facility, address indexed lender, address indexed borrower, address vault, bytes32 termsHash, address creator)",
]);
const fundedAbi = parseAbi(["event Funded(address indexed lender, uint256 assets, uint256 cashAfter)"]);

function config(partial: Partial<ChainConfig> = {}): ChainConfig {
  return {
    chainId: 31337,
    name: "Audit",
    rpcUrl: "http://unused.invalid",
    factory: null,
    vaultFactory: null,
    recoveryEscrow: null,
    lens: null,
    startBlock: 1n,
    oracleMode: "simulated",
    faucet: null,
    directFactory: null,
    directLens: null,
    markets: [
      {
        id: "audit",
        address: MARKET,
        label: "Audit",
        deliveryMode: "wallet",
        loanSymbol: "mUSDC",
        collateralSymbol: "mWETH",
        oracle: null,
      },
    ],
    ...partial,
  };
}

function suppliedLog(address: Address, owner: Address, logIndex: number, blockNumber = 1n) {
  return {
    address,
    blockNumber,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex,
    topics: encodeEventTopics({ abi: suppliedAbi, eventName: "Supplied", args: { supplier: owner } }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [100n, 100n, 100n, 100n],
    ),
  };
}

function clientFor(logs: Array<{ address: Address }>, head = 1n, read: PublicClient["readContract"] = async () => {
  throw new Error("Hydration unavailable");
}): PublicClient {
  return {
    getBlockNumber: async () => head,
    getBlock: async ({ blockNumber }: { blockNumber?: bigint }) => ({
      hash: HASH,
      parentHash: HASH,
      timestamp: 1000n + (blockNumber ?? 0n),
    }),
    getLogs: async ({ address }: { address?: Address | Address[] }) => {
      const wanted = new Set(
        (Array.isArray(address) ? address : address ? [address] : []).map((a) => a.toLowerCase()),
      );
      if (wanted.size === 0) return logs;
      return logs.filter((l) => wanted.has(l.address.toLowerCase()));
    },
    readContract: read,
  } as unknown as PublicClient;
}

const env = { maxBlockRange: 100, reorgDepth: 10, pollMs: 1_000 } as IndexerEnv;

it("A08: crash after event insertion recovers the supplier on retry", async () => {
  const log = suppliedLog(MARKET, OWNER, 0);
  const client = clientFor([log]);
  const store = new MemoryStore();
  const realUpsert = store.upsertPosition.bind(store);
  store.upsertPosition = async () => {
    throw new Error("Simulated crash before position persistence");
  };
  await expect(indexOnce({ store, config: config(), env, client })).rejects.toThrow("Simulated crash");
  store.upsertPosition = realUpsert;
  await indexOnce({ store, config: config(), env, client });
  expect((await store.getCursor(31337))?.lastBlock).toBe(1n);
  const positions = await store.listPositions(31337);
  expect(positions).toHaveLength(1);
  expect(positions[0]!.owner.toLowerCase()).toBe(OWNER);
  expect(positions[0]!.supplyShares).toBe(100n);
  expect((await store.listEventsForReplay(31337)).length).toBe(1);
});

it("A08: already-journaled event is still projected when insertEvent returns false", async () => {
  const store = new MemoryStore();
  await store.seedMarkets(config());
  await store.insertEvent({
    chainId: 31337,
    txHash: HASH,
    logIndex: 0,
    blockNumber: 1n,
    blockHash: HASH,
    address: MARKET,
    eventName: "Supplied",
    args: { supplier: OWNER, assets: "100", shares: "100", cashAfter: "100", assetsAfter: "100" },
    timestamp: 1000n,
  });
  expect(await store.listPositions(31337)).toEqual([]);
  await indexOnce({ store, config: config(), env, client: clientFor([suppliedLog(MARKET, OWNER, 0)]) });
  const positions = await store.listPositions(31337);
  expect(positions).toHaveLength(1);
  expect(positions[0]!.owner.toLowerCase()).toBe(OWNER);
});

it("A08: crash during facility snapshot recovers the facility on retry", async () => {
  const created = {
    address: DIRECT_FACTORY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 0,
    topics: encodeEventTopics({
      abi: facilityCreatedAbi,
      eventName: "FacilityCreated",
      args: { facility: FACILITY, lender: LENDER, borrower: BORROWER },
    }),
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "address" }],
      [FACILITY_VAULT, HASH, LENDER],
    ),
  };
  const funded = {
    address: FACILITY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 1,
    topics: encodeEventTopics({ abi: fundedAbi, eventName: "Funded", args: { lender: LENDER } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [500n, 500n]),
  };
  const cfg = config({ directFactory: DIRECT_FACTORY, markets: [] });
  const client = clientFor([created, funded]);
  const store = new MemoryStore();
  const real = store.upsertDirectFacility.bind(store);
  store.upsertDirectFacility = async () => {
    throw new Error("Simulated crash before facility persistence");
  };
  await expect(indexOnce({ store, config: cfg, env, client })).rejects.toThrow("Simulated crash");
  store.upsertDirectFacility = real;
  await indexOnce({ store, config: cfg, env, client });
  const rows = await store.listDirectFacilities(31337);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.facility.toLowerCase()).toBe(FACILITY);
  expect(rows[0]!.accountedCash).toBe(500n);
});

it("A09: hydration reads the pinned indexed block and does not keep stale OK", async () => {
  const seen: bigint[] = [];
  const client = clientFor([suppliedLog(MARKET, OWNER, 0)], 50n, async (req) => {
    if (req.blockNumber !== undefined) seen.push(req.blockNumber as bigint);
    throw new Error("Hydration unavailable");
  });
  const store = new MemoryStore();
  await store.seedMarkets(config());
  const seeded = await store.getMarket(31337, "audit");
  await store.upsertMarket({ ...seeded!, oracleStatus: "OK" });
  const cursor = await indexOnce({
    store,
    config: config(),
    env: { ...env, maxBlockRange: 1 } as IndexerEnv,
    client,
  });
  expect(cursor.lastBlock).toBe(1n);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((n) => n === 1n)).toBe(true);
  expect(cursor.hydrationOk).toBe(false);
  expect(cursor.lastHydratedAt).toBeNull();
  expect(cursor.lastPolledAt).toBeTruthy();
  expect(cursor.lastError).toMatch(/Hydration unavailable/);
  const market = await store.getMarket(31337, "audit");
  expect(market?.oracleStatus).toBe("UNAVAILABLE");
  const fresh = freshnessOf(cursor, "OK");
  expect(fresh.hydrationOk).toBe(false);
  expect(fresh.oracleStatus).toBe("UNAVAILABLE");
  expect(fresh.lastError).toMatch(/Hydration unavailable/);
  expect(fresh.indexedBlockNumber).toBe("1");
  expect(fresh.headBlockNumber).toBe("50");
});

it("A13: same-range discovery indexes new pool, vault, and facility activity", async () => {
  const createdMarket = {
    address: FACTORY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 0,
    topics: encodeEventTopics({
      abi: marketCreatedAbi,
      eventName: "MarketCreated",
      args: { market: NEW_MARKET, loanToken: LOAN, collateralToken: COLLATERAL },
    }),
    data: encodeAbiParameters([{ type: "uint8" }], [0]),
  };
  const supplied = suppliedLog(NEW_MARKET, OWNER, 1);
  const collateral = {
    address: NEW_MARKET,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 2,
    topics: encodeEventTopics({
      abi: collateralAbi,
      eventName: "CollateralAdded",
      args: { owner: OWNER, from: OWNER },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [10n ** 18n]),
  };
  const borrowed = {
    address: NEW_MARKET,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 3,
    topics: encodeEventTopics({ abi: borrowedAbi, eventName: "Borrowed", args: { owner: OWNER } }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [40n, 40n, OWNER, 40n],
    ),
  };
  const createdVault = {
    address: VAULT_FACTORY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 4,
    topics: encodeEventTopics({
      abi: vaultCreatedAbi,
      eventName: "VaultCreated",
      args: { market: NEW_MARKET, owner: OWNER },
    }),
    data: encodeAbiParameters([{ type: "address" }], [NEW_VAULT]),
  };
  const entered = {
    address: NEW_VAULT,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 5,
    topics: encodeEventTopics({ abi: enteredAbi, eventName: "EnteredVenue" }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [25n, 25n]),
  };
  const createdFacility = {
    address: DIRECT_FACTORY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 6,
    topics: encodeEventTopics({
      abi: facilityCreatedAbi,
      eventName: "FacilityCreated",
      args: { facility: FACILITY, lender: LENDER, borrower: BORROWER },
    }),
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "address" }],
      [FACILITY_VAULT, HASH, LENDER],
    ),
  };
  const funded = {
    address: FACILITY,
    blockNumber: 1n,
    blockHash: HASH,
    transactionHash: HASH,
    transactionIndex: 0,
    logIndex: 7,
    topics: encodeEventTopics({ abi: fundedAbi, eventName: "Funded", args: { lender: LENDER } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [500n, 500n]),
  };

  const cfg = config({
    factory: FACTORY,
    vaultFactory: VAULT_FACTORY,
    directFactory: DIRECT_FACTORY,
    markets: [],
  });
  const store = new MemoryStore();
  await indexOnce({
    store,
    config: cfg,
    env,
    client: clientFor([createdMarket, supplied, collateral, borrowed, createdVault, entered, createdFacility, funded]),
  });

  const markets = await store.listMarkets(31337);
  expect(markets.some((m) => m.address.toLowerCase() === NEW_MARKET)).toBe(true);
  const positions = await store.listPositions(31337);
  expect(positions).toHaveLength(1);
  expect(positions[0]!.supplyShares).toBe(100n);
  expect(positions[0]!.collateral).toBe(10n ** 18n);
  expect(positions[0]!.debtShares).toBe(40n);
  expect(positions[0]!.vault?.toLowerCase()).toBe(NEW_VAULT);
  const vaults = await store.listVaults(31337);
  expect(vaults.some((v) => v.vault.toLowerCase() === NEW_VAULT && v.venueAssets === 25n)).toBe(true);
  const facilities = await store.listDirectFacilities(31337);
  expect(facilities).toHaveLength(1);
  expect(facilities[0]!.accountedCash).toBe(500n);
  const names = (await store.listEventsForReplay(31337)).map((e) => e.eventName);
  expect(names).toEqual([
    "MarketCreated",
    "Supplied",
    "CollateralAdded",
    "Borrowed",
    "VaultCreated",
    "EnteredVenue",
    "FacilityCreated",
    "Funded",
  ]);
});
