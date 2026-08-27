import type { CommandRemediation, CoreResult, Digest, MessageRemediation } from "../foundation/index.js";

export type SchemaVersionIdentity = Readonly<{ schemaId: string; version: number }>;

export type SchemaVersionRecord = Readonly<{
  identity: SchemaVersionIdentity;
  schemaBytes: Uint8Array;
  schemaDigest: Digest;
}>;

export type RegisterSchemaVersionInput = Readonly<{
  identity: SchemaVersionIdentity;
  schemaBytes: Uint8Array;
  schemaDigest: Digest;
}>;

export type RevisionIdentity = Readonly<{ entryId: string; revisionId: string }>;

export type RevisionLineage = Readonly<{ operationId: string; operationKind: string }>;

export type RevisionRecord = Readonly<{
  identity: RevisionIdentity;
  schemaIdentity: SchemaVersionIdentity;
  contentBytes: Uint8Array;
  contentDigest: Digest;
  restoredFromRevisionId?: string;
  lineage: RevisionLineage;
}>;

export type CreateRevisionInput = Readonly<{
  identity: RevisionIdentity;
  schemaIdentity: SchemaVersionIdentity;
  contentBytes: Uint8Array;
  contentDigest: Digest;
  restoredFromRevisionId?: string;
  lineage: RevisionLineage;
}>;

export type MigrationSummary = Readonly<{
  appliedMigrationIds: readonly string[];
  currentMigrationId: string;
}>;

export type PersistenceFailureCode =
  | "INVALID_DATABASE_PATH"
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
  | "IMMUTABLE_SCHEMA_VERSION"
  | "IMMUTABLE_REVISION"
  | "CONSTRAINT_VIOLATION"
  | "STORAGE_FAILURE";

export type PersistenceFailure = Readonly<{
  code: PersistenceFailureCode;
  owner: "Persistence";
  subjectIds: readonly [];
  remediation: MessageRemediation | CommandRemediation;
}>;

export type PersistenceResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PersistenceFailure }>;

export interface PersistenceStore {
  registerSchemaVersion(input: RegisterSchemaVersionInput): PersistenceResult<SchemaVersionRecord>;
  getSchemaVersion(identity: SchemaVersionIdentity): PersistenceResult<SchemaVersionRecord>;
  createRevision(input: CreateRevisionInput): PersistenceResult<RevisionRecord>;
  getRevision(identity: RevisionIdentity): PersistenceResult<RevisionRecord>;
  close(): void;
}
