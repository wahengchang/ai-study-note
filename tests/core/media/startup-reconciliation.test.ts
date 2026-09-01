import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
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

test("startup keeps two same-bytes pending intents convergent regardless of processing order", () => {
  const f = fixture();
  try {
    const unpaired = f.intent("a-unpaired", "version-a", "shared"), paired = f.intent("b-paired", "version-b", "shared");
    stage(f, unpaired); const pairedStage = stage(f, paired);
    assert.equal(f.objectStore.promote(pairedStage, paired).ok, true);
    assert.equal(f.persistence.createMediaImportIntent(unpaired).ok, true);
    assert.equal(f.persistence.createMediaImportIntent(paired).ok, true);
    const started = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore });
    assert.equal(started.ok, true, started.ok ? "" : started.error.subjectIds.join(","));
    assert.equal(f.persistence.getReadyAssetVersion(unpaired.identity).ok, true);
    assert.equal(f.persistence.getReadyAssetVersion(paired.identity).ok, true);
    const storage = f.objectStore.readStartupSnapshot(); assert.equal(storage.ok, true); if (!storage.ok) return;
    assert.equal(storage.value.stages.length, 0); assert.equal(storage.value.finals.length, 1);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("startup demotes a ready version with lost bytes to missing and RestoreAsset recovers it", () => {
  const f = fixture();
  try {
    const first = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }); assert.equal(first.ok, true); if (!first.ok) return;
    const bytes = new TextEncoder().encode("recoverable"), metadata = { mime: "text/plain" };
    const identity = { assetId: "asset", assetVersionId: "lost" };
    assert.equal(first.value.importLocal({ importId: "lost-import", ...identity, bytes, metadata }).ok, true);
    const objects = path.join(f.directory, "objects", "objects");
    for (const entry of readdirSync(objects)) unlinkSync(path.join(objects, entry));

    // 可復原的媒體狀態不得讓 CMS 無法啟動：ready 版本降級為 missing，並保留 RestoreAsset remediation。
    const restarted = startDataMedia({ persistence: f.persistence, objectStore: f.objectStore });
    assert.equal(restarted.ok, true, restarted.ok ? "" : restarted.error.subjectIds.join(",")); if (!restarted.ok) return;
    const demoted = f.persistence.getAssetVersion(identity); assert.equal(demoted.ok, true); if (!demoted.ok) return;
    assert.equal(demoted.value.availability, "missing");
    const report = restarted.value.inspectRestoreAvailability([identity]); assert.equal(report.ok, true); if (!report.ok) return;
    assert.equal(report.value.status, "blocked");
    if (report.value.status === "blocked") assert.equal(report.value.commands[0]?.recovery, "local-bytes-and-metadata");
    const restored = restarted.value.restoreAsset({ ...identity, recovery: { bytes, metadata } });
    assert.equal(restored.ok, true, restored.ok ? "" : restored.error.code); if (!restored.ok) return;
    assert.equal(restored.value.availability, "ready");
    assert.equal(startDataMedia({ persistence: f.persistence, objectStore: f.objectStore }).ok, true);
  } finally { f.persistence.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
