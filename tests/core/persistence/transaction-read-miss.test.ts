import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("a handled read miss does not roll back a transaction the caller decided to commit", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "read-miss-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    const schema = canonicalJsonBytes({ type: "object" });
    const content = canonicalJsonBytes({ title: "draft" });
    if (!schema.ok || !content.ok) return;
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);

    const committed = store.runTransaction<string, never>((transaction) => {
      // 尚未存在的 Entry 沒有 pointers；這是呼叫端要自行處理的正常結果，不是儲存故障。
      assert.equal(transaction.getEntryPointers("entry-1").ok, false);
      assert.equal(transaction.getRevision({ entryId: "entry-1", revisionId: "missing" }).ok, false);
      assert.equal(transaction.getReadyAssetVersion({ assetId: "asset-1", assetVersionId: "version-1" }).ok, false);
      assert.equal(transaction.createRevision({
        identity: { entryId: "entry-1", revisionId: "revision-1" },
        schemaIdentity: { schemaId: "note", version: 1 },
        contentBytes: content.value, contentDigest: sha256Digest(content.value),
        lineage: { operationId: "save-1", operationKind: "SaveRevision" },
      }).ok, true);
      return { ok: true, value: "committed" };
    });

    assert.equal(committed.ok, true);
    assert.equal(store.getRevision({ entryId: "entry-1", revisionId: "revision-1" }).ok, true);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("an unhandled write failure still rolls the whole transaction back", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "write-poison-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    const schema = canonicalJsonBytes({ type: "object" });
    const content = canonicalJsonBytes({ title: "draft" });
    if (!schema.ok || !content.ok) return;
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);

    const committed = store.runTransaction<string, never>((transaction) => {
      assert.equal(transaction.createRevision({
        identity: { entryId: "entry-1", revisionId: "revision-1" },
        schemaIdentity: { schemaId: "note", version: 1 },
        contentBytes: content.value, contentDigest: sha256Digest(content.value),
        lineage: { operationId: "save-1", operationKind: "SaveRevision" },
      }).ok, true);
      // 忽略寫入失敗並照樣 commit：Persistence 仍必須回滾整筆 transaction。
      assert.equal(transaction.createRevisionReferences({ entryId: "entry-1", revisionId: "revision-1" }, [{ assetId: "missing", assetVersionId: "missing" }]).ok, false);
      return { ok: true, value: "committed" };
    });

    assert.equal(committed.ok, false);
    assert.equal(store.getRevision({ entryId: "entry-1", revisionId: "revision-1" }).ok, false);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
