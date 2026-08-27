import type { MigrationSummary, PersistenceResult, PersistenceStore } from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import { migrateDatabaseWithSources, openCurrentDatabase, shippedMigrationSources } from "./migrations.js";
import { createPersistenceStore } from "./store.js";

export type {
  CreateRevisionInput,
  MigrationSummary,
  PersistenceFailure,
  PersistenceFailureCode,
  PersistenceResult,
  PersistenceStore,
  RegisterSchemaVersionInput,
  RevisionIdentity,
  RevisionLineage,
  RevisionRecord,
  SchemaVersionIdentity,
  SchemaVersionRecord,
} from "./contracts.js";

export function migrateDatabase(input: Readonly<{ databasePath: string }>): PersistenceResult<MigrationSummary> {
  const sources = shippedMigrationSources();
  if (sources === null) return persistenceResultFailure("MIGRATION_FAILED");
  return migrateDatabaseWithSources(input, sources);
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
