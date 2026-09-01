import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { startDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import type { MediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";

function start(input: Parameters<typeof startDataMedia>[0]) {
  const started = startDataMedia(input);
  assert.equal(started.ok, true, started.ok ? "" : started.error.code);
  if (!started.ok) throw new Error("startDataMedia");
  return started.value;
}


function openStore(directory: string) {
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence unavailable");
  const objectsRoot = path.join(directory, "media");
  const objects = createLocalMediaObjectStore({ objectsRoot });
  assert.equal(objects.ok, true);
  if (!objects.ok) throw new Error("object store unavailable");
  return { store: opened.value, objectStore: objects.value, objectsRoot };
}

function publish(store: PersistenceStore, entryId: string, revisionId: string, assetVersionId: string): void {
  const schemaBytes = canonicalJsonBytes({ type: "object" });
  assert.equal(schemaBytes.ok, true);
  if (!schemaBytes.ok) return;
  store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) });
  const contentBytes = canonicalJsonBytes({ title: revisionId });
  assert.equal(contentBytes.ok, true);
  if (!contentBytes.ok) return;
  assert.equal(store.createRevisionWithReferences({ revision: { identity: { entryId, revisionId }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: contentBytes.value, contentDigest: sha256Digest(contentBytes.value), lineage: { operationId: `save-${revisionId}`, operationKind: "SaveRevision" } }, assetVersions: [{ assetId: "asset", assetVersionId }] }).ok, true);
  assert.equal(store.setEntryPointers({ entryId, currentRevisionId: revisionId, publishedRevisionId: revisionId, lineage: { revisionId, operationId: `publish-${revisionId}`, operationKind: "PublishRevision" } }).ok, true);
}

function discardObjects(objectsRoot: string): void {
  const objects = path.join(objectsRoot, "objects");
  for (const entry of readdirSync(objects)) unlinkSync(path.join(objects, entry));
}

test("ArchiveAsset changes only availability and RestoreAsset re-enables verified bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "archive-restore-"));
  try {
    const { store, objectStore } = openStore(directory);
    const media = start({ persistence: store, objectStore });
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1, 2, 3]), metadata: { type: "image" } }).ok, true);
    const imported = store.getAssetVersion({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;

    const archived = media.archiveAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    assert.equal(archived.value.availability, "archived");
    // immutable identity、checksum、byte length 與 metadata 不得因 archive 而改變。
    assert.deepEqual(archived.value.identity, imported.value.identity);
    assert.equal(archived.value.objectDigest, imported.value.objectDigest);
    assert.equal(archived.value.byteLength, imported.value.byteLength);
    assert.equal(archived.value.metadataDigest, imported.value.metadataDigest);
    assert.equal(media.getReadyAssetVersion({ assetId: "asset", assetVersionId: "v1" }).ok, false);

    const restored = media.restoreAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.value.availability, "ready");
    assert.equal(restored.value.objectDigest, imported.value.objectDigest);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ArchiveAsset refuses a version an active published pointer still references and leaves canonical state unchanged", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "archive-published-"));
  try {
    const { store, objectStore } = openStore(directory);
    const media = start({ persistence: store, objectStore });
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1, 2, 3]), metadata: { type: "image" } }).ok, true);
    publish(store, "entry", "published-1", "v1");

    const before = store.canonicalState();
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const blocked = media.archiveAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.error.code, "MEDIA_ARCHIVE_BLOCKED_PUBLISHED");
    assert.deepEqual(blocked.error.archiveImpact, {
      contract: "archive-asset-impact/v1",
      assetVersion: { assetId: "asset", assetVersionId: "v1" },
      publishedReferences: [{ entryId: "entry", revisionId: "published-1", assetVersion: { assetId: "asset", assetVersionId: "v1" } }],
    });
    const after = store.canonicalState();
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.value.digest, before.value.digest);
    assert.equal(media.getReadyAssetVersion({ assetId: "asset", assetVersionId: "v1" }).ok, true);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RestoreAsset for physically missing bytes only accepts exact recovery and stays retryable", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-recovery-"));
  try {
    const { store, objectStore, objectsRoot } = openStore(directory);
    const media = start({ persistence: store, objectStore });
    const bytes = new Uint8Array([7, 8, 9]);
    const metadata = { type: "image" };
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes, metadata }).ok, true);
    assert.equal(media.archiveAsset({ assetId: "asset", assetVersionId: "v1" }).ok, true);
    discardObjects(objectsRoot);

    const withoutRecovery = media.restoreAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(withoutRecovery.ok, false);
    if (!withoutRecovery.ok) assert.equal(withoutRecovery.error.code, "MEDIA_RESTORE_REQUIRED");
    const wrongBytes = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes: new Uint8Array([7, 8, 10]), metadata } });
    assert.equal(wrongBytes.ok, false);
    if (!wrongBytes.ok) assert.equal(wrongBytes.error.code, "MEDIA_RESTORE_MISMATCH");
    const wrongMetadata = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata: { type: "video" } } });
    assert.equal(wrongMetadata.ok, false);
    if (!wrongMetadata.ok) assert.equal(wrongMetadata.error.code, "MEDIA_RESTORE_MISMATCH");
    assert.equal(media.getReadyAssetVersion({ assetId: "asset", assetVersionId: "v1" }).ok, false);

    const recovered = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata } });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.value.availability, "ready");
    // 同一份 recovery 重送必須是可重試的成功，不得因 object 已恢復健康而回報 mismatch。
    const retried = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata } });
    assert.equal(retried.ok, true, retried.ok ? "" : retried.error.code);
    assert.deepEqual(readdirSync(path.join(objectsRoot, "staging")), []);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a host fault while releasing the restored stage leaves the version unavailable", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-fault-"));
  try {
    const { store, objectStore, objectsRoot } = openStore(directory);
    let refuseRelease = false;
    const faulted: MediaObjectStore = {
      ...objectStore,
      releaseStage: (stage, final) => refuseRelease
        ? { ok: false, error: { code: "MEDIA_FINAL_VERIFICATION_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "release refused" } } }
        : objectStore.releaseStage(stage, final),
    };
    const media = start({ persistence: store, objectStore: faulted });
    const bytes = new Uint8Array([1, 2, 3]);
    const metadata = { type: "image" };
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes, metadata }).ok, true);
    assert.equal(media.archiveAsset({ assetId: "asset", assetVersionId: "v1" }).ok, true);
    discardObjects(objectsRoot);

    refuseRelease = true;
    const faultedRestore = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata } });
    assert.equal(faultedRestore.ok, false);
    if (!faultedRestore.ok) assert.equal(faultedRestore.error.code, "MEDIA_RESTORE_FAILURE");
    // 回報失敗時 availability 不得已經翻成 ready。
    const record = store.getAssetVersion({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(record.ok, true);
    if (record.ok) assert.notEqual(record.value.availability, "ready");
    assert.equal(media.getReadyAssetVersion({ assetId: "asset", assetVersionId: "v1" }).ok, false);

    refuseRelease = false;
    const recovered = media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata } });
    assert.equal(recovered.ok, true, recovered.ok ? "" : recovered.error.code);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("inspectRestoreAvailability reports ordered per-version RestoreAsset descriptors", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-availability-"));
  try {
    const { store, objectStore, objectsRoot } = openStore(directory);
    const media = start({ persistence: store, objectStore });
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1]), metadata: { n: 1 } }).ok, true);
    assert.equal(media.importLocal({ importId: "import-2", assetId: "asset", assetVersionId: "v2", bytes: new Uint8Array([2]), metadata: { n: 2 } }).ok, true);
    assert.equal(media.archiveAsset({ assetId: "asset", assetVersionId: "v2" }).ok, true);

    const ready = media.inspectRestoreAvailability([{ assetId: "asset", assetVersionId: "v1" }]);
    assert.equal(ready.ok, true);
    if (ready.ok) assert.equal(ready.value.status, "ready");

    const blocked = media.inspectRestoreAvailability([{ assetId: "asset", assetVersionId: "v2" }, { assetId: "asset", assetVersionId: "v1" }]);
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.equal(blocked.value.status, "blocked");
    if (blocked.value.status !== "blocked") return;
    assert.deepEqual(blocked.value.commands, [{ contract: "restore-asset-command/v1", command: "RestoreAsset", assetVersion: { assetId: "asset", assetVersionId: "v2" }, recovery: "none" }]);

    discardObjects(objectsRoot);
    const missing = media.inspectRestoreAvailability([{ assetId: "asset", assetVersionId: "v2" }, { assetId: "asset", assetVersionId: "v1" }]);
    assert.equal(missing.ok, true);
    if (!missing.ok || missing.value.status !== "blocked") return;
    // descriptors 依 assetId、assetVersionId 的 code-unit 順序輸出，與傳入順序無關。
    assert.deepEqual(missing.value.commands.map((item) => item.assetVersion.assetVersionId), ["v1", "v2"]);
    assert.deepEqual(missing.value.commands.map((item) => item.recovery), ["local-bytes-and-metadata", "local-bytes-and-metadata"]);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
