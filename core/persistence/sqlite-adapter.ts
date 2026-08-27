import { DatabaseSync } from "node:sqlite";

import type { PersistenceFailureCode } from "./contracts.js";

type SqliteParameter = string | number | bigint | Uint8Array | null;
export type SqliteRow = Readonly<Record<string, unknown>>;

export class SqliteAdapter {
  readonly #database: DatabaseSync;

  constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.enableLoadExtension(false);
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA defensive = ON; PRAGMA trusted_schema = OFF; PRAGMA dqs_dml = OFF; PRAGMA dqs_ddl = OFF;");
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

  close(): void {
    this.#database.close();
  }
}

export function openSqliteAdapter(databasePath: string): SqliteAdapter {
  return new SqliteAdapter(databasePath);
}

export function sqliteFailureCode(error: unknown): PersistenceFailureCode {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("immutable_schema_versions")) return "IMMUTABLE_SCHEMA_VERSION";
  if (message.includes("immutable_revisions")) return "IMMUTABLE_REVISION";
  if (message.includes("constraint") || message.includes("FOREIGN KEY") || message.includes("UNIQUE") || message.includes("CHECK")) {
    return "CONSTRAINT_VIOLATION";
  }
  return "STORAGE_FAILURE";
}
