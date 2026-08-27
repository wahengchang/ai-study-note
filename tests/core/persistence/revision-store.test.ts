import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceResult } from "../../../core/persistence/index.js";

function failureCode<T>(result: PersistenceResult<T>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

function databasePath(): Readonly<{ directory: string; value: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "revision-store-"));
  return { directory, value: path.join(directory, "cms.sqlite") };
}

function fixtureBytes(): Readonly<{ schemaBytes: Uint8Array; contentBytes: Uint8Array }> {
  const schema = canonicalJsonBytes({ fields: { title: "string" } });
  const content = canonicalJsonBytes({ title: "可信 Revision" });
  assert.equal(schema.ok, true);
  assert.equal(content.ok, true);
  if (!schema.ok || !content.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
  return { schemaBytes: schema.value, contentBytes: content.value };
}

test("schema versions and revisions persist immutable copied evidence", () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.value }).ok, true);
    const bytes = fixtureBytes();
    const opened = openPersistence({ databasePath: fixture.value });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    const schema = store.registerSchemaVersion({
      identity: { schemaId: "article", version: 1 },
      schemaBytes: bytes.schemaBytes,
      schemaDigest: sha256Digest(bytes.schemaBytes),
    });
    assert.equal(schema.ok, true);
    const created = store.createRevision({
      identity: { entryId: "entry-1", revisionId: "revision-1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: bytes.contentBytes,
      contentDigest: sha256Digest(bytes.contentBytes),
      lineage: { operationId: "save-1", operationKind: "SaveRevision" },
    });
    assert.equal(created.ok, true);
    bytes.schemaBytes[0] = 0;
    bytes.contentBytes[0] = 0;
    store.close();

    const reopened = openPersistence({ databasePath: fixture.value });
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    const found = reopened.value.getRevision({ entryId: "entry-1", revisionId: "revision-1" });
    assert.equal(found.ok, true);
    if (found.ok) {
      assert.deepEqual(found.value.identity, { entryId: "entry-1", revisionId: "revision-1" });
      assert.deepEqual(found.value.schemaIdentity, { schemaId: "article", version: 1 });
      assert.deepEqual(found.value.lineage, { operationId: "save-1", operationKind: "SaveRevision" });
      assert.deepEqual(found.value.contentBytes, fixtureBytes().contentBytes);
      found.value.contentBytes[0] = 0;
      const again = reopened.value.getRevision({ entryId: "entry-1", revisionId: "revision-1" });
      assert.equal(again.ok, true);
      if (again.ok) assert.deepEqual(again.value.contentBytes, fixtureBytes().contentBytes);
    }
    reopened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("schema history and revision constraints are append-only", () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.value }).ok, true);
    const bytes = fixtureBytes();
    const opened = openPersistence({ databasePath: fixture.value });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    const schemaInput = { schemaBytes: bytes.schemaBytes, schemaDigest: sha256Digest(bytes.schemaBytes) };
    assert.equal(failureCode(store.registerSchemaVersion({ identity: { schemaId: "article", version: 2 }, ...schemaInput })), "SCHEMA_VERSION_CONFLICT");
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "article", version: 1 }, ...schemaInput }).ok, true);
    assert.equal(failureCode(store.registerSchemaVersion({ identity: { schemaId: "article", version: 1 }, ...schemaInput })), "SCHEMA_VERSION_CONFLICT");
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "article", version: 2 }, ...schemaInput }).ok, true);

    const revision = {
      identity: { entryId: "entry-1", revisionId: "revision-1" },
      schemaIdentity: { schemaId: "article", version: 1 },
      contentBytes: bytes.contentBytes,
      contentDigest: sha256Digest(bytes.contentBytes),
      lineage: { operationId: "save-1", operationKind: "SaveRevision" },
    };
    assert.equal(failureCode(store.createRevision({ ...revision, schemaIdentity: { schemaId: "missing", version: 1 } })), "SCHEMA_VERSION_NOT_FOUND");
    assert.equal(store.createRevision(revision).ok, true);
    assert.equal(failureCode(store.createRevision(revision)), "REVISION_CONFLICT");
    assert.equal(
      store.createRevision({
        ...revision,
        identity: { entryId: "entry-1", revisionId: "revision-2" },
        restoredFromRevisionId: "revision-1",
        lineage: { operationId: "restore-1", operationKind: "RestoreRevision" },
      }).ok,
      true,
    );
    store.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
