import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { inspectDatabaseGeneration } from "../../../core/persistence/migrations.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

function fixture(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "fresh-migration-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}
function digestFile(pathname: string): string { return createHash("sha256").update(readFileSync(pathname)).digest("hex"); }

test("fresh current-only schema seeds Article, Categories and Tags and reruns without writes", () => {
  const item = fixture();
  try {
    assert.equal(inspectDatabaseGeneration(item.databasePath), "absent");
    assert.deepEqual(migrateDatabase({ databasePath: item.databasePath }), { ok: true, value: { appliedMigrationIds: ["0001-create-current-only-storage"], currentMigrationId: "0001-create-current-only-storage" } });
    assert.equal(inspectDatabaseGeneration(item.databasePath), "current");
    const database = openSqliteAdapter(item.databasePath);
    try {
      assert.equal(database.get("PRAGMA application_id")?.application_id, 1095324501);
      assert.equal(database.get("PRAGMA user_version")?.user_version, 1);
      assert.equal(database.get("SELECT count(*) AS count FROM current_content_types")?.count, 1);
      assert.equal(database.get("SELECT count(*) AS count FROM current_taxonomies")?.count, 2);
      assert.equal(database.get("SELECT count(*) AS count FROM global_slug_claims")?.count, 3);
      assert.equal(database.get("SELECT count(*) AS count FROM sqlite_master WHERE name IN ('schema_versions','revisions','entry_pointers','asset_versions')")?.count, 0);
    } finally { database.close(); }
    const before = digestFile(item.databasePath);
    assert.deepEqual(migrateDatabase({ databasePath: item.databasePath }), { ok: true, value: { appliedMigrationIds: [], currentMigrationId: "0001-create-current-only-storage" } });
    assert.equal(digestFile(item.databasePath), before);
    const opened = openPersistence({ databasePath: item.databasePath });
    assert.equal(opened.ok, true);
    if (opened.ok) {
      const publicStore = opened.value as unknown as Record<string, unknown>;
      for (const oldMethod of ["createRevision", "registerSchemaVersion", "preflightSchemaMigration", "createTaxonomy", "commitReadyAssetVersion"]) {
        assert.equal(publicStore[oldMethod], undefined, oldMethod);
        assert.equal(oldMethod in publicStore, false, oldMethod);
      }
      assert.deepEqual(opened.value.runTransaction((transaction) => ({ ok: true, value: typeof (transaction as unknown as Record<string, unknown>).createRevision })), { ok: true, value: "undefined" });
      assert.deepEqual(opened.value.runReadSnapshot((snapshot) => ({ ok: true, value: typeof (snapshot as unknown as Record<string, unknown>).getRevision })), { ok: true, value: "undefined" });
      opened.value.close();
    }
  } finally { rmSync(item.directory, { recursive: true, force: true }); }
});

test("legacy database is rejected before any write", () => {
  const item = fixture();
  try {
    const database = openSqliteAdapter(item.databasePath);
    database.exec("CREATE TABLE legacy_canary (secret TEXT NOT NULL); INSERT INTO legacy_canary VALUES ('keep'); PRAGMA application_id = 1095324500");
    database.close();
    const before = digestFile(item.databasePath);
    assert.equal(inspectDatabaseGeneration(item.databasePath), "old");
    const migrated = migrateDatabase({ databasePath: item.databasePath });
    assert.equal(migrated.ok ? "" : migrated.error.code, "OLD_DATABASE_UNSUPPORTED");
    const opened = openPersistence({ databasePath: item.databasePath });
    assert.equal(opened.ok ? "" : opened.error.code, "OLD_DATABASE_UNSUPPORTED");
    assert.equal(digestFile(item.databasePath), before);
  } finally { rmSync(item.directory, { recursive: true, force: true }); }
});
