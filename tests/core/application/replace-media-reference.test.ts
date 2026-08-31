import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

test("ReplaceMediaReference copies the complete set, moves only current, and preserves published history", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "replace-media-reference-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objects.ok, true); if (!objects.ok) return;
    const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    const host = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) }); assert.equal(host.ok, true); if (!host.ok) return;
    const schemaBytes = canonicalJsonBytes({ type: "object" }); assert.equal(schemaBytes.ok, true); if (!schemaBytes.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
    const media = createDataMedia({ persistence: opened.value, objectStore: objects.value });
    for (const [assetId, assetVersionId, importId] of [["asset-a", "v1", "import-a"], ["asset-b", "v1", "import-b"], ["asset-c", "v1", "import-c"]] as const) assert.equal(media.importLocal({ assetId, assetVersionId, importId, bytes: new TextEncoder().encode(importId), metadata: { mime: "text/plain" } }).ok, true);
    const site = createSiteDefinition({ persistence: opened.value });
    const app = createDomainApplication({ persistence: opened.value, siteDefinition: site, dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: host.value });
    const saved = await app.saveRevision({ entryId: "entry", revisionId: "draft-1", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "original" }, route: "/guide", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }, { assetId: "asset-b", assetVersionId: "v1" }] });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error.code); if (!saved.ok) return;
    assert.equal((await app.publishRevision({ entryId: "entry", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" })).ok, true);
    const oldReferences = opened.value.getRevisionReferences({ entryId: "entry", revisionId: "draft-1" }); assert.equal(oldReferences.ok, true); if (!oldReferences.ok) return;
    const oldRevision = opened.value.getRevision({ entryId: "entry", revisionId: "draft-1" }); assert.equal(oldRevision.ok, true); if (!oldRevision.ok) return;
    const replaced = await app.replaceMediaReference({ entryId: "entry", sourceRevisionId: "draft-1", newRevisionId: "draft-2", operationId: "replace-1", targetAssetVersion: { assetId: "asset-a", assetVersionId: "v1" }, newAssetVersion: { assetId: "asset-c", assetVersionId: "v1" } });
    assert.equal(replaced.ok, true, replaced.ok ? "" : replaced.error.code); if (!replaced.ok) return;
    assert.deepEqual(replaced.value.references.map((reference) => reference.assetVersion), [{ assetId: "asset-b", assetVersionId: "v1" }, { assetId: "asset-c", assetVersionId: "v1" }]);
    assert.deepEqual(opened.value.getRevisionReferences({ entryId: "entry", revisionId: "draft-1" }), oldReferences);
    assert.deepEqual(opened.value.getRevision({ entryId: "entry", revisionId: "draft-1" }), oldRevision);
    const pointers = opened.value.getEntryPointers("entry"); assert.equal(pointers.ok, true); if (!pointers.ok) return;
    assert.equal(pointers.value.currentRevisionId, "draft-2"); assert.equal(pointers.value.publishedRevisionId, "draft-1");
    const published = site.snapshot("published"); assert.equal(published.ok, true); if (!published.ok) return;
    assert.equal(published.value.claims[0]?.sourceRevisionId, "draft-1");
    const beforeFailure = opened.value.canonicalState(); assert.equal(beforeFailure.ok, true); if (!beforeFailure.ok) return;
    const unavailable = await app.replaceMediaReference({ entryId: "entry", sourceRevisionId: "draft-2", newRevisionId: "draft-3", operationId: "replace-2", targetAssetVersion: { assetId: "asset-c", assetVersionId: "v1" }, newAssetVersion: { assetId: "missing", assetVersionId: "v1" } });
    assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.error.code, "MEDIA_UNAVAILABLE");
    const afterFailure = opened.value.canonicalState(); assert.equal(afterFailure.ok, true); if (!afterFailure.ok) return;
    assert.equal(afterFailure.value.digest, beforeFailure.value.digest);
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
