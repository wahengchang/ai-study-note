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
const noMedia: DataMedia = {
  importLocal: () => ({ ok: false, error: mediaFailure() }),
  getReadyAssetVersion: () => ({ ok: false, error: mediaFailure() }),
  requireReadyAssetVersions: () => ({ ok: true, value: [] }),
  resolvePublishedSelection: () => ({ ok: false, error: mediaFailure() }),
};

function mediaFailure() {
  return { code: "MEDIA_VERSION_UNAVAILABLE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "" } } as const;
}

/** 開一個已完成 migration、已登錄 `note` schema version 1 的空資料庫。 */
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

function request(overrides: Partial<Parameters<DomainApplication["saveRevision"]>[0]> = {}) {
  return {
    entryId: "entry-a", revisionId: "draft-1", operationId: "save-1",
    schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "draft" },
    route: "/guide", assetVersions: [], ...overrides,
  };
}

async function withStore(prefix: string, body: (store: PersistenceStore, pluginHost: DomainApplicationDependencies["pluginHost"]) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    const store = openStore(directory);
    const installedRoot = path.join(directory, "installed");
    mkdirSync(installedRoot);
    const created = await createPluginHost({
      repositoryRoot: process.cwd(),
      installedPluginsRoot: installedRoot,
      activationState: createPersistencePluginActivationStatePort({ persistence: store }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    try { await body(store, created.value); } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("a route already claimed by another entry fails with ROUTE_CONFLICT and leaves canonical state unchanged", async () => {
  await withStore("save-conflict-", async (store, pluginHost) => {
    const app = createDomainApplication({ persistence: store, siteDefinition: createSiteDefinition({ persistence: store }), dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    assert.equal((await app.saveRevision(request())).ok, true);
    const before = digestOf(store);
    const conflicted = await app.saveRevision(request({ entryId: "entry-b", revisionId: "draft-2", operationId: "save-2" }));
    assert.equal(conflicted.ok, false);
    if (conflicted.ok) return;
    assert.equal(conflicted.error.code, "ROUTE_CONFLICT");
    assert.equal(conflicted.error.owner, "SiteDefinition");
    assert.equal(digestOf(store), before);
  });
});

test("media that disappears after the preflight keeps MEDIA_UNAVAILABLE instead of collapsing to SAVE_REVISION_FAILED", async () => {
  await withStore("save-media-", async (store, pluginHost) => {
    const app = createDomainApplication({ persistence: store, siteDefinition: createSiteDefinition({ persistence: store }), dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const before = digestOf(store);
    const saved = await app.saveRevision(request({ assetVersions: [{ assetId: "asset-1", assetVersionId: "version-1" }] }));
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.error.code, "MEDIA_UNAVAILABLE");
    assert.equal(saved.error.owner, "DataMedia");
    assert.deepEqual([...saved.error.subjectIds], ["asset-1"]);
    assert.equal(digestOf(store), before);
  });
});

test("a route graph that moves under the proposal keeps STALE_ROUTE_PROPOSAL", async () => {
  await withStore("save-stale-", async (store, pluginHost) => {
    const site = createSiteDefinition({ persistence: store });
    const staleSite: DomainApplicationDependencies["siteDefinition"] = {
      ...site,
      validateCurrentClaimInTransaction: () => ({ ok: false, error: { code: "STALE_ROUTE_PROPOSAL", owner: "SiteDefinition", subjectIds: [], remediation: { kind: "message", message: "" } } }),
    };
    const app = createDomainApplication({ persistence: store, siteDefinition: staleSite, dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const before = digestOf(store);
    const saved = await app.saveRevision(request());
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.error.code, "STALE_ROUTE_PROPOSAL");
    assert.equal(digestOf(store), before);
  });
});

test("an unregistered schema version is reported as a correctable request", async () => {
  await withStore("save-schema-", async (store, pluginHost) => {
    const app = createDomainApplication({ persistence: store, siteDefinition: createSiteDefinition({ persistence: store }), dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const before = digestOf(store);
    const saved = await app.saveRevision(request({ schemaIdentity: { schemaId: "note", version: 9 } }));
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.error.code, "INVALID_SAVE_REVISION_REQUEST");
    assert.deepEqual([...saved.error.subjectIds], ["note"]);
    assert.equal(digestOf(store), before);
  });
});

test("SaveRevision moves only the current pointer and preserves the published pointer", async () => {
  await withStore("save-published-", async (store, pluginHost) => {
    const app = createDomainApplication({ persistence: store, siteDefinition: createSiteDefinition({ persistence: store }), dataMedia: noMedia, schemaValidator: acceptEverySchema, pluginHost });
    const first = await app.saveRevision(request());
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.value.stateDigest, digestOf(store));
    assert.equal(store.setEntryPointers({
      entryId: "entry-a", currentRevisionId: "draft-1", publishedRevisionId: "draft-1",
      lineage: { revisionId: "draft-1", operationId: "publish-1", operationKind: "PublishRevision" },
    }).ok, true);
    const second = await app.saveRevision(request({ revisionId: "draft-2", operationId: "save-2" }));
    assert.equal(second.ok, true, second.ok ? "" : second.error.code);
    if (!second.ok) return;
    assert.equal(second.value.currentPointer.currentRevisionId, "draft-2");
    assert.equal(second.value.currentPointer.publishedRevisionId, "draft-1");
    assert.equal(second.value.currentClaim.sourceRevisionId, "draft-2");
  });
});
