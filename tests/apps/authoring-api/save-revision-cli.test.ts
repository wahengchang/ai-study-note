import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runSaveRevisionCli } from "../../../apps/authoring-api/index.js";

function io(): Readonly<{ out: string[]; err: string[]; value: { stdout(text: string): void; stderr(text: string): void } }> {
  const out: string[] = []; const err: string[] = [];
  return { out, err, value: { stdout: (text) => out.push(text), stderr: (text) => err.push(text) } };
}

test("SaveRevision CLI rejects argv and request files with fixed exit contracts", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "save-revision-cli-"));
  const environment = { cwd: directory, homeDirectory: directory, xdgConfigHome: path.join(directory, "config") };
  const invalidArguments = io();
  assert.equal(await runSaveRevisionCli(["--entry-id", "not/a/path", "--input", "request.json"], invalidArguments.value, environment), 2);
  assert.deepEqual(invalidArguments.out, []); assert.deepEqual(invalidArguments.err, ["AUTHORING_SAVE_REVISION_FAILED code=INVALID_ARGUMENTS\n"]);
  const missing = io();
  assert.equal(await runSaveRevisionCli(["--entry-id", "entry", "--input", "missing.json"], missing.value, environment), 2);
  assert.deepEqual(missing.out, []); assert.deepEqual(missing.err, ["AUTHORING_SAVE_REVISION_FAILED code=INPUT_READ_FAILED\n"]);
  writeFileSync(path.join(directory, "request.json"), "{}");
  const invalidFile = io();
  assert.equal(await runSaveRevisionCli(["--entry-id", "entry", "--input", "request.json"], invalidFile.value, environment), 2);
  assert.deepEqual(invalidFile.out, []); assert.deepEqual(invalidFile.err, ["AUTHORING_SAVE_REVISION_FAILED code=INVALID_REQUEST_FILE\n"]);
  const prohibitedKey = io();
  assert.equal(await runSaveRevisionCli(["--entry-id", "entry", "--input", "request.json", "--api-key", "asn_v1_test"], prohibitedKey.value, environment), 2);
  assert.deepEqual(prohibitedKey.out, []); assert.deepEqual(prohibitedKey.err, ["AUTHORING_SAVE_REVISION_FAILED code=INVALID_ARGUMENTS\n"]);
});
