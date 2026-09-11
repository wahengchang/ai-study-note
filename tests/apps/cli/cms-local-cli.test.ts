import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCmsLocalCli } from "../../../apps/authoring-api/index.js";

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
  const runtime = path.join(homeDirectory, ".local", "share", "ai-study-note-reset", "cms");
  assert.equal(existsSync(path.join(runtime, "cms.sqlite")), true);
  assert.equal(existsSync(path.join(runtime, "media")), true);
  assert.equal(existsSync(path.join(runtime, "plugins", "seo-basics", "plugin.json")), true);
  assert.equal(existsSync(path.join(runtime, "themes", "study-notes", "theme.json")), true);
  assert.equal(existsSync(path.join(xdgConfigHome, "ai-study-note", "local-authoring-v1.json")), true);
  assert.deepEqual(initialized.output.at(-1), `CMS_INIT_OK runtime=${runtime}\n`);

  const rerun = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory, xdgConfigHome }, rerun.io), 0);
  assert.deepEqual(rerun.output.at(-1), `CMS_INIT_OK runtime=${runtime}\n`);
});

test("cms local CLI rejects an unknown command and relative home", async () => {
  const unknown = capture();
  assert.equal(await runCmsLocalCli(["unknown"], { homeDirectory: "/tmp" }, unknown.io), 2);
  assert.deepEqual(unknown.output, ["CMS_LOCAL_FAILED code=INVALID_ARGUMENTS\n"]);

  const invalidHome = capture();
  assert.equal(await runCmsLocalCli(["init"], { homeDirectory: "relative" }, invalidHome.io), 1);
  assert.deepEqual(invalidHome.output, ["CMS_INIT_FAILED code=INVALID_HOME\n"]);
});
