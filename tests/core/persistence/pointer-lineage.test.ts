import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("pointers, producing lineage, and immutable revision references commit atomically", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pointer-lineage-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const store = opened.value;
    const schema = canonicalJsonBytes({ type: "object" }); const content = canonicalJsonBytes({ title: "draft" }); const metadata = canonicalJsonBytes({ mime: "text/plain" });
    assert.equal(schema.ok && content.ok && metadata.ok, true); if (!schema.ok || !content.ok || !metadata.ok) return;
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    assert.equal(store.createMediaImportIntent({ importId: "import-1", identity: { assetId: "asset-1", assetVersionId: "version-1" }, objectDigest: sha256Digest(new TextEncoder().encode("object")), byteLength: 6, metadataBytes: metadata.value, metadataDigest: sha256Digest(metadata.value) }).ok, true);
    assert.equal(store.commitReadyAssetVersion({ importId: "import-1", identity: { assetId: "asset-1", assetVersionId: "version-1" }, objectDigest: sha256Digest(new TextEncoder().encode("object")), byteLength: 6, metadataBytes: metadata.value, metadataDigest: sha256Digest(metadata.value) }).ok, true);
    const created = store.createRevisionWithReferences({ revision: { identity: { entryId: "entry-1", revisionId: "revision-1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: "save-1", operationKind: "SaveRevision" } }, assetVersions: [{ assetId: "asset-1", assetVersionId: "version-1" }] });
    assert.equal(created.ok, true);
    assert.equal(store.setEntryPointers({ entryId: "entry-1", currentRevisionId: "revision-1", lineage: { revisionId: "revision-1", operationId: "save-1", operationKind: "SaveRevision" } }).ok, true);
    const pointers = store.getEntryPointers("entry-1"); const references = store.getRevisionReferences({ entryId: "entry-1", revisionId: "revision-1" }); const lineage = store.getEntryPointerLineage({ entryId: "entry-1", revisionId: "revision-1", operationId: "save-1" });
    assert.equal(pointers.ok && pointers.value.currentRevisionId === "revision-1", true);
    assert.equal(references.ok && references.value.length === 1, true);
    assert.equal(lineage.ok && lineage.value.lineageIdentity.operationId === "save-1", true);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
