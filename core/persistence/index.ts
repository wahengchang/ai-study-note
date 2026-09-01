import type { MigrationSummary, PersistenceResult, PersistenceStore } from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import { migrateDatabaseWithSources, openCurrentDatabase, shippedMigrationSources } from "./migrations.js";
import { createPersistenceStore } from "./store.js";

export type {
  AssetVersionIdentity,
  CompareAndReplacePluginActivationStateInput,
  CreateRevisionInput,
  CreateRevisionWithReferencesInput,
  EntryPointerLineageRecord,
  EntryPointerRecord,
  MediaImportIntent,
  MediaAssetVersionRecord,
  MediaAvailability,
  MediaStartupSnapshot,
  MigrationSummary,
  OperationLineageIdentity,
  OperationLineageRecord,
  PluginActivationStateRecord,
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
  SchemaMigrationExecutionReplacementInput,
  SchemaMigrationExecutionInput,
  SchemaMigrationExecutionReplacementRecord,
  SchemaMigrationExecutionPointerRecord,
  SchemaMigrationExecutionRecord,
  SchemaMigrationValidationIssue,
  SchemaMigrationValidator,
  TransactionDecision,
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
