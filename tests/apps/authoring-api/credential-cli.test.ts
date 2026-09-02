import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCredentialCli } from "../../../apps/authoring-api/credential-cli.js";

function output() { const stdout: string[] = []; const stderr: string[] = []; return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } }; }

test("credential CLI has exact success and invalid argument output", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-cli-"));
  try {
    const captured = output();
    assert.equal(await runCredentialCli(["provision"], captured.io, { homeDirectory: root, xdgConfigHome: path.join(root, "config") }), 0);
    assert.deepEqual(captured.stdout, ["AUTHORING_CREDENTIAL_OK action=provision generation=1 status=active\n"]); assert.deepEqual(captured.stderr, []);
    const invalid = output(); assert.equal(await runCredentialCli(["provision", "extra"], invalid.io, { homeDirectory: root }), 2);
    assert.deepEqual(invalid.stderr, ["AUTHORING_CREDENTIAL_FAILED code=INVALID_ARGUMENTS\n"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
