import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceResult, type PersistenceStore, type SchemaMigrationPreflightInput } from "../../../core/persistence/index.js";

function bytes(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); assert.equal(result.ok, true); if (!result.ok) throw new Error("canonical fixture failed"); return result.value; }
function databasePath(): Readonly<{ directory: string; value: string }> { const directory = mkdtempSync(path.join(tmpdir(), "schema-migration-impact-")); return { directory, value: path.join(directory, "cms.sqlite") }; }
function failure<T>(result: PersistenceResult<T>): string | undefined { return result.ok ? undefined : result.error.code; }
function digest(store: PersistenceStore): string { const result = store.canonicalState(); assert.equal(result.ok, true); if (!result.ok) throw new Error("state unavailable"); return result.value.digest; }

function fixture(databasePathname: string): PersistenceStore {
  assert.equal(migrateDatabase({ databasePath: databasePathname }).ok, true);
  const opened = openPersistence({ databasePath: databasePathname });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("store unavailable");
  const store = opened.value;
  for (const version of [1, 2]) {
    const schemaBytes = bytes({ type: "note", version, canary: "schema-private-canary" });
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version }, schemaBytes, schemaDigest: sha256Digest(schemaBytes) }).ok, true);
  }
  for (const [entryId, revisionId] of [["history", "r0"], ["entry-a", "r1"], ["entry-a", "r2"], ["entry-b", "r3"]] as const) {
    const contentBytes = bytes({ entryId, revisionId, private: "content-private-canary" });
    assert.equal(store.createRevision({ identity: { entryId, revisionId }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes, contentDigest: sha256Digest(contentBytes), lineage: { operationId: `save-${entryId}-${revisionId}`, operationKind: "SaveRevision" } }).ok, true);
  }
  assert.equal(store.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r2", publishedRevisionId: "r1", lineage: { revisionId: "r2", operationId: "save-entry-a-r2", operationKind: "SaveRevision" } }).ok, true);
  assert.equal(store.setEntryPointers({ entryId: "entry-b", currentRevisionId: "r3", publishedRevisionId: "r3", lineage: { revisionId: "r3", operationId: "save-entry-b-r3", operationKind: "SaveRevision" } }).ok, true);
  return store;
}

function preflight(map: SchemaMigrationPreflightInput["mapper"], validator: SchemaMigrationPreflightInput["validator"], policies: SchemaMigrationPreflightInput["pointerPolicies"]): SchemaMigrationPreflightInput {
  return { sourceSchemaIdentity: { schemaId: "note", version: 1 }, targetSchemaIdentity: { schemaId: "note", version: 2 }, mappingIdentity: sha256Digest(bytes({ operator: "migration-v1" })), pointerPolicies: policies, mapper: map, validator };
}

const completePolicies = [
  { entryId: "entry-a", pointer: "current" as const, policy: "move" as const },
  { entryId: "entry-a", pointer: "published" as const, policy: "pin" as const },
  { entryId: "entry-b", pointer: "current" as const, policy: "move" as const },
  { entryId: "entry-b", pointer: "published" as const, policy: "move" as const },
];

function mapper(calls: string[], mode: "mapped" | "missing" | "throw" | "thenable" = "mapped") {
  return {
    map(input: Parameters<SchemaMigrationPreflightInput["mapper"]["map"]>[0]) {
      calls.push(`${input.sourceRevision.identity.entryId}/${input.sourceRevision.identity.revisionId}`);
      if (mode === "throw") throw new Error("mapper-private-canary");
      if (mode === "thenable") return Promise.resolve({ ok: false, code: "MAPPING_NOT_PROVIDED" }) as never;
      if (mode === "missing") return { ok: false as const, code: "MAPPING_NOT_PROVIDED" as const };
      input.sourceSchema.schemaBytes[0] = 0;
      input.sourceRevision.contentBytes[0] = 0;
      const contentBytes = bytes({ mapped: input.sourceRevision.identity });
      return { ok: true as const, contentBytes, contentDigest: sha256Digest(contentBytes) };
    },
  };
}

function acceptingValidator(calls: string[]) { return { validate(input: Parameters<SchemaMigrationPreflightInput["validator"]["validate"]>[0]) { calls.push(input.contentDigest); input.contentBytes[0] = 0; return { ok: true as const }; } }; }

test("preflight is read-only, covers pointers, and issues issuer-bound evidence", () => {
  const database = databasePath();
  try {
    const store = fixture(database.value);
    const before = digest(store);
    const mappings: string[] = [];
    const validations: string[] = [];
    const result = store.preflightSchemaMigration(preflight(mapper(mappings), acceptingValidator(validations), completePolicies));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(digest(store), before);
    assert.equal(result.value.status, "approvable");
    assert.deepEqual(result.value.affectedPointers.map((item) => [item.entryId, item.pointer, item.revisionId, item.policy]), [["entry-a", "current", "r2", "move"], ["entry-a", "published", "r1", "pin"], ["entry-b", "current", "r3", "move"], ["entry-b", "published", "r3", "move"]]);
    assert.deepEqual(result.value.historicalRevisions.map((item) => item.revision), [{ entryId: "entry-a", revisionId: "r1" }, { entryId: "entry-a", revisionId: "r2" }, { entryId: "entry-b", revisionId: "r3" }, { entryId: "history", revisionId: "r0" }]);
    assert.deepEqual(result.value.mapping.map((item) => [item.sourceRevision, item.outcome]), [[{ entryId: "entry-a", revisionId: "r2" }, "validated"], [{ entryId: "entry-b", revisionId: "r3" }, "validated"]]);
    assert.deepEqual(mappings, ["entry-a/r2", "entry-b/r3"]);
    assert.equal(validations.length, 2);
    assert.equal(store.validateSchemaMigrationImpactEvidence(result.value.evidence).ok, true);
    const serialized = JSON.stringify(result.value);
    assert.equal(serialized.includes("private-canary"), false);
    assert.equal(serialized.includes("sha256:"), true);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.mapping), true);
  } finally { rmSync(database.directory, { recursive: true, force: true }); }
});

test("preflight reports deterministic policy, mapping, and validator blockers without writes", () => {
  const database = databasePath();
  try {
    const store = fixture(database.value);
    const before = digest(store);
    const missingPolicy = store.preflightSchemaMigration(preflight(mapper([]), acceptingValidator([]), completePolicies.filter((item) => !(item.entryId === "entry-a" && item.pointer === "published"))));
    assert.equal(missingPolicy.ok, true);
    if (missingPolicy.ok) {
      assert.equal(missingPolicy.value.status, "blocked");
      assert.equal(missingPolicy.value.affectedPointers.find((item) => item.entryId === "entry-a" && item.pointer === "published")?.policy, "unassigned");
      assert.deepEqual(missingPolicy.value.blockedRows[0]?.subject, { kind: "pointer", entryId: "entry-a", pointer: "published", revisionId: "r1" });
    }
    const mappingBlocked = store.preflightSchemaMigration(preflight(mapper([], "missing"), acceptingValidator([]), completePolicies));
    assert.equal(mappingBlocked.ok, true);
    if (mappingBlocked.ok) assert.equal(mappingBlocked.value.blockedRows.every((row) => row.reasons.some((reason) => reason.code === "MAPPING_NOT_PROVIDED")), true);
    const validationBlocked = store.preflightSchemaMigration(preflight(mapper([]), { validate() { return { ok: false as const, issues: [{ code: "MISSING_REQUIRED_FIELD" as const, schemaPath: "$.title" }, { code: "INVALID_SELECT_MAPPING" as const, schemaPath: "$.kind" }, { code: "TARGET_SCHEMA_REJECTED" as const, schemaPath: "$.state" }] }; } }, completePolicies));
    assert.equal(validationBlocked.ok, true);
    if (validationBlocked.ok) assert.deepEqual(validationBlocked.value.blockedRows[0]?.reasons.map((reason) => [reason.code, reason.schemaPath]), [["INVALID_SELECT_MAPPING", "$.kind"], ["MISSING_REQUIRED_FIELD", "$.title"], ["TARGET_SCHEMA_REJECTED", "$.state"]]);
    assert.equal(digest(store), before);
  } finally { rmSync(database.directory, { recursive: true, force: true }); }
});

test("preflight fails closed for callback faults and stale or foreign evidence", () => {
  const database = databasePath();
  try {
    const store = fixture(database.value);
    const before = digest(store);
    assert.equal(failure(store.preflightSchemaMigration(preflight(mapper([], "throw"), acceptingValidator([]), completePolicies))), "SCHEMA_MIGRATION_MAPPING_FAILED");
    assert.equal(failure(store.preflightSchemaMigration(preflight(mapper([], "thenable"), acceptingValidator([]), completePolicies))), "SCHEMA_MIGRATION_MAPPING_FAILED");
    assert.equal(failure(store.preflightSchemaMigration(preflight(mapper([]), { validate() { return new Proxy({ ok: true }, {}); } }, completePolicies))), "SCHEMA_MIGRATION_VALIDATION_FAILED");
    assert.equal(failure(store.preflightSchemaMigration({ ...preflight(mapper([]), acceptingValidator([]), completePolicies), targetSchemaIdentity: { schemaId: "note", version: 1 } })), "INVALID_SCHEMA_MIGRATION_REQUEST");
    const report = store.preflightSchemaMigration(preflight(mapper([]), acceptingValidator([]), completePolicies));
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(store.replaceRouteClaim({ graph: "current", normalizedRoute: "/unrelated", owner: "history", sourceRevisionId: "r0" }).ok, true);
    assert.equal(store.validateSchemaMigrationImpactEvidence(report.value.evidence).ok, true);
    assert.equal(failure(store.validateSchemaMigrationImpactEvidence(Object.freeze(JSON.parse(JSON.stringify(report.value.evidence))) as never)), "INVALID_SCHEMA_MIGRATION_EVIDENCE");
    assert.equal(failure(store.validateSchemaMigrationImpactEvidence(Object.freeze({}) as never)), "INVALID_SCHEMA_MIGRATION_EVIDENCE");
    const other = openPersistence({ databasePath: database.value });
    assert.equal(other.ok, true);
    if (!other.ok) return;
    const contentBytes = bytes({ entryId: "entry-a", revisionId: "r4" });
    assert.equal(other.value.createRevision({ identity: { entryId: "entry-a", revisionId: "r4" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes, contentDigest: sha256Digest(contentBytes), lineage: { operationId: "save-entry-a-r4", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(other.value.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r4", publishedRevisionId: "r1", lineage: { revisionId: "r4", operationId: "save-entry-a-r4", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(failure(store.validateSchemaMigrationImpactEvidence(report.value.evidence)), "STALE_SCHEMA_MIGRATION_REPORT");
    assert.equal(failure(other.value.validateSchemaMigrationImpactEvidence(report.value.evidence)), "INVALID_SCHEMA_MIGRATION_EVIDENCE");
    other.value.close();
    assert.equal(digest(store) === before, false);
  } finally { rmSync(database.directory, { recursive: true, force: true }); }
});
