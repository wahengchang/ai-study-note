import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("published media selection follows only the published pointer and fails without a complete selection", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "published-selection-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objects.ok, true); if (!objects.ok) return;
    const media = createDataMedia({ persistence: opened.value, objectStore: objects.value });
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new TextEncoder().encode("bytes"), metadata: { mime: "text/plain" } }).ok, true);
    const schemaBytes = canonicalJsonBytes({ type: "object" }); assert.equal(schemaBytes.ok, true); if (!schemaBytes.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
    const contentBytes = canonicalJsonBytes({ title: "published" }); assert.equal(contentBytes.ok, true); if (!contentBytes.ok) return;
    assert.equal(opened.value.createRevisionWithReferences({ revision: { identity: { entryId: "entry", revisionId: "published-1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: contentBytes.value, contentDigest: sha256Digest(contentBytes.value), lineage: { operationId: "save-1", operationKind: "SaveRevision" } }, assetVersions: [{ assetId: "asset", assetVersionId: "v1" }] }).ok, true);
    assert.equal(opened.value.setEntryPointers({ entryId: "entry", currentRevisionId: "published-1", publishedRevisionId: "published-1", lineage: { revisionId: "published-1", operationId: "publish-1", operationKind: "PublishRevision" } }).ok, true);
    const selected = media.resolvePublishedSelection("entry"); assert.equal(selected.ok, true); if (!selected.ok) return;
    assert.equal(selected.value.revisionId, "published-1"); assert.deepEqual(selected.value.assets.map((asset) => asset.identity), [{ assetId: "asset", assetVersionId: "v1" }]);
    const before = opened.value.canonicalState(); assert.equal(before.ok, true); if (!before.ok) return;
    const missing = media.resolvePublishedSelection("missing"); assert.equal(missing.ok, false); if (!missing.ok) assert.equal(missing.error.code, "MEDIA_VERSION_UNAVAILABLE");
    const after = opened.value.canonicalState(); assert.equal(after.ok, true); if (!after.ok) return;
    assert.equal(after.value.digest, before.value.digest);
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
