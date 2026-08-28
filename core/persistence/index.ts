import type { MigrationSummary, PersistenceResult, PersistenceStore } from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import { migrateDatabaseWithSources, openCurrentDatabase, shippedMigrationSources } from "./migrations.js";
import { createPersistenceStore } from "./store.js";

export type {
  AssetVersionIdentity,
  CreateRevisionInput,
  CreateRevisionWithReferencesInput,
  EntryPointerLineageRecord,
  EntryPointerRecord,
  MediaImportIntent,
  MigrationSummary,
  OperationLineageIdentity,
  OperationLineageRecord,
  PersistenceCanonicalState,
  PersistenceFailure,
  PersistenceFailureCode,
  PersistenceResult,
  PersistenceStore,
  PersistenceTransaction,
  ReadyAssetVersionRecord,
  RegisterSchemaVersionInput,
  RevisionIdentity,
  RevisionLineage,
  RevisionRecord,
  RevisionReferenceRecord,
  RouteClaimRecord,
  SchemaVersionIdentity,
  SchemaVersionRecord,
  SetEntryPointersInput,
  TransactionDecision,
} from "./contracts.js";

export function migrateDatabase(input: Readonly<{ databasePath: string }>): PersistenceResult<MigrationSummary> {
  return migrateDatabaseWithSources(input, shippedMigrationSources);
}

export function openPersistence(input: Readonly<{ databasePath: string }>): PersistenceResult<PersistenceStore> {
  const opened = openCurrentDatabase(input);
  if (!opened.ok) return persistenceResultFailure(opened.code);
  try {
    return { ok: true, value: createPersistenceStore(opened.database) };
  } catch {
    opened.database.close();
    return persistenceResultFailure("STORAGE_FAILURE");
  }
}
