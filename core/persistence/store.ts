import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import type {
  AssetVersionIdentity,
  CompareAndReplacePluginActivationStateInput,
  CreateRevisionInput,
  EntryPointerRecord,
  MediaImportIntent,
  OperationLineageIdentity,
  PersistenceCanonicalState,
  PersistenceFailure,
  PersistenceFailureCode,
  PersistenceResult,
  PersistenceStore,
  PersistenceTransaction,
  PluginActivationStateRecord,
  ReadyAssetVersionRecord,
  RevisionIdentity,
  RevisionRecord,
  RevisionReferenceRecord,
  RouteClaimRecord,
  SchemaMigrationImpactEvidence,
  SchemaVersionIdentity,
  SchemaVersionRecord,
  SetEntryPointersInput,
  TransactionDecision,
} from "./contracts.js";
import { validateCanonicalBytes } from "./canonical-bytes.js";
import { persistenceFailure, persistenceResultFailure } from "./failures.js";
import { createSchemaMigrationImpactAnalyzer } from "./schema-migration-impact.js";
import { executeSchemaMigrationInTransaction, getSchemaMigrationExecution, normalizeSchemaMigrationExecution } from "./schema-migration-execution.js";
import { sqliteConstraintKind, sqliteFailureCode, type SqliteAdapter, type SqliteRow } from "./sqlite-adapter.js";

/** 產生 failure result 的方式：`failed` 會讓外層 transaction 回滾，`refused` 不會。 */
type Fail = <T>(code: PersistenceFailureCode) => PersistenceResult<T>;

class Rollback extends Error { constructor(readonly decision: TransactionDecision<never, unknown>) { super("rollback"); } }

export function createPersistenceStore(database: SqliteAdapter): PersistenceStore {
  const operations = createOperations(database);
  const activeTransactions = new WeakSet<object>();
  const runTransaction = <T, E>(operation: (transaction: PersistenceTransaction) => TransactionDecision<T, E>): TransactionDecision<T, E | PersistenceFailure> => {
    let alive = true;
    let firstFailure: PersistenceFailure | undefined;
    const transaction = createOperations(database, () => alive, (failure) => { firstFailure ??= failure; });
    try {
      return database.transaction(() => {
        activeTransactions.add(transaction);
        try {
          let decision: TransactionDecision<T, E>;
          try { decision = operation(transaction); } catch { throw new Rollback({ ok: false, error: persistenceFailure("STORAGE_FAILURE") }); }
          if (!decision.ok) throw new Rollback(decision as TransactionDecision<never, E>);
          if (firstFailure !== undefined) throw new Rollback({ ok: false, error: firstFailure });
          return decision;
        } finally { activeTransactions.delete(transaction); }
      });
    } catch (error) {
      if (error instanceof Rollback) return error.decision as TransactionDecision<T, E | PersistenceFailure>;
      return { ok: false, error: persistenceFailure("STORAGE_FAILURE") };
    } finally { activeTransactions.delete(transaction); alive = false; }
  };
  const atomic = <T>(operation: (transaction: PersistenceTransaction) => PersistenceResult<T>): PersistenceResult<T> => {
    const result = runTransaction((transaction) => {
      const value = operation(transaction);
      return value.ok ? { ok: true, value: value.value } : { ok: false, error: value.error };
    });
    return result as PersistenceResult<T>;
  };
  const migrationImpact = createSchemaMigrationImpactAnalyzer(database);
  return {
    ...operations,
    registerSchemaVersion(input) { return atomic((transaction) => transaction.registerSchemaVersion(input)); },
    createRevision(input) { return atomic((transaction) => transaction.createRevision(input)); },
    setEntryPointers(input) { return atomic((transaction) => transaction.setEntryPointers(input)); },
    replaceRouteClaim(input) { return atomic((transaction) => transaction.replaceRouteClaim(input)); },
    createMediaImportIntent(input) { return atomic((transaction) => transaction.createMediaImportIntent(input)); },
    commitReadyAssetVersion(input) { return atomic((transaction) => transaction.commitReadyAssetVersion(input)); },
    createRevisionReferences(revision, assetVersions) { return atomic((transaction) => transaction.createRevisionReferences(revision, assetVersions)); },
    createRevisionWithReferences(input) { return atomic((transaction) => transaction.createRevisionWithReferences(input)); },
    readPluginActivationState() { return readPluginActivationState(database); },
    compareAndReplacePluginActivationState(input) { return compareAndReplacePluginActivationState(database, input); },
    runTransaction,
    ownsActiveTransaction(transaction) { return activeTransactions.has(transaction); },
    preflightSchemaMigration(input) { return migrationImpact.preflight(input); },
    validateSchemaMigrationImpactEvidence(evidence) { return migrationImpact.validateEvidence(evidence); },
    executeSchemaMigration(input) {
      const evidence = (input as Readonly<{ evidence?: SchemaMigrationImpactEvidence }> | null | undefined)?.evidence;
      const plan = migrationImpact.readExecutionPlan(evidence as SchemaMigrationImpactEvidence);
      if (!plan.ok) return plan;
      const normalized = normalizeSchemaMigrationExecution(input, plan.value);
      if (!normalized.ok) return normalized;
      const executed = atomic((transaction) => executeSchemaMigrationInTransaction(database, transaction, plan.value, normalized.value, migrationImpact.validateExecutionPlanInTransaction));
      // 只有 commit 過的 execution 會讓 evidence 失效，避免同一份 report 產生第二次 write-set。
      if (executed.ok) migrationImpact.releaseExecutionPlan(evidence as SchemaMigrationImpactEvidence);
      return executed;
    },
    getSchemaMigrationExecution(operationId) { return getSchemaMigrationExecution(database, operationId); },
    close() { database.close(); },
  };
}

function createOperations(database: SqliteAdapter, live: () => boolean = () => true, markFailure?: (failure: PersistenceFailure) => void): PersistenceTransaction {
  // 寫入操作的失敗可能發生在部分 statement 已執行之後，必須讓外層 transaction 回滾，
  // 即使呼叫端把該失敗當成可處理的結果。
  const failed: Fail = <T>(code: PersistenceFailureCode): PersistenceResult<T> => {
    const result = persistenceResultFailure(code);
    markFailure?.(result.error);
    return result;
  };
  // 唯讀查詢不寫入任何 row，「找不到」是呼叫端可自行決定如何處理的正常結果，
  // 不得污染仍打算 commit 的 transaction。
  const refused: Fail = <T>(code: PersistenceFailureCode): PersistenceResult<T> => persistenceResultFailure(code) as PersistenceResult<T>;
  // 只有唯一性衝突才是 conflict；CHECK／FK 失敗代表輸入違反既定 constraint，必須照實回報。
  const guarded = <T>(operation: () => PersistenceResult<T>, onUniqueConflict?: PersistenceFailureCode): PersistenceResult<T> => {
    if (!live()) return failed("STORAGE_FAILURE");
    try {
      const result = operation();
      if (!result.ok && result.error.owner === "Persistence") markFailure?.(result.error);
      return result;
    }
    catch (error) {
      return failed(onUniqueConflict !== undefined && sqliteConstraintKind(error) === "unique" ? onUniqueConflict : sqliteFailureCode(error));
    }
  };
  const reading = <T>(operation: () => PersistenceResult<T>): PersistenceResult<T> => {
    if (!live()) return failed("STORAGE_FAILURE");
    try { return operation(); }
    catch (error) { return failed(sqliteFailureCode(error)); }
  };
  const revision = (input: CreateRevisionInput): PersistenceResult<RevisionRecord> => guarded(() => {
    if (!validRevisionInput(input)) return failed("INVALID_PERSISTENCE_INPUT");
    const canonical = validateCanonicalBytes(input.contentBytes, input.contentDigest);
    if (!canonical.ok) return failed(canonical.code);
    if (database.get("SELECT 1 FROM schema_versions WHERE schema_id = ? AND version = ?", input.schemaIdentity.schemaId, input.schemaIdentity.version) === undefined) return failed("SCHEMA_VERSION_NOT_FOUND");
    if (database.get("SELECT 1 FROM revisions WHERE entry_id = ? AND revision_id = ?", input.identity.entryId, input.identity.revisionId) !== undefined) return failed("REVISION_CONFLICT");
    if (input.restoredFromRevisionId !== undefined && database.get("SELECT 1 FROM revisions WHERE entry_id = ? AND revision_id = ?", input.identity.entryId, input.restoredFromRevisionId) === undefined) return failed("REVISION_NOT_FOUND");
    database.run("INSERT INTO revisions (entry_id, revision_id, schema_id, schema_version, content_bytes, content_digest, restored_from_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?)", input.identity.entryId, input.identity.revisionId, input.schemaIdentity.schemaId, input.schemaIdentity.version, copyBytes(canonical.bytes), canonical.digest, input.restoredFromRevisionId ?? null);
    database.run("INSERT INTO operation_lineage (entry_id, revision_id, operation_id, operation_kind, creates_revision) VALUES (?, ?, ?, ?, 1)", input.identity.entryId, input.identity.revisionId, input.lineage.operationId, input.lineage.operationKind);
    return { ok: true, value: revisionRecord(input, canonical.bytes, canonical.digest) };
  }, "REVISION_CONFLICT");
  const references = (identity: RevisionIdentity, assetVersions: readonly AssetVersionIdentity[]): PersistenceResult<readonly RevisionReferenceRecord[]> => guarded(() => {
    if (!validRevisionIdentity(identity) || !validAssetVersions(assetVersions)) return failed("INVALID_PERSISTENCE_INPUT");
    const ordered = [...assetVersions].sort(compareAssetVersions);
    if (ordered.some((item, index) => {
      if (index === 0) return false;
      const previous = ordered[index - 1];
      return previous !== undefined && item.assetId === previous.assetId && item.assetVersionId === previous.assetVersionId;
    })) return failed("INVALID_PERSISTENCE_INPUT");
    for (const assetVersion of ordered) {
      if (database.get("SELECT 1 FROM asset_versions WHERE asset_id = ? AND asset_version_id = ?", assetVersion.assetId, assetVersion.assetVersionId) === undefined) return failed("ASSET_VERSION_NOT_FOUND");
      database.run("INSERT INTO revision_refs (entry_id, revision_id, asset_id, asset_version_id) VALUES (?, ?, ?, ?)", identity.entryId, identity.revisionId, assetVersion.assetId, assetVersion.assetVersionId);
    }
    return { ok: true, value: ordered.map((assetVersion) => ({ revision: { ...identity }, assetVersion: { ...assetVersion } })) };
  });
  return {
    registerSchemaVersion(input) { return guarded(() => {
      if (!validSchemaIdentity(input.identity)) return failed("INVALID_PERSISTENCE_INPUT");
      const canonical = validateCanonicalBytes(input.schemaBytes, input.schemaDigest);
      if (!canonical.ok) return failed(canonical.code);
      const current = database.get("SELECT max(version) AS version FROM schema_versions WHERE schema_id = ?", input.identity.schemaId);
      const latest = positive(current?.version); const expected = latest === null ? 1 : latest + 1;
      if (input.identity.version !== expected) return failed("SCHEMA_VERSION_CONFLICT");
      database.run("INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)", input.identity.schemaId, input.identity.version, copyBytes(canonical.bytes), canonical.digest);
      return { ok: true, value: schemaRecord(input.identity, canonical.bytes, canonical.digest) };
    }, "SCHEMA_VERSION_CONFLICT"); },
    getSchemaVersion(identity) { return reading(() => {
      if (!validSchemaIdentity(identity)) return refused("INVALID_PERSISTENCE_INPUT");
      const row = database.get("SELECT schema_bytes, schema_digest FROM schema_versions WHERE schema_id = ? AND version = ?", identity.schemaId, identity.version);
      const bytes = row === undefined ? null : byte(row, "schema_bytes"); const digest = row === undefined ? null : digestField(row, "schema_digest");
      if (row === undefined) return refused("SCHEMA_VERSION_NOT_FOUND"); if (bytes === null || digest === null) return refused("STORAGE_FAILURE");
      return { ok: true, value: schemaRecord(identity, bytes, digest) };
    }); },
    createRevision(input) { return revision(input); },
    getRevision(identity) { return reading(() => {
      if (!validRevisionIdentity(identity)) return refused("INVALID_PERSISTENCE_INPUT");
      const row = database.get("SELECT r.schema_id, r.schema_version, r.content_bytes, r.content_digest, r.restored_from_revision_id, l.operation_id, l.operation_kind FROM revisions r JOIN operation_lineage l ON l.entry_id=r.entry_id AND l.revision_id=r.revision_id AND l.creates_revision=1 WHERE r.entry_id=? AND r.revision_id=?", identity.entryId, identity.revisionId);
      if (row === undefined) return refused("REVISION_NOT_FOUND");
      const schemaId = text(row, "schema_id"), version = positive(row.schema_version), bytes = byte(row, "content_bytes"), digest = digestField(row, "content_digest"), operationId = text(row, "operation_id"), operationKind = text(row, "operation_kind"), restored = nullableText(row, "restored_from_revision_id");
      if (schemaId === null || version === null || bytes === null || digest === null || operationId === null || operationKind === null || restored === undefined) return refused("STORAGE_FAILURE");
      return { ok: true, value: revisionRecord({ identity, schemaIdentity: { schemaId, version }, contentBytes: bytes, contentDigest: digest, ...(restored === null ? {} : { restoredFromRevisionId: restored }), lineage: { operationId, operationKind } }, bytes, digest) };
    }); },
    getEntryPointers(entryId) { return reading(() => pointer(database.get("SELECT current_revision_id, published_revision_id FROM entry_pointers WHERE entry_id=?", entryId), entryId, refused)); },
    setEntryPointers(input) { return guarded(() => {
      if (!validPointers(input)) return failed("INVALID_PERSISTENCE_INPUT");
      const identity = { entryId: input.entryId, revisionId: input.lineage.revisionId, operationId: input.lineage.operationId };
      const existing = database.get("SELECT operation_kind FROM operation_lineage WHERE entry_id=? AND revision_id=? AND operation_id=?", identity.entryId, identity.revisionId, identity.operationId);
      if (existing === undefined) database.run("INSERT INTO operation_lineage (entry_id, revision_id, operation_id, operation_kind, creates_revision) VALUES (?, ?, ?, ?, 0)", identity.entryId, identity.revisionId, identity.operationId, input.lineage.operationKind);
      else if (text(existing, "operation_kind") !== input.lineage.operationKind) return failed("OPERATION_LINEAGE_CONFLICT");
      database.run("INSERT INTO entry_pointer_lineage (entry_id, operation_revision_id, operation_id, current_revision_id, published_revision_id) VALUES (?, ?, ?, ?, ?)", input.entryId, input.lineage.revisionId, input.lineage.operationId, input.currentRevisionId, input.publishedRevisionId ?? null);
      database.run("INSERT INTO entry_pointers (entry_id,current_revision_id,published_revision_id) VALUES (?, ?, ?) ON CONFLICT(entry_id) DO UPDATE SET current_revision_id=excluded.current_revision_id,published_revision_id=excluded.published_revision_id", input.entryId, input.currentRevisionId, input.publishedRevisionId ?? null);
      return { ok: true, value: { entryId: input.entryId, currentRevisionId: input.currentRevisionId, ...(input.publishedRevisionId === undefined ? {} : { publishedRevisionId: input.publishedRevisionId }) } };
    }); },
    getOperationLineage(identity) { return reading(() => {
      if (!validLineageIdentity(identity)) return refused("INVALID_PERSISTENCE_INPUT"); const row = database.get("SELECT operation_kind, creates_revision FROM operation_lineage WHERE entry_id=? AND revision_id=? AND operation_id=?", identity.entryId, identity.revisionId, identity.operationId);
      if (row === undefined) return refused("REVISION_NOT_FOUND"); const kind = text(row, "operation_kind"); const creates = row.creates_revision;
      if (kind === null || (creates !== 0 && creates !== 1)) return refused("STORAGE_FAILURE"); return { ok: true, value: { ...identity, operationKind: kind, createsRevision: creates === 1 } };
    }); },
    getEntryPointerLineage(identity) { return reading(() => {
      if (!validLineageIdentity(identity)) return refused("INVALID_PERSISTENCE_INPUT"); const row = database.get("SELECT current_revision_id,published_revision_id FROM entry_pointer_lineage WHERE entry_id=? AND operation_revision_id=? AND operation_id=?", identity.entryId, identity.revisionId, identity.operationId);
      if (row === undefined) return refused("ENTRY_POINTER_NOT_FOUND"); const current = text(row, "current_revision_id"), published = nullableText(row, "published_revision_id");
      if (current === null || published === undefined) return refused("STORAGE_FAILURE");
      return { ok: true, value: { entryId: identity.entryId, currentRevisionId: current, ...(published === null ? {} : { publishedRevisionId: published }), lineageIdentity: { ...identity } } };
    }); },
    listRouteClaims(graph) { return reading(() => {
      if (graph !== "current" && graph !== "published") return refused("INVALID_PERSISTENCE_INPUT");
      const claims: RouteClaimRecord[] = []; for (const row of database.all("SELECT normalized_route,owner_entry_id,source_revision_id FROM route_claims WHERE graph=?", graph)) { const normalizedRoute=text(row,"normalized_route"), owner=text(row,"owner_entry_id"), sourceRevisionId=text(row,"source_revision_id"); if (normalizedRoute===null||owner===null||sourceRevisionId===null) return refused("STORAGE_FAILURE"); claims.push({graph,normalizedRoute,owner,sourceRevisionId}); }
      return { ok: true, value: claims.sort(compareClaims) };
    }); },
    replaceRouteClaim(input) { return guarded(() => {
      if ((input.graph !== "current" && input.graph !== "published") || !validText(input.normalizedRoute) || !validText(input.owner) || !validText(input.sourceRevisionId)) return failed("INVALID_PERSISTENCE_INPUT");
      database.run("DELETE FROM route_claims WHERE graph=? AND owner_entry_id=?", input.graph, input.owner);
      database.run("INSERT INTO route_claims (graph,normalized_route,owner_entry_id,source_revision_id) VALUES (?, ?, ?, ?)", input.graph,input.normalizedRoute,input.owner,input.sourceRevisionId);
      return { ok: true, value: { ...input } };
    }); },
    createMediaImportIntent(input) { return guarded(() => {
      if (!validIntent(input)) return failed("INVALID_PERSISTENCE_INPUT"); const prior=database.get("SELECT asset_id,asset_version_id,object_digest,byte_length,metadata_digest FROM media_import_intents WHERE import_id=?",input.importId);
      if (prior !== undefined) { if (text(prior,"asset_id")===input.identity.assetId&&text(prior,"asset_version_id")===input.identity.assetVersionId&&text(prior,"object_digest")===input.objectDigest&&prior.byte_length===input.byteLength&&text(prior,"metadata_digest")===input.metadataDigest) return {ok:true,value:copyIntent(input)}; return failed("MEDIA_IMPORT_CONFLICT"); }
      database.run("INSERT INTO media_import_intents (import_id,asset_id,asset_version_id,object_digest,byte_length,metadata_bytes,metadata_digest) VALUES (?,?,?,?,?,?,?)",input.importId,input.identity.assetId,input.identity.assetVersionId,input.objectDigest,input.byteLength,copyBytes(input.metadataBytes),input.metadataDigest); return {ok:true,value:copyIntent(input)};
    }); },
    getMediaImportIntent(importId) { return reading(() => intentRow(database.get("SELECT * FROM media_import_intents WHERE import_id=?",importId), refused)); },
    commitReadyAssetVersion(input) { return guarded(() => {
      if (!validIntent(input)) return failed("INVALID_PERSISTENCE_INPUT"); const intent=intentRow(database.get("SELECT * FROM media_import_intents WHERE import_id=?",input.importId),failed); if(!intent.ok) return intent; if(!sameIntent(intent.value,input)) return failed("MEDIA_IMPORT_CONFLICT");
      const version=database.get("SELECT object_digest,metadata_bytes,metadata_digest FROM asset_versions WHERE asset_id=? AND asset_version_id=?",input.identity.assetId,input.identity.assetVersionId); if(version!==undefined) return failed("MEDIA_IMPORT_CONFLICT");
      const object=database.get("SELECT byte_length FROM media_objects WHERE object_digest=?",input.objectDigest); if(object===undefined) database.run("INSERT INTO media_objects (object_digest,byte_length) VALUES (?,?)",input.objectDigest,input.byteLength); else if(object.byte_length!==input.byteLength) return failed("MEDIA_IMPORT_CONFLICT");
      database.run("INSERT INTO media_assets (asset_id) VALUES (?) ON CONFLICT(asset_id) DO NOTHING",input.identity.assetId); database.run("INSERT INTO asset_versions (asset_id,asset_version_id,object_digest,metadata_bytes,metadata_digest) VALUES (?,?,?,?,?)",input.identity.assetId,input.identity.assetVersionId,input.objectDigest,copyBytes(input.metadataBytes),input.metadataDigest); database.run("INSERT INTO asset_version_availability (asset_id,asset_version_id,availability) VALUES (?,?,'ready')",input.identity.assetId,input.identity.assetVersionId); database.run("DELETE FROM media_import_intents WHERE import_id=?",input.importId);
      return {ok:true,value:readyFromIntent(input)};
    }); },
    getReadyAssetVersion(identity) { return reading(() => readyRow(database.get("SELECT v.object_digest,o.byte_length,v.metadata_bytes,v.metadata_digest,a.availability FROM asset_versions v JOIN media_objects o ON o.object_digest=v.object_digest JOIN asset_version_availability a ON a.asset_id=v.asset_id AND a.asset_version_id=v.asset_version_id WHERE v.asset_id=? AND v.asset_version_id=?",identity.assetId,identity.assetVersionId),identity,refused)); },
    createRevisionReferences(identity, assetVersions) { return references(identity,assetVersions); },
    getRevisionReferences(identity) { return reading(() => { if(!validRevisionIdentity(identity)) return refused("INVALID_PERSISTENCE_INPUT"); const items: RevisionReferenceRecord[]=[]; for(const row of database.all("SELECT asset_id,asset_version_id FROM revision_refs WHERE entry_id=? AND revision_id=?",identity.entryId,identity.revisionId)){const assetId=text(row,"asset_id"),assetVersionId=text(row,"asset_version_id");if(assetId===null||assetVersionId===null)return refused("STORAGE_FAILURE");items.push({revision:{...identity},assetVersion:{assetId,assetVersionId}});} return {ok:true,value:items.sort((a,b)=>compareAssetVersions(a.assetVersion,b.assetVersion))}; }); },
    createRevisionWithReferences(input) { return guarded(() => { const created=revision(input.revision); if(!created.ok)return created; const createdReferences=references(input.revision.identity,input.assetVersions); if(!createdReferences.ok)return createdReferences; return {ok:true,value:{revision:created.value,references:createdReferences.value}}; }); },
    canonicalState() { return reading(() => canonicalState(database, refused)); },
  };
}

function readPluginActivationState(database: SqliteAdapter): PersistenceResult<PluginActivationStateRecord> {
  try {
    const row = database.get("SELECT state_bytes, state_digest FROM plugin_activation_state WHERE singleton = 1");
    const bytes = row === undefined ? null : byte(row, "state_bytes");
    const digest = row === undefined ? null : digestField(row, "state_digest");
    return bytes === null || digest === null
      ? persistenceResultFailure("STORAGE_FAILURE")
      : { ok: true, value: Object.freeze({ bytes: copyBytes(bytes), digest }) };
  } catch (error) {
    return persistenceResultFailure(sqliteFailureCode(error));
  }
}

function compareAndReplacePluginActivationState(
  database: SqliteAdapter,
  input: CompareAndReplacePluginActivationStateInput,
): PersistenceResult<boolean> {
  if (
    input === null || typeof input !== "object" || !isDigest(input.expectedDigest)
    || input.next === null || typeof input.next !== "object"
    || !(input.next.bytes instanceof Uint8Array) || !isDigest(input.next.digest)
  ) return persistenceResultFailure("INVALID_PERSISTENCE_INPUT");
  try {
    return database.transaction(() => {
      const row = database.get("SELECT state_digest FROM plugin_activation_state WHERE singleton = 1");
      const currentDigest = row === undefined ? null : digestField(row, "state_digest");
      if (currentDigest === null) return persistenceResultFailure("STORAGE_FAILURE");
      if (currentDigest !== input.expectedDigest) return { ok: true, value: false };
      const canonical = validateCanonicalBytes(input.next.bytes, input.next.digest);
      if (!canonical.ok) return persistenceResultFailure(canonical.code);
      database.run(
        "UPDATE plugin_activation_state SET state_bytes = ?, state_digest = ? WHERE singleton = 1",
        copyBytes(canonical.bytes),
        canonical.digest,
      );
      return { ok: true, value: true };
    });
  } catch (error) {
    return persistenceResultFailure(sqliteFailureCode(error));
  }
}

function canonicalState(database: SqliteAdapter, failed: Fail): PersistenceResult<PersistenceCanonicalState> {
  const collect = (sql: string, keys: readonly string[]) => database.all(sql)
    .map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
    .sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right)));
  try {
    const schemaVersions = collect("SELECT schema_id AS schemaId,version,schema_digest AS schemaDigest FROM schema_versions", ["schemaId", "version", "schemaDigest"]);
    const revisions = collect("SELECT entry_id AS entryId,revision_id AS revisionId,schema_id AS schemaId,schema_version AS schemaVersion,content_digest AS contentDigest,restored_from_revision_id AS restoredFromRevisionId FROM revisions", ["entryId", "revisionId", "schemaId", "schemaVersion", "contentDigest", "restoredFromRevisionId"]);
    const operationLineage = collect("SELECT entry_id AS entryId,revision_id AS revisionId,operation_id AS operationId,operation_kind AS operationKind,creates_revision AS createsRevision FROM operation_lineage", ["entryId", "revisionId", "operationId", "operationKind", "createsRevision"]);
    const entryPointers = collect("SELECT entry_id AS entryId,current_revision_id AS currentRevisionId,published_revision_id AS publishedRevisionId FROM entry_pointers", ["entryId", "currentRevisionId", "publishedRevisionId"]);
    const entryPointerLineage = collect("SELECT entry_id AS entryId,operation_revision_id AS operationRevisionId,operation_id AS operationId,current_revision_id AS currentRevisionId,published_revision_id AS publishedRevisionId FROM entry_pointer_lineage", ["entryId", "operationRevisionId", "operationId", "currentRevisionId", "publishedRevisionId"]);
    const routeClaims = collect("SELECT graph,normalized_route AS normalizedRoute,owner_entry_id AS ownerEntryId,source_revision_id AS sourceRevisionId FROM route_claims", ["graph", "normalizedRoute", "ownerEntryId", "sourceRevisionId"]);
    const mediaImportIntents = collect("SELECT import_id AS importId,asset_id AS assetId,asset_version_id AS assetVersionId,object_digest AS objectDigest,byte_length AS byteLength,metadata_digest AS metadataDigest FROM media_import_intents", ["importId", "assetId", "assetVersionId", "objectDigest", "byteLength", "metadataDigest"]);
    const mediaObjects = collect("SELECT object_digest AS objectDigest,byte_length AS byteLength FROM media_objects", ["objectDigest", "byteLength"]);
    const mediaAssets = collect("SELECT asset_id AS assetId FROM media_assets", ["assetId"]);
    const assetVersions = collect("SELECT v.asset_id AS assetId,v.asset_version_id AS assetVersionId,v.object_digest AS objectDigest,v.metadata_digest AS metadataDigest,a.availability FROM asset_versions v JOIN asset_version_availability a ON a.asset_id=v.asset_id AND a.asset_version_id=v.asset_version_id", ["assetId", "assetVersionId", "objectDigest", "metadataDigest", "availability"]);
    const revisionReferences = collect("SELECT entry_id AS entryId,revision_id AS revisionId,asset_id AS assetId,asset_version_id AS assetVersionId FROM revision_refs", ["entryId", "revisionId", "assetId", "assetVersionId"]);
    const schemaMigrationExecutions = collect("SELECT operation_id AS operationId,source_schema_id AS sourceSchemaId,source_schema_version AS sourceSchemaVersion,target_schema_id AS targetSchemaId,target_schema_version AS targetSchemaVersion,mapping_identity AS mappingIdentity FROM schema_migration_executions", ["operationId", "sourceSchemaId", "sourceSchemaVersion", "targetSchemaId", "targetSchemaVersion", "mappingIdentity"]);
    const schemaMigrationRevisionLineage = collect("SELECT operation_id AS operationId,entry_id AS entryId,source_revision_id AS sourceRevisionId,replacement_revision_id AS replacementRevisionId FROM schema_migration_revision_lineage", ["operationId", "entryId", "sourceRevisionId", "replacementRevisionId"]);
    const schemaMigrationPointerLineage = collect("SELECT operation_id AS operationId,entry_id AS entryId,pointer,source_revision_id AS sourceRevisionId,policy,result_revision_id AS resultRevisionId,replacement_revision_id AS replacementRevisionId FROM schema_migration_pointer_lineage", ["operationId", "entryId", "pointer", "sourceRevisionId", "policy", "resultRevisionId", "replacementRevisionId"]);
    const payload = { contract: "persistence-canonical-state/v2", schemaVersions, revisions, operationLineage, entryPointers, entryPointerLineage, routeClaims, mediaImportIntents, mediaObjects, mediaAssets, assetVersions, revisionReferences, schemaMigrationExecutions, schemaMigrationRevisionLineage, schemaMigrationPointerLineage };
    const bytes = canonicalJsonBytes(payload);
    if (!bytes.ok) return failed("STORAGE_FAILURE");
    return Object.freeze({ ok: true, value: Object.freeze({ contract: "persistence-canonical-state/v2", bytes: copyBytes(bytes.value), digest: sha256Digest(bytes.value), counts: Object.freeze({ schemaVersions: schemaVersions.length, revisions: revisions.length, operationLineage: operationLineage.length, entryPointers: entryPointers.length, entryPointerLineage: entryPointerLineage.length, routeClaims: routeClaims.length, mediaImportIntents: mediaImportIntents.length, mediaObjects: mediaObjects.length, mediaAssets: mediaAssets.length, assetVersions: assetVersions.length, revisionReferences: revisionReferences.length, schemaMigrationExecutions: schemaMigrationExecutions.length, schemaMigrationRevisionLineage: schemaMigrationRevisionLineage.length, schemaMigrationPointerLineage: schemaMigrationPointerLineage.length }) }) });
  } catch {
    return failed("STORAGE_FAILURE");
  }
}
function pointer(row:SqliteRow|undefined,entryId:string,failed:Fail):PersistenceResult<EntryPointerRecord>{if(row===undefined)return failed("ENTRY_POINTER_NOT_FOUND");const current=text(row,"current_revision_id"),published=nullableText(row,"published_revision_id");if(current===null||published===undefined)return failed("STORAGE_FAILURE");return{ok:true,value:{entryId,currentRevisionId:current,...(published===null?{}:{publishedRevisionId:published})}};}
function intentRow(row:SqliteRow|undefined,failed:Fail):PersistenceResult<MediaImportIntent>{if(row===undefined)return failed("MEDIA_IMPORT_CONFLICT");const importId=text(row,"import_id"),assetId=text(row,"asset_id"),assetVersionId=text(row,"asset_version_id"),objectDigest=digestField(row,"object_digest"),byteLength=row.byte_length,metadataBytes=byte(row,"metadata_bytes"),metadataDigest=digestField(row,"metadata_digest");if(importId===null||assetId===null||assetVersionId===null||objectDigest===null||typeof byteLength!=="number"||metadataBytes===null||metadataDigest===null)return failed("STORAGE_FAILURE");return{ok:true,value:{importId,identity:{assetId,assetVersionId},objectDigest,byteLength,metadataBytes:copyBytes(metadataBytes),metadataDigest}};}
function readyRow(row:SqliteRow|undefined,identity:AssetVersionIdentity,failed:Fail):PersistenceResult<ReadyAssetVersionRecord>{if(row===undefined||row.availability!=="ready")return failed("ASSET_VERSION_NOT_FOUND");const objectDigest=digestField(row,"object_digest"),byteLength=row.byte_length,metadataBytes=byte(row,"metadata_bytes"),metadataDigest=digestField(row,"metadata_digest");if(objectDigest===null||typeof byteLength!=="number"||metadataBytes===null||metadataDigest===null)return failed("STORAGE_FAILURE");return{ok:true,value:{identity:{...identity},objectDigest,byteLength,metadataBytes:copyBytes(metadataBytes),metadataDigest,availability:"ready"}};}
function schemaRecord(identity:SchemaVersionIdentity,bytes:Uint8Array,digest:Digest):SchemaVersionRecord{return{identity:{...identity},schemaBytes:copyBytes(bytes),schemaDigest:digest};} function revisionRecord(input:CreateRevisionInput,bytes:Uint8Array,digest:Digest):RevisionRecord{return{identity:{...input.identity},schemaIdentity:{...input.schemaIdentity},contentBytes:copyBytes(bytes),contentDigest:digest,...(input.restoredFromRevisionId===undefined?{}:{restoredFromRevisionId:input.restoredFromRevisionId}),lineage:{...input.lineage}};}
function readyFromIntent(input:MediaImportIntent):ReadyAssetVersionRecord{return{identity:{...input.identity},objectDigest:input.objectDigest,byteLength:input.byteLength,metadataBytes:copyBytes(input.metadataBytes),metadataDigest:input.metadataDigest,availability:"ready"};} function copyIntent(input:MediaImportIntent):MediaImportIntent{return{...input,identity:{...input.identity},metadataBytes:copyBytes(input.metadataBytes)};} function sameIntent(a:MediaImportIntent,b:MediaImportIntent){return a.importId===b.importId&&a.identity.assetId===b.identity.assetId&&a.identity.assetVersionId===b.identity.assetVersionId&&a.objectDigest===b.objectDigest&&a.byteLength===b.byteLength&&a.metadataDigest===b.metadataDigest&&sameBytes(a.metadataBytes,b.metadataBytes);}
function validRevisionInput(input:CreateRevisionInput):boolean{return validRevisionIdentity(input.identity)&&validSchemaIdentity(input.schemaIdentity)&&input.contentBytes instanceof Uint8Array&&isDigest(input.contentDigest)&&validText(input.lineage.operationId)&&validText(input.lineage.operationKind)&&(input.restoredFromRevisionId===undefined||validText(input.restoredFromRevisionId));} function validSchemaIdentity(value:SchemaVersionIdentity):boolean{return validText(value.schemaId)&&Number.isSafeInteger(value.version)&&value.version>0;} function validRevisionIdentity(value:RevisionIdentity):boolean{return validText(value.entryId)&&validText(value.revisionId);} function validAssetVersions(values:readonly AssetVersionIdentity[]):boolean{return Array.isArray(values)&&values.every((value)=>validText(value.assetId)&&validText(value.assetVersionId));} function validLineageIdentity(value:OperationLineageIdentity):boolean{return validRevisionIdentity(value)&&validText(value.operationId);} function validPointers(value:SetEntryPointersInput):boolean{return validText(value.entryId)&&validText(value.currentRevisionId)&&validText(value.lineage.revisionId)&&validText(value.lineage.operationId)&&validText(value.lineage.operationKind)&&(value.publishedRevisionId===undefined||validText(value.publishedRevisionId));} function validIntent(value:MediaImportIntent):boolean{return validText(value.importId)&&validText(value.identity.assetId)&&validText(value.identity.assetVersionId)&&isDigest(value.objectDigest)&&Number.isSafeInteger(value.byteLength)&&value.byteLength>=0&&value.metadataBytes instanceof Uint8Array&&isDigest(value.metadataDigest)&&sha256Digest(value.metadataBytes)===value.metadataDigest;} function validText(value:unknown):value is string{return typeof value==="string"&&value.length>0;}
// canonical state bytes、digest 與所有 record 排序必須與 host locale／ICU 版本無關，因此一律使用 code-unit 順序而非 `localeCompare`。
function compareCodeUnits(left:string,right:string){return left<right?-1:left>right?1:0;}
function text(row:SqliteRow,key:string):string|null{const value=row[key];return typeof value==="string"?value:null;} function nullableText(row:SqliteRow,key:string):string|null|undefined{const value=row[key];return value===null||typeof value==="string"?value:undefined;} function byte(row:SqliteRow,key:string):Uint8Array|null{const value=row[key];return value instanceof Uint8Array?copyBytes(value):null;} function digestField(row:SqliteRow,key:string):Digest|null{const value=text(row,key);return value!==null&&isDigest(value)?value:null;} function positive(value:unknown):number|null{return typeof value==="number"&&Number.isSafeInteger(value)&&value>0?value:null;} function compareAssetVersions(a:AssetVersionIdentity,b:AssetVersionIdentity){return compareCodeUnits(a.assetId,b.assetId)||compareCodeUnits(a.assetVersionId,b.assetVersionId);} function compareClaims(a:RouteClaimRecord,b:RouteClaimRecord){return compareCodeUnits(a.normalizedRoute,b.normalizedRoute)||compareCodeUnits(a.owner,b.owner);} function sameBytes(a:Uint8Array,b:Uint8Array){if(a.byteLength!==b.byteLength)return false;for(let i=0;i<a.byteLength;i+=1)if(a[i]!==b[i])return false;return true;}
