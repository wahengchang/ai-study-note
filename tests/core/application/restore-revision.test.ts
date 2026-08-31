import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import type { DomainApplication } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import type { DataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

type Harness = Readonly<{ store: PersistenceStore; media: DataMedia; application: DomainApplication; objectsRoot: string }>;

async function harness(directory: string): Promise<Harness> {
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence unavailable");
  const objectsRoot = path.join(directory, "media");
  const objects = createLocalMediaObjectStore({ objectsRoot });
  assert.equal(objects.ok, true);
  if (!objects.ok) throw new Error("object store unavailable");
  const installedRoot = path.join(directory, "installed");
  mkdirSync(installedRoot, { recursive: true });
  const plugins = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) });
  assert.equal(plugins.ok, true);
  if (!plugins.ok) throw new Error("plugin host unavailable");
  const schemaBytes = canonicalJsonBytes({ type: "object" });
  assert.equal(schemaBytes.ok, true);
  if (!schemaBytes.ok) throw new Error("schema unavailable");
  assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
  const media = createDataMedia({ persistence: opened.value, objectStore: objects.value });
  const application = createDomainApplication({ persistence: opened.value, siteDefinition: createSiteDefinition({ persistence: opened.value }), dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: plugins.value });
  return { store: opened.value, media, application, objectsRoot };
}

test("RestoreRevision creates a new current immutable revision and retains the published pin", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-revision-"));
  try {
    const { store, media, application } = await harness(directory);
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1, 2, 3]), metadata: { type: "image" } }).ok, true);
    const saved = await application.saveRevision({ entryId: "entry", revisionId: "draft", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "old" }, route: "/old", assetVersions: [{ assetId: "asset", assetVersionId: "v1" }] });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error.code);
    if (!saved.ok) return;
    assert.equal((await application.publishRevision({ entryId: "entry", expectedCurrentRevisionId: "draft", operationId: "publish-1" })).ok, true);
    assert.equal((await application.saveRevision({ entryId: "entry", revisionId: "draft-2", operationId: "save-2", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "new" }, route: "/old", assetVersions: [] })).ok, true);

    const restored = await application.restoreRevision({ entryId: "entry", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore-1" });
    assert.equal(restored.ok, true, restored.ok ? "" : restored.error.code);
    if (!restored.ok) return;
    assert.equal(restored.value.revision.restoredFromRevisionId, "draft");
    // 還原的 content 與 references 必須逐位元對應來源 revision。
    assert.equal(restored.value.revision.contentDigest, saved.value.revision.contentDigest);
    assert.deepEqual(restored.value.references.map((reference) => reference.assetVersion), [{ assetId: "asset", assetVersionId: "v1" }]);
    assert.equal(restored.value.currentPointer.currentRevisionId, "restored");
    // published pin 與 published claim 不因 RestoreRevision 移動。
    assert.equal(restored.value.currentPointer.publishedRevisionId, "draft");
    assert.equal(restored.value.currentClaim.sourceRevisionId, "restored");
    const published = createSiteDefinition({ persistence: store }).snapshot("published");
    assert.equal(published.ok, true);
    if (published.ok) assert.deepEqual(published.value.claims, [{ graph: "published", normalizedRoute: "/old", owner: "entry", sourceRevisionId: "draft" }]);
    // 來源 revision 維持 immutable。
    const source = store.getRevision({ entryId: "entry", revisionId: "draft" });
    assert.equal(source.ok, true);
    if (source.ok) assert.equal(source.value.contentDigest, saved.value.revision.contentDigest);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RestoreRevision refuses unavailable media before any mutation and succeeds once RestoreAsset completes", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-blocked-"));
  try {
    const { store, media, application, objectsRoot } = await harness(directory);
    const bytes = new Uint8Array([4, 5, 6]);
    const metadata = { type: "image" };
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes, metadata }).ok, true);
    assert.equal(media.importLocal({ importId: "import-2", assetId: "asset", assetVersionId: "v2", bytes: new Uint8Array([9]), metadata: { type: "other" } }).ok, true);
    assert.equal((await application.saveRevision({ entryId: "entry", revisionId: "draft", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "old" }, route: "/old", assetVersions: [{ assetId: "asset", assetVersionId: "v1" }] })).ok, true);
    assert.equal((await application.saveRevision({ entryId: "entry", revisionId: "draft-2", operationId: "save-2", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "new" }, route: "/old", assetVersions: [{ assetId: "asset", assetVersionId: "v2" }] })).ok, true);
    assert.equal(media.archiveAsset({ assetId: "asset", assetVersionId: "v1" }).ok, true);
    // v1 的 physical bytes 也遺失，remediation 必須要求本機 recovery bytes 而非單純解除封存。
    unlinkSync(path.join(objectsRoot, "objects", sha256Digest(bytes).slice(7)));

    const before = store.canonicalState();
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const blocked = await application.restoreRevision({ entryId: "entry", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore-1" });
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.error.code, "BLOCKED_ARCHIVED_MEDIA_RESTORE");
    assert.equal(blocked.error.owner, "DataMedia");
    assert.deepEqual(blocked.error.restoreCommands, [{ contract: "restore-asset-command/v1", command: "RestoreAsset", assetVersion: { assetId: "asset", assetVersionId: "v1" }, recovery: "local-bytes-and-metadata" }]);
    assert.deepEqual(blocked.error.subjectIds, ["asset", "v1"]);
    // remediation descriptor 必須是可序列化、不含 authority 的純資料。
    assert.equal(typeof JSON.stringify(blocked.error.restoreCommands), "string");
    const after = store.canonicalState();
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.value.digest, before.value.digest);
    assert.equal(store.getRevision({ entryId: "entry", revisionId: "restored" }).ok, false);

    assert.equal(media.restoreAsset({ assetId: "asset", assetVersionId: "v1", recovery: { bytes, metadata } }).ok, true);
    const restored = await application.restoreRevision({ entryId: "entry", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore-1" });
    assert.equal(restored.ok, true, restored.ok ? "" : restored.error.code);
    if (restored.ok) assert.equal(restored.value.currentPointer.currentRevisionId, "restored");
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RestoreRevision rejects malformed requests and unknown source revisions without touching canonical state", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-invalid-"));
  try {
    const { store, application } = await harness(directory);
    assert.equal((await application.saveRevision({ entryId: "entry", revisionId: "draft", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "old" }, route: "/old", assetVersions: [] })).ok, true);
    const before = store.canonicalState();
    assert.equal(before.ok, true);
    if (!before.ok) return;

    for (const request of [
      { entryId: "entry", sourceRevisionId: "draft", revisionId: "draft", operationId: "restore-1" },
      { entryId: "", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore-1" },
      { entryId: "entry", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore-1", extra: true },
    ]) {
      const rejected = await application.restoreRevision(request as never);
      assert.equal(rejected.ok, false);
      if (!rejected.ok) assert.equal(rejected.error.code, "INVALID_RESTORE_REVISION_REQUEST");
    }
    const unknown = await application.restoreRevision({ entryId: "entry", sourceRevisionId: "absent", revisionId: "restored", operationId: "restore-1" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.error.code, "INVALID_RESTORE_REVISION_REQUEST");
      assert.deepEqual(unknown.error.subjectIds, ["entry", "absent"]);
    }
    const after = store.canonicalState();
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.value.digest, before.value.digest);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
