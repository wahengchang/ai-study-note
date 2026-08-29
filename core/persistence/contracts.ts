import type { CommandRemediation, Digest, MessageRemediation } from "../foundation/index.js";

export type SchemaVersionIdentity = Readonly<{ schemaId: string; version: number }>;
export type SchemaVersionRecord = Readonly<{ identity: SchemaVersionIdentity; schemaBytes: Uint8Array; schemaDigest: Digest }>;
export type RegisterSchemaVersionInput = Readonly<{ identity: SchemaVersionIdentity; schemaBytes: Uint8Array; schemaDigest: Digest }>;
export type RevisionIdentity = Readonly<{ entryId: string; revisionId: string }>;
export type RevisionLineage = Readonly<{ operationId: string; operationKind: string }>;
export type RevisionRecord = Readonly<{ identity: RevisionIdentity; schemaIdentity: SchemaVersionIdentity; contentBytes: Uint8Array; contentDigest: Digest; restoredFromRevisionId?: string; lineage: RevisionLineage }>;
export type CreateRevisionInput = Readonly<{ identity: RevisionIdentity; schemaIdentity: SchemaVersionIdentity; contentBytes: Uint8Array; contentDigest: Digest; restoredFromRevisionId?: string; lineage: RevisionLineage }>;
export type AssetVersionIdentity = Readonly<{ assetId: string; assetVersionId: string }>;
export type RevisionReferenceRecord = Readonly<{ revision: RevisionIdentity; assetVersion: AssetVersionIdentity }>;
export type CreateRevisionWithReferencesInput = Readonly<{ revision: CreateRevisionInput; assetVersions: readonly AssetVersionIdentity[] }>;

export type OperationLineageIdentity = Readonly<{ entryId: string; revisionId: string; operationId: string }>;
export type OperationLineageRecord = Readonly<OperationLineageIdentity & { operationKind: string; createsRevision: boolean }>;
export type EntryPointerRecord = Readonly<{ entryId: string; currentRevisionId: string; publishedRevisionId?: string }>;
export type SetEntryPointersInput = Readonly<EntryPointerRecord & { lineage: Readonly<{ revisionId: string; operationId: string; operationKind: string }> }>;
export type EntryPointerLineageRecord = Readonly<EntryPointerRecord & { lineageIdentity: OperationLineageIdentity }>;
export type RouteClaimRecord = Readonly<{ graph: "current" | "published"; normalizedRoute: string; owner: string; sourceRevisionId: string }>;
export type MediaImportIntent = Readonly<{ importId: string; identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest }>;
export type ReadyAssetVersionRecord = Readonly<{ identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest; availability: "ready" }>;
export type PluginActivationStateRecord = Readonly<{ bytes: Uint8Array; digest: Digest }>;
export type CompareAndReplacePluginActivationStateInput = Readonly<{ expectedDigest: Digest; next: PluginActivationStateRecord }>;

export type PersistenceCanonicalState = Readonly<{
  contract: "persistence-canonical-state/v1";
  bytes: Uint8Array;
  digest: Digest;
  counts: Readonly<{ schemaVersions: number; revisions: number; operationLineage: number; entryPointers: number; entryPointerLineage: number; routeClaims: number; mediaImportIntents: number; mediaObjects: number; mediaAssets: number; assetVersions: number; revisionReferences: number }>;
}>;
export type TransactionDecision<T, E> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;
export type MigrationSummary = Readonly<{ appliedMigrationIds: readonly string[]; currentMigrationId: string }>;

export type SchemaMigrationPointer = "current" | "published";
export type SchemaMigrationPointerPolicy = "move" | "pin";
export type SchemaMigrationPointerPolicyInput = Readonly<{ entryId: string; pointer: SchemaMigrationPointer; policy: SchemaMigrationPointerPolicy }>;
export type SchemaMigrationMapperInput = Readonly<{ sourceSchema: SchemaVersionRecord; targetSchema: SchemaVersionRecord; sourceRevision: RevisionRecord }>;
export interface SchemaMigrationMapper {
  map(input: SchemaMigrationMapperInput): Readonly<{ ok: true; contentBytes: Uint8Array; contentDigest: Digest }> | Readonly<{ ok: false; code: "MAPPING_NOT_PROVIDED" }>;
}
export type SchemaMigrationValidationIssue = Readonly<{ code: "MISSING_REQUIRED_FIELD" | "INVALID_SELECT_MAPPING" | "TARGET_SCHEMA_REJECTED"; schemaPath: string }>;
export interface SchemaMigrationValidator {
  validate(input: Readonly<{ schema: SchemaVersionRecord; contentBytes: Uint8Array; contentDigest: Digest }>): Readonly<{ ok: true }> | Readonly<{ ok: false; issues: readonly SchemaMigrationValidationIssue[] }>;
}
export type SchemaMigrationPreflightInput = Readonly<{
  sourceSchemaIdentity: SchemaVersionIdentity;
  targetSchemaIdentity: SchemaVersionIdentity;
  pointerPolicies: readonly SchemaMigrationPointerPolicyInput[];
  mappingIdentity: Digest;
  mapper: SchemaMigrationMapper;
  validator: SchemaMigrationValidator;
}>;
export type SchemaMigrationImpactEvidence = Readonly<{ readonly __schemaMigrationImpactEvidence: unique symbol }>;
export type SchemaMigrationAffectedPointer = Readonly<{
  entryId: string;
  pointer: SchemaMigrationPointer;
  revisionId: string;
  targetSchemaIdentity: SchemaVersionIdentity;
  policy: SchemaMigrationPointerPolicy | "unassigned";
}>;
export type SchemaMigrationHistoricalRevision = Readonly<{ revision: RevisionIdentity; disposition: "retained" }>;
export type SchemaMigrationMappingRow = Readonly<{
  sourceRevision: RevisionIdentity;
  targetSchemaIdentity: SchemaVersionIdentity;
  affectedPointers: readonly SchemaMigrationAffectedPointer[];
  outcome: "validated" | "blocked";
}>;
export type SchemaMigrationBlockedReason = Readonly<{
  code: "POINTER_POLICY_MISSING" | "MAPPING_NOT_PROVIDED" | "MISSING_REQUIRED_FIELD" | "INVALID_SELECT_MAPPING" | "TARGET_SCHEMA_REJECTED";
  remediation: MessageRemediation;
  schemaPath?: string;
}>;
export type SchemaMigrationBlockedRow = Readonly<{
  subject: Readonly<{ kind: "pointer"; entryId: string; pointer: SchemaMigrationPointer; revisionId: string }> | Readonly<{ kind: "mapping"; sourceRevision: RevisionIdentity }>;
  reasons: readonly SchemaMigrationBlockedReason[];
}>;
export type SchemaMigrationImpactReport = Readonly<{
  contract: "schema-migration-impact-report/v1";
  status: "approvable" | "blocked";
  sourceSchemaIdentity: SchemaVersionIdentity;
  targetSchemaIdentity: SchemaVersionIdentity;
  mappingIdentity: Digest;
  affectedPointers: readonly SchemaMigrationAffectedPointer[];
  historicalRevisions: readonly SchemaMigrationHistoricalRevision[];
  mapping: readonly SchemaMigrationMappingRow[];
  blockedRows: readonly SchemaMigrationBlockedRow[];
  evidence: SchemaMigrationImpactEvidence;
}>;

export type PersistenceFailureCode =
  | "INVALID_DATABASE_PATH"
  | "DATABASE_UNAVAILABLE"
  | "UNKNOWN_DATABASE"
  | "MIGRATION_HISTORY_MISMATCH"
  | "MIGRATION_FAILED"
  | "INVALID_PERSISTENCE_INPUT"
  | "NON_CANONICAL_BYTES"
  | "DIGEST_MISMATCH"
  | "SCHEMA_VERSION_CONFLICT"
  | "SCHEMA_VERSION_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "REVISION_NOT_FOUND"
  | "ENTRY_POINTER_NOT_FOUND"
  | "OPERATION_LINEAGE_CONFLICT"
  | "ASSET_VERSION_NOT_FOUND"
  | "REVISION_REFERENCE_CONFLICT"
  | "MEDIA_IMPORT_CONFLICT"
  | "IMMUTABLE_SCHEMA_VERSION"
  | "IMMUTABLE_REVISION"
  | "CONSTRAINT_VIOLATION"
  | "INVALID_SCHEMA_MIGRATION_REQUEST"
  | "SCHEMA_MIGRATION_SOURCE_NOT_FOUND"
  | "SCHEMA_MIGRATION_TARGET_NOT_FOUND"
  | "SCHEMA_MIGRATION_MAPPING_FAILED"
  | "SCHEMA_MIGRATION_VALIDATION_FAILED"
  | "INVALID_SCHEMA_MIGRATION_EVIDENCE"
  | "STALE_SCHEMA_MIGRATION_REPORT"
  | "STORAGE_FAILURE";

export type PersistenceFailure = Readonly<{
  code: PersistenceFailureCode;
  owner: "Persistence";
  subjectIds: readonly [];
  remediation: MessageRemediation | CommandRemediation;
}>;

// 刻意不沿用 CoreResult：Persistence 永遠不回傳 CoreFailure，聯集會讓 caller 被迫處理
// `owner: "CoreFoundation"` 這種不可能出現的 failure。
export type PersistenceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: PersistenceFailure }>;

export interface PersistenceTransaction {
  registerSchemaVersion(input: RegisterSchemaVersionInput): PersistenceResult<SchemaVersionRecord>;
  getSchemaVersion(identity: SchemaVersionIdentity): PersistenceResult<SchemaVersionRecord>;
  createRevision(input: CreateRevisionInput): PersistenceResult<RevisionRecord>;
  getRevision(identity: RevisionIdentity): PersistenceResult<RevisionRecord>;
  getEntryPointers(entryId: string): PersistenceResult<EntryPointerRecord>;
  setEntryPointers(input: SetEntryPointersInput): PersistenceResult<EntryPointerRecord>;
  getOperationLineage(identity: OperationLineageIdentity): PersistenceResult<OperationLineageRecord>;
  getEntryPointerLineage(identity: OperationLineageIdentity): PersistenceResult<EntryPointerLineageRecord>;
  listRouteClaims(graph: "current" | "published"): PersistenceResult<readonly RouteClaimRecord[]>;
  replaceRouteClaim(input: RouteClaimRecord): PersistenceResult<RouteClaimRecord>;
  createMediaImportIntent(input: MediaImportIntent): PersistenceResult<MediaImportIntent>;
  getMediaImportIntent(importId: string): PersistenceResult<MediaImportIntent>;
  commitReadyAssetVersion(input: MediaImportIntent): PersistenceResult<ReadyAssetVersionRecord>;
  getReadyAssetVersion(identity: AssetVersionIdentity): PersistenceResult<ReadyAssetVersionRecord>;
  createRevisionReferences(revision: RevisionIdentity, assetVersions: readonly AssetVersionIdentity[]): PersistenceResult<readonly RevisionReferenceRecord[]>;
  getRevisionReferences(revision: RevisionIdentity): PersistenceResult<readonly RevisionReferenceRecord[]>;
  createRevisionWithReferences(input: CreateRevisionWithReferencesInput): PersistenceResult<Readonly<{ revision: RevisionRecord; references: readonly RevisionReferenceRecord[] }>>;
  canonicalState(): PersistenceResult<PersistenceCanonicalState>;
}

export interface PersistenceStore extends PersistenceTransaction {
  readPluginActivationState(): PersistenceResult<PluginActivationStateRecord>;
  compareAndReplacePluginActivationState(input: CompareAndReplacePluginActivationStateInput): PersistenceResult<boolean>;
  runTransaction<T, E>(operation: (transaction: PersistenceTransaction) => TransactionDecision<T, E>): TransactionDecision<T, E | PersistenceFailure>;
  close(): void;
  preflightSchemaMigration(input: SchemaMigrationPreflightInput): PersistenceResult<SchemaMigrationImpactReport>;
  validateSchemaMigrationImpactEvidence(evidence: SchemaMigrationImpactEvidence): PersistenceResult<undefined>;
}
