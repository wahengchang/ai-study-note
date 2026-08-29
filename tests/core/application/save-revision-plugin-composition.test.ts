import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import type { DomainApplication, DomainApplicationResult, RevisionSchemaValidator, SaveRevisionRequest } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue } from "../../../core/foundation/index.js";
import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceCanonicalState, PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import type { PluginActivationState, PluginActivationStatePort, PluginHost } from "../../../core/plugin-host/index.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import type { SiteDefinition } from "../../../core/site-definition/index.js";

type PluginMode = "accept" | "reject" | "throw" | "malformed";
type SchemaMode = "accept" | "reject-replacement" | "throw-replacement";
type PluginTraceEntry = Readonly<{ facadeKeys: readonly string[]; frozen: boolean }>;
type Baseline = Readonly<{ pointers: unknown; current: unknown; published: unknown; persistence: PersistenceCanonicalState; activeDigest: Digest }>;
type Fixture = Readonly<{
  directory: string;
  databasePath: string;
  store: PersistenceStore;
  site: SiteDefinition;
  app: DomainApplication;
  pluginHost: PluginHost;
  activationPort: PluginActivationStatePort;
  activeDigest: Digest;
  traceKey: string;
  pauseNextActivationRead(): Readonly<{ captured: Promise<void>; release(): void }>;
}>;

function canonical(value: JsonValue): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical JSON fixture failed");
  return result.value;
}

function request(overrides: Partial<SaveRevisionRequest> = {}): SaveRevisionRequest {
  return {
    entryId: "entry-a",
    revisionId: "draft-1",
    operationId: "save-1",
    schemaIdentity: { schemaId: "note", version: 1 },
    content: { title: "draft" },
    route: "/guide",
    assetVersions: [],
    ...overrides,
  };
}

function persistedState(store: PersistenceStore): PersistenceCanonicalState {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonical persistence state failed");
  return state.value;
}

function writeValidatorPlugin(installedRoot: string, mode: PluginMode, traceKey: string, canary: string): void {
  const directory = path.join(installedRoot, "application-validator");
  mkdirSync(directory, { recursive: true });
  const output = mode === "accept"
    ? 'return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: { title: "validated" } } };'
    : mode === "reject"
      ? 'return { contract: "save-revision-validator-output/v1", decision: "reject" };'
      : mode === "throw"
        ? `throw new Error(${JSON.stringify(canary)});`
        : `return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: input.content }, extra: ${JSON.stringify(canary)} };`;
  const source = `const traceKey = ${JSON.stringify(traceKey)};
export function validate(input, facade) {
  const trace = globalThis[traceKey] ?? [];
  trace.push({ input, facadeKeys: Object.keys(facade), frozen: Object.isFrozen(input) && Object.isFrozen(input.content) && Object.isFrozen(facade) });
  globalThis[traceKey] = trace;
  ${output}
}`;
  const entryPath = path.join(directory, "index.mjs");
  writeFileSync(entryPath, source);
  const entryBytes = new TextEncoder().encode(source);
  const manifest = {
    manifestVersion: "plugin-manifest/v1",
    id: "application-validator",
    version: "1.0.0",
    trustedLocal: true,
    hookContract: "plugin-hooks/v1",
    capabilities: ["save-revision-validator"],
    entry: { file: "index.mjs", digest: sha256Digest(entryBytes) },
    callbacks: [{ hook: "save-revision/validate", exportName: "validate", priority: 10 }],
    resources: [],
  };
  writeFileSync(path.join(directory, "plugin-manifest.json"), canonical(manifest));
}

async function fixture(mode: PluginMode, schemaMode: SchemaMode = "accept"): Promise<Fixture> {
  const directory = mkdtempSync(path.join(tmpdir(), "save-revision-plugin-composition-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("openPersistence failed");
  const store = opened.value;
  const schemaBytes = canonical({ type: "object" });
  assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes, schemaDigest: sha256Digest(schemaBytes) }).ok, true);
  const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") });
  assert.equal(objects.ok, true);
  if (!objects.ok) throw new Error("local media object store failed");
  const media = createDataMedia({ persistence: store, objectStore: objects.value });
  assert.equal(media.importLocal({ importId: "import-a", assetId: "asset-a", assetVersionId: "version-a", bytes: new TextEncoder().encode("asset bytes"), metadata: { mime: "text/plain" } }).ok, true);

  const installedRoot = path.join(directory, "installed");
  mkdirSync(installedRoot);
  const traceKey = `__applicationPluginTrace_${path.basename(directory)}`;
  const canary = `plugin-canary ${directory}`;
  writeValidatorPlugin(installedRoot, mode, traceKey, canary);

  const realPort = createPersistencePluginActivationStatePort({ persistence: store });
  let gate: Readonly<{ captured(): void; release: Promise<void> }> | undefined;
  const activationPort: PluginActivationStatePort = {
    async read() {
      const state = await realPort.read();
      const pending = gate;
      if (pending !== undefined) {
        gate = undefined;
        pending.captured();
        await pending.release;
      }
      return state;
    },
    compareAndReplace(input) { return realPort.compareAndReplace(input); },
  };
  const created = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: activationPort });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("plugin host creation failed");
  const pluginHost = created.value;
  const site = createSiteDefinition({ persistence: store });
  let validations = 0;
  const schemaValidator: RevisionSchemaValidator = {
    validate() {
      validations += 1;
      if (validations > 1 && schemaMode === "throw-replacement") throw new Error(`schema-service-canary ${directory}`);
      return Object.freeze({ ok: !(validations > 1 && schemaMode === "reject-replacement") });
    },
  };
  const app = createDomainApplication({ persistence: store, siteDefinition: site, dataMedia: media, schemaValidator, pluginHost });
  const baselineSave = await app.saveRevision(request({ revisionId: "draft-0", operationId: "save-0" }));
  assert.equal(baselineSave.ok, true);
  if (!baselineSave.ok) throw new Error("baseline SaveRevision failed");
  assert.equal(store.setEntryPointers({ entryId: "entry-a", currentRevisionId: "draft-0", publishedRevisionId: "draft-0", lineage: { revisionId: "draft-0", operationId: "publish-0", operationKind: "PublishRevision" } }).ok, true);
  assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/guide", sourceRevisionId: "draft-0" }).ok, true);
  validations = 0;
  const discovered = await pluginHost.discover();
  assert.equal(discovered.ok, true);
  if (!discovered.ok) throw new Error("plugin discovery failed");
  const candidate = discovered.value.candidates.find((item) => item.id === "application-validator");
  assert.notEqual(candidate, undefined);
  if (candidate === undefined) throw new Error("application validator candidate missing");
  const activated = await pluginHost.activate({ identity: { id: candidate.id, version: candidate.version, hookContract: candidate.hookContract, manifestHash: candidate.manifestHash } });
  assert.equal(activated.ok, true, activated.ok ? "" : JSON.stringify(activated.error));
  if (!activated.ok) throw new Error("plugin activation failed");

  return {
    directory,
    databasePath,
    store,
    site,
    app,
    pluginHost,
    activationPort: realPort,
    activeDigest: activated.value.digest,
    traceKey,
    pauseNextActivationRead() {
      let captured!: () => void;
      let release!: () => void;
      gate = { captured: () => captured(), release: new Promise<void>((resolve) => { release = resolve; }) };
      return Object.freeze({ captured: new Promise<void>((resolve) => { captured = resolve; }), release });
    },
  };
}

function baseline(value: Fixture): Baseline {
  const pointers = value.store.getEntryPointers("entry-a");
  const current = value.site.snapshot("current");
  const published = value.site.snapshot("published");
  assert.equal(pointers.ok && current.ok && published.ok, true);
  if (!pointers.ok || !current.ok || !published.ok) throw new Error("baseline state unavailable");
  return Object.freeze({ pointers: pointers.value, current: current.value, published: published.value, persistence: persistedState(value.store), activeDigest: value.activeDigest });
}

async function assertFailedCandidateState(value: Fixture, before: Baseline): Promise<void> {
  const revision = value.store.getRevision({ entryId: "entry-a", revisionId: "draft-1" });
  assert.equal(revision.ok, false);
  if (!revision.ok) assert.equal(revision.error.code, "REVISION_NOT_FOUND");
  const references = value.store.getRevisionReferences({ entryId: "entry-a", revisionId: "draft-1" });
  assert.equal(references.ok, true);
  if (references.ok) assert.deepEqual(references.value, []);
  const lineage = value.store.getOperationLineage({ entryId: "entry-a", revisionId: "draft-1", operationId: "save-1" });
  assert.equal(lineage.ok, false);
  if (!lineage.ok) assert.equal(lineage.error.code, "REVISION_NOT_FOUND");
  const pointerLineage = value.store.getEntryPointerLineage({ entryId: "entry-a", revisionId: "draft-1", operationId: "save-1" });
  assert.equal(pointerLineage.ok, false);
  if (!pointerLineage.ok) assert.equal(pointerLineage.error.code, "ENTRY_POINTER_NOT_FOUND");
  const pointers = value.store.getEntryPointers("entry-a");
  const current = value.site.snapshot("current");
  const published = value.site.snapshot("published");
  assert.equal(pointers.ok && current.ok && published.ok, true);
  if (!pointers.ok || !current.ok || !published.ok) throw new Error("candidate changed baseline availability");
  assert.deepEqual(pointers.value, before.pointers);
  assert.deepEqual(current.value, before.current);
  assert.deepEqual(published.value, before.published);
  assert.deepEqual(persistedState(value.store), before.persistence);
  const active = await value.pluginHost.getActiveSnapshot();
  assert.equal(active.ok, true);
  if (active.ok) assert.equal(active.value.digest, before.activeDigest);
}

function trace(value: Fixture): readonly PluginTraceEntry[] {
  const result = Reflect.get(globalThis, value.traceKey);
  if (!Array.isArray(result)) return [];
  const entries: PluginTraceEntry[] = [];
  for (const item of result) {
    if (item === null || typeof item !== "object" || !("facadeKeys" in item) || !("frozen" in item) || !Array.isArray(item.facadeKeys) || !item.facadeKeys.every((key: unknown) => typeof key === "string") || typeof item.frozen !== "boolean") return [];
    entries.push(Object.freeze({ facadeKeys: Object.freeze([...item.facadeKeys]), frozen: item.frozen }));
  }
  return Object.freeze(entries);
}

function assertApplicationFailure(result: DomainApplicationResult<unknown>, owner: string, code: string, canary: string): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.owner, owner);
  assert.equal(result.error.code, code);
  assert.equal(JSON.stringify(result).includes(canary), false);
}

test("SaveRevision consumes a real PluginHost snapshot before writes and returns separate digests", async () => {
  const value = await fixture("accept");
  try {
    const before = baseline(value);
    const gate = value.pauseNextActivationRead();
    const firstSave = value.app.saveRevision(request());
    await gate.captured;
    const empty: PluginActivationState = Object.freeze({ contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] });
    assert.equal(await value.activationPort.compareAndReplace({ expectedDigest: value.activeDigest, nextState: empty }), true);
    gate.release();
    const first = await firstSave;
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.deepEqual(JSON.parse(new TextDecoder().decode(first.value.revision.contentBytes)), { title: "validated" });
    assert.equal(first.value.activePluginStateDigest, value.activeDigest);
    assert.equal(first.value.stateDigest, persistedState(value.store).digest);
    assert.equal(first.value.currentPointer.currentRevisionId, "draft-1");
    assert.equal(first.value.currentPointer.publishedRevisionId, "draft-0");
    assert.deepEqual(trace(value).map((item) => item.facadeKeys), [["capability"]]);
    assert.deepEqual(trace(value).map((item) => item.frozen), [true]);
    assert.deepEqual(value.site.snapshot("published"), { ok: true, value: before.published });

    const second = await value.app.saveRevision(request({ revisionId: "draft-2", operationId: "save-2", content: { title: "raw" } }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.deepEqual(JSON.parse(new TextDecoder().decode(second.value.revision.contentBytes)), { title: "raw" });
    assert.equal(second.value.activePluginStateDigest, sha256Digest(canonical(empty)));
    assert.equal(trace(value).length, 1);
    assert.equal(second.value.currentPointer.currentRevisionId, "draft-2");
    assert.equal(second.value.currentPointer.publishedRevisionId, "draft-0");
    assert.deepEqual(value.site.snapshot("published"), { ok: true, value: before.published });
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("Plugin-owned validator failures leave the candidate lifecycle untouched", async () => {
  const matrix: readonly Readonly<{ mode: PluginMode; schemaMode?: SchemaMode; owner: string; code: string }>[] = [
    { mode: "reject", owner: "PluginHost", code: "PLUGIN_VALIDATION_REJECTED" },
    { mode: "throw", owner: "PluginHost", code: "PLUGIN_CALLBACK_FAILED" },
    { mode: "malformed", owner: "PluginHost", code: "PLUGIN_CALLBACK_RESULT_INVALID" },
    { mode: "accept", schemaMode: "reject-replacement", owner: "PluginHost", code: "PLUGIN_CALLBACK_RESULT_INVALID" },
  ];
  for (const item of matrix) {
    const value = await fixture(item.mode, item.schemaMode);
    try {
      const before = baseline(value);
      const result = await value.app.saveRevision(request());
      assertApplicationFailure(result, item.owner, item.code, value.directory);
      await assertFailedCandidateState(value, before);
    } finally {
      value.store.close();
      rmSync(value.directory, { recursive: true, force: true });
    }
  }
});

test("replacement schema service failure is application-owned and sanitized", async () => {
  const value = await fixture("accept", "throw-replacement");
  try {
    const before = baseline(value);
    const result = await value.app.saveRevision(request());
    assertApplicationFailure(result, "DomainApplication", "SAVE_REVISION_FAILED", value.directory);
    if (!result.ok) assert.equal("detail" in result.error, false);
    await assertFailedCandidateState(value, before);
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("late route-claim fault rolls back validated revision references and lifecycle writes", async () => {
  const value = await fixture("accept");
  try {
    const before = baseline(value);
    const adapter = openSqliteAdapter(value.databasePath);
    adapter.exec("CREATE TRIGGER fail_route_claim BEFORE INSERT ON route_claims BEGIN SELECT RAISE(ABORT, 'canary transaction failure'); END");
    adapter.close();
    const result = await value.app.saveRevision(request({ assetVersions: [{ assetId: "asset-a", assetVersionId: "version-a" }] }));
    assertApplicationFailure(result, "DomainApplication", "SAVE_REVISION_FAILED", "canary transaction failure");
    assert.equal(trace(value).length, 1);
    await assertFailedCandidateState(value, before);
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});
