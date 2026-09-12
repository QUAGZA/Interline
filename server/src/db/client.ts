import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export async function runMigrations(pool: Pool): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const applied = await pool.query("select 1 from schema_migrations where id = $1", [file]);
    if (applied.rowCount) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await pool.query(sql);
    await pool.query("insert into schema_migrations (id) values ($1)", [file]);
  }
}
