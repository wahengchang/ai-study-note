import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia, type DataMediaPersistence } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("local import persists a ready version and resolves only verified final bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "local-media-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objectStore = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objectStore.ok, true); if (!objectStore.ok) return;
    const started = startDataMedia({ persistence: opened.value, objectStore: objectStore.value }); assert.equal(started.ok, true); if (!started.ok) return;
    const media = started.value;
    const imported = media.importLocal({ importId: "import-1", assetId: "asset-1", assetVersionId: "version-1", bytes: new TextEncoder().encode("media bytes"), metadata: { mime: "text/plain" } });
    assert.equal(imported.ok, true); if (!imported.ok) return;
    assert.equal(imported.value.availability, "ready");
    const resolved = media.getReadyAssetVersion({ assetId: "asset-1", assetVersionId: "version-1" });
    assert.equal(resolved.ok, true);
    const catalog = media.listAssets();
    assert.equal(catalog.ok, true); if (!catalog.ok) return;
    assert.deepEqual(catalog.value, [{ contract: "media-asset/v1", assetId: "asset-1", versions: [{ contract: "media-asset-version/v1", identity: { assetId: "asset-1", assetVersionId: "version-1" }, evidence: { objectDigest: imported.value.objectDigest, byteLength: 11, metadataDigest: imported.value.metadataDigest }, availability: "ready" }] }]);
    assert.equal(JSON.stringify(catalog.value).includes("mime"), false);
    const detail = media.getAssetDetail("asset-1");
    assert.equal(detail.ok, true); if (!detail.ok) return;
    assert.deepEqual(detail.value.references, { current: [], published: [] });
    const drifting = Object.create(opened.value) as DataMediaPersistence;
    let canonicalReads = 0;
    drifting.canonicalState = () => {
      const state = opened.value.canonicalState();
      if (!state.ok || canonicalReads++ === 0) return state;
      return { ok: true, value: { ...state.value, digest: `sha256:${"0".repeat(64)}` } };
    };
    const drifted = startDataMedia({ persistence: drifting, objectStore: objectStore.value });
    assert.equal(drifted.ok, true); if (!drifted.ok) return;
    const stale = drifted.value.listAssets();
    assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, "MEDIA_READ_STATE_STALE");
    const pendingBytes = new TextEncoder().encode("pending bytes"), pendingMetadata = canonicalJsonBytes({ mime: "text/plain" });
    assert.equal(pendingMetadata.ok, true); if (!pendingMetadata.ok) return;
    assert.equal(opened.value.createMediaImportIntent({ importId: "pending-import", identity: { assetId: "asset-2", assetVersionId: "version-1" }, objectDigest: sha256Digest(pendingBytes), byteLength: pendingBytes.byteLength, metadataBytes: pendingMetadata.value, metadataDigest: sha256Digest(pendingMetadata.value) }).ok, true);
    const beforeConflict = opened.value.canonicalState(); assert.equal(beforeConflict.ok, true); if (!beforeConflict.ok) return;
    const conflicted = media.importLocal({ importId: "pending-import", assetId: "asset-2", assetVersionId: "version-1", bytes: pendingBytes, metadata: { mime: "text/plain" } });
    assert.equal(conflicted.ok, false); if (!conflicted.ok) assert.equal(conflicted.error.code, "MEDIA_IMPORT_CONFLICT");
    const afterConflict = opened.value.canonicalState(); assert.equal(afterConflict.ok, true); if (!afterConflict.ok) return;
    assert.equal(afterConflict.value.digest, beforeConflict.value.digest);
    assert.equal(opened.value.createMediaImportIntent({ importId: "import-1", identity: { assetId: "asset-4", assetVersionId: "version-1" }, objectDigest: sha256Digest(pendingBytes), byteLength: pendingBytes.byteLength, metadataBytes: pendingMetadata.value, metadataDigest: sha256Digest(pendingMetadata.value) }).ok, true);
    const beforePrecedence = opened.value.canonicalState(); assert.equal(beforePrecedence.ok, true); if (!beforePrecedence.ok) return;
    const pendingOverReady = media.importLocal({ importId: "import-1", assetId: "asset-1", assetVersionId: "version-1", bytes: new TextEncoder().encode("media bytes"), metadata: { mime: "text/plain" } });
    assert.equal(pendingOverReady.ok, false); if (!pendingOverReady.ok) assert.equal(pendingOverReady.error.code, "MEDIA_IMPORT_CONFLICT");
    const afterPrecedence = opened.value.canonicalState(); assert.equal(afterPrecedence.ok, true); if (!afterPrecedence.ok) return;
    assert.equal(afterPrecedence.value.digest, beforePrecedence.value.digest);
    const stagedBytes = new TextEncoder().encode("staged collision"), stagedEvidence = { objectDigest: sha256Digest(stagedBytes), byteLength: stagedBytes.byteLength };
    assert.equal(objectStore.value.stage({ importId: "staged-collision", bytes: stagedBytes, evidence: stagedEvidence }).ok, true);
    const beforeStageCollision = opened.value.canonicalState(); assert.equal(beforeStageCollision.ok, true); if (!beforeStageCollision.ok) return;
    const stageCollision = media.importLocal({ importId: "staged-collision", assetId: "asset-3", assetVersionId: "version-1", bytes: stagedBytes, metadata: { mime: "text/plain" } });
    assert.equal(stageCollision.ok, false); if (!stageCollision.ok) assert.equal(stageCollision.error.code, "MEDIA_IMPORT_CONFLICT");
    const afterStageCollision = opened.value.canonicalState(); assert.equal(afterStageCollision.ok, true); if (!afterStageCollision.ok) return;
    assert.equal(afterStageCollision.value.digest, beforeStageCollision.value.digest);
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
