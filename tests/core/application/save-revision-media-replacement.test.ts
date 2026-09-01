import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort, type DomainApplicationDependencies } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

test("SaveRevision media replacement copies the complete set, moves only current, and preserves published history", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "replace-media-reference-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objects.ok, true); if (!objects.ok) return;
    const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    const host = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) }); assert.equal(host.ok, true); if (!host.ok) return;
    const schemaBytes = canonicalJsonBytes({ type: "object" }); assert.equal(schemaBytes.ok, true); if (!schemaBytes.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
    const started = startDataMedia({ persistence: opened.value, objectStore: objects.value }); assert.equal(started.ok, true); if (!started.ok) return;
    const media = started.value;
    for (const [assetId, assetVersionId, importId] of [["asset-a", "v1", "import-a-v1"], ["asset-a", "v2", "import-a-v2"], ["asset-b", "v1", "import-b"], ["asset-c", "v1", "import-c"]] as const) assert.equal(media.importLocal({ assetId, assetVersionId, importId, bytes: new TextEncoder().encode(importId), metadata: { mime: "text/plain" } }).ok, true);
    const site = createSiteDefinition({ persistence: opened.value });
    const app = createDomainApplication({ persistence: opened.value, siteDefinition: site, dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: host.value });
    const saved = await app.saveRevision({ entryId: "entry", revisionId: "draft-1", operationId: "save-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "original" }, route: "/guide", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }, { assetId: "asset-b", assetVersionId: "v1" }, { assetId: "asset-c", assetVersionId: "v1" }] });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error.code); if (!saved.ok) return;
    assert.equal((await app.publishRevision({ entryId: "entry", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" })).ok, true);
    const oldReferences = opened.value.getRevisionReferences({ entryId: "entry", revisionId: "draft-1" }); assert.equal(oldReferences.ok, true); if (!oldReferences.ok) return;
    const oldRevision = opened.value.getRevision({ entryId: "entry", revisionId: "draft-1" }); assert.equal(oldRevision.ok, true); if (!oldRevision.ok) return;
    const replaced = await app.saveRevision({ kind: "media-reference-replacement", entryId: "entry", revisionId: "draft-2", operationId: "replace-1", expectedCurrentRevisionId: "draft-1", targetAssetVersion: { assetId: "asset-a", assetVersionId: "v1" }, replacementAssetVersion: { assetId: "asset-a", assetVersionId: "v2" } });
    assert.equal(replaced.ok, true, replaced.ok ? "" : replaced.error.code); if (!replaced.ok) return;
    assert.deepEqual(replaced.value.references.map((reference) => reference.assetVersion), [{ assetId: "asset-a", assetVersionId: "v2" }, { assetId: "asset-b", assetVersionId: "v1" }, { assetId: "asset-c", assetVersionId: "v1" }]);
    assert.deepEqual(opened.value.getRevisionReferences({ entryId: "entry", revisionId: "draft-1" }), oldReferences);
    assert.deepEqual(opened.value.getRevision({ entryId: "entry", revisionId: "draft-1" }), oldRevision);
    for (const importId of ["import-a-v1", "import-a-v2", "import-b", "import-c"]) {
      const bytes = new TextEncoder().encode(importId);
      assert.equal(objects.value.verifyEvidence({ objectDigest: sha256Digest(bytes), byteLength: bytes.byteLength }).ok, true);
    }
    const pointers = opened.value.getEntryPointers("entry"); assert.equal(pointers.ok, true); if (!pointers.ok) return;
    assert.equal(pointers.value.currentRevisionId, "draft-2"); assert.equal(pointers.value.publishedRevisionId, "draft-1");
    const published = site.snapshot("published"); assert.equal(published.ok, true); if (!published.ok) return;
    assert.equal(published.value.claims[0]?.sourceRevisionId, "draft-1");
    const beforeFailure = opened.value.canonicalState(); assert.equal(beforeFailure.ok, true); if (!beforeFailure.ok) return;
    const unavailable = await app.saveRevision({ kind: "media-reference-replacement", entryId: "entry", revisionId: "draft-3", operationId: "replace-2", expectedCurrentRevisionId: "draft-2", targetAssetVersion: { assetId: "asset-a", assetVersionId: "v2" }, replacementAssetVersion: { assetId: "asset-a", assetVersionId: "missing" } });
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) { assert.equal(unavailable.error.code, "MEDIA_UNAVAILABLE"); assert.deepEqual(unavailable.error.subjectIds, ["asset-a"]); }
    const afterFailure = opened.value.canonicalState(); assert.equal(afterFailure.ok, true); if (!afterFailure.ok) return;
    assert.equal(afterFailure.value.digest, beforeFailure.value.digest);
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

async function replacementFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "save-revision-media-replacement-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("openPersistence");
  const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") });
  assert.equal(objects.ok, true);
  if (!objects.ok) throw new Error("createLocalMediaObjectStore");
  const installedRoot = path.join(directory, "installed");
  mkdirSync(installedRoot);
  const host = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) });
  assert.equal(host.ok, true);
  if (!host.ok) throw new Error("createPluginHost");
  const schemaBytes = canonicalJsonBytes({ type: "object" });
  assert.equal(schemaBytes.ok, true);
  if (!schemaBytes.ok) throw new Error("canonicalJsonBytes");
  assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
  const started = startDataMedia({ persistence: opened.value, objectStore: objects.value });
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("startDataMedia");
  const media = started.value;
  for (const assetVersionId of ["v1", "v2"] as const) {
    assert.equal(media.importLocal({ assetId: "asset-a", assetVersionId, importId: `import-${assetVersionId}`, bytes: new TextEncoder().encode(assetVersionId), metadata: { mime: "text/plain" } }).ok, true);
  }
  const site = createSiteDefinition({ persistence: opened.value });
  const dependencies: DomainApplicationDependencies = { persistence: opened.value, siteDefinition: site, dataMedia: media, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: host.value };
  const app = createDomainApplication(dependencies);
  const source = await app.saveRevision({ entryId: "entry", revisionId: "source", operationId: "save-source", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "source" }, route: "/source", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }] });
  assert.equal(source.ok, true, source.ok ? "" : source.error.code);
  return { app, dependencies, directory, site, store: opened.value };
}

function digest(store: PersistenceStore): string {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonicalState");
  return state.value.digest;
}

test("SaveRevision media replacement rejects malformed, missing, unavailable, and stale intents without mutation", async () => {
  const value = await replacementFixture();
  try {
    const request = {
      kind: "media-reference-replacement" as const,
      entryId: "entry",
      revisionId: "candidate",
      operationId: "replace",
      expectedCurrentRevisionId: "source",
      targetAssetVersion: { assetId: "asset-a", assetVersionId: "v1" },
      replacementAssetVersion: { assetId: "asset-a", assetVersionId: "v2" },
    };
    const before = digest(value.store);
    const getter = { ...request };
    Object.defineProperty(getter, "kind", { enumerable: true, get: () => { throw new Error("getter"); } });
    const invalidRequests: readonly unknown[] = [
      { ...request, unexpected: true },
      { ...request, targetAssetVersion: { ...request.targetAssetVersion, unexpected: true } },
      { ...request, expectedCurrentRevisionId: "candidate" },
      { ...request, replacementAssetVersion: { assetId: "asset-b", assetVersionId: "v2" } },
      { ...request, replacementAssetVersion: { assetId: "asset-a", assetVersionId: "v1" } },
      getter,
      new Proxy(request, { ownKeys: () => { throw new Error("proxy"); } }),
    ];
    for (const invalid of invalidRequests) {
      const result = await value.app.saveRevision(invalid as never);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "INVALID_SAVE_REVISION_REQUEST");
      assert.equal(digest(value.store), before);
    }

    const missing = await value.app.saveRevision({ ...request, revisionId: "missing", targetAssetVersion: { assetId: "asset-a", assetVersionId: "absent" } });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.code, "MEDIA_REFERENCE_NOT_FOUND");
      assert.equal(missing.error.owner, "DataMedia");
      assert.deepEqual(missing.error.subjectIds, ["asset-a", "absent"]);
    }
    assert.equal(digest(value.store), before);

    const unavailable = await value.app.saveRevision({ ...request, revisionId: "unavailable", replacementAssetVersion: { assetId: "asset-a", assetVersionId: "missing" } });
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) assert.equal(unavailable.error.code, "MEDIA_UNAVAILABLE");
    assert.equal(digest(value.store), before);

    const actor = await value.app.saveRevision({ entryId: "entry", revisionId: "actor", operationId: "save-actor", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "actor" }, route: "/source", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }] });
    assert.equal(actor.ok, true, actor.ok ? "" : actor.error.code);
    const stale = await value.app.saveRevision(request);
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "CURRENT_REVISION_MISMATCH");
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("SaveRevision media replacement rejects a replacement the current source already references", async () => {
  const value = await replacementFixture();
  try {
    const both = await value.app.saveRevision({ entryId: "entry", revisionId: "both", operationId: "save-both", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "both" }, route: "/source", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }, { assetId: "asset-a", assetVersionId: "v2" }] });
    assert.equal(both.ok, true, both.ok ? "" : both.error.code);
    const before = digest(value.store);
    const conflict = await value.app.saveRevision({ kind: "media-reference-replacement", entryId: "entry", revisionId: "candidate", operationId: "replace", expectedCurrentRevisionId: "both", targetAssetVersion: { assetId: "asset-a", assetVersionId: "v1" }, replacementAssetVersion: { assetId: "asset-a", assetVersionId: "v2" } });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) {
      assert.equal(conflict.error.code, "MEDIA_REFERENCE_CONFLICT");
      assert.equal(conflict.error.owner, "DataMedia");
      assert.deepEqual(conflict.error.subjectIds, ["asset-a", "v2"]);
    }
    assert.equal(digest(value.store), before);
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("SaveRevision media replacement reports a current pointer that moves before the route snapshot as a mismatch", async () => {
  const value = await replacementFixture();
  try {
    const next = await value.app.saveRevision({ entryId: "entry", revisionId: "next", operationId: "save-next", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "next" }, route: "/source", assetVersions: [{ assetId: "asset-a", assetVersionId: "v1" }] });
    assert.equal(next.ok, true, next.ok ? "" : next.error.code);
    assert.equal(value.store.setEntryPointers({ entryId: "entry", currentRevisionId: "source", lineage: { revisionId: "source", operationId: "rewind", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(value.site.replaceRouteClaim({ graph: "current", owner: "entry", route: "/source", sourceRevisionId: "source" }).ok, true);

    let raced = false;
    const racedSite: DomainApplicationDependencies["siteDefinition"] = {
      ...value.site,
      snapshot(graph) {
        if (!raced && graph === "current") {
          raced = true;
          assert.equal(value.store.setEntryPointers({ entryId: "entry", currentRevisionId: "next", lineage: { revisionId: "next", operationId: "race", operationKind: "SaveRevision" } }).ok, true);
          assert.equal(value.site.replaceRouteClaim({ graph: "current", owner: "entry", route: "/source", sourceRevisionId: "next" }).ok, true);
        }
        return value.site.snapshot(graph);
      },
    };
    const app = createDomainApplication({ ...value.dependencies, siteDefinition: racedSite });
    const result = await app.saveRevision({ kind: "media-reference-replacement", entryId: "entry", revisionId: "candidate", operationId: "replace", expectedCurrentRevisionId: "source", targetAssetVersion: { assetId: "asset-a", assetVersionId: "v1" }, replacementAssetVersion: { assetId: "asset-a", assetVersionId: "v2" } });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "CURRENT_REVISION_MISMATCH");
      assert.equal(result.error.owner, "Content");
    }
    assert.equal(value.store.getRevision({ entryId: "entry", revisionId: "candidate" }).ok, false);
    const pointers = value.store.getEntryPointers("entry");
    assert.equal(pointers.ok, true);
    if (pointers.ok) assert.equal(pointers.value.currentRevisionId, "next");
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});
