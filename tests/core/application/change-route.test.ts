import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import type { ChangeRouteSuccess, DomainApplication, DomainApplicationResult } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import type { DataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceCanonicalState, PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import type { PluginHost } from "../../../core/plugin-host/index.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import type { SiteDefinition } from "../../../core/site-definition/index.js";

type Harness = Readonly<{
  databasePath: string;
  store: PersistenceStore;
  site: SiteDefinition;
  application: DomainApplication;
  media: DataMedia;
  plugins: PluginHost;
}>;

async function harness(directory: string): Promise<Harness> {
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("openPersistence");
  const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "media") });
  assert.equal(objects.ok, true);
  if (!objects.ok) throw new Error("createLocalMediaObjectStore");
  const started = startDataMedia({ persistence: opened.value, objectStore: objects.value });
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("startDataMedia");
  const installedPluginsRoot = path.join(directory, "installed");
  mkdirSync(installedPluginsRoot, { recursive: true });
  const plugins = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot, activationState: createPersistencePluginActivationStatePort({ persistence: opened.value }) });
  assert.equal(plugins.ok, true);
  if (!plugins.ok) throw new Error("createPluginHost");
  const schema = canonicalJsonBytes({ type: "object" });
  assert.equal(schema.ok, true);
  if (!schema.ok) throw new Error("canonicalJsonBytes");
  assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
  const site = createSiteDefinition({ persistence: opened.value });
  const application = createDomainApplication({ persistence: opened.value, siteDefinition: site, dataMedia: started.value, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: plugins.value });
  return { databasePath, store: opened.value, site, application, media: started.value, plugins: plugins.value };
}

async function save(application: DomainApplication, entryId: string, revisionId: string, route: string, operationId = `save-${entryId}-${revisionId}`): Promise<void> {
  const result = await application.saveRevision({ entryId, revisionId, operationId, schemaIdentity: { schemaId: "note", version: 1 }, content: { entryId, revisionId }, route, assetVersions: [] });
  assert.equal(result.ok, true, result.ok ? "" : result.error.code);
}

async function seedPublished(value: Harness, entryId = "entry-a", route = "/old"): Promise<void> {
  await save(value.application, entryId, "r1", route);
  const published = await value.application.publishRevision({ entryId, expectedCurrentRevisionId: "r1", operationId: `publish-${entryId}` });
  assert.equal(published.ok, true, published.ok ? "" : published.error.code);
  await save(value.application, entryId, "r2", route);
}

function snapshots(site: SiteDefinition) {
  const current = site.snapshot("current");
  const published = site.snapshot("published");
  assert.equal(current.ok && published.ok, true);
  if (!current.ok || !published.ok) throw new Error("snapshot");
  return { current: current.value, published: published.value };
}

function canonical(store: PersistenceStore) {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonicalState");
  return state.value;
}

function changeOnlyApplication(value: Harness): DomainApplication {
  const unavailable = new Proxy(value.media, { get() { throw new Error("ChangeRoute must not read DataMedia"); } }) as DataMedia;
  const plugins = new Proxy(value.plugins, { get() { throw new Error("ChangeRoute must not read PluginHost"); } }) as PluginHost;
  return createDomainApplication({
    persistence: value.store,
    siteDefinition: value.site,
    dataMedia: unavailable,
    schemaValidator: { validate() { throw new Error("ChangeRoute must not validate schema"); } },
    pluginHost: plugins,
  });
}

function assertFailure(result: DomainApplicationResult<ChangeRouteSuccess>, code: string, owner: string, subjectIds: readonly string[]): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
    assert.equal(result.error.owner, owner);
    assert.deepEqual(result.error.subjectIds, subjectIds);
  }
}

function assertUnchanged(value: Harness, before: PersistenceCanonicalState): void {
  const after = canonical(value.store);
  assert.equal(after.digest, before.digest);
  assert.deepEqual(after.counts, before.counts);
}

test("ChangeRoute atomically changes current and published claims without moving pointers or creating revisions", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "change-route-success-"));
  try {
    const value = await harness(directory);
    await seedPublished(value);
    const app = changeOnlyApplication(value);
    const originalPointer = value.store.getEntryPointers("entry-a");
    assert.equal(originalPointer.ok, true);
    if (!originalPointer.ok) return;

    for (const input of [
      { graph: "current" as const, route: "/current-new", sourceRevisionId: "r2", operationId: "change-current" },
      { graph: "published" as const, route: "/published-new", sourceRevisionId: "r1", operationId: "change-published" },
    ]) {
      const beforeState = canonical(value.store);
      const before = snapshots(value.site);
      const proposal = value.site.prepareRouteClaimReplacement({ graph: input.graph, owner: "entry-a", route: input.route, sourceRevisionId: input.sourceRevisionId });
      assert.equal(proposal.ok, true, proposal.ok ? "" : proposal.error.code);
      if (!proposal.ok) return;
      const changed = await app.changeRoute({ operationId: input.operationId, proposal: proposal.value });
      assert.equal(changed.ok, true, changed.ok ? "" : changed.error.code);
      if (!changed.ok) return;
      const after = snapshots(value.site);
      assert.deepEqual(changed.value.claim, { graph: input.graph, normalizedRoute: input.route, owner: "entry-a", sourceRevisionId: input.sourceRevisionId });
      assert.deepEqual(changed.value.impact, proposal.value.impact);
      assert.deepEqual(changed.value.baselineDigests, proposal.value.baselineDigests);
      assert.deepEqual(changed.value.resultingDigests, proposal.value.resultingDigests);
      assert.deepEqual(changed.value.entryPointer, originalPointer.value);
      assert.equal(after[input.graph].digest, changed.value.resultingDigests[input.graph]);
      assert.equal(after[input.graph === "current" ? "published" : "current"].digest, before[input.graph === "current" ? "published" : "current"].digest);
      const lineage = value.store.getOperationLineage(changed.value.lineageIdentity);
      assert.deepEqual(lineage, { ok: true, value: { ...changed.value.lineageIdentity, operationKind: "ChangeRoute", createsRevision: false } });
      assert.deepEqual(value.store.getEntryPointerLineage(changed.value.lineageIdentity), { ok: true, value: { ...originalPointer.value, lineageIdentity: changed.value.lineageIdentity } });
      const afterState = canonical(value.store);
      assert.equal(afterState.counts.revisions, beforeState.counts.revisions);
      assert.equal(afterState.counts.revisionReferences, beforeState.counts.revisionReferences);
      assert.equal(afterState.counts.entryPointers, beforeState.counts.entryPointers);
      assert.equal(afterState.counts.operationLineage, beforeState.counts.operationLineage + 1);
      assert.equal(afterState.counts.entryPointerLineage, beforeState.counts.entryPointerLineage + 1);
      assert.equal(changed.value.stateDigest, afterState.digest);
    }
    assert.equal(value.store.getRevision({ entryId: "entry-a", revisionId: "r1" }).ok, true);
    assert.equal(value.store.getRevision({ entryId: "entry-a", revisionId: "r2" }).ok, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ChangeRoute rejects malformed, cloned, foreign, mutated, stale, and unselected proposals without mutation", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "change-route-rejections-"));
  try {
    const value = await harness(directory);
    await seedPublished(value);
    await save(value.application, "entry-b", "b1", "/b");
    const app = changeOnlyApplication(value);
    const baseline = canonical(value.store);
    const prepared = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/new", sourceRevisionId: "r2" });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const accessor = { operationId: "change", proposal: prepared.value };
    Object.defineProperty(accessor, "proposal", { enumerable: true, get() { return prepared.value; } });
    const symbolKey = { operationId: "change", proposal: prepared.value };
    Object.defineProperty(symbolKey, Symbol("extra"), { enumerable: true, value: true });
    const throwingProxy = new Proxy({}, { ownKeys() { throw new Error("request-canary"); } });
    const malformed: unknown[] = [null, [], { operationId: "", proposal: prepared.value }, { operationId: "change" }, { operationId: "change", proposal: prepared.value, extra: true }, { operationId: "change", proposal: null }, { operationId: "change", proposal: 1 }, symbolKey, accessor, throwingProxy, { operationId: "change\0", proposal: prepared.value }];
    for (const request of malformed) {
      assertFailure(await app.changeRoute(request as never), "INVALID_CHANGE_ROUTE_REQUEST", "DomainApplication", []);
      assertUnchanged(value, baseline);
    }

    const clone = { ...prepared.value, claim: { ...prepared.value.claim }, impact: prepared.value.impact.map((item) => ({ ...item })), nextTargetBytes: prepared.value.nextTargetBytes.slice() };
    assertFailure(await app.changeRoute({ operationId: "clone", proposal: clone }), "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    assertUnchanged(value, baseline);
    const foreignSite = createSiteDefinition({ persistence: value.store });
    const foreign = foreignSite.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/foreign", sourceRevisionId: "r2" });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    assertFailure(await app.changeRoute({ operationId: "foreign", proposal: foreign.value }), "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    assertUnchanged(value, baseline);
    const mutated = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/mutated", sourceRevisionId: "r2" });
    assert.equal(mutated.ok, true);
    if (!mutated.ok) return;
    (mutated.value.impact as unknown as Array<{ owner: string }>)[0]!.owner = "forged";
    assertFailure(await app.changeRoute({ operationId: "mutated", proposal: mutated.value }), "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    assertUnchanged(value, baseline);

    const stateful = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/stateful", sourceRevisionId: "r2" });
    assert.equal(stateful.ok, true);
    if (!stateful.ok) return;
    const issuedClaim = stateful.value.claim;
    let claimReads = 0;
    Object.defineProperty(stateful.value, "claim", {
      configurable: true,
      enumerable: true,
      get() {
        claimReads += 1;
        return claimReads <= 4 ? issuedClaim : { ...issuedClaim, owner: "entry-b", sourceRevisionId: "b1" };
      },
    });
    const statefulResult = await app.changeRoute({ operationId: "stateful-issuer", proposal: stateful.value });
    assert.equal(statefulResult.ok, true, statefulResult.ok ? "" : statefulResult.error.code);
    if (!statefulResult.ok) return;
    assert.deepEqual(statefulResult.value.lineageIdentity, { entryId: "entry-a", revisionId: "r2", operationId: "stateful-issuer" });
    assert.equal(value.store.getOperationLineage({ entryId: "entry-b", revisionId: "b1", operationId: "stateful-issuer" }).ok, false);

    const afterStateful = canonical(value.store);

    const historical = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/historical", sourceRevisionId: "r1" });
    assert.equal(historical.ok, true);
    if (!historical.ok) return;
    assertFailure(await app.changeRoute({ operationId: "historical", proposal: historical.value }), "CURRENT_REVISION_MISMATCH", "Content", ["entry-a"]);
    assertUnchanged(value, afterStateful);
    const noPublished = value.site.prepareRouteClaimReplacement({ graph: "published", owner: "entry-a", route: "/published-missing", sourceRevisionId: "r1" });
    assert.equal(noPublished.ok, true);
    if (!noPublished.ok) return;
    const pointer = value.store.getEntryPointers("entry-a");
    assert.equal(pointer.ok, true);
    if (!pointer.ok) return;
    assert.equal(value.store.setEntryPointers({ entryId: "entry-a", currentRevisionId: pointer.value.currentRevisionId, lineage: { revisionId: pointer.value.currentRevisionId, operationId: "clear-published", operationKind: "SaveRevision" } }).ok, true);
    const afterClearPublished = canonical(value.store);
    assertFailure(await app.changeRoute({ operationId: "published-missing", proposal: noPublished.value }), "CURRENT_REVISION_MISMATCH", "Content", ["entry-a"]);
    assertUnchanged(value, afterClearPublished);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ChangeRoute detects target and non-target graph advances, but isolates route keys across graphs", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "change-route-stale-"));
  try {
    const value = await harness(directory);
    await seedPublished(value);
    await save(value.application, "entry-b", "b1", "/b");
    const app = changeOnlyApplication(value);
    const target = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/target", sourceRevisionId: "r2" });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    await save(value.application, "entry-c", "c1", "/other");
    const afterTargetAdvance = canonical(value.store);
    assertFailure(await app.changeRoute({ operationId: "target-stale", proposal: target.value }), "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    assertUnchanged(value, afterTargetAdvance);
    const nonTarget = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/non-target", sourceRevisionId: "r2" });
    assert.equal(nonTarget.ok, true);
    if (!nonTarget.ok) return;
    assert.equal((await value.application.publishRevision({ entryId: "entry-c", expectedCurrentRevisionId: "c1", operationId: "publish-entry-c" })).ok, true);
    const afterNonTargetAdvance = canonical(value.store);
    assertFailure(await app.changeRoute({ operationId: "non-target-stale", proposal: nonTarget.value }), "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    assertUnchanged(value, afterNonTargetAdvance);
    const current = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/shared", sourceRevisionId: "r2" });
    assert.equal(current.ok, true);
    if (!current.ok) return;
    assert.equal((await app.changeRoute({ operationId: "current-shared", proposal: current.value })).ok, true);
    const published = value.site.prepareRouteClaimReplacement({ graph: "published", owner: "entry-a", route: "/shared", sourceRevisionId: "r1" });
    assert.equal(published.ok, true);
    if (!published.ok) return;
    assert.equal((await app.changeRoute({ operationId: "published-shared", proposal: published.value })).ok, true);
    const graph = snapshots(value.site);
    assert.equal(graph.current.claims.find((claim) => claim.owner === "entry-a")?.normalizedRoute, "/shared");
    assert.equal(graph.published.claims.find((claim) => claim.owner === "entry-a")?.normalizedRoute, "/shared");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ChangeRoute competition admits exactly one same-graph owner and rolls back lineage and claims on faults", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "change-route-atomicity-"));
  try {
    const value = await harness(directory);
    await seedPublished(value, "entry-a");
    await seedPublished(value, "entry-b", "/b");
    const app = changeOnlyApplication(value);
    const first = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/collision", sourceRevisionId: "r2" });
    const second = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-b", route: "/collision", sourceRevisionId: "r2" });
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    const raced = await Promise.all([app.changeRoute({ operationId: "winner-a", proposal: first.value }), app.changeRoute({ operationId: "winner-b", proposal: second.value })]);
    assert.equal(raced.filter((result) => result.ok).length, 1);
    const loser = raced.find((result) => !result.ok);
    if (loser === undefined) return;
    assertFailure(loser, "STALE_ROUTE_PROPOSAL", "SiteDefinition", []);
    const claims = snapshots(value.site).current.claims.filter((claim) => claim.normalizedRoute === "/collision");
    assert.equal(claims.length, 1);
    const winnerIndex = raced.findIndex((result) => result.ok);
    const loserEntryId = winnerIndex === 0 ? "entry-b" : "entry-a";
    const loserOperationId = winnerIndex === 0 ? "winner-b" : "winner-a";
    assert.deepEqual(snapshots(value.site).current.claims.find((claim) => claim.owner === loserEntryId), { graph: "current", normalizedRoute: loserEntryId === "entry-a" ? "/old" : "/b", owner: loserEntryId, sourceRevisionId: "r2" });
    assert.equal(value.store.getOperationLineage({ entryId: loserEntryId, revisionId: "r2", operationId: loserOperationId }).ok, false);

    const collisionPointer = value.store.getEntryPointers(claims[0]!.owner);
    assert.equal(collisionPointer.ok, true);
    if (!collisionPointer.ok) return;
    assert.equal(value.store.setEntryPointers({
      entryId: collisionPointer.value.entryId,
      currentRevisionId: collisionPointer.value.currentRevisionId,
      ...(collisionPointer.value.publishedRevisionId === undefined ? {} : { publishedRevisionId: collisionPointer.value.publishedRevisionId }),
      lineage: { revisionId: "r2", operationId: "lineage-conflict", operationKind: "ChangeRoute" },
    }).ok, true);
    const lineageFault = value.site.prepareRouteClaimReplacement({ graph: "current", owner: collisionPointer.value.entryId, route: "/lineage-fault", sourceRevisionId: "r2" });
    assert.equal(lineageFault.ok, true);
    if (!lineageFault.ok) return;
    const beforeLineageFault = canonical(value.store);
    const lineageFailed = await app.changeRoute({ operationId: "lineage-conflict", proposal: lineageFault.value });
    assertFailure(lineageFailed, "CHANGE_ROUTE_FAILED", "DomainApplication", []);
    assertUnchanged(value, beforeLineageFault);

    const collisionOwner = claims[0]!.owner;
    const fault = value.site.prepareRouteClaimReplacement({ graph: "current", owner: collisionOwner, route: "/proposal-route-canary", sourceRevisionId: "r2" });
    assert.equal(fault.ok, true);
    if (!fault.ok) return;
    const before = canonical(value.store);
    const adapter = openSqliteAdapter(value.databasePath);
    adapter.exec("CREATE TRIGGER fail_change_route BEFORE INSERT ON route_claims BEGIN SELECT RAISE(ABORT, 'change-route-canary'); END");
    adapter.close();
    const failed = await app.changeRoute({ operationId: "operation-canary", proposal: fault.value });
    assertFailure(failed, "CHANGE_ROUTE_FAILED", "DomainApplication", []);
    if (!failed.ok) {
      const serialized = JSON.stringify(failed.error);
      for (const canary of ["change-route-canary", "operation-canary", "/proposal-route-canary"]) assert.equal(serialized.includes(canary), false);
    }
    assertUnchanged(value, before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ChangeRoute reports a SiteDefinition snapshot storage fault as CHANGE_ROUTE_FAILED and leaves the proposal reusable", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "change-route-storage-"));
  try {
    const value = await harness(directory);
    await seedPublished(value);
    const app = changeOnlyApplication(value);
    const proposal = value.site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/storage-fault", sourceRevisionId: "r2" });
    assert.equal(proposal.ok, true);
    if (!proposal.ok) return;
    const before = canonical(value.store);

    const hidden = openSqliteAdapter(value.databasePath);
    hidden.exec("ALTER TABLE route_claims RENAME TO route_claims_hidden");
    hidden.close();
    const failed = await app.changeRoute({ operationId: "storage-fault", proposal: proposal.value });
    const restored = openSqliteAdapter(value.databasePath);
    restored.exec("ALTER TABLE route_claims_hidden RENAME TO route_claims");
    restored.close();

    // snapshot 讀取 fault 不是 staleness：它必須收斂為 CHANGE_ROUTE_FAILED，不得偽裝成可重取 proposal 的 STALE_ROUTE_PROPOSAL。
    assertFailure(failed, "CHANGE_ROUTE_FAILED", "DomainApplication", []);
    assertUnchanged(value, before);
    const retried = await app.changeRoute({ operationId: "storage-fault-retry", proposal: proposal.value });
    assert.equal(retried.ok, true, retried.ok ? "" : retried.error.code);
    if (!retried.ok) return;
    assert.equal(retried.value.claim.normalizedRoute, "/storage-fault");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
