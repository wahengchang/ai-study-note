import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceResult, type PersistenceStore } from "../../../core/persistence/index.js";

function bytes(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); assert.equal(result.ok, true); if (!result.ok) throw new Error("canonical fixture failed"); return result.value; }
function failure<T>(result: PersistenceResult<T>): string | undefined { return result.ok ? undefined : result.error.code; }
function databasePath(): Readonly<{ directory: string; value: string }> { const directory = mkdtempSync(path.join(tmpdir(), "schema-migration-execution-")); return { directory, value: path.join(directory, "cms.sqlite") }; }
function state(store: PersistenceStore): string { const result = store.canonicalState(); assert.equal(result.ok, true); if (!result.ok) throw new Error("state unavailable"); return result.value.digest; }

function fixture(databasePathname: string): Readonly<{ store: PersistenceStore; sourceBytes: Uint8Array; mappedBytes: Uint8Array }> {
  assert.equal(migrateDatabase({ databasePath: databasePathname }).ok, true);
  const opened = openPersistence({ databasePath: databasePathname });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("store unavailable");
  const store = opened.value;
  const schemaBytes = bytes({ type: "note", version: 1 });
  assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes, schemaDigest: sha256Digest(schemaBytes) }).ok, true);
  const sourceBytes = bytes({ title: "before" });
  assert.equal(store.createRevision({ identity: { entryId: "entry", revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: sourceBytes, contentDigest: sha256Digest(sourceBytes), lineage: { operationId: "save-r1", operationKind: "SaveRevision" } }).ok, true);
  assert.equal(store.setEntryPointers({ entryId: "entry", currentRevisionId: "r1", publishedRevisionId: "r1", lineage: { revisionId: "r1", operationId: "save-r1", operationKind: "SaveRevision" } }).ok, true);
  return { store, sourceBytes, mappedBytes: bytes({ title: "after" }) };
}

function preflight(store: PersistenceStore, mappedBytes: Uint8Array) {
  const schemaBytes = bytes({ type: "note", version: 2 });
  return store.preflightSchemaMigration({
    sourceSchemaIdentity: { schemaId: "note", version: 1 },
    targetSchema: { identity: { schemaId: "note", version: 2 }, schemaBytes, schemaDigest: sha256Digest(schemaBytes) },
    mappingIdentity: sha256Digest(bytes({ mapper: "v2" })),
    pointerPolicies: [
      { entryId: "entry", pointer: "current", policy: "move" },
      { entryId: "entry", pointer: "published", policy: "pin" },
    ],
    mapper: { map() { return { ok: true as const, contentBytes: mappedBytes, contentDigest: sha256Digest(mappedBytes) }; } },
    validator: { validate() { return { ok: true as const }; } },
  });
}

test("executes one fresh approvable plan atomically and reconstructs durable lineage", () => {
  const database = databasePath();
  try {
    const { store, sourceBytes, mappedBytes } = fixture(database.value);
    const report = preflight(store, mappedBytes);
    assert.equal(report.ok, true);
    if (!report.ok) return;
    const execution = store.executeSchemaMigration({ evidence: report.value.evidence, operationId: "schema-migration-v2", replacements: [{ sourceRevision: { entryId: "entry", revisionId: "r1" }, replacementRevisionId: "r2" }] });
    assert.equal(execution.ok, true);
    if (!execution.ok) return;
    assert.deepEqual(execution.value.pointers, [
      { entryId: "entry", pointer: "current", sourceRevisionId: "r1", policy: "move", resultRevisionId: "r2" },
      { entryId: "entry", pointer: "published", sourceRevisionId: "r1", policy: "pin", resultRevisionId: "r1" },
    ]);
    const canonical = store.canonicalState();
    assert.equal(canonical.ok, true);
    if (canonical.ok) assert.deepEqual(canonical.value.counts, { schemaVersions: 2, revisions: 2, operationLineage: 3, entryPointers: 1, entryPointerLineage: 3, routeClaims: 0, mediaImportIntents: 0, mediaObjects: 0, mediaAssets: 0, assetVersions: 0, revisionReferences: 0, schemaMigrationExecutions: 1, schemaMigrationRevisionLineage: 1, schemaMigrationPointerLineage: 2 });
    assert.deepEqual(store.getEntryPointers("entry"), { ok: true, value: { entryId: "entry", currentRevisionId: "r2", publishedRevisionId: "r1" } });
    const source = store.getRevision({ entryId: "entry", revisionId: "r1" });
    const replacement = store.getRevision({ entryId: "entry", revisionId: "r2" });
    assert.equal(source.ok, true); assert.equal(replacement.ok, true);
    if (source.ok && replacement.ok) {
      assert.deepEqual(source.value.contentBytes, sourceBytes);
      assert.deepEqual(replacement.value.contentBytes, mappedBytes);
      assert.deepEqual(replacement.value.schemaIdentity, { schemaId: "note", version: 2 });
    }
    assert.deepEqual(store.getSchemaMigrationExecution("schema-migration-v2"), execution);
    store.close();
    const reopened = openPersistence({ databasePath: database.value });
    assert.equal(reopened.ok, true);
    if (reopened.ok) {
      assert.deepEqual(reopened.value.getSchemaMigrationExecution("schema-migration-v2"), execution);
      reopened.value.close();
    }
  } finally { rmSync(database.directory, { recursive: true, force: true }); }
});

test("invalid replacement plan consumes no canonical state", () => {
  const database = databasePath();
  try {
    const { store, mappedBytes } = fixture(database.value);
    const report = preflight(store, mappedBytes);
    assert.equal(report.ok, true);
    if (!report.ok) return;
    const before = state(store);
    assert.equal(failure(store.executeSchemaMigration({ evidence: report.value.evidence, operationId: "schema-migration-v2", replacements: [] })), "INVALID_SCHEMA_MIGRATION_REQUEST");
    assert.equal(state(store), before);
    assert.equal(failure(store.getSchemaMigrationExecution("schema-migration-v2")), "SCHEMA_MIGRATION_EXECUTION_NOT_FOUND");
    assert.equal(failure(store.getSchemaVersion({ schemaId: "note", version: 2 })), "SCHEMA_VERSION_NOT_FOUND");
  } finally { rmSync(database.directory, { recursive: true, force: true }); }
});
