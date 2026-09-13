import { describe, expect, it } from "vitest";
import {
  ALLOWED_ENV,
  assertNoSigningKeys,
  EnvError,
  loadAllowlistedEnv,
  readIndexerEnv,
} from "../src/env.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("env allowlist", () => {
  it("uses the hosting platform port unless explicitly overridden", () => {
    expect(readIndexerEnv({ PORT: "10000" }).port).toBe(10000);
    expect(readIndexerEnv({ PORT: "10000", INDEXER_PORT: "8787" }).port).toBe(8787);
  });
  it("rejects PRIVATE_KEY when present", () => {
    expect(() => assertNoSigningKeys({ PRIVATE_KEY: "0xabc" })).toThrow(EnvError);
  });

  it("rejects BORROWER_PRIVATE_KEY when present", () => {
    expect(() => assertNoSigningKeys({ BORROWER_PRIVATE_KEY: "0xabc" })).toThrow(EnvError);
  });

  it("allows empty forbidden keys", () => {
    expect(() => assertNoSigningKeys({ PRIVATE_KEY: "", BORROWER_PRIVATE_KEY: "  " })).not.toThrow();
  });

  it("loads only allowlisted keys from env files", () => {
    const dir = mkdtempSync(join(tmpdir(), "interline-env-"));
    writeFileSync(join(dir, "foundry.toml"), "");
    writeFileSync(join(dir, "compose.yaml"), "");
    writeFileSync(
      join(dir, ".env"),
      [
        "DATABASE_URL=postgres://interline:interline@127.0.0.1:5432/interline",
        "PRIVATE_KEY=0xshouldnotload",
        "BORROWER_PRIVATE_KEY=0xneither",
        "SOMETHING_ELSE=nope",
        "INDEXER_PORT=9999",
      ].join("\n"),
    );
    const prevDb = process.env.DATABASE_URL;
    const prevPort = process.env.INDEXER_PORT;
    delete process.env.DATABASE_URL;
    delete process.env.INDEXER_PORT;
    delete process.env.PRIVATE_KEY;
    delete process.env.BORROWER_PRIVATE_KEY;
    try {
      loadAllowlistedEnv({ cwd: dir, repoRoot: dir });
      expect(process.env.DATABASE_URL).toBe("postgres://interline:interline@127.0.0.1:5432/interline");
      expect(process.env.INDEXER_PORT).toBe("9999");
      expect(process.env.PRIVATE_KEY).toBeUndefined();
      expect(process.env.SOMETHING_ELSE).toBeUndefined();
    } finally {
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
      if (prevPort === undefined) delete process.env.INDEXER_PORT;
      else process.env.INDEXER_PORT = prevPort;
    }
  });

  it("reads defaults without signing keys", () => {
    const cfg = readIndexerEnv({
      DATABASE_URL: "postgres://interline:interline@127.0.0.1:5432/interline",
      RPC_URL: "http://127.0.0.1:8545",
    });
    expect(cfg.databaseUrl).toContain("interline");
    expect(cfg.port).toBe(8787);
    expect(ALLOWED_ENV).toContain("FACTORY_ADDRESS");
    expect(ALLOWED_ENV).not.toContain("PRIVATE_KEY");
  });
});
