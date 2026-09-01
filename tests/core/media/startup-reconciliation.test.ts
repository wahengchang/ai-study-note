import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia, type MediaImportIntent } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "startup-reconciliation-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const persistence = openPersistence({ databasePath }); assert.equal(persistence.ok, true); if (!persistence.ok) throw new Error("openPersistence");
  const objectStore = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objectStore.ok, true); if (!objectStore.ok) throw new Error("createLocalMediaObjectStore");
  const intent = (importId: string, assetVersionId: string, body = importId): MediaImportIntent => {
    const metadata = canonicalJsonBytes({ mime: "text/plain" }); assert.equal(metadata.ok, true); if (!metadata.ok) throw new Error("canonicalJsonBytes");
    const bytes = new TextEncoder().encode(body);
    return { importId, identity: { assetId: "asset", assetVersionId }, objectDigest: sha256Digest(bytes), byteLength: bytes.byteLength, metadataBytes: metadata.value, metadataDigest: sha256Digest(metadata.value) };
  };
  return { directory, persistence: persistence.value, objectStore: objectStore.value, intent };
}
function stage(f: ReturnType<typeof fixture>, value: MediaImportIntent) { const bytes = new TextEncoder().encode(value.importId === "stage-only" ? "stage-only" : value.objectDigest === sha256Digest(new TextEncoder().encode("shared")) ? "shared" : value.importId); const staged = f.objectStore.stage({ importId: value.importId, bytes, evidence: value }); assert.equal(staged.ok, true); if (!staged.ok) throw new Error("stage failed"); return staged.value; }

for (const mode of ["stage-only", "final-only", "crash-pair", "absent"] as const) test(`startup reconciles ${mode} durable import evidence`, () => {
  const f = fixture();
  try {
    const value = f.intent(mode, `version-${mode}`);
    if (mode !== "absent") {
      const staged = stage(f, value);
      if (mode === "final-only") { const final = f.objectStore.promote(staged, value); assert.equal(final.ok, true); if (!final.ok) return; assert.equal(f.objectStore.releaseStage(staged, final.value).ok, true); }
      else if (mode === "crash-pair") assert.equal(f.objectStore.promote(staged, value).ok, true);
    }
    assert.equal(f.persistence.createMediaImportIntent(value).ok, true);
    const started = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }); assert.equal(started.ok, true, started.ok ? "" : started.error.code);
    const pending = f.persistence.readMediaStartupSnapshot(); assert.equal(pending.ok, true); if (!pending.ok) return;
    assert.equal(pending.value.pendingIntents.length, 0);
    const version = f.persistence.getReadyAssetVersion(value.identity);
    if (mode === "absent") assert.equal(version.ok, false); else assert.equal(version.ok, true);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("startup removes unprotected orphan and completed retry creates no redundant intent", () => {
  const f = fixture();
  try {
    const orphan = f.intent("orphan", "orphan"); stage(f, orphan);
    const started = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }); assert.equal(started.ok, true); if (!started.ok) return;
    const snapshot = f.objectStore.readStartupSnapshot(); assert.equal(snapshot.ok, true); if (!snapshot.ok) return;
    assert.equal(snapshot.value.stages.length, 0);
    const imported = started.value.importLocal({ importId: "ready", assetId: "asset", assetVersionId: "ready", bytes: new TextEncoder().encode("ready"), metadata: { mime: "text/plain" } }); assert.equal(imported.ok, true); if (!imported.ok) return;
    const retry = started.value.importLocal({ importId: "ready-retry", assetId: "asset", assetVersionId: "ready", bytes: new TextEncoder().encode("ready"), metadata: { mime: "text/plain" } }); assert.equal(retry.ok, true);
    const state = f.persistence.readMediaStartupSnapshot(); assert.equal(state.ok, true); if (!state.ok) return;
    assert.equal(state.value.pendingIntents.length, 0);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("completed startup is digest-idempotent after reopening", () => {
  const f = fixture();
  try {
    const value = f.intent("stage-only", "stable"); stage(f, value); assert.equal(f.persistence.createMediaImportIntent(value).ok, true);
    assert.equal(startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }).ok, true);
    const state = f.persistence.canonicalState(); const storage = f.objectStore.readStartupSnapshot(); assert.equal(state.ok, true); assert.equal(storage.ok, true); if (!state.ok || !storage.ok) return;
    const again = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }); assert.equal(again.ok, true);
    const nextState = f.persistence.canonicalState(); const nextStorage = f.objectStore.readStartupSnapshot(); assert.equal(nextState.ok, true); assert.equal(nextStorage.ok, true); if (!nextState.ok || !nextStorage.ok) return;
    assert.equal(nextState.value.digest, state.value.digest); assert.equal(nextStorage.value.digest, storage.value.digest);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("mismatched stage retains durable evidence without returning an instance", () => {
  const f = fixture();
  try {
    const mismatch = f.intent("mismatch", "mismatch", "expected");
    const badBytes = new TextEncoder().encode("different");
    const badStage = f.objectStore.stage({ importId: mismatch.importId, bytes: badBytes, evidence: { objectDigest: sha256Digest(badBytes), byteLength: badBytes.byteLength } });
    assert.equal(badStage.ok, true);
    assert.equal(f.persistence.createMediaImportIntent(mismatch).ok, true);
    const rejected = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore });
    assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.error.code, "MEDIA_RECONCILIATION_FAILURE");
    assert.equal(f.persistence.getMediaImportIntent(mismatch.importId).ok, true);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("one-shot promotion fault preserves evidence and retries successfully", () => {
  const f = fixture();
  try {
    const retry = f.intent("retry", "retry"); stage(f, retry); assert.equal(f.persistence.createMediaImportIntent(retry).ok, true);
    let failOnce = true;
    const faulting = {
      ...f.objectStore,
      promote(stageToken: Parameters<typeof f.objectStore.promote>[0], evidence: Parameters<typeof f.objectStore.promote>[1]) {
        if (failOnce) {
          failOnce = false;
          return { ok: false as const, error: { code: "MEDIA_PROMOTION_FAILURE" as const, owner: "DataMedia" as const, subjectIds: [], remediation: { kind: "message" as const, message: "" } } };
        }
        return f.objectStore.promote(stageToken, evidence);
      },
    };
    const failed = startDataMedia({ persistence: f.persistence, objectStore: faulting });
    assert.equal(failed.ok, false);
    assert.equal(f.persistence.getMediaImportIntent(retry.importId).ok, true);
    const recovered = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore });
    assert.equal(recovered.ok, true);
    assert.equal(f.persistence.getReadyAssetVersion(retry.identity).ok, true);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
