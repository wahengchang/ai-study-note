import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCmsLocalCli } from "../../../apps/authoring-api/index.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout: (text) => { output.push(text); }, stderr: (text) => { output.push(text); } } };
}

test("cms:init creates a repository-external local runtime and reruns safely", async (context) => {
  const homeDirectory = mkdtempSync(path.join(tmpdir(), "cms-local-cli-"));
  const xdgConfigHome = path.join(homeDirectory, "config");
  context.after(() => { rmSync(homeDirectory, { recursive: true, force: true }); });

  const initialized = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory, xdgConfigHome }, initialized.io), 0);
  const runtime = path.join(realpathSync(homeDirectory), ".local", "share", "ai-study-note-reset", "cms");
  assert.equal(existsSync(path.join(runtime, "cms.sqlite")), true);
  assert.equal(existsSync(path.join(runtime, "media")), true);
  assert.equal(existsSync(path.join(runtime, "media", ".cms-current-only-v1")), true);
  assert.equal(existsSync(path.join(xdgConfigHome, "ai-study-note", "local-authoring-v1.json")), true);
  assert.deepEqual(initialized.output.at(-1), `CMS_INIT_OK runtime=${runtime}\n`);

  const rerun = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory, xdgConfigHome }, rerun.io), 0);
  assert.deepEqual(rerun.output.at(-1), `CMS_INIT_OK runtime=${runtime}\n`);
});

test("cms:init rejects a HOME symlink resolving inside the repository", async (context) => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "cms-local-cli-symlink-"));
  const linkedHome = path.join(temporaryRoot, "home");
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  symlinkSync(repositoryRoot, linkedHome);
  context.after(() => { rmSync(temporaryRoot, { recursive: true, force: true }); });

  const rejected = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory: linkedHome }, rejected.io), 1);
  assert.deepEqual(rejected.output, ["CMS_INIT_FAILED code=INVALID_HOME\n"]);
});

test("cms local CLI rejects an unknown command and relative home", async () => {
  const unknown = capture();
  assert.equal(await runCmsLocalCli(["unknown"], { homeDirectory: "/tmp" }, unknown.io), 2);
  assert.deepEqual(unknown.output, ["CMS_LOCAL_FAILED code=INVALID_ARGUMENTS\n"]);

  const invalidHome = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory: "relative" }, invalidHome.io), 1);
  assert.deepEqual(invalidHome.output, ["CMS_INIT_FAILED code=INVALID_HOME\n"]);
});

test("cms:init rejects an old media layout before creating a database or credential", async (context) => {
  const homeDirectory = mkdtempSync(path.join(tmpdir(), "cms-old-media-"));
  context.after(() => rmSync(homeDirectory, { recursive: true, force: true }));
  const runtime = path.join(homeDirectory, ".local", "share", "ai-study-note-reset", "cms");
  const mediaRoot = path.join(runtime, "media");
  mkdirSync(mediaRoot, { recursive: true });
  writeFileSync(path.join(mediaRoot, "legacy-canary"), "keep old media");
  const captured = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory }, captured.io), 1);
  assert.deepEqual(captured.output, ["CMS_INIT_FAILED code=OLD_MEDIA_UNSUPPORTED\n"]);
  assert.equal(readFileSync(path.join(mediaRoot, "legacy-canary"), "utf8"), "keep old media");
  assert.equal(existsSync(path.join(runtime, "cms.sqlite")), false);
  assert.equal(existsSync(path.join(homeDirectory, ".config", "ai-study-note", "local-authoring-v1.json")), false);
});

test("cms:init refuses a current media marker with a symlinked current directory", async (context) => {
  const homeDirectory = mkdtempSync(path.join(tmpdir(), "cms-linked-media-"));
  context.after(() => rmSync(homeDirectory, { recursive: true, force: true }));
  const runtime = path.join(homeDirectory, ".local", "share", "ai-study-note-reset", "cms");
  const mediaRoot = path.join(runtime, "media");
  const outside = path.join(homeDirectory, "outside");
  mkdirSync(mediaRoot, { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(outside, "canary"), "keep");
  writeFileSync(path.join(mediaRoot, ".cms-current-only-v1"), "ai-study-note-reset/current-media/v1\n");
  symlinkSync(outside, path.join(mediaRoot, "current"));
  const captured = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory }, captured.io), 1);
  assert.equal(existsSync(path.join(runtime, "cms.sqlite")), false);
  assert.equal(readFileSync(path.join(outside, "canary"), "utf8"), "keep");
});

test("cms:init rejects an old SQLite generation without changing its bytes", async (context) => {
  const homeDirectory = mkdtempSync(path.join(tmpdir(), "cms-old-sqlite-"));
  context.after(() => rmSync(homeDirectory, { recursive: true, force: true }));
  const runtime = path.join(homeDirectory, ".local", "share", "ai-study-note-reset", "cms");
  mkdirSync(runtime, { recursive: true });
  const databasePath = path.join(runtime, "cms.sqlite");
  const database = openSqliteAdapter(databasePath);
  database.exec("CREATE TABLE legacy_canary (message TEXT NOT NULL); INSERT INTO legacy_canary VALUES ('keep'); PRAGMA application_id = 1095324500");
  database.close();
  const before = readFileSync(databasePath);
  const captured = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory }, captured.io), 1);
  assert.deepEqual(captured.output, ["CMS_INIT_FAILED code=OLD_DATABASE_UNSUPPORTED\n"]);
  assert.deepEqual(readFileSync(databasePath), before);
  assert.equal(existsSync(path.join(runtime, "media")), false);
});
