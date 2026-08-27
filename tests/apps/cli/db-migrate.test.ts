import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

const root = path.resolve(import.meta.dirname, "../../..");

function invoke(args: readonly string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "apps/cli/db-migrate.ts", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), "db-migrate-cli-"));
}

test("CLI validates arguments before opening a database", () => {
  const directory = temporaryDirectory();
  try {
    const databasePath = path.join(directory, "not-created.sqlite");
    const result = invoke([]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "DB_MIGRATE_FAILED code=INVALID_ARGUMENTS\n");
    assert.equal(existsSync(databasePath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI reports exact fresh and rerun migration output", () => {
  const directory = temporaryDirectory();
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    const first = invoke(["--database", databasePath]);
    assert.equal(first.status, 0);
    assert.equal(first.stdout, "DB_MIGRATE_OK applied=2 current=0002-add-persistence-query-indexes\n");
    assert.equal(first.stderr, "");
    const rerun = invoke(["--database", databasePath]);
    assert.equal(rerun.status, 0);
    assert.equal(rerun.stdout, "DB_MIGRATE_OK applied=0 current=0002-add-persistence-query-indexes\n");
    assert.equal(rerun.stderr, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI rejects unknown storage without leaking canary or changing bytes", () => {
  const directory = temporaryDirectory();
  try {
    const databasePath = path.join(directory, "unknown.sqlite");
    const database = openSqliteAdapter(databasePath);
    database.exec("CREATE TABLE canary (path TEXT, token TEXT) STRICT");
    database.run("INSERT INTO canary (path, token) VALUES (?, ?)", "/do-not-leak", "token-do-not-leak");
    database.close();
    const before = createHash("sha256").update(readFileSync(databasePath)).digest("hex");
    const result = invoke(["--database", databasePath]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "DB_MIGRATE_FAILED code=UNKNOWN_DATABASE\n");
    assert.equal(result.stderr.includes(databasePath), false);
    assert.equal(result.stderr.includes("token-do-not-leak"), false);
    assert.equal(createHash("sha256").update(readFileSync(databasePath)).digest("hex"), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
