import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

const root = path.resolve(import.meta.dirname, "../../..");

// 直接從 package.json 取出 `db:migrate` 實際會跑的 argv，而不是在測試裡另抄一份旗標：
// 抄一份會在 script 變動時無聲走鐘，測到的就不再是 operator 真正執行的那條指令。
// （node:sqlite 在 Node 24 會把 ExperimentalWarning 寫進 stderr，CLI 的 exact-output
// contract 必須把 driver 噪音隔離掉，該旗標即為此而存在。）
function shippedCliArgv(): readonly string[] {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts?: Readonly<Record<string, string>>;
  };
  const script = manifest.scripts?.["db:migrate"];
  assert.equal(typeof script, "string");
  const tokens = String(script).split(/\s+/).filter((token) => token.length > 0);
  assert.equal(tokens[0], "node");
  return tokens.slice(1);
}

const cliArgv = shippedCliArgv();

function invoke(args: readonly string[]) {
  return spawnSync(process.execPath, [...cliArgv, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("shipped db:migrate script isolates the driver warning", () => {
  assert.equal(cliArgv.includes("--disable-warning=ExperimentalWarning"), true);
  assert.equal(cliArgv.at(-1), "apps/cli/db-migrate.ts");
});

function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), "db-migrate-cli-"));
}

test("CLI validates arguments before opening a database", () => {
  const directory = temporaryDirectory();
  try {
    const databasePath = path.join(directory, "not-created.sqlite");
    const missing = invoke([]);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, "");
    assert.equal(missing.stderr, "DB_MIGRATE_FAILED code=INVALID_ARGUMENTS\n");

    // 帶了合法 database path 但夾雜未知選項：必須在開啟資料庫前就失敗，不得建立檔案。
    const unknownOption = invoke(["--database", databasePath, "--unknown", "value"]);
    assert.equal(unknownOption.status, 2);
    assert.equal(unknownOption.stdout, "");
    assert.equal(unknownOption.stderr, "DB_MIGRATE_FAILED code=INVALID_ARGUMENTS\n");
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
