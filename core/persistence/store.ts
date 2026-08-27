import { copyBytes, isDigest, type Digest } from "../foundation/index.js";

import type {
  CreateRevisionInput,
  PersistenceStore,
  RevisionIdentity,
  RevisionRecord,
  SchemaVersionIdentity,
  SchemaVersionRecord,
} from "./contracts.js";
import { validateCanonicalBytes } from "./canonical-bytes.js";
import { persistenceResultFailure } from "./failures.js";
import { sqliteFailureCode, type SqliteAdapter, type SqliteRow } from "./sqlite-adapter.js";

export function createPersistenceStore(database: SqliteAdapter): PersistenceStore {
  return {
    registerSchemaVersion(input) {
      if (!validSchemaIdentity(input.identity)) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
      const canonical = validateCanonicalBytes(input.schemaBytes, input.schemaDigest);
      if (!canonical.ok) return persistenceResultFailure(canonical.code);
      const bytes = copyBytes(canonical.bytes);
      try {
        return database.transaction(() => {
          const current = database.get("SELECT max(version) AS version FROM schema_versions WHERE schema_id = ?", input.identity.schemaId);
          const latest = nullablePositiveInteger(current?.version);
          const expected = latest === null ? 1 : latest + 1;
          if (input.identity.version !== expected) return persistenceResultFailure("SCHEMA_VERSION_CONFLICT");
          database.run(
            "INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)",
            input.identity.schemaId,
            input.identity.version,
            bytes,
            canonical.digest,
          );
          return { ok: true, value: schemaRecord(input.identity, bytes, canonical.digest) };
        });
      } catch (error) {
        const code = sqliteFailureCode(error);
        return persistenceResultFailure(code === "CONSTRAINT_VIOLATION" ? "SCHEMA_VERSION_CONFLICT" : code);
      }
    },

    getSchemaVersion(identity) {
      if (!validSchemaIdentity(identity)) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
      try {
        const row = database.get(
          "SELECT schema_bytes, schema_digest FROM schema_versions WHERE schema_id = ? AND version = ?",
          identity.schemaId,
          identity.version,
        );
        if (row === undefined) return persistenceResultFailure("SCHEMA_VERSION_NOT_FOUND");
        const bytes = byteField(row, "schema_bytes");
        const digest = digestField(row, "schema_digest");
        if (bytes === null || digest === null) return persistenceResultFailure("STORAGE_FAILURE");
        return { ok: true, value: schemaRecord(identity, bytes, digest) };
      } catch {
        return persistenceResultFailure("STORAGE_FAILURE");
      }
    },

    createRevision(input) {
      if (!validRevisionInput(input)) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
      const canonical = validateCanonicalBytes(input.contentBytes, input.contentDigest);
      if (!canonical.ok) return persistenceResultFailure(canonical.code);
      const bytes = copyBytes(canonical.bytes);
      try {
        return database.transaction(() => {
          const schema = database.get(
            "SELECT 1 AS found FROM schema_versions WHERE schema_id = ? AND version = ?",
            input.schemaIdentity.schemaId,
            input.schemaIdentity.version,
          );
          if (schema === undefined) return persistenceResultFailure("SCHEMA_VERSION_NOT_FOUND");
          const existing = database.get(
            "SELECT 1 AS found FROM revisions WHERE entry_id = ? AND revision_id = ?",
            input.identity.entryId,
            input.identity.revisionId,
          );
          if (existing !== undefined) return persistenceResultFailure("REVISION_CONFLICT");
          if (input.restoredFromRevisionId !== undefined) {
            const origin = database.get(
              "SELECT 1 AS found FROM revisions WHERE entry_id = ? AND revision_id = ?",
              input.identity.entryId,
              input.restoredFromRevisionId,
            );
            if (origin === undefined) return persistenceResultFailure("REVISION_NOT_FOUND");
          }
          database.run(
            "INSERT INTO revisions (entry_id, revision_id, schema_id, schema_version, content_bytes, content_digest, restored_from_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            input.identity.entryId,
            input.identity.revisionId,
            input.schemaIdentity.schemaId,
            input.schemaIdentity.version,
            bytes,
            canonical.digest,
            input.restoredFromRevisionId ?? null,
          );
          database.run(
            "INSERT INTO operation_lineage (entry_id, revision_id, operation_id, operation_kind) VALUES (?, ?, ?, ?)",
            input.identity.entryId,
            input.identity.revisionId,
            input.lineage.operationId,
            input.lineage.operationKind,
          );
          return { ok: true, value: revisionRecord(input, bytes, canonical.digest) };
        });
      } catch (error) {
        const code = sqliteFailureCode(error);
        return persistenceResultFailure(code === "CONSTRAINT_VIOLATION" ? "REVISION_CONFLICT" : code);
      }
    },

    getRevision(identity) {
      if (!validRevisionIdentity(identity)) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
      try {
        const row = database.get(
          "SELECT r.schema_id, r.schema_version, r.content_bytes, r.content_digest, r.restored_from_revision_id, l.operation_id, l.operation_kind FROM revisions r LEFT JOIN operation_lineage l ON l.entry_id = r.entry_id AND l.revision_id = r.revision_id WHERE r.entry_id = ? AND r.revision_id = ?",
          identity.entryId,
          identity.revisionId,
        );
        if (row === undefined) return persistenceResultFailure("REVISION_NOT_FOUND");
        const schemaId = stringField(row, "schema_id");
        const schemaVersion = nullablePositiveInteger(row.schema_version);
        const bytes = byteField(row, "content_bytes");
        const digest = digestField(row, "content_digest");
        const operationId = stringField(row, "operation_id");
        const operationKind = stringField(row, "operation_kind");
        const restored = nullableStringField(row, "restored_from_revision_id");
        if (
          schemaId === null ||
          schemaVersion === null ||
          bytes === null ||
          digest === null ||
          operationId === null ||
          operationKind === null ||
          restored === undefined
        ) {
          return persistenceResultFailure("STORAGE_FAILURE");
        }
        return {
          ok: true,
          value: revisionRecord(
            {
              identity,
              schemaIdentity: { schemaId, version: schemaVersion },
              contentBytes: bytes,
              contentDigest: digest,
              ...(restored === null ? {} : { restoredFromRevisionId: restored }),
              lineage: { operationId, operationKind },
            },
            bytes,
            digest,
          ),
        };
      } catch {
        return persistenceResultFailure("STORAGE_FAILURE");
      }
    },

    close() {
      database.close();
    },
  };
}

function validRevisionInput(input: CreateRevisionInput): boolean {
  return (
    validRevisionIdentity(input.identity) &&
    validSchemaIdentity(input.schemaIdentity) &&
    input.contentBytes instanceof Uint8Array &&
    typeof input.contentDigest === "string" &&
    validNonEmptyString(input.lineage.operationId) &&
    validNonEmptyString(input.lineage.operationKind) &&
    (input.restoredFromRevisionId === undefined || validNonEmptyString(input.restoredFromRevisionId))
  );
}

function validSchemaIdentity(identity: SchemaVersionIdentity): boolean {
  return validNonEmptyString(identity.schemaId) && Number.isSafeInteger(identity.version) && identity.version > 0;
}

function validRevisionIdentity(identity: RevisionIdentity): boolean {
  return validNonEmptyString(identity.entryId) && validNonEmptyString(identity.revisionId);
}

function validNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function schemaRecord(identity: SchemaVersionIdentity, bytes: Uint8Array, digest: Digest): SchemaVersionRecord {
  return {
    identity: { schemaId: identity.schemaId, version: identity.version },
    schemaBytes: copyBytes(bytes),
    schemaDigest: digest,
  };
}

function revisionRecord(input: CreateRevisionInput, bytes: Uint8Array, digest: Digest): RevisionRecord {
  return {
    identity: { entryId: input.identity.entryId, revisionId: input.identity.revisionId },
    schemaIdentity: { schemaId: input.schemaIdentity.schemaId, version: input.schemaIdentity.version },
    contentBytes: copyBytes(bytes),
    contentDigest: digest,
    ...(input.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: input.restoredFromRevisionId }),
    lineage: { operationId: input.lineage.operationId, operationKind: input.lineage.operationKind },
  };
}

function byteField(row: SqliteRow, key: string): Uint8Array | null {
  const value = row[key];
  return value instanceof Uint8Array ? copyBytes(value) : null;
}

function digestField(row: SqliteRow, key: string): Digest | null {
  const value = row[key];
  return typeof value === "string" && isDigest(value) ? value : null;
}

function stringField(row: SqliteRow, key: string): string | null {
  const value = row[key];
  return validNonEmptyString(value) ? value : null;
}

function nullableStringField(row: SqliteRow, key: string): string | null | undefined {
  const value = row[key];
  return value === null || typeof value === "string" ? value : undefined;
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
