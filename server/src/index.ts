import { serve } from "@hono/node-server";
import { createApp } from "./api/app.js";
import { createDb, createPool, runMigrations } from "./db/client.js";
import { PgStore } from "./db/postgres.js";
import { EnvError, loadIndexerEnv } from "./env.js";
import { loadChainConfigs } from "./indexer/deployments.js";
import { runIndexer } from "./indexer/run.js";

function mode(argv: string[]): "all" | "api" | "indexer" | "migrate" {
  if (argv.includes("--migrate-only")) return "migrate";
  if (argv.includes("--api-only")) return "api";
  if (argv.includes("--indexer-only")) return "indexer";
  return "all";
}

async function main() {
  let env;
  try {
    env = loadIndexerEnv();
  } catch (err) {
    const message = err instanceof EnvError ? err.message : String(err);
    console.error(message);
    process.exit(1);
    return;
  }

  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);
  const selected = mode(process.argv);
  if (selected === "migrate") {
    console.log("migrations applied");
    await pool.end();
    return;
  }

  const db = createDb(pool);
  const store = new PgStore(db);
  const configs = loadChainConfigs(env);
  if (configs.length === 0) {
    console.warn("no chain configs (need deployments/{chainId}/v2.json or FACTORY_ADDRESS+START_BLOCK)");
  }

  const app = createApp({ store, configs });
  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  process.on("SIGTERM", () => ac.abort());

  if (selected === "api" || selected === "all") {
    serve({ fetch: app.fetch, port: env.port }, () => {
      console.log(`interline api listening on :${env.port} (read-only, no signing keys)`);
    });
  }
  if (selected === "indexer" || selected === "all") {
    console.log(
      `interline indexer starting (${configs.map((c) => c.chainId).join(", ") || "no chains"}) from deployment startBlock`,
    );
    await runIndexer({ store, env, configs, signal: ac.signal });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
