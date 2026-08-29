import type { PersistenceFailure, PersistenceFailureCode } from "./contracts.js";

const messages: Readonly<Record<PersistenceFailureCode, string>> = {
  INVALID_DATABASE_PATH: "請提供有效的 database path。",
  DATABASE_UNAVAILABLE: "無法開啟指定的資料庫檔案；請確認目錄存在且具備讀寫權限。",
  UNKNOWN_DATABASE: "指定的資料庫不屬於此 CMS。",
  MIGRATION_HISTORY_MISMATCH: "Storage migration 歷史與目前程式不一致。",
  MIGRATION_FAILED: "Storage migration 未完成。",
  INVALID_PERSISTENCE_INPUT: "請提供有效的 Persistence 輸入。",
  NON_CANONICAL_BYTES: "請提供 canonical JSON bytes。",
  DIGEST_MISMATCH: "Canonical bytes 與 digest 不一致。",
  SCHEMA_VERSION_CONFLICT: "請使用同一 schema 的下一個版本。",
  SCHEMA_VERSION_NOT_FOUND: "請先登錄 Revision 引用的 schema version。",
  REVISION_CONFLICT: "請使用新的 Revision identity。",
  REVISION_NOT_FOUND: "找不到指定的 Revision。",
  ENTRY_POINTER_NOT_FOUND: "找不到指定 Entry 的 pointers。",
  OPERATION_LINEAGE_CONFLICT: "Operation lineage 與既有紀錄衝突。",
  ASSET_VERSION_NOT_FOUND: "找不到指定的 asset version。",
  REVISION_REFERENCE_CONFLICT: "Revision media reference 與既有紀錄衝突。",
  MEDIA_IMPORT_CONFLICT: "Media import identity 與既有紀錄衝突。",
  IMMUTABLE_SCHEMA_VERSION: "Schema version 不可修改或刪除。",
  IMMUTABLE_REVISION: "Revision 不可修改或刪除。",
  CONSTRAINT_VIOLATION: "Persistence constraint 拒絕這次操作。",
  INVALID_SCHEMA_MIGRATION_REQUEST: "Schema migration 請求無效。",
  SCHEMA_MIGRATION_SOURCE_NOT_FOUND: "找不到來源 schema version。",
  SCHEMA_MIGRATION_TARGET_NOT_FOUND: "找不到目標 schema version。",
  SCHEMA_MIGRATION_MAPPING_FAILED: "Schema migration mapping 未完成。",
  SCHEMA_MIGRATION_VALIDATION_FAILED: "Schema migration validation 未完成。",
  INVALID_SCHEMA_MIGRATION_EVIDENCE: "Schema migration impact evidence 無效。",
  STALE_SCHEMA_MIGRATION_REPORT: "Schema migration impact report 已過期，請重新預演。",
  SCHEMA_MIGRATION_REPORT_NOT_APPROVABLE: "Schema migration impact report 尚不可執行；請先排除 blocked rows。",
  SCHEMA_MIGRATION_EXECUTION_NOT_FOUND: "找不到指定的 schema migration execution。",
  STORAGE_FAILURE: "Persistence 操作未完成。",
};

export function persistenceFailure(code: PersistenceFailureCode): PersistenceFailure {
  return {
    code,
    owner: "Persistence",
    subjectIds: [],
    remediation: { kind: "message", message: messages[code] },
  };
}

export function persistenceResultFailure(code: PersistenceFailureCode): Readonly<{ ok: false; error: PersistenceFailure }> {
  return { ok: false, error: persistenceFailure(code) };
}
