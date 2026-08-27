import { readFileSync } from "node:fs";

import { sha256Digest } from "../foundation/index.js";

import type { MigrationSummary, PersistenceResult } from "./contracts.js";
import { persistenceResultFailure } from "./failures.js";
import { openSqliteAdapter, type SqliteAdapter, type SqliteRow } from "./sqlite-adapter.js";

const applicationId = 1095324500;
const migrationFilename = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/;

export type MigrationSource = Readonly<{ filename: string; sqlBytes: Uint8Array }>;

type PreparedMigration = Readonly<{
  sequence: number;
  filename: string;
  migrationId: string;
  digest: string;
  sql: string;
}>;

type DatabaseState = Readonly<{
  applicationId: number;
  userVersion: number;
  userObjects: number;
  ledger: readonly SqliteRow[];
}>;

const shippedMigrationFilenames: readonly string[] = [
  "0001-create-persistence-storage.sql",
  "0002-add-persistence-query-indexes.sql",
];

// 刻意不在 module top-level 讀檔：讀取失敗必須成為 structured failure，
// 而不是在 import 期丟出未包裝的例外、繞過整套 failure contract。
export function shippedMigrationSources(): readonly MigrationSource[] | null {
  try {
    return shippedMigrationFilenames.map((filename) => ({
      filename,
      sqlBytes: readFileSync(new URL(`../../db/migrations/${filename}`, import.meta.url)),
    }));
  } catch {
    return null;
  }
}

export function migrateDatabaseWithSources(
  input: Readonly<{ databasePath: string }>,
  sources: readonly MigrationSource[],
): PersistenceResult<MigrationSummary> {
  if (!validDatabasePath(input.databasePath)) return persistenceResultFailure("INVALID_DATABASE_PATH");

  let database: SqliteAdapter;
  try {
    database = openSqliteAdapter(input.databasePath);
  } catch {
    // path 語法已通過檢查，開不起來就是目錄不存在／權限／磁碟／檔案毀損，不是「path 給錯格式」。
    return persistenceResultFailure("DATABASE_UNAVAILABLE");
  }

  try {
    const migrations = prepareMigrations(sources);
    if (migrations === null) return persistenceResultFailure("MIGRATION_FAILED");
    const state = readState(database);
    const expectedCurrent = migrations[migrations.length - 1];
    if (expectedCurrent === undefined) return persistenceResultFailure("MIGRATION_FAILED");

    const isEmpty = state.applicationId === 0 && state.userVersion === 0 && state.userObjects === 0;
    if (!isEmpty && state.applicationId !== applicationId) return persistenceResultFailure("UNKNOWN_DATABASE");
    if (!isEmpty && !matchesLedger(state, migrations)) return persistenceResultFailure("MIGRATION_HISTORY_MISMATCH");

    const appliedCount = isEmpty ? 0 : state.ledger.length;
    const pending = migrations.slice(appliedCount);
    if (pending.length === 0) {
      return { ok: true, value: { appliedMigrationIds: [], currentMigrationId: expectedCurrent.migrationId } };
    }

    try {
      database.transaction(() => {
        for (const migration of pending) {
          database.exec(migration.sql);
          database.run(
            "INSERT INTO storage_migrations (sequence, migration_id, filename, digest) VALUES (?, ?, ?, ?)",
            migration.sequence,
            migration.migrationId,
            migration.filename,
            migration.digest,
          );
        }
        database.exec(`PRAGMA application_id = ${applicationId}`);
        database.exec(`PRAGMA user_version = ${migrations.length}`);
      });
    } catch {
      return persistenceResultFailure("MIGRATION_FAILED");
    }

    return {
      ok: true,
      value: { appliedMigrationIds: pending.map((migration) => migration.migrationId), currentMigrationId: expectedCurrent.migrationId },
    };
  } catch {
    return persistenceResultFailure("STORAGE_FAILURE");
  } finally {
    database.close();
  }
}

export function openCurrentDatabase(input: Readonly<{ databasePath: string }>):
  | Readonly<{ ok: true; database: SqliteAdapter }>
  | Readonly<{ ok: false; code: "INVALID_DATABASE_PATH" | "DATABASE_UNAVAILABLE" | "UNKNOWN_DATABASE" | "MIGRATION_HISTORY_MISMATCH" }> {
  if (!validDatabasePath(input.databasePath)) return { ok: false, code: "INVALID_DATABASE_PATH" };
  let database: SqliteAdapter;
  try {
    database = openSqliteAdapter(input.databasePath);
  } catch {
    return { ok: false, code: "DATABASE_UNAVAILABLE" };
  }
  try {
    const sources = shippedMigrationSources();
    const migrations = sources === null ? null : prepareMigrations(sources);
    if (migrations === null) {
      database.close();
      return { ok: false, code: "MIGRATION_HISTORY_MISMATCH" };
    }
    const state = readState(database);
    if (state.applicationId !== applicationId) {
      database.close();
      return { ok: false, code: "UNKNOWN_DATABASE" };
    }
    if (!matchesLedger(state, migrations) || state.ledger.length !== migrations.length) {
      database.close();
      return { ok: false, code: "MIGRATION_HISTORY_MISMATCH" };
    }
    return { ok: true, database };
  } catch {
    database.close();
    return { ok: false, code: "UNKNOWN_DATABASE" };
  }
}

function validDatabasePath(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

function prepareMigrations(sources: readonly MigrationSource[]): readonly PreparedMigration[] | null {
  const migrations: PreparedMigration[] = [];
  for (const [index, source] of sources.entries()) {
    const match = migrationFilename.exec(source.filename);
    if (match === null || Number(match[1]) !== index + 1) return null;
    let sql: string;
    try {
      sql = new TextDecoder("utf-8", { fatal: true }).decode(source.sqlBytes);
    } catch {
      return null;
    }
    migrations.push({
      sequence: index + 1,
      filename: source.filename,
      migrationId: source.filename.slice(0, -4),
      digest: sha256Digest(source.sqlBytes),
      sql,
    });
  }
  return migrations;
}

function readState(database: SqliteAdapter): DatabaseState {
  const application = database.get("PRAGMA application_id");
  const userVersion = database.get("PRAGMA user_version");
  // 不限定 type：只含 view（或其他非 table 物件）的外部資料庫仍是 unknown database，不得被判為空並寫入。
  const objects = database.get("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  let ledger: readonly SqliteRow[] = [];
  try {
    ledger = database.all("SELECT sequence, migration_id, filename, digest FROM storage_migrations ORDER BY sequence");
  } catch {
    // 沒有 ledger 的資料庫在 marker 檢查後一律被識別為未知資料庫。
  }
  return {
    applicationId: numericField(application, "application_id"),
    userVersion: numericField(userVersion, "user_version"),
    userObjects: numericField(objects, "count"),
    ledger,
  };
}

function matchesLedger(state: DatabaseState, migrations: readonly PreparedMigration[]): boolean {
  if (state.ledger.length === 0 || state.ledger.length > migrations.length || state.userVersion !== state.ledger.length) return false;
  for (const [index, row] of state.ledger.entries()) {
    const migration = migrations[index];
    if (
      migration === undefined ||
      numericField(row, "sequence") !== migration.sequence ||
      row.migration_id !== migration.migrationId ||
      row.filename !== migration.filename ||
      row.digest !== migration.digest
    ) {
      return false;
    }
  }
  return true;
}

function numericField(row: SqliteRow | undefined, key: string): number {
  const value = row?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : Number.NaN;
}
