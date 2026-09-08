import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceReadSnapshot, type PersistenceStore } from "../../../core/persistence/index.js";

function withStore(action: (store: PersistenceStore) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "read-snapshot-"));
  try {
    const store = openStore(path.join(directory, "cms.sqlite"));
    action(store);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function openStore(databasePath: string) {
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence did not open");
  return opened.value;
}

function createPublishedRevision(store: PersistenceStore, entryId: string, revisionId: string): void {
  const schema = canonicalJsonBytes({ type: "object" });
  const content = canonicalJsonBytes({ entryId, revisionId });
  assert.equal(schema.ok && content.ok, true);
  if (!schema.ok || !content.ok) return;
  if (!store.getSchemaVersion({ schemaId: "note", version: 1 }).ok) {
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
  }
  assert.equal(store.createRevision({
    identity: { entryId, revisionId }, schemaIdentity: { schemaId: "note", version: 1 },
    contentBytes: content.value, contentDigest: sha256Digest(content.value),
    lineage: { operationId: `save-${entryId}-${revisionId}`, operationKind: "SaveRevision" },
  }).ok, true);
  assert.equal(store.setEntryPointers({
    entryId, currentRevisionId: revisionId, publishedRevisionId: revisionId,
    lineage: { revisionId, operationId: `publish-${entryId}-${revisionId}`, operationKind: "PublishRevision" },
  }).ok, true);
}

test("read snapshot exposes only read capabilities, retains one generation, and expires on return", () => {
  withStore((store) => {
    createPublishedRevision(store, "entry-b", "r2");
    createPublishedRevision(store, "entry-a", "r1");
    let escaped: PersistenceReadSnapshot | undefined;
    const result = store.runReadSnapshot((snapshot) => {
      escaped = snapshot;
      assert.equal("setEntryPointers" in snapshot, false);
      assert.equal(store.ownsActiveReadSnapshot(snapshot), true);
      const selections = snapshot.listPublishedRevisionSelections();
      assert.equal(selections.ok, true);
      if (!selections.ok) return selections;
      assert.deepEqual(selections.value, [{ entryId: "entry-a", revisionId: "r1" }, { entryId: "entry-b", revisionId: "r2" }]);
      assert.equal(snapshot.getRevision(selections.value[0]!).ok, true);
      return { ok: true as const, value: selections.value };
    });
    assert.equal(result.ok, true);
    assert.notEqual(escaped, undefined);
    if (escaped === undefined) return;
    assert.equal(store.ownsActiveReadSnapshot(escaped), false);
    const expired = escaped.getRevision({ entryId: "entry-a", revisionId: "r1" });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.error.code, "STORAGE_FAILURE");
  });
});

test("ignored read failure poisons a successful read-snapshot decision", () => {
  withStore((store) => {
    const result = store.runReadSnapshot((snapshot) => {
      assert.equal(snapshot.getRevision({ entryId: "missing", revisionId: "missing" }).ok, false);
      return { ok: true as const, value: "must-not-succeed" };
    });
    assert.equal(result.ok, false);
    if (!result.ok && result.error !== null && typeof result.error === "object" && "code" in result.error) assert.equal(result.error.code, "REVISION_NOT_FOUND");
  });
});
