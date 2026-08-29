import { isDigest } from "../foundation/index.js";
import type {
  PersistenceResult,
  PersistenceTransaction,
  RevisionIdentity,
  SchemaMigrationExecutionPointerRecord,
  SchemaMigrationExecutionRecord,
  SchemaMigrationExecutionReplacementRecord,
  SchemaMigrationPointer,
} from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import type { SchemaMigrationExecutionPlan } from "./schema-migration-impact.js";
import type { SqliteAdapter, SqliteRow } from "./sqlite-adapter.js";

export type NormalizedSchemaMigrationExecution = Readonly<{
  operationId: string;
  replacements: readonly Readonly<{ sourceRevision: RevisionIdentity; replacementRevisionId: string }> [];
}>;

export function normalizeSchemaMigrationExecution(input: unknown, plan: SchemaMigrationExecutionPlan): PersistenceResult<NormalizedSchemaMigrationExecution> {
  if (!plainRecord(input, ["evidence", "operationId", "replacements"]) || !text(input.operationId) || input.operationId.includes("\0") || !Array.isArray(input.replacements)) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
  const expected = plan.mapped.map((item) => item.sourceRevision).sort(compareRevision);
  const replacements: Array<Readonly<{ sourceRevision: RevisionIdentity; replacementRevisionId: string }>> = [];
  const seen = new Set<string>();
  for (const item of input.replacements) {
    if (!plainRecord(item, ["sourceRevision", "replacementRevisionId"]) || !revisionIdentity(item.sourceRevision) || !text(item.replacementRevisionId) || item.replacementRevisionId.includes("\0")) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const key = revisionKey(item.sourceRevision);
    if (seen.has(key)) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    seen.add(key);
    replacements.push(Object.freeze({ sourceRevision: freezeRevisionIdentity(item.sourceRevision), replacementRevisionId: item.replacementRevisionId }));
  }
  replacements.sort((left, right) => compareRevision(left.sourceRevision, right.sourceRevision));
  if (replacements.length !== expected.length || replacements.some((item, index) => revisionKey(item.sourceRevision) !== revisionKey(expected[index]!))) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
  return Object.freeze({ ok: true, value: Object.freeze({ operationId: input.operationId, replacements: Object.freeze(replacements) }) });
}

export function executeSchemaMigrationInTransaction(
  database: SqliteAdapter,
  transaction: PersistenceTransaction,
  plan: SchemaMigrationExecutionPlan,
  input: NormalizedSchemaMigrationExecution,
  validatePlan: (plan: SchemaMigrationExecutionPlan) => PersistenceResult<undefined>,
): PersistenceResult<SchemaMigrationExecutionRecord> {
  const fresh = validatePlan(plan);
  if (!fresh.ok) return fresh;
  if (database.get("SELECT 1 FROM schema_migration_executions WHERE operation_id=?", input.operationId) !== undefined || database.get("SELECT 1 FROM operation_lineage WHERE operation_id=? LIMIT 1", input.operationId) !== undefined) return persistenceResultFailure("OPERATION_LINEAGE_CONFLICT");
  for (const replacement of input.replacements) {
    if (database.get("SELECT 1 FROM revisions WHERE entry_id=? AND revision_id=?", replacement.sourceRevision.entryId, replacement.replacementRevisionId) !== undefined) return persistenceResultFailure("REVISION_CONFLICT");
  }
  const target = transaction.registerSchemaVersion({ identity: plan.targetSchema.identity, schemaBytes: plan.targetSchema.schemaBytes, schemaDigest: plan.targetSchema.schemaDigest });
  if (!target.ok) return target;
  database.run("INSERT INTO schema_migration_executions (operation_id,source_schema_id,source_schema_version,target_schema_id,target_schema_version,mapping_identity) VALUES (?,?,?,?,?,?)", input.operationId, plan.sourceSchemaIdentity.schemaId, plan.sourceSchemaIdentity.version, plan.targetSchema.identity.schemaId, plan.targetSchema.identity.version, plan.mappingIdentity);
  const mapped = new Map(plan.mapped.map((item) => [revisionKey(item.sourceRevision), item]));
  const replacementBySource = new Map(input.replacements.map((item) => [revisionKey(item.sourceRevision), item.replacementRevisionId]));
  const replacementRecords: SchemaMigrationExecutionReplacementRecord[] = [];
  for (const replacement of input.replacements) {
    const content = mapped.get(revisionKey(replacement.sourceRevision));
    if (content === undefined) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const refs = transaction.getRevisionReferences(replacement.sourceRevision);
    if (!refs.ok) return refs;
    const created = transaction.createRevisionWithReferences({
      revision: {
        identity: { entryId: replacement.sourceRevision.entryId, revisionId: replacement.replacementRevisionId },
        schemaIdentity: plan.targetSchema.identity,
        contentBytes: content.contentBytes,
        contentDigest: content.contentDigest,
        lineage: { operationId: input.operationId, operationKind: "SchemaMigration" },
      },
      assetVersions: refs.value.map((reference) => reference.assetVersion),
    });
    if (!created.ok) return created;
    database.run("INSERT INTO schema_migration_revision_lineage (operation_id,entry_id,source_revision_id,replacement_revision_id) VALUES (?,?,?,?)", input.operationId, replacement.sourceRevision.entryId, replacement.sourceRevision.revisionId, replacement.replacementRevisionId);
    replacementRecords.push(Object.freeze({ sourceRevision: freezeRevisionIdentity(replacement.sourceRevision), replacementRevision: Object.freeze({ entryId: replacement.sourceRevision.entryId, revisionId: replacement.replacementRevisionId }) }));
  }
  const pointers: SchemaMigrationExecutionPointerRecord[] = [];
  const entryUpdates = new Map<string, Readonly<{ currentRevisionId: string; publishedRevisionId?: string; anchors: readonly string[] }>>();
  for (const affected of plan.affectedPointers) {
    if (affected.policy !== "move" && affected.policy !== "pin") return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const replacementRevisionId = affected.policy === "move" ? replacementBySource.get(revisionKey({ entryId: affected.entryId, revisionId: affected.revisionId })) : undefined;
    if (affected.policy === "move" && replacementRevisionId === undefined) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const resultRevisionId = replacementRevisionId ?? affected.revisionId;
    database.run("INSERT INTO schema_migration_pointer_lineage (operation_id,entry_id,pointer,source_revision_id,policy,result_revision_id,replacement_revision_id) VALUES (?,?,?,?,?,?,?)", input.operationId, affected.entryId, affected.pointer, affected.revisionId, affected.policy, resultRevisionId, replacementRevisionId ?? null);
    pointers.push(Object.freeze({ entryId: affected.entryId, pointer: affected.pointer, sourceRevisionId: affected.revisionId, policy: affected.policy, resultRevisionId }));
    let existing = entryUpdates.get(affected.entryId);
    if (existing === undefined) {
      const current = transaction.getEntryPointers(affected.entryId);
      if (!current.ok) return current;
      existing = Object.freeze({ currentRevisionId: current.value.currentRevisionId, ...(current.value.publishedRevisionId === undefined ? {} : { publishedRevisionId: current.value.publishedRevisionId }), anchors: Object.freeze([]) });
    }
    const anchors = new Set(existing.anchors);
    anchors.add(affected.policy === "move" ? resultRevisionId : affected.revisionId);
    entryUpdates.set(affected.entryId, Object.freeze({ currentRevisionId: affected.pointer === "current" ? resultRevisionId : existing.currentRevisionId, ...(affected.pointer === "published" ? { publishedRevisionId: resultRevisionId } : existing.publishedRevisionId === undefined ? {} : { publishedRevisionId: existing.publishedRevisionId }), anchors: Object.freeze([...anchors]) }));
  }
  for (const [entryId, update] of entryUpdates) {
    for (const anchorRevisionId of update.anchors) {
      const updated = transaction.setEntryPointers({ entryId, currentRevisionId: update.currentRevisionId, ...(update.publishedRevisionId === undefined ? {} : { publishedRevisionId: update.publishedRevisionId }), lineage: { revisionId: anchorRevisionId, operationId: input.operationId, operationKind: "SchemaMigration" } });
      if (!updated.ok) return updated;
    }
  }
  return Object.freeze({ ok: true, value: freezeExecutionRecord({ contract: "schema-migration-execution/v1", operationId: input.operationId, operationKind: "SchemaMigration", sourceSchemaIdentity: plan.sourceSchemaIdentity, targetSchemaIdentity: plan.targetSchema.identity, mappingIdentity: plan.mappingIdentity, replacements: replacementRecords, pointers }) });
}

export function getSchemaMigrationExecution(database: SqliteAdapter, operationId: string): PersistenceResult<SchemaMigrationExecutionRecord> {
  if (!text(operationId) || operationId.includes("\0")) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
  try {
    const header = database.get("SELECT source_schema_id,source_schema_version,target_schema_id,target_schema_version,mapping_identity FROM schema_migration_executions WHERE operation_id=?", operationId);
    if (header === undefined) return persistenceResultFailure("SCHEMA_MIGRATION_EXECUTION_NOT_FOUND");
    const sourceSchemaId = textField(header, "source_schema_id"), sourceSchemaVersion = positive(header.source_schema_version), targetSchemaId = textField(header, "target_schema_id"), targetSchemaVersion = positive(header.target_schema_version), mappingIdentity = textField(header, "mapping_identity");
    if (sourceSchemaId === null || sourceSchemaVersion === null || targetSchemaId === null || targetSchemaVersion === null || mappingIdentity === null || !isDigest(mappingIdentity)) return persistenceResultFailure("STORAGE_FAILURE");
    const replacements: SchemaMigrationExecutionReplacementRecord[] = [];
    for (const row of database.all("SELECT entry_id,source_revision_id,replacement_revision_id FROM schema_migration_revision_lineage WHERE operation_id=? ORDER BY entry_id,source_revision_id", operationId)) {
      const entryId = textField(row, "entry_id"), sourceRevisionId = textField(row, "source_revision_id"), replacementRevisionId = textField(row, "replacement_revision_id");
      if (entryId === null || sourceRevisionId === null || replacementRevisionId === null) return persistenceResultFailure("STORAGE_FAILURE");
      replacements.push(Object.freeze({ sourceRevision: Object.freeze({ entryId, revisionId: sourceRevisionId }), replacementRevision: Object.freeze({ entryId, revisionId: replacementRevisionId }) }));
    }
    const pointers: SchemaMigrationExecutionPointerRecord[] = [];
    for (const row of database.all("SELECT entry_id,pointer,source_revision_id,policy,result_revision_id FROM schema_migration_pointer_lineage WHERE operation_id=? ORDER BY entry_id, CASE pointer WHEN 'current' THEN 0 ELSE 1 END", operationId)) {
      const entryId = textField(row, "entry_id"), pointer = row.pointer, sourceRevisionId = textField(row, "source_revision_id"), policy = row.policy, resultRevisionId = textField(row, "result_revision_id");
      if (entryId === null || (pointer !== "current" && pointer !== "published") || sourceRevisionId === null || (policy !== "move" && policy !== "pin") || resultRevisionId === null) return persistenceResultFailure("STORAGE_FAILURE");
      pointers.push(Object.freeze({ entryId, pointer, sourceRevisionId, policy, resultRevisionId }));
    }
    return Object.freeze({ ok: true, value: freezeExecutionRecord({ contract: "schema-migration-execution/v1", operationId, operationKind: "SchemaMigration", sourceSchemaIdentity: { schemaId: sourceSchemaId, version: sourceSchemaVersion }, targetSchemaIdentity: { schemaId: targetSchemaId, version: targetSchemaVersion }, mappingIdentity, replacements, pointers }) });
  } catch {
    return persistenceResultFailure("STORAGE_FAILURE");
  }
}

function freezeExecutionRecord(value: SchemaMigrationExecutionRecord): SchemaMigrationExecutionRecord {
  return Object.freeze({ ...value, sourceSchemaIdentity: Object.freeze({ ...value.sourceSchemaIdentity }), targetSchemaIdentity: Object.freeze({ ...value.targetSchemaIdentity }), replacements: Object.freeze(value.replacements.map((item) => Object.freeze({ sourceRevision: Object.freeze({ ...item.sourceRevision }), replacementRevision: Object.freeze({ ...item.replacementRevision }) })).sort((left, right) => compareRevision(left.sourceRevision, right.sourceRevision))), pointers: Object.freeze(value.pointers.map((item) => Object.freeze({ ...item })).sort((left, right) => compareCodeUnits(left.entryId, right.entryId) || pointerOrder[left.pointer] - pointerOrder[right.pointer])) });
}
const pointerOrder: Readonly<Record<SchemaMigrationPointer, number>> = { current: 0, published: 1 };
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareRevision(left: RevisionIdentity, right: RevisionIdentity): number { return compareCodeUnits(left.entryId, right.entryId) || compareCodeUnits(left.revisionId, right.revisionId); }
function revisionKey(value: RevisionIdentity): string { return `${value.entryId}\u0000${value.revisionId}`; }
function freezeRevisionIdentity(value: RevisionIdentity): RevisionIdentity { return Object.freeze({ entryId: value.entryId, revisionId: value.revisionId }); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function positive(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null; }
function textField(row: SqliteRow, key: string): string | null { const value = row[key]; return text(value) ? value : null; }
function revisionIdentity(value: unknown): value is RevisionIdentity { return plainRecord(value, ["entryId", "revisionId"]) && text(value.entryId) && !value.entryId.includes("\0") && text(value.revisionId) && !value.revisionId.includes("\0"); }
function plainRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> { if (value === null || typeof value !== "object" || Array.isArray(value)) return false; try { const descriptors = Object.getOwnPropertyDescriptors(value); const actual = Reflect.ownKeys(descriptors); return Object.getPrototypeOf(value) === Object.prototype && actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key)) && keys.every((key) => { const descriptor = descriptors[key]; return descriptor !== undefined && "value" in descriptor && descriptor.enumerable && descriptor.configurable && descriptor.writable; }); } catch { return false; } }
