import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { getSiteContentSchemaEvidence } from "../../../core/content/index.js";

import { migrateDatabase, migrateDatabaseWithSchemaEvidence } from "../../../core/persistence/index.js";
import { migrateDatabaseWithSources, shippedMigrationSources, type MigrationSource } from "../../../core/persistence/migrations.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

function temporaryDatabase(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "persistence-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

function digestFile(databasePath: string): string {
  return createHash("sha256").update(readFileSync(databasePath)).digest("hex");
}

function shippedSources(): readonly MigrationSource[] {
  const sources = shippedMigrationSources();
  assert.notEqual(sources, null);
  if (sources === null) throw new Error("Shipped migration sources are unreadable");
  return sources;
}

test("empty database migrates once and rerun preserves current storage", () => {
  const fixture = temporaryDatabase();
  try {
    const first = migrateDatabaseWithSchemaEvidence({ databasePath: fixture.databasePath }, getSiteContentSchemaEvidence());
    assert.deepEqual(first, {
      ok: true,
      value: {
        appliedMigrationIds: [
          "0001-create-persistence-storage",
          "0002-add-persistence-query-indexes",
          "0003-add-entry-pointers",
          "0004-add-route-claims",
          "0005-add-media-storage",
          "0006-add-revision-references",
          "0007-add-plugin-activation-state",
          "0008-add-schema-migration-lineage",
          "0009-add-theme-activation-state",
          "0010-add-plugin-settings-state",
          "0011-add-taxonomy-storage",
        ],
        currentMigrationId: "0011-add-taxonomy-storage",
      },
    });
    const database = openSqliteAdapter(fixture.databasePath);
    assert.equal(database.get("PRAGMA application_id")?.application_id, 1095324500);
    assert.equal(database.get("PRAGMA user_version")?.user_version, 11);
    assert.equal(database.get("SELECT count(*) AS count FROM storage_migrations")?.count, 11);
    assert.equal(database.get("SELECT count(*) AS count FROM taxonomies")?.count, 0);
    assert.equal(database.get("SELECT count(*) AS count FROM taxonomy_term_identities")?.count, 0);
    assert.equal(database.get("SELECT count(*) AS count FROM taxonomy_terms")?.count, 0);
    assert.equal(database.get("SELECT count(*) AS count FROM revision_taxonomy_bindings")?.count, 0);
    assert.deepEqual({ ...database.get("SELECT state_bytes AS bytes, state_digest AS digest FROM theme_activation_state WHERE singleton = 1") }, {
      bytes: new TextEncoder().encode('{"contract":"theme-activation-state/v1"}'),
      digest: "sha256:2d3bd9fd385ef0f4dad9d7026da41a3a39fa04850e0e05ea98322cf5d0230430",
    });
    assert.deepEqual({ ...database.get("SELECT state_bytes AS bytes, state_digest AS digest FROM plugin_settings_state WHERE singleton = 1") }, {
      bytes: new TextEncoder().encode('{"contract":"plugin-settings-state/v1","records":[]}'),
      digest: "sha256:c890fac912180a420c855ee7e05adf0dc94d7e8ef0fba033604dc4156f0a013e",
    });
    const siteContent = getSiteContentSchemaEvidence();
    assert.deepEqual(
      { ...database.get("SELECT schema_bytes AS bytes, schema_digest AS digest FROM schema_versions WHERE schema_id = ? AND version = ?", "site-content", 1) },
      { bytes: siteContent.schemaBytes, digest: siteContent.schemaDigest },
    );
    database.close();
    const before = digestFile(fixture.databasePath);
    assert.deepEqual(migrateDatabaseWithSchemaEvidence({ databasePath: fixture.databasePath }, siteContent), {
      ok: true,
      value: { appliedMigrationIds: [], currentMigrationId: "0011-add-taxonomy-storage" },
    });
    assert.equal(digestFile(fixture.databasePath), before);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("forward migration preserves prior canonical evidence byte-for-byte", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabaseWithSources({ databasePath: fixture.databasePath }, shippedSources().slice(0, 1)).ok, true);
    const schemaBytes = canonicalJsonBytes({ fields: { title: "string" } });
    const contentBytes = canonicalJsonBytes({ title: "可信 Revision" });
    assert.equal(schemaBytes.ok, true);
    assert.equal(contentBytes.ok, true);
    if (!schemaBytes.ok || !contentBytes.ok) return;
    const database = openSqliteAdapter(fixture.databasePath);
    database.run("INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)", "article", 1, schemaBytes.value, sha256Digest(schemaBytes.value));
    database.run("INSERT INTO revisions (entry_id, revision_id, schema_id, schema_version, content_bytes, content_digest, restored_from_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?)", "entry", "r1", "article", 1, contentBytes.value, sha256Digest(contentBytes.value), null);
    database.run("INSERT INTO operation_lineage (entry_id, revision_id, operation_id, operation_kind) VALUES (?, ?, ?, ?)", "entry", "r1", "save-1", "SaveRevision");
    const before = database.get("SELECT content_bytes, content_digest FROM revisions WHERE entry_id = ? AND revision_id = ?", "entry", "r1");
    database.close();
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const afterDatabase = openSqliteAdapter(fixture.databasePath);
    const after = afterDatabase.get("SELECT content_bytes, content_digest FROM revisions WHERE entry_id = ? AND revision_id = ?", "entry", "r1");
    afterDatabase.close();
    assert.deepEqual(after, before);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("production migration reconciles only absent exact site-content schema evidence", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabaseWithSources({ databasePath: fixture.databasePath }, shippedSources().slice(0, 1)).ok, true);
    const database = openSqliteAdapter(fixture.databasePath);
    const incompatible = canonicalJsonBytes({ type: "object" });
    assert.equal(incompatible.ok, true);
    if (!incompatible.ok) return;
    database.run(
      "INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)",
      "site-content",
      1,
      incompatible.value,
      sha256Digest(incompatible.value),
    );
    database.close();
    const before = digestFile(fixture.databasePath);
    const result = migrateDatabaseWithSchemaEvidence({ databasePath: fixture.databasePath }, getSiteContentSchemaEvidence());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "MIGRATION_FAILED");
    assert.equal(digestFile(fixture.databasePath), before);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("path syntax and open failures are separate failures", () => {
  const fixture = temporaryDatabase();
  try {
    const invalidPath = migrateDatabase({ databasePath: "  " });
    assert.equal(invalidPath.ok, false);
    if (!invalidPath.ok) assert.equal(invalidPath.error.code, "INVALID_DATABASE_PATH");

    // path 格式合法但目錄不存在：不得再回報成「請提供有效的 database path」。
    const unavailable = migrateDatabase({ databasePath: path.join(fixture.directory, "no-such-directory", "cms.sqlite") });
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) {
      assert.equal(unavailable.error.code, "DATABASE_UNAVAILABLE");
      assert.deepEqual(unavailable.error.subjectIds, []);
      assert.equal(JSON.stringify(unavailable).includes(fixture.directory), false);
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("unknown and failed migrations do not alter database evidence", () => {
  const unknown = temporaryDatabase();
  const failed = temporaryDatabase();
  try {
    const canary = openSqliteAdapter(unknown.databasePath);
    canary.exec("CREATE TABLE canary (path TEXT, token TEXT) STRICT");
    canary.run("INSERT INTO canary (path, token) VALUES (?, ?)", "/private/canary", "token-do-not-leak");
    canary.close();
    const unknownBefore = digestFile(unknown.databasePath);
    const unknownResult = migrateDatabase({ databasePath: unknown.databasePath });
    assert.equal(unknownResult.ok, false);
    if (!unknownResult.ok) assert.equal(unknownResult.error.code, "UNKNOWN_DATABASE");
    assert.equal(digestFile(unknown.databasePath), unknownBefore);
    assert.equal(JSON.stringify(unknownResult).includes("token-do-not-leak"), false);

    const viewOnly = temporaryDatabase();
    try {
      const foreign = openSqliteAdapter(viewOnly.databasePath);
      foreign.exec("CREATE VIEW foreign_view AS SELECT 1 AS x");
      foreign.close();
      const viewOnlyBefore = digestFile(viewOnly.databasePath);
      const viewOnlyResult = migrateDatabase({ databasePath: viewOnly.databasePath });
      assert.equal(viewOnlyResult.ok, false);
      if (!viewOnlyResult.ok) assert.equal(viewOnlyResult.error.code, "UNKNOWN_DATABASE");
      assert.equal(digestFile(viewOnly.databasePath), viewOnlyBefore);
    } finally {
      rmSync(viewOnly.directory, { recursive: true, force: true });
    }

    const broken = new TextEncoder().encode("CREATE TABLE rollback_canary (value TEXT) STRICT; INVALID SQL;");
    const failedResult = migrateDatabaseWithSources(
      { databasePath: failed.databasePath },
      [shippedSources()[0] as MigrationSource, { filename: "0002-add-persistence-query-indexes.sql", sqlBytes: broken }],
    );
    assert.equal(failedResult.ok, false);
    if (!failedResult.ok) assert.equal(failedResult.error.code, "MIGRATION_FAILED");
    const rollback = openSqliteAdapter(failed.databasePath);
    assert.equal(rollback.get("PRAGMA application_id")?.application_id, 0);
    assert.equal(rollback.get("PRAGMA user_version")?.user_version, 0);
    assert.equal(rollback.get("SELECT count(*) AS count FROM sqlite_master WHERE name = 'rollback_canary'")?.count, 0);
    rollback.close();
  } finally {
    rmSync(unknown.directory, { recursive: true, force: true });
    rmSync(failed.directory, { recursive: true, force: true });
  }
});
