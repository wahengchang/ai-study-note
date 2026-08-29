import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { openSqliteAdapter, sqliteConstraintKind, sqliteFailureCode } from "../../../core/persistence/sqlite-adapter.js";

function fixture(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "persistence-failures-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

function canonicalContent(): Uint8Array {
  const result = canonicalJsonBytes({ title: "可信 Revision" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
  return result.value;
}

function readyStore(databasePath: string) {
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("Migration did not open Persistence store");
  const schemaBytes = canonicalJsonBytes({ fields: { title: "string" } });
  assert.equal(schemaBytes.ok, true);
  if (!schemaBytes.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
  assert.equal(
    opened.value.registerSchemaVersion({
      identity: { schemaId: "article", version: 1 },
      schemaBytes: schemaBytes.value,
      schemaDigest: sha256Digest(schemaBytes.value),
    }).ok,
    true,
  );
  return opened.value;
}

test("canonical and digest failures are fixed and sanitized", () => {
  const value = fixture();
  try {
    const store = readyStore(value.databasePath);
    const invalid = store.createRevision({
      identity: { entryId: "entry", revisionId: "r1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: new TextEncoder().encode('{"z":1,"a":2}'),
      contentDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      lineage: { operationId: "token-do-not-leak", operationKind: "SaveRevision" },
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.error.code, "NON_CANONICAL_BYTES");
      assert.deepEqual(invalid.error.subjectIds, []);
      assert.equal(JSON.stringify(invalid).includes("token-do-not-leak"), false);
    }
    const content = canonicalContent();
    const digest = store.createRevision({
      identity: { entryId: "entry", revisionId: "r1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: content,
      contentDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      lineage: { operationId: "save", operationKind: "SaveRevision" },
    });
    assert.equal(digest.ok, false);
    if (!digest.ok) assert.equal(digest.error.code, "DIGEST_MISMATCH");
    const absent = store.getRevision({ entryId: "entry", revisionId: "r1" });
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.equal(absent.error.code, "REVISION_NOT_FOUND");
    store.close();
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("lineage failure rolls back earlier revision append and immutable triggers hold", () => {
  const value = fixture();
  try {
    const store = readyStore(value.databasePath);
    const baselineContent = canonicalContent();
    assert.equal(
      store.createRevision({
        identity: { entryId: "entry", revisionId: "r0" },
        schemaIdentity: { schemaId: "article", version: 1 },
        contentBytes: baselineContent,
        contentDigest: sha256Digest(baselineContent),
        lineage: { operationId: "save-0", operationKind: "SaveRevision" },
      }).ok,
      true,
    );
    store.close();
    const adapter = openSqliteAdapter(value.databasePath);
    adapter.exec("CREATE TRIGGER canary_lineage_abort BEFORE INSERT ON operation_lineage BEGIN SELECT RAISE(ABORT, 'canary transaction failure'); END");
    adapter.close();

    const reopened = openPersistence({ databasePath: value.databasePath });
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    const content = canonicalContent();
    const created = reopened.value.createRevision({
      identity: { entryId: "entry", revisionId: "r1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: content,
      contentDigest: sha256Digest(content),
      lineage: { operationId: "save", operationKind: "SaveRevision" },
    });
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.error.code, "STORAGE_FAILURE");
      assert.deepEqual(created.error.subjectIds, []);
    }
    assert.equal(reopened.value.getRevision({ entryId: "entry", revisionId: "r1" }).ok, false);
    reopened.value.close();

    const compatibility = openSqliteAdapter(value.databasePath);
    assert.throws(() => compatibility.run("UPDATE schema_versions SET schema_digest = ? WHERE schema_id = ?", "sha256:0000000000000000000000000000000000000000000000000000000000000000", "article"), (error) => sqliteFailureCode(error) === "IMMUTABLE_SCHEMA_VERSION");
    assert.throws(() => compatibility.run("DELETE FROM schema_versions WHERE schema_id = ?", "article"), (error) => sqliteFailureCode(error) === "IMMUTABLE_SCHEMA_VERSION");
    assert.throws(() => compatibility.run("UPDATE revisions SET content_digest = ? WHERE entry_id = ? AND revision_id = ?", "sha256:0000000000000000000000000000000000000000000000000000000000000000", "entry", "r0"), (error) => sqliteFailureCode(error) === "IMMUTABLE_REVISION");
    assert.throws(() => compatibility.run("DELETE FROM revisions WHERE entry_id = ? AND revision_id = ?", "entry", "r0"), (error) => sqliteFailureCode(error) === "IMMUTABLE_REVISION");
    compatibility.close();
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("failures are classified by SQLite result code, not by driver message text", () => {
  const value = fixture();
  try {
    const store = readyStore(value.databasePath);
    store.close();
    const database = openSqliteAdapter(value.databasePath);
    const digest = `sha256:${"0".repeat(64)}`;

    function thrown(operation: () => void): unknown {
      try {
        operation();
      } catch (error) {
        return error;
      }
      throw new Error("Expected the operation to fail");
    }

    // 同一句 "constraint failed" 底下的四種 constraint 必須被分開，否則 store 會把
    // CHECK／FK 失敗誤報成 identity conflict。
    const unique = thrown(() =>
      database.run("INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)", "article", 1, new Uint8Array([1]), digest),
    );
    assert.equal(sqliteConstraintKind(unique), "unique");
    assert.equal(sqliteFailureCode(unique), "CONSTRAINT_VIOLATION");

    const foreignKey = thrown(() =>
      database.run(
        "INSERT INTO revisions (entry_id, revision_id, schema_id, schema_version, content_bytes, content_digest, restored_from_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        "entry",
        "r-fk",
        "missing-schema",
        1,
        new Uint8Array([1]),
        digest,
        null,
      ),
    );
    assert.equal(sqliteConstraintKind(foreignKey), "foreign-key");
    assert.equal(sqliteFailureCode(foreignKey), "CONSTRAINT_VIOLATION");

    const check = thrown(() =>
      database.run("INSERT INTO schema_versions (schema_id, version, schema_bytes, schema_digest) VALUES (?, ?, ?, ?)", "other", 1, new Uint8Array([1]), "not-a-digest"),
    );
    assert.equal(sqliteConstraintKind(check), "check");
    assert.equal(sqliteFailureCode(check), "CONSTRAINT_VIOLATION");

    const trigger = thrown(() => database.run("DELETE FROM schema_versions WHERE schema_id = ?", "article"));
    assert.equal(sqliteConstraintKind(trigger), "trigger");
    assert.equal(sqliteFailureCode(trigger), "IMMUTABLE_SCHEMA_VERSION");

    // 非本 owner 宣告的 trigger abort 不是既定 constraint，維持 STORAGE_FAILURE。
    database.exec("CREATE TRIGGER foreign_trigger BEFORE INSERT ON operation_lineage BEGIN SELECT RAISE(ABORT, 'foreign trigger'); END");
    const foreignTrigger = thrown(() =>
      database.run("INSERT INTO operation_lineage (entry_id, revision_id, operation_id, operation_kind) VALUES (?, ?, ?, ?)", "entry", "r-x", "op", "SaveRevision"),
    );
    assert.equal(sqliteConstraintKind(foreignTrigger), "trigger");
    assert.equal(sqliteFailureCode(foreignTrigger), "STORAGE_FAILURE");

    // 非 constraint 的錯誤不得被歸類成 constraint。
    const syntax = thrown(() => database.exec("INVALID SQL"));
    assert.equal(sqliteConstraintKind(syntax), null);
    assert.equal(sqliteFailureCode(syntax), "STORAGE_FAILURE");

    // 訊息文字剛好含有 trigger 名稱的非 SQLite 錯誤不得被誤判為 immutable 違規。
    assert.equal(sqliteConstraintKind(new Error("immutable_revisions")), null);
    assert.equal(sqliteFailureCode(new Error("immutable_revisions")), "STORAGE_FAILURE");
    database.close();
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

// `validText` 只要求 length > 0，但 SQLite 的 `length()` 在第一個 NUL 就停止，
// 因此含前導 NUL 的 identity 會通過 store 前置檢查、在 INSERT 才觸發 CHECK。
// 這是唯一能從公開 API 走到「非 unique constraint 失敗」的路徑。
const nulEntryId = "\u0000entry";

test("CHECK 違規不得被回報成 identity conflict", () => {
  const value = fixture();
  try {
    const store = readyStore(value.databasePath);
    const content = canonicalContent();
    const revision = store.createRevision({
      identity: { entryId: nulEntryId, revisionId: "r1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: content,
      contentDigest: sha256Digest(content),
      lineage: { operationId: "op-1", operationKind: "SaveRevision" },
    });
    assert.equal(revision.ok, false);
    if (!revision.ok) assert.equal(revision.error.code, "CONSTRAINT_VIOLATION");

    const schemaBytes = canonicalJsonBytes({ fields: { title: "string" } });
    assert.equal(schemaBytes.ok, true);
    if (!schemaBytes.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
    const schema = store.registerSchemaVersion({
      identity: { schemaId: nulEntryId, version: 1 },
      schemaBytes: schemaBytes.value,
      schemaDigest: sha256Digest(schemaBytes.value),
    });
    assert.equal(schema.ok, false);
    if (!schema.ok) assert.equal(schema.error.code, "CONSTRAINT_VIOLATION");
    store.close();
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("INSERT 期間的 unique 違規仍回報 REVISION_CONFLICT", () => {
  const value = fixture();
  try {
    const setup = readyStore(value.databasePath);
    setup.close();
    // 額外的 unique index 讓第二筆 revision 通過 store 的存在性前置檢查後，
    // 才在 INSERT 撞上 unique constraint，藉此走到 catch 分支。
    const schemaSetup = openSqliteAdapter(value.databasePath);
    schemaSetup.exec("CREATE UNIQUE INDEX one_revision_per_content ON revisions (content_digest)");
    schemaSetup.close();

    const opened = openPersistence({ databasePath: value.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) throw new Error("Persistence store did not reopen");
    const content = canonicalContent();
    const write = (revisionId: string) =>
      opened.value.createRevision({
        identity: { entryId: "entry", revisionId },
        schemaIdentity: { schemaId: "article", version: 1 },
        contentBytes: content,
        contentDigest: sha256Digest(content),
        lineage: { operationId: `op-${revisionId}`, operationKind: "SaveRevision" },
      });
    assert.equal(write("r1").ok, true);
    const conflict = write("r2");
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "REVISION_CONFLICT");
    opened.value.close();
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
