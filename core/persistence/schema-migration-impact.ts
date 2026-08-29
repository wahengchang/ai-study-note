import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import type {
  PersistenceResult,
  RegisterSchemaVersionInput,
  RevisionIdentity,
  RevisionLineage,
  RevisionRecord,
  SchemaMigrationAffectedPointer,
  SchemaMigrationBlockedReason,
  SchemaMigrationBlockedRow,
  SchemaMigrationImpactEvidence,
  SchemaMigrationImpactReport,
  SchemaMigrationMapper,
  SchemaMigrationMapperInput,
  SchemaMigrationMappingRow,
  SchemaMigrationPointer,
  SchemaMigrationPointerPolicy,
  SchemaMigrationPointerPolicyInput,
  SchemaMigrationPreflightInput,
  SchemaMigrationValidationIssue,
  SchemaMigrationValidator,
  SchemaVersionIdentity,
  SchemaVersionRecord,
} from "./contracts.js";
import { validateCanonicalBytes } from "./canonical-bytes.js";
import { persistenceResultFailure } from "./failures.js";
import { plainRecord } from "./record-shape.js";
import type { SqliteAdapter, SqliteRow } from "./sqlite-adapter.js";

type NormalizedRequest = Readonly<{
  sourceSchemaIdentity: SchemaVersionIdentity;
  targetSchema: SchemaVersionRecord;
  pointerPolicies: readonly SchemaMigrationPointerPolicyInput[];
  mappingIdentity: Digest;
  mapper: SchemaMigrationMapper;
  validator: SchemaMigrationValidator;
}>;
type PointerRow = Readonly<{ entryId: string; currentRevisionId: string; publishedRevisionId?: string }>;
type ReferenceRow = Readonly<{ revision: RevisionIdentity; assetId: string; assetVersionId: string }>;
type SnapshotContent = "include" | "omit";
type RevisionSnapshot = Readonly<{
  identity: RevisionIdentity;
  schemaIdentity: SchemaVersionIdentity;
  contentDigest: Digest;
  restoredFromRevisionId?: string;
  lineage: RevisionLineage;
  contentBytes?: Uint8Array;
}>;
type LoadedRevision = RevisionSnapshot & Readonly<{ contentBytes: Uint8Array }>;
type Snapshot = Readonly<{
  sourceSchema: SchemaVersionRecord;
  targetSchema: SchemaVersionRecord;
  revisions: readonly RevisionSnapshot[];
  pointers: readonly PointerRow[];
  references: readonly ReferenceRow[];
  digest: Digest;
}>;
export type SchemaMigrationExecutionPlan = Readonly<{
  sourceSchemaIdentity: SchemaVersionIdentity;
  targetSchema: SchemaVersionRecord;
  mappingIdentity: Digest;
  scopedDigest: Digest;
  affectedPointers: readonly SchemaMigrationAffectedPointer[];
  mapped: readonly Readonly<{ sourceRevision: RevisionIdentity; contentBytes: Uint8Array; contentDigest: Digest }>[];
}>;
type InternalEvidence = Readonly<{
  plan: SchemaMigrationExecutionPlan;
  scopedDigest: Digest;
  status: "approvable" | "blocked";
}>;
type CallbackResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>;
type MapperOutcome = Readonly<{ kind: "mapped"; contentBytes: Uint8Array; contentDigest: Digest }> | Readonly<{ kind: "missing" }>;

const revisionsMetadataColumns = "r.entry_id,r.revision_id,r.content_digest,r.restored_from_revision_id,l.operation_id,l.operation_kind";
const revisionsFrom = "FROM revisions r JOIN operation_lineage l ON l.entry_id=r.entry_id AND l.revision_id=r.revision_id AND l.creates_revision=1 WHERE r.schema_id=? AND r.schema_version=?";
// staleness 重讀與 evidence 驗證只比對 digest，content bytes 不進記憶體。
const revisionsMetadataQuery = `SELECT ${revisionsMetadataColumns} ${revisionsFrom}`;
const revisionsWithContentQuery = `SELECT ${revisionsMetadataColumns},r.content_bytes ${revisionsFrom}`;
const pointerOrder: Readonly<Record<SchemaMigrationPointer, number>> = { current: 0, published: 1 };
const remediationMessages: Readonly<Record<SchemaMigrationBlockedReason["code"], string>> = {
  POINTER_POLICY_MISSING: "請為受影響 pointer 指定 move 或 pin policy。",
  MAPPING_NOT_PROVIDED: "請提供來源 Revision 的 schema migration mapping。",
  MISSING_REQUIRED_FIELD: "請補齊 target schema 要求的欄位。",
  INVALID_SELECT_MAPPING: "請修正 target schema 的 select mapping。",
  TARGET_SCHEMA_REJECTED: "請修正 target schema 拒絕的內容。",
};

export function createSchemaMigrationImpactAnalyzer(database: SqliteAdapter): Readonly<{
  preflight(input: SchemaMigrationPreflightInput): PersistenceResult<SchemaMigrationImpactReport>;
  validateEvidence(evidence: SchemaMigrationImpactEvidence): PersistenceResult<undefined>;
  readExecutionPlan(evidence: SchemaMigrationImpactEvidence): PersistenceResult<SchemaMigrationExecutionPlan>;
  releaseExecutionPlan(evidence: SchemaMigrationImpactEvidence): void;
  validateExecutionPlanInTransaction(plan: SchemaMigrationExecutionPlan): PersistenceResult<undefined>;
}> {
  const issued = new WeakMap<SchemaMigrationImpactEvidence, InternalEvidence>();

  const preflight = (input: SchemaMigrationPreflightInput): PersistenceResult<SchemaMigrationImpactReport> => {
    const targetInput = (input as Readonly<{ targetSchema?: unknown }>).targetSchema;
    if (registerSchemaInput(targetInput)) {
      const canonical = validateCanonicalBytes(targetInput.schemaBytes, targetInput.schemaDigest);
      if (!canonical.ok) return persistenceResultFailure(canonical.code);
    }
    const request = normalizeRequest(input);
    if (request === null) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const initial = snapshot(database, request.sourceSchemaIdentity, request.targetSchema, "include");
    if (!initial.ok) return initial;
    const policies = new Map(request.pointerPolicies.map((policy) => [policyKey(policy.entryId, policy.pointer), policy.policy]));
    const affectedPointers = affected(initial.value, request.targetSchema.identity, policies);
    const actualPolicies = new Set(affectedPointers.map((item) => policyKey(item.entryId, item.pointer)));
    if (request.pointerPolicies.some((policy) => !actualPolicies.has(policyKey(policy.entryId, policy.pointer)))) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_REQUEST");
    const pointerBlockedRows = affectedPointers.filter((item) => item.policy === "unassigned").map((item) => blockedPointer(item, "POINTER_POLICY_MISSING"));
    const moved = new Map<string, Readonly<{ revision: LoadedRevision; pointers: readonly SchemaMigrationAffectedPointer[] }>>();
    for (const item of affectedPointers) {
      if (item.policy !== "move") continue;
      const source = initial.value.revisions.find((revision) => revisionKey(revision.identity) === revisionKey({ entryId: item.entryId, revisionId: item.revisionId }));
      if (source === undefined || !loaded(source)) return persistenceResultFailure("STORAGE_FAILURE");
      const prior = moved.get(revisionKey(source.identity));
      moved.set(revisionKey(source.identity), Object.freeze({ revision: source, pointers: Object.freeze([...(prior?.pointers ?? []), item]) }));
    }
    const mapping: SchemaMigrationMappingRow[] = [];
    const mappingBlockedRows: SchemaMigrationBlockedRow[] = [];
    const mappedRows: Array<Readonly<{ sourceRevision: RevisionIdentity; contentBytes: Uint8Array; contentDigest: Digest }>> = [];
    for (const item of [...moved.values()].sort((left, right) => compareRevision(left.revision.identity, right.revision.identity))) {
      const mapped = runMapper(request.mapper, initial.value.sourceSchema, initial.value.targetSchema, item.revision);
      if (!mapped.ok) return persistenceResultFailure("SCHEMA_MIGRATION_MAPPING_FAILED");
      if (mapped.value.kind === "missing") {
        mapping.push(freezeMapping(item.revision.identity, request.targetSchema.identity, item.pointers, "blocked"));
        mappingBlockedRows.push(blockedMapping(item.revision.identity, [reason("MAPPING_NOT_PROVIDED")]));
        continue;
      }
      const validated = runValidator(request.validator, initial.value.targetSchema, mapped.value);
      if (!validated.ok) return persistenceResultFailure("SCHEMA_MIGRATION_VALIDATION_FAILED");
      if (validated.value.length > 0) {
        mapping.push(freezeMapping(item.revision.identity, request.targetSchema.identity, item.pointers, "blocked"));
        mappingBlockedRows.push(blockedMapping(item.revision.identity, validated.value.map((issue) => reason(issue.code, issue.schemaPath))));
        continue;
      }
      mapping.push(freezeMapping(item.revision.identity, request.targetSchema.identity, item.pointers, "validated"));
      mappedRows.push(Object.freeze({ sourceRevision: freezeRevisionIdentity(item.revision.identity), contentBytes: copyBytes(mapped.value.contentBytes), contentDigest: mapped.value.contentDigest }));
    }
    const current = snapshot(database, request.sourceSchemaIdentity, request.targetSchema, "omit");
    if (!current.ok) return current;
    if (current.value.digest !== initial.value.digest) return persistenceResultFailure("STALE_SCHEMA_MIGRATION_REPORT");
    const blockedRows = Object.freeze([...pointerBlockedRows, ...mappingBlockedRows].sort(compareBlocked));
    const status = blockedRows.length === 0 ? "approvable" as const : "blocked" as const;
    const evidence = Object.freeze({}) as SchemaMigrationImpactEvidence;
    const report = freezeReport({
      contract: "schema-migration-impact-report/v1", status, sourceSchemaIdentity: request.sourceSchemaIdentity,
      targetSchemaIdentity: request.targetSchema.identity, mappingIdentity: request.mappingIdentity, affectedPointers,
      historicalRevisions: initial.value.revisions.map((revision) => Object.freeze({ revision: freezeRevisionIdentity(revision.identity), disposition: "retained" as const })),
      mapping, blockedRows, evidence,
    });
    const plan = freezeExecutionPlan({
      sourceSchemaIdentity: request.sourceSchemaIdentity, targetSchema: request.targetSchema, mappingIdentity: request.mappingIdentity,
      scopedDigest: initial.value.digest, affectedPointers, mapped: mappedRows,
    });
    issued.set(evidence, Object.freeze({ plan, scopedDigest: initial.value.digest, status }));
    return Object.freeze({ ok: true, value: report });
  };

  const validateEvidence = (evidence: SchemaMigrationImpactEvidence): PersistenceResult<undefined> => {
    if (!isOpaqueEvidence(evidence)) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_EVIDENCE");
    const prior = issued.get(evidence);
    if (prior === undefined) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_EVIDENCE");
    const current = snapshot(database, prior.plan.sourceSchemaIdentity, prior.plan.targetSchema, "omit");
    if (!current.ok) return current.error.code === "SCHEMA_VERSION_CONFLICT" ? persistenceResultFailure("STALE_SCHEMA_MIGRATION_REPORT") : current;
    return current.value.digest === prior.scopedDigest ? Object.freeze({ ok: true, value: undefined }) : persistenceResultFailure("STALE_SCHEMA_MIGRATION_REPORT");
  };
  // evidence 只在「已 commit 的 execution」後失效：被拒絕或回滾的嘗試沒有寫入任何 row，
  // 燒掉 evidence 只會逼呼叫端重跑整個 preflight（含 mapper／validator）。
  const readExecutionPlan = (evidence: SchemaMigrationImpactEvidence): PersistenceResult<SchemaMigrationExecutionPlan> => {
    if (!isOpaqueEvidence(evidence)) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_EVIDENCE");
    const prior = issued.get(evidence);
    if (prior === undefined) return persistenceResultFailure("INVALID_SCHEMA_MIGRATION_EVIDENCE");
    return prior.status === "approvable"
      ? Object.freeze({ ok: true, value: prior.plan })
      : persistenceResultFailure("SCHEMA_MIGRATION_REPORT_NOT_APPROVABLE");
  };
  const releaseExecutionPlan = (evidence: SchemaMigrationImpactEvidence): void => {
    if (isOpaqueEvidence(evidence)) issued.delete(evidence);
  };
  const validateExecutionPlanInTransaction = (plan: SchemaMigrationExecutionPlan): PersistenceResult<undefined> => {
    const current = snapshot(database, plan.sourceSchemaIdentity, plan.targetSchema, "omit", true);
    if (!current.ok) return current.error.code === "SCHEMA_VERSION_CONFLICT" ? persistenceResultFailure("STALE_SCHEMA_MIGRATION_REPORT") : current;
    return current.value.digest === plan.scopedDigest ? Object.freeze({ ok: true, value: undefined }) : persistenceResultFailure("STALE_SCHEMA_MIGRATION_REPORT");
  };
  return Object.freeze({ preflight, validateEvidence, readExecutionPlan, releaseExecutionPlan, validateExecutionPlanInTransaction });
}

function normalizeRequest(input: unknown): NormalizedRequest | null {
  if (!plainRecord(input, ["sourceSchemaIdentity", "targetSchema", "pointerPolicies", "mappingIdentity", "mapper", "validator"])) return null;
  const sourceSchemaIdentity = input.sourceSchemaIdentity;
  const targetInput = input.targetSchema;
  if (!schemaIdentity(sourceSchemaIdentity) || !registerSchemaInput(targetInput) || sourceSchemaIdentity.schemaId !== targetInput.identity.schemaId || targetInput.identity.version <= sourceSchemaIdentity.version || !Array.isArray(input.pointerPolicies) || typeof input.mappingIdentity !== "string" || !isDigest(input.mappingIdentity) || !callback(input.mapper, "map") || !callback(input.validator, "validate")) return null;
  const canonical = validateCanonicalBytes(targetInput.schemaBytes, targetInput.schemaDigest);
  if (!canonical.ok) return null;
  const policies: SchemaMigrationPointerPolicyInput[] = [];
  const seen = new Set<string>();
  for (const item of input.pointerPolicies) {
    if (!plainRecord(item, ["entryId", "pointer", "policy"]) || !text(item.entryId) || (item.pointer !== "current" && item.pointer !== "published") || (item.policy !== "move" && item.policy !== "pin")) return null;
    const key = policyKey(item.entryId, item.pointer);
    if (seen.has(key)) return null;
    seen.add(key);
    policies.push(freezePolicy({ entryId: item.entryId, pointer: item.pointer, policy: item.policy }));
  }
  return Object.freeze({
    sourceSchemaIdentity: freezeSchemaIdentity(sourceSchemaIdentity),
    targetSchema: Object.freeze({ identity: freezeSchemaIdentity(targetInput.identity), schemaBytes: copyBytes(canonical.bytes), schemaDigest: canonical.digest }),
    pointerPolicies: Object.freeze(policies.sort(comparePolicy)),
    mappingIdentity: input.mappingIdentity,
    mapper: input.mapper as SchemaMigrationMapper,
    validator: input.validator as SchemaMigrationValidator,
  });
}

function snapshot(database: SqliteAdapter, sourceIdentity: SchemaVersionIdentity, targetSchema: SchemaVersionRecord, content: SnapshotContent, inTransaction = false): PersistenceResult<Snapshot> {
  try {
    const inspect = (): PersistenceResult<Snapshot> => {
      const sourceSchema = schema(database.get("SELECT schema_bytes, schema_digest FROM schema_versions WHERE schema_id=? AND version=?", sourceIdentity.schemaId, sourceIdentity.version), sourceIdentity);
      if (sourceSchema === null) return persistenceResultFailure("SCHEMA_MIGRATION_SOURCE_NOT_FOUND");
      const latest = positive(database.get("SELECT max(version) AS version FROM schema_versions WHERE schema_id=?", sourceIdentity.schemaId)?.version);
      const expected = latest === null ? 1 : latest + 1;
      if (targetSchema.identity.version !== expected) return persistenceResultFailure("SCHEMA_VERSION_CONFLICT");
      const revisions: RevisionSnapshot[] = [];
      for (const row of database.all(content === "include" ? revisionsWithContentQuery : revisionsMetadataQuery, sourceIdentity.schemaId, sourceIdentity.version)) {
        const record = revision(row, sourceIdentity, content);
        if (record === null) return persistenceResultFailure("STORAGE_FAILURE");
        revisions.push(record);
      }
      revisions.sort((left, right) => compareRevision(left.identity, right.identity));
      const keys = new Set(revisions.map((record) => revisionKey(record.identity)));
      const pointers: PointerRow[] = [];
      for (const row of database.all("SELECT entry_id,current_revision_id,published_revision_id FROM entry_pointers")) {
        const pointer = pointerRow(row);
        if (pointer === null) return persistenceResultFailure("STORAGE_FAILURE");
        if (keys.has(revisionKey({ entryId: pointer.entryId, revisionId: pointer.currentRevisionId })) || (pointer.publishedRevisionId !== undefined && keys.has(revisionKey({ entryId: pointer.entryId, revisionId: pointer.publishedRevisionId })))) pointers.push(pointer);
      }
      pointers.sort(comparePointerRow);
      const references: ReferenceRow[] = [];
      for (const row of database.all("SELECT rr.entry_id,rr.revision_id,rr.asset_id,rr.asset_version_id FROM revision_refs rr JOIN revisions r ON r.entry_id=rr.entry_id AND r.revision_id=rr.revision_id WHERE r.schema_id=? AND r.schema_version=?", sourceIdentity.schemaId, sourceIdentity.version)) {
        const reference = referenceRow(row);
        if (reference === null) return persistenceResultFailure("STORAGE_FAILURE");
        references.push(reference);
      }
      references.sort(compareReference);
      const metadata = canonicalJsonBytes({
        contract: "schema-migration-impact-state/v2",
        sourceSchema: { identity: sourceSchema.identity, digest: sourceSchema.schemaDigest },
        targetSchema: { identity: targetSchema.identity, digest: targetSchema.schemaDigest },
        revisions: revisions.map((record) => ({ identity: record.identity, schemaIdentity: record.schemaIdentity, contentDigest: record.contentDigest, ...(record.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: record.restoredFromRevisionId }), lineage: record.lineage })),
        pointers: pointers.map((pointer) => ({ entryId: pointer.entryId, currentRevisionId: pointer.currentRevisionId, ...(pointer.publishedRevisionId === undefined ? {} : { publishedRevisionId: pointer.publishedRevisionId }) })),
        references: references.map((reference) => ({ revision: reference.revision, assetId: reference.assetId, assetVersionId: reference.assetVersionId })),
      });
      if (!metadata.ok) return persistenceResultFailure("STORAGE_FAILURE");
      return Object.freeze({ ok: true, value: Object.freeze({ sourceSchema, targetSchema: callbackSchema(targetSchema), revisions: Object.freeze(revisions), pointers: Object.freeze(pointers), references: Object.freeze(references), digest: sha256Digest(metadata.value) }) });
    };
    return inTransaction ? inspect() : database.readTransaction(inspect);
  } catch {
    return persistenceResultFailure("STORAGE_FAILURE");
  }
}

function affected(snapshot: Snapshot, targetSchemaIdentity: SchemaVersionIdentity, policies: ReadonlyMap<string, SchemaMigrationPointerPolicy>): readonly SchemaMigrationAffectedPointer[] {
  const source = new Set(snapshot.revisions.map((item) => revisionKey(item.identity)));
  const values: SchemaMigrationAffectedPointer[] = [];
  for (const row of snapshot.pointers) {
    const pointers: readonly Readonly<{ pointer: SchemaMigrationPointer; revisionId: string }>[] = Object.freeze([
      { pointer: "current", revisionId: row.currentRevisionId },
      ...(row.publishedRevisionId === undefined ? [] : [{ pointer: "published" as const, revisionId: row.publishedRevisionId }]),
    ]);
    for (const item of pointers) {
      if (!source.has(revisionKey({ entryId: row.entryId, revisionId: item.revisionId }))) continue;
      values.push(freezeAffected({ entryId: row.entryId, pointer: item.pointer, revisionId: item.revisionId, targetSchemaIdentity, policy: policies.get(policyKey(row.entryId, item.pointer)) ?? "unassigned" }));
    }
  }
  return Object.freeze(values.sort(compareAffected));
}

function runMapper(mapper: SchemaMigrationMapper, sourceSchema: SchemaVersionRecord, targetSchema: SchemaVersionRecord, sourceRevision: LoadedRevision): CallbackResult<MapperOutcome> {
  let output: unknown;
  try { output = mapper.map(Object.freeze({ sourceSchema: callbackSchema(sourceSchema), targetSchema: callbackSchema(targetSchema), sourceRevision: callbackRevision(sourceRevision) }) as SchemaMigrationMapperInput); } catch { return Object.freeze({ ok: false }); }
  if (thenable(output)) return Object.freeze({ ok: false });
  if (plainDataRecord(output, ["ok", "code"]) && output.ok === false && output.code === "MAPPING_NOT_PROVIDED") return Object.freeze({ ok: true, value: Object.freeze({ kind: "missing" }) });
  if (!plainDataRecord(output, ["ok", "contentBytes", "contentDigest"]) || output.ok !== true || !(output.contentBytes instanceof Uint8Array) || typeof output.contentDigest !== "string" || !isDigest(output.contentDigest)) return Object.freeze({ ok: false });
  const bytes = copyBytes(output.contentBytes);
  const canonical = validateCanonicalBytes(bytes, output.contentDigest);
  if (!canonical.ok) return Object.freeze({ ok: false });
  return Object.freeze({ ok: true, value: Object.freeze({ kind: "mapped", contentBytes: copyBytes(canonical.bytes), contentDigest: canonical.digest }) });
}

function runValidator(validator: SchemaMigrationValidator, targetSchema: SchemaVersionRecord, mapped: Readonly<{ contentBytes: Uint8Array; contentDigest: Digest }>): CallbackResult<readonly SchemaMigrationValidationIssue[]> {
  let output: unknown;
  try { output = validator.validate(Object.freeze({ schema: callbackSchema(targetSchema), contentBytes: copyBytes(mapped.contentBytes), contentDigest: mapped.contentDigest })); } catch { return Object.freeze({ ok: false }); }
  if (thenable(output)) return Object.freeze({ ok: false });
  if (plainDataRecord(output, ["ok"]) && output.ok === true) return Object.freeze({ ok: true, value: Object.freeze([]) });
  if (!plainDataRecord(output, ["ok", "issues"]) || output.ok !== false || !Array.isArray(output.issues) || output.issues.length === 0) return Object.freeze({ ok: false });
  const issues: SchemaMigrationValidationIssue[] = [];
  for (const issue of output.issues) {
    if (!plainDataRecord(issue, ["code", "schemaPath"]) || (issue.code !== "MISSING_REQUIRED_FIELD" && issue.code !== "INVALID_SELECT_MAPPING" && issue.code !== "TARGET_SCHEMA_REJECTED") || !text(issue.schemaPath)) return Object.freeze({ ok: false });
    issues.push(Object.freeze({ code: issue.code, schemaPath: issue.schemaPath }));
  }
  return Object.freeze({ ok: true, value: Object.freeze(issues) });
}

function schema(row: SqliteRow | undefined, identity: SchemaVersionIdentity): SchemaVersionRecord | null {
  if (row === undefined || !(row.schema_bytes instanceof Uint8Array) || typeof row.schema_digest !== "string" || !isDigest(row.schema_digest)) return null;
  return Object.freeze({ identity: freezeSchemaIdentity(identity), schemaBytes: copyBytes(row.schema_bytes), schemaDigest: row.schema_digest });
}
function revision(row: SqliteRow, schemaIdentity: SchemaVersionIdentity, content: SnapshotContent): RevisionSnapshot | null {
  if (!text(row.entry_id) || !text(row.revision_id) || typeof row.content_digest !== "string" || !isDigest(row.content_digest) || !text(row.operation_id) || !text(row.operation_kind) || (row.restored_from_revision_id !== null && !text(row.restored_from_revision_id))) return null;
  if (content === "include" && !(row.content_bytes instanceof Uint8Array)) return null;
  return Object.freeze({ identity: freezeRevisionIdentity({ entryId: row.entry_id, revisionId: row.revision_id }), schemaIdentity: freezeSchemaIdentity(schemaIdentity), contentDigest: row.content_digest, ...(row.restored_from_revision_id === null ? {} : { restoredFromRevisionId: row.restored_from_revision_id }), lineage: Object.freeze({ operationId: row.operation_id, operationKind: row.operation_kind }), ...(content === "include" && row.content_bytes instanceof Uint8Array ? { contentBytes: copyBytes(row.content_bytes) } : {}) });
}
function loaded(value: RevisionSnapshot): value is LoadedRevision { return value.contentBytes !== undefined; }
function pointerRow(row: SqliteRow): PointerRow | null { if (!text(row.entry_id) || !text(row.current_revision_id) || (row.published_revision_id !== null && !text(row.published_revision_id))) return null; return Object.freeze({ entryId: row.entry_id, currentRevisionId: row.current_revision_id, ...(row.published_revision_id === null ? {} : { publishedRevisionId: row.published_revision_id }) }); }
function referenceRow(row: SqliteRow): ReferenceRow | null { if (!text(row.entry_id) || !text(row.revision_id) || !text(row.asset_id) || !text(row.asset_version_id)) return null; return Object.freeze({ revision: freezeRevisionIdentity({ entryId: row.entry_id, revisionId: row.revision_id }), assetId: row.asset_id, assetVersionId: row.asset_version_id }); }
function callbackSchema(value: SchemaVersionRecord): SchemaVersionRecord { return Object.freeze({ identity: freezeSchemaIdentity(value.identity), schemaBytes: copyBytes(value.schemaBytes), schemaDigest: value.schemaDigest }); }
function callbackRevision(value: LoadedRevision): RevisionRecord { return Object.freeze({ identity: freezeRevisionIdentity(value.identity), schemaIdentity: freezeSchemaIdentity(value.schemaIdentity), contentBytes: copyBytes(value.contentBytes), contentDigest: value.contentDigest, ...(value.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: value.restoredFromRevisionId }), lineage: Object.freeze({ ...value.lineage }) }); }
function reason(code: SchemaMigrationBlockedReason["code"], schemaPath?: string): SchemaMigrationBlockedReason { return Object.freeze({ code, remediation: Object.freeze({ kind: "message", message: remediationMessages[code] }), ...(schemaPath === undefined ? {} : { schemaPath }) }); }
function blockedPointer(value: SchemaMigrationAffectedPointer, code: "POINTER_POLICY_MISSING"): SchemaMigrationBlockedRow { return Object.freeze({ subject: Object.freeze({ kind: "pointer", entryId: value.entryId, pointer: value.pointer, revisionId: value.revisionId }), reasons: Object.freeze([reason(code)]) }); }
function blockedMapping(sourceRevision: RevisionIdentity, values: readonly SchemaMigrationBlockedReason[]): SchemaMigrationBlockedRow { return Object.freeze({ subject: Object.freeze({ kind: "mapping", sourceRevision: freezeRevisionIdentity(sourceRevision) }), reasons: Object.freeze([...values].sort(compareReason).filter((item, index, all) => index === 0 || item.code !== all[index - 1]!.code || item.schemaPath !== all[index - 1]!.schemaPath)) }); }
function freezeMapping(sourceRevision: RevisionIdentity, targetSchemaIdentity: SchemaVersionIdentity, affectedPointers: readonly SchemaMigrationAffectedPointer[], outcome: "validated" | "blocked"): SchemaMigrationMappingRow { return Object.freeze({ sourceRevision: freezeRevisionIdentity(sourceRevision), targetSchemaIdentity: freezeSchemaIdentity(targetSchemaIdentity), affectedPointers: Object.freeze([...affectedPointers].sort(compareAffected).map(freezeAffected)), outcome }); }
function freezeReport(value: Omit<SchemaMigrationImpactReport, "evidence"> & Readonly<{ evidence: SchemaMigrationImpactEvidence }>): SchemaMigrationImpactReport { return Object.freeze({ ...value, sourceSchemaIdentity: freezeSchemaIdentity(value.sourceSchemaIdentity), targetSchemaIdentity: freezeSchemaIdentity(value.targetSchemaIdentity), affectedPointers: Object.freeze(value.affectedPointers.map(freezeAffected).sort(compareAffected)), historicalRevisions: Object.freeze(value.historicalRevisions.map((item) => Object.freeze({ revision: freezeRevisionIdentity(item.revision), disposition: "retained" as const })).sort((left, right) => compareRevision(left.revision, right.revision))), mapping: Object.freeze(value.mapping.map((item) => freezeMapping(item.sourceRevision, item.targetSchemaIdentity, item.affectedPointers, item.outcome)).sort((left, right) => compareRevision(left.sourceRevision, right.sourceRevision))), blockedRows: Object.freeze([...value.blockedRows].sort(compareBlocked)), evidence: value.evidence }); }
function freezeAffected(value: SchemaMigrationAffectedPointer): SchemaMigrationAffectedPointer { return Object.freeze({ entryId: value.entryId, pointer: value.pointer, revisionId: value.revisionId, targetSchemaIdentity: freezeSchemaIdentity(value.targetSchemaIdentity), policy: value.policy }); }
function freezeSchemaIdentity(value: SchemaVersionIdentity): SchemaVersionIdentity { return Object.freeze({ schemaId: value.schemaId, version: value.version }); }
function freezeRevisionIdentity(value: RevisionIdentity): RevisionIdentity { return Object.freeze({ entryId: value.entryId, revisionId: value.revisionId }); }
function freezePolicy(value: SchemaMigrationPointerPolicyInput): SchemaMigrationPointerPolicyInput { return Object.freeze({ entryId: value.entryId, pointer: value.pointer, policy: value.policy }); }
function freezeExecutionPlan(value: SchemaMigrationExecutionPlan): SchemaMigrationExecutionPlan {
  return Object.freeze({
    sourceSchemaIdentity: freezeSchemaIdentity(value.sourceSchemaIdentity),
    targetSchema: callbackSchema(value.targetSchema),
    mappingIdentity: value.mappingIdentity,
    scopedDigest: value.scopedDigest,
    affectedPointers: Object.freeze(value.affectedPointers.map(freezeAffected).sort(compareAffected)),
    mapped: Object.freeze(value.mapped.map((item) => Object.freeze({ sourceRevision: freezeRevisionIdentity(item.sourceRevision), contentBytes: copyBytes(item.contentBytes), contentDigest: item.contentDigest })).sort((left, right) => compareRevision(left.sourceRevision, right.sourceRevision))),
  });
}
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareRevision(left: RevisionIdentity, right: RevisionIdentity): number { return compareCodeUnits(left.entryId, right.entryId) || compareCodeUnits(left.revisionId, right.revisionId); }
function comparePointerRow(left: PointerRow, right: PointerRow): number { return compareCodeUnits(left.entryId, right.entryId) || compareCodeUnits(left.currentRevisionId, right.currentRevisionId) || compareCodeUnits(left.publishedRevisionId ?? "", right.publishedRevisionId ?? ""); }
function compareAffected(left: SchemaMigrationAffectedPointer, right: SchemaMigrationAffectedPointer): number { return compareCodeUnits(left.entryId, right.entryId) || pointerOrder[left.pointer] - pointerOrder[right.pointer] || compareCodeUnits(left.revisionId, right.revisionId); }
function comparePolicy(left: SchemaMigrationPointerPolicyInput, right: SchemaMigrationPointerPolicyInput): number { return compareCodeUnits(left.entryId, right.entryId) || pointerOrder[left.pointer] - pointerOrder[right.pointer]; }
function compareReference(left: ReferenceRow, right: ReferenceRow): number { return compareRevision(left.revision, right.revision) || compareCodeUnits(left.assetId, right.assetId) || compareCodeUnits(left.assetVersionId, right.assetVersionId); }
function compareReason(left: SchemaMigrationBlockedReason, right: SchemaMigrationBlockedReason): number { return compareCodeUnits(left.code, right.code) || compareCodeUnits(left.schemaPath ?? "", right.schemaPath ?? ""); }
function compareBlocked(left: SchemaMigrationBlockedRow, right: SchemaMigrationBlockedRow): number { const leftIdentity = left.subject.kind === "pointer" ? { entryId: left.subject.entryId, revisionId: left.subject.revisionId } : left.subject.sourceRevision; const rightIdentity = right.subject.kind === "pointer" ? { entryId: right.subject.entryId, revisionId: right.subject.revisionId } : right.subject.sourceRevision; return compareRevision(leftIdentity, rightIdentity) || (left.subject.kind === "pointer" && right.subject.kind === "pointer" ? pointerOrder[left.subject.pointer] - pointerOrder[right.subject.pointer] : left.subject.kind === "pointer" ? -1 : right.subject.kind === "pointer" ? 1 : 0); }
function policyKey(entryId: string, pointer: SchemaMigrationPointer): string { return `${entryId}\u0000${pointer}`; }
function revisionKey(value: RevisionIdentity): string { return `${value.entryId}\u0000${value.revisionId}`; }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function positive(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null; }
function schemaIdentity(value: unknown): value is SchemaVersionIdentity { return plainRecord(value, ["schemaId", "version"]) && text(value.schemaId) && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 0; }
function registerSchemaInput(value: unknown): value is RegisterSchemaVersionInput {
  return plainRecord(value, ["identity", "schemaBytes", "schemaDigest"])
    && schemaIdentity(value.identity) && value.schemaBytes instanceof Uint8Array
    && typeof value.schemaDigest === "string" && isDigest(value.schemaDigest);
}
function callback(value: unknown, name: "map" | "validate"): boolean { try { return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as Record<string, unknown>)[name] === "function"; } catch { return false; } }
function thenable(value: unknown): boolean { try { return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function"; } catch { return true; } }
function isOpaqueEvidence(value: unknown): value is SchemaMigrationImpactEvidence { try { return value !== null && typeof value === "object" && Object.isFrozen(value); } catch { return false; } }
function plainDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> { if (!plainRecord(value, keys)) return false; try { structuredClone(value); return true; } catch { return false; } }
