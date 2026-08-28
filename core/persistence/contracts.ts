import type { CommandRemediation, CoreResult, Digest, MessageRemediation } from "../foundation/index.js";

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

export type PersistenceFailureCode =
  | "INVALID_DATABASE_PATH" | "UNKNOWN_DATABASE" | "MIGRATION_HISTORY_MISMATCH" | "MIGRATION_FAILED"
  | "INVALID_PERSISTENCE_INPUT" | "NON_CANONICAL_BYTES" | "DIGEST_MISMATCH"
  | "SCHEMA_VERSION_CONFLICT" | "SCHEMA_VERSION_NOT_FOUND" | "REVISION_CONFLICT" | "REVISION_NOT_FOUND"
  | "ENTRY_POINTER_NOT_FOUND" | "OPERATION_LINEAGE_CONFLICT" | "ASSET_VERSION_NOT_FOUND" | "REVISION_REFERENCE_CONFLICT"
  | "MEDIA_IMPORT_CONFLICT" | "IMMUTABLE_SCHEMA_VERSION" | "IMMUTABLE_REVISION" | "CONSTRAINT_VIOLATION" | "STORAGE_FAILURE";
export type PersistenceFailure = Readonly<{ code: PersistenceFailureCode; owner: "Persistence"; subjectIds: readonly []; remediation: MessageRemediation | CommandRemediation }>;
export type PersistenceResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PersistenceFailure }>;

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
}
