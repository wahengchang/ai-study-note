import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import type { DomainApplication, DomainApplicationDependencies } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import type { DataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

const acceptEverySchema = { validate: () => ({ ok: true }) as const };
const unavailableMedia: DataMedia = {
  importLocal: () => ({ ok: false, error: mediaFailure() }),
  getReadyAssetVersion: () => ({ ok: false, error: mediaFailure() }),
  requireReadyAssetVersions: () => ({ ok: false, error: mediaFailure() }),
  resolvePublishedSelection: () => ({ ok: false, error: mediaFailure() }),
};
const noMedia: DataMedia = { ...unavailableMedia, requireReadyAssetVersions: () => ({ ok: true, value: [] }) };

function mediaFailure() {
  return { code: "MEDIA_VERSION_UNAVAILABLE", owner: "DataMedia", subjectIds: ["asset-1"], remediation: { kind: "message", message: "" } } as const;
}

function openStore(directory: string): PersistenceStore {
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("openPersistence");
  const schemaBytes = canonicalJsonBytes({ type: "object" });
  if (!schemaBytes.ok) throw new Error("canonicalJsonBytes");
  assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
  return opened.value;
}

function digestOf(store: PersistenceStore): string {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonicalState");
  return state.value.digest;
}

async function withStore(body: (store: PersistenceStore, pluginHost: DomainApplicationDependencies["pluginHost"]) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-revision-"));
  try {
    const store = openStore(directory);
    const installedRoot = path.join(directory, "installed");
    mkdirSync(installedRoot);
    const host = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: store }) });
    assert.equal(host.ok, true);
    if (!host.ok) return;
    try { await body(store, host.value); } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

async function save(app: DomainApplication, revisionId: string, operationId: string) {
  const result = await app.saveRevision({ entryId: "entry-a", revisionId, operationId, schemaIdentity: { schemaId: "note", version: 1 }, content: { title: revisionId }, route: "/guide", assetVersions: [] });
  assert.equal(result.ok, true, result.ok ? "" : result.error.code);
}

test("PublishRevision moves only the published selection and records non-revision lineage", async () => {
  await withStore(async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const app = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    await save(app, "draft-1", "save-1");
    const beforeCurrent = site.snapshot("current"); assert.equal(beforeCurrent.ok, true);
    const published = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" });
    assert.equal(published.ok, true, published.ok ? "" : published.error.code);
    if (!published.ok || !beforeCurrent.ok) return;
    assert.equal(published.value.publishedPointer.currentRevisionId, "draft-1");
    assert.equal(published.value.publishedPointer.publishedRevisionId, "draft-1");
    assert.equal(published.value.publishedClaim.sourceRevisionId, "draft-1");
    assert.equal(published.value.stateDigest, digestOf(store));
    const afterCurrent = site.snapshot("current"); assert.equal(afterCurrent.ok, true); if (!afterCurrent.ok) return;
    assert.equal(afterCurrent.value.digest, beforeCurrent.value.digest);
    const lineage = store.getOperationLineage(published.value.lineageIdentity); assert.equal(lineage.ok, true); if (!lineage.ok) return;
    assert.equal(lineage.value.operationKind, "PublishRevision"); assert.equal(lineage.value.createsRevision, false);
    await save(app, "draft-2", "save-2");
    const republished = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-2", operationId: "publish-2" });
    assert.equal(republished.ok, true, republished.ok ? "" : republished.error.code);
    if (!republished.ok) return;
    assert.equal(republished.value.publishedClaim.sourceRevisionId, "draft-2");
    assert.equal(store.getRevision({ entryId: "entry-a", revisionId: "draft-2" }).ok, true);
  });
});

test("PublishRevision rejects invalid, stale, schema, media, and route gates without mutation", async () => {
  await withStore(async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const app = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    await save(app, "draft-1", "save-1");
    const beforeMismatch = digestOf(store);
    const mismatch = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "other", operationId: "publish-1" });
    assert.equal(mismatch.ok, false); if (!mismatch.ok) assert.equal(mismatch.error.code, "CURRENT_REVISION_MISMATCH");
    assert.equal(digestOf(store), beforeMismatch);
    const conflictSite: DomainApplicationDependencies["siteDefinition"] = { ...site, preparePublishedClaim: () => ({ ok: false, error: { code: "ROUTE_CONFLICT", owner: "SiteDefinition", subjectIds: [], remediation: { kind: "message", message: "" } } }) };
    const conflictApp = createDomainApplication({ persistence: store, siteDefinition: conflictSite, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const beforeRoute = digestOf(store);
    const conflict = await conflictApp.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-2" });
    assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.error.code, "ROUTE_CONFLICT");
    assert.equal(digestOf(store), beforeRoute);
    const schemaApp = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: { validate: () => ({ ok: false }) }, pluginHost });
    const invalid = await schemaApp.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-3" });
    assert.equal(invalid.ok, false); if (!invalid.ok) assert.equal(invalid.error.code, "SCHEMA_INVALID");
    const mediaApp = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: unavailableMedia, schemaValidator: acceptEverySchema, pluginHost });
    const media = await mediaApp.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-4" });
    assert.equal(media.ok, false); if (!media.ok) assert.equal(media.error.code, "MEDIA_UNAVAILABLE");
    assert.equal(digestOf(store), beforeRoute);
  });
});

test("PublishRevision reports stale route proposals and leaves its write-set unchanged", async () => {
  await withStore(async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const staleSite: DomainApplicationDependencies["siteDefinition"] = { ...site, validatePublishedClaimInTransaction: () => ({ ok: false, error: { code: "STALE_ROUTE_PROPOSAL", owner: "SiteDefinition", subjectIds: [], remediation: { kind: "message", message: "" } } }) };
    const app = createDomainApplication({ persistence: store, siteDefinition: staleSite, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    await save(createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost }), "draft-1", "save-1");
    const before = digestOf(store);
    const result = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "STALE_ROUTE_PROPOSAL");
    assert.equal(digestOf(store), before);
  });
});

test("PublishRevision replaces an existing published claim when current route moves", async () => {
  await withStore(async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const app = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    await save(app, "draft-1", "save-1");
    assert.equal((await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" })).ok, true);
    await save(app, "draft-2", "save-2");
    const moved = site.replaceRouteClaim({ graph: "current", owner: "entry-a", route: "/new-guide", sourceRevisionId: "draft-2" });
    assert.equal(moved.ok, true);
    const republished = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-2", operationId: "publish-2" });
    assert.equal(republished.ok, true, republished.ok ? "" : republished.error.code);
    if (!republished.ok) return;
    assert.equal(republished.value.publishedClaim.normalizedRoute, "/new-guide");
    assert.equal(republished.value.publishedClaim.sourceRevisionId, "draft-2");
    const pointer = store.getEntryPointers("entry-a");
    assert.equal(pointer.ok, true);
    if (!pointer.ok) return;
    assert.equal(pointer.value.publishedRevisionId, "draft-2");
  });
});

test("PublishRevision rejects a proposal detached from its selected current-route snapshot", async () => {
  await withStore(async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const initial = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    await save(initial, "draft-1", "save-1");
    const racedSite: DomainApplicationDependencies["siteDefinition"] = {
      ...site,
      preparePublishedClaim(input) {
        const moved = site.replaceRouteClaim({ graph: "current", owner: "entry-a", route: "/raced", sourceRevisionId: "draft-1" });
        assert.equal(moved.ok, true);
        return site.preparePublishedClaim(input);
      },
    };
    const app = createDomainApplication({ persistence: store, siteDefinition: racedSite, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const result = await app.publishRevision({ entryId: "entry-a", expectedCurrentRevisionId: "draft-1", operationId: "publish-1" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "STALE_ROUTE_PROPOSAL");
    const pointer = store.getEntryPointers("entry-a");
    assert.equal(pointer.ok, true);
    if (!pointer.ok) return;
    assert.equal(pointer.value.publishedRevisionId, undefined);
  });
});
