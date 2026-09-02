import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalAuthoringCredentialAuthority } from "../../../apps/authoring-api/index.js";

function authority(root: string) { return createLocalAuthoringCredentialAuthority({ homeDirectory: root, xdgConfigHome: path.join(root, "config") }); }

test("credential lifecycle only permits the four contract transitions", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root);
    const provisioned = await credentials.transition("provision"); assert.deepEqual(provisioned, { ok: true, value: { generation: 1, status: "active" } });
    const first = await credentials.openAdmission(); assert.equal(first.ok, true); if (!first.ok) return;
    const recordPath = path.join(root, "config", "ai-study-note", "local-authoring-v1.json"); const firstKey = JSON.parse(readFileSync(recordPath, "utf8")).apiKey as string;
    assert.equal(first.value.verifyBearer(firstKey), true); first.value.dispose();
    const rotated = await credentials.transition("rotate"); assert.deepEqual(rotated, { ok: true, value: { generation: 2, status: "active" } });
    const second = await credentials.openAdmission(); assert.equal(second.ok, true); if (!second.ok) return;
    assert.equal(second.value.verifyBearer(firstKey), false); second.value.dispose();
    assert.deepEqual(await credentials.transition("revoke"), { ok: true, value: { generation: 3, status: "revoked" } });
    const revoked = await credentials.openAdmission(); assert.equal(revoked.ok, false); if (!revoked.ok) assert.equal(revoked.error.code, "CREDENTIAL_REVOKED");
    assert.deepEqual(await credentials.transition("reprovision"), { ok: true, value: { generation: 4, status: "active" } });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsafe credential mode fails closed without disclosing the key", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root); assert.equal((await credentials.transition("provision")).ok, true);
    const recordPath = path.join(root, "config", "ai-study-note", "local-authoring-v1.json"); const key = JSON.parse(readFileSync(recordPath, "utf8")).apiKey as string;
    chmodSync(recordPath, 0o644);
    const opened = await credentials.openAdmission(); assert.equal(opened.ok, false); if (!opened.ok) assert.equal(opened.error.code, "CREDENTIAL_STORE_UNSAFE");
    assert.equal(JSON.stringify(opened).includes(key), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
