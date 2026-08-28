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

test("SaveRevision atomically creates current revision, pointer, and claim", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "save-revision-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const pluginHost = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) }); assert.equal(pluginHost.ok, true); if (!pluginHost.ok) return;
    const schemaBytes = canonicalJsonBytes({ type: "object" }); assert.equal(schemaBytes.ok, true); if (!schemaBytes.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
    const site = createSiteDefinition({ persistence: opened.value });
    const media = createDataMedia({ persistence: opened.value, objectStore: { stage: () => ({ ok: false, error: { code: "MEDIA_STAGING_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "" } } }), promote: () => ({ ok: false, error: { code: "MEDIA_PROMOTION_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "" } } }), verifyFinal: () => ({ ok: true, value: undefined }), releaseStage: () => ({ ok: true, value: undefined }), verifyEvidence: () => ({ ok: true, value: undefined }) } });
    const app = createDomainApplication({ persistence: opened.value, siteDefinition: site, dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: pluginHost.value });
    const saved = await app.saveRevision({ entryId: "entry", revisionId: "draft-1", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "draft" }, route: "/Learn//Guide/", assetVersions: [] });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error.code); if (!saved.ok) return;
    assert.equal(saved.value.currentPointer.currentRevisionId, "draft-1"); assert.equal(saved.value.currentClaim.normalizedRoute, "/learn/guide"); opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
