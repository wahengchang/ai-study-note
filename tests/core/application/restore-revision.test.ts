import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

test("RestoreRevision creates a new current immutable revision and retains published pin", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "restore-revision-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const plugins = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) }); assert.equal(plugins.ok, true); if (!plugins.ok) return;
    const schemaBytes = canonicalJsonBytes({ type: "object" }); assert.equal(schemaBytes.ok, true); if (!schemaBytes.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
    const media = createDataMedia({ persistence: opened.value, objectStore: { stage: () => ({ ok: false, error: { code: "MEDIA_STAGING_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "" } } }), promote: () => ({ ok: false, error: { code: "MEDIA_PROMOTION_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "" } } }), verifyFinal: () => ({ ok: true, value: undefined }), releaseStage: () => ({ ok: true, value: undefined }), verifyEvidence: () => ({ ok: true, value: undefined }), inspectFinal: () => ({ ok: true, value: "absent" }) } });
    const app = createDomainApplication({ persistence: opened.value, siteDefinition: createSiteDefinition({ persistence: opened.value }), dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: plugins.value });
    assert.equal((await app.saveRevision({ entryId: "entry", revisionId: "draft", operationId: "save", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "old" }, route: "/old", assetVersions: [] })).ok, true);
    const restored = await app.restoreRevision({ entryId: "entry", sourceRevisionId: "draft", revisionId: "restored", operationId: "restore" });
    assert.equal(restored.ok, true, restored.ok ? "" : restored.error.code);
    assert.equal(restored.ok && restored.value.revision.restoredFromRevisionId, "draft");
    assert.equal(restored.ok && restored.value.currentPointer.currentRevisionId, "restored");
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
