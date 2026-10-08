import type { CurrentPersistenceReadSnapshot, CurrentPersistenceStore, CurrentPersistenceTransaction, MigrationSummary, PersistenceResult, TransactionDecision } from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import { inspectDatabaseGeneration, migrateDatabaseWithSources, openCurrentDatabase, shippedMigrationSources } from "./migrations.js";
import { createPersistenceStore } from "./store.js";
export { globalSlug, globalSlugNamespaceKey, normalizeDisplaySlug, suggestGlobalSlug, type GlobalSlug } from "./global-slug.js";

export type {
  AllocateGlobalSlugInput,
  CompareAndReplacePluginActivationStateInput,
  CompareAndReplaceThemeActivationStateInput,
  CompareAndReplacePluginSettingsStateInput,
  CreateCurrentContentTypeInput,
  CreateCurrentEntryInput,
  CreateCurrentMediaAssetInput,
  CurrentContentTypeRecord,
  CurrentEntryRecord,
  CurrentEntryStatus,
  CurrentEntryTermBinding,
  CurrentMediaAssetRecord,
  CurrentMediaEntryStatus,
  CurrentMediaImage,
  CurrentMediaReferenceRecord,
  CurrentMediaThumbnail,
  CurrentTaxonomyRecord,
  CurrentTaxonomyTermRecord,
  GlobalSlugClaimRecord,
  GlobalSlugEntityIdentity,
  MigrationSummary,
  PersistenceCanonicalState,
  PersistenceFailure,
  PersistenceFailureCode,
  PersistenceResult,
  CurrentPersistenceReadSnapshot as PersistenceReadSnapshot,
  CurrentPersistenceStore as PersistenceStore,
  CurrentPersistenceTransaction as PersistenceTransaction,
  PluginActivationStateRecord,
  PluginSettingsStateRecord,
  ReplaceCurrentEntryInput,
  ReplaceCurrentMediaAssetInput,
  ReplaceEntryMediaReferencesInput,
  ThemeActivationStateRecord,
  TransactionDecision,
} from "./contracts.js";

export { inspectDatabaseGeneration };

const currentReadMethods = new Set<string>([
  "readPluginActivationState", "readThemeActivationState", "readPluginSettingsState",
  "getCurrentContentType", "listCurrentContentTypes", "getCurrentMediaAsset", "listCurrentMediaAssets", "listCurrentMediaReferences",
  "getGlobalSlugClaim", "getGlobalSlugClaimByEntity", "getCurrentEntry", "listCurrentEntries",
  "getCurrentTaxonomy", "listCurrentTaxonomies", "getCurrentTaxonomyTerm", "listCurrentTaxonomyTerms",
  "listCurrentEntryTermBindings", "listCurrentTermUsage",
]);
const currentTransactionMethods = new Set<string>([
  ...currentReadMethods,
  "createCurrentTaxonomy", "replaceCurrentTaxonomy", "createCurrentTaxonomyTerm", "replaceCurrentTaxonomyTerm",
  "deleteCurrentTaxonomyTerm", "replaceCurrentEntryTermBindings", "createCurrentContentType", "replaceCurrentContentType",
  "allocateGlobalSlug", "releaseGlobalSlug", "createCurrentEntry", "replaceCurrentEntry", "deleteCurrentEntry",
  "createCurrentMediaAsset", "replaceCurrentMediaAsset", "deleteCurrentMediaAsset", "replaceEntryMediaReferences",
  "contentTypeHasCurrentEntries", "canonicalState",
]);
const currentStoreMethods = new Set<string>([
  ...currentTransactionMethods,
  "compareAndReplacePluginActivationState", "compareAndReplaceThemeActivationState", "compareAndReplacePluginSettingsState",
  "runReadSnapshot", "ownsActiveReadSnapshot", "runTransaction", "ownsActiveTransaction", "close",
]);

/** Only current operations are reachable from the public factory, including transaction callbacks. */
function currentFacade(store: ReturnType<typeof createPersistenceStore>): CurrentPersistenceStore {
  const rawByFacade = new WeakMap<object, object>();
  const mask = <T extends object>(target: T, allowed: ReadonlySet<string>): T => {
    if (target !== store) {
      const facade = Object.freeze(Object.fromEntries([...allowed].filter((name) => name in target).map((name) => [name, Reflect.get(target, name)]))) as T;
      rawByFacade.set(facade, target);
      return facade;
    }
    const facade = new Proxy(target, {
      get(raw, property, receiver) {
        if (typeof property === "string" && !allowed.has(property)) return undefined;
        if (raw === store && property === "runReadSnapshot") return <TValue, E>(operation: (snapshot: CurrentPersistenceReadSnapshot) => TransactionDecision<TValue, E>) => store.runReadSnapshot((snapshot) => operation(mask(snapshot, currentReadMethods)));
        if (raw === store && property === "runTransaction") return <TValue, E>(operation: (transaction: CurrentPersistenceTransaction) => TransactionDecision<TValue, E>) => store.runTransaction((transaction) => operation(mask(transaction, currentTransactionMethods)));
        if (raw === store && property === "ownsActiveReadSnapshot") return (snapshot: object) => store.ownsActiveReadSnapshot(rawByFacade.get(snapshot) ?? snapshot);
        if (raw === store && property === "ownsActiveTransaction") return (transaction: object) => store.ownsActiveTransaction(rawByFacade.get(transaction) ?? transaction);
        return Reflect.get(raw, property, receiver);
      },
      has(raw, property) { return typeof property !== "string" || allowed.has(property) && Reflect.has(raw, property); },
      ownKeys(raw) { return Reflect.ownKeys(raw).filter((property) => typeof property !== "string" || allowed.has(property)); },
      getOwnPropertyDescriptor(raw, property) { return typeof property === "string" && !allowed.has(property) ? undefined : Reflect.getOwnPropertyDescriptor(raw, property); },
      set() { return false; },
    });
    rawByFacade.set(facade, target);
    return facade;
  };
  return mask(store, currentStoreMethods) as CurrentPersistenceStore;
}

export function migrateDatabase(input: Readonly<{ databasePath: string }>): PersistenceResult<MigrationSummary> {
  const sources = shippedMigrationSources();
  if (sources === null) return persistenceResultFailure("MIGRATION_FAILED");
  return migrateDatabaseWithSources(input, sources);
}

export function openPersistence(input: Readonly<{ databasePath: string }>): PersistenceResult<CurrentPersistenceStore> {
  const opened = openCurrentDatabase(input);
  if (!opened.ok) return persistenceResultFailure(opened.code);
  try {
    return { ok: true, value: currentFacade(createPersistenceStore(opened.database)) };
  } catch {
    opened.database.close();
    return persistenceResultFailure("STORAGE_FAILURE");
  }
}
