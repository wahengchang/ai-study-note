import { DatabaseSync } from "node:sqlite";

import type { PersistenceFailureCode } from "./contracts.js";

type SqliteParameter = string | number | bigint | Uint8Array | null;
export type SqliteRow = Readonly<Record<string, unknown>>;

export class SqliteAdapter {
  readonly #database: DatabaseSync;

  constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.enableLoadExtension(false);
    // `defensive` 與 `dqs_dml`／`dqs_ddl` 只是 sqlite3_db_config() flag，不是 PRAGMA；
    // SQLite 會靜默忽略未知 PRAGMA，寫在這裡只會製造安全假象。node:sqlite 尚未暴露 db_config，
    // 目前無法開啟 defensive；double-quoted string misfeature 在 Node 內建 build 已預設關閉。
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  exec(sql: string): void {
    this.#database.exec(sql);
  }

  get(sql: string, ...parameters: SqliteParameter[]): SqliteRow | undefined {
    return this.#database.prepare(sql).get(...parameters) as SqliteRow | undefined;
  }

  all(sql: string, ...parameters: SqliteParameter[]): readonly SqliteRow[] {
    return this.#database.prepare(sql).all(...parameters) as readonly SqliteRow[];
  }

  run(sql: string, ...parameters: SqliteParameter[]): void {
    this.#database.prepare(sql).run(...parameters);
  }

  transaction<T>(operation: () => T): T {
    this.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        this.exec("ROLLBACK");
      } catch {
        // 交易尚未開始或已中止時不覆蓋原始失敗；外層會轉為固定 failure。
      }
      throw error;
    }
  }

  readTransaction<T>(operation: () => T): T {
    this.exec("BEGIN");
    try {
      const value = operation();
      this.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        this.exec("ROLLBACK");
      } catch {
        // 唯讀快照未開始或已中止時保留原始失敗。
      }
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }
}

export function openSqliteAdapter(databasePath: string): SqliteAdapter {
  return new SqliteAdapter(databasePath);
}

// SQLite extended result code（node:sqlite 以 `errcode` 提供）。用數值分類，不解析英文訊息：
// driver 訊息會隨 SQLite／Node 版本改寫，result code 不會。
const sqliteConstraint = 19; // SQLITE_CONSTRAINT，取 errcode & 0xff 得到 primary code
const constraintKinds: Readonly<Record<number, SqliteConstraintKind>> = {
  275: "check", // SQLITE_CONSTRAINT_CHECK
  787: "foreign-key", // SQLITE_CONSTRAINT_FOREIGNKEY
  1555: "unique", // SQLITE_CONSTRAINT_PRIMARYKEY
  1811: "trigger", // SQLITE_CONSTRAINT_TRIGGER
  2067: "unique", // SQLITE_CONSTRAINT_UNIQUE
};

export type SqliteConstraintKind = "unique" | "foreign-key" | "check" | "trigger" | "other";

export function sqliteConstraintKind(error: unknown): SqliteConstraintKind | null {
  if (!(error instanceof Error)) return null;
  const errcode = (error as Error & { errcode?: unknown }).errcode;
  if (typeof errcode !== "number" || !Number.isSafeInteger(errcode)) return null;
  if ((errcode & 0xff) !== sqliteConstraint) return null;
  return constraintKinds[errcode] ?? "other";
}

export function sqliteFailureCode(error: unknown): PersistenceFailureCode {
  const kind = sqliteConstraintKind(error);
  if (kind === null) return "STORAGE_FAILURE";
  if (kind !== "trigger") return "CONSTRAINT_VIOLATION";
  // trigger 名稱是本 owner 自己 RAISE 的固定字串，不是 driver 產生的訊息，所以可安全比對。
  // 非本 owner 宣告的 trigger 不是既定 constraint，一律當成非預期的 storage fault。
  const message = error instanceof Error ? error.message : "";
  if (message.includes("immutable_schema_versions")) return "IMMUTABLE_SCHEMA_VERSION";
  if (message.includes("immutable_revisions")) return "IMMUTABLE_REVISION";
  return "STORAGE_FAILURE";
}
