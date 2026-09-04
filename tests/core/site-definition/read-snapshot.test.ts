import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";
import { createSiteDefinition, type SiteDefinitionReadSnapshot } from "../../../core/site-definition/index.js";

function withStore(action: (store: PersistenceStore) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "site-read-snapshot-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    action(opened.value);
    opened.value.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("SiteDefinition snapshots an owned active read capability using the existing canonical graph path", () => {
  withStore((store) => {
    const schema = canonicalJsonBytes({ type: "object" });
    const content = canonicalJsonBytes({ title: "route source" });
    assert.equal(schema.ok && content.ok, true);
    if (!schema.ok || !content.ok) return;
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    assert.equal(store.createRevision({
      identity: { entryId: "entry-a", revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 },
      contentBytes: content.value, contentDigest: sha256Digest(content.value),
      lineage: { operationId: "save-entry-a", operationKind: "SaveRevision" },
    }).ok, true);
    const site = createSiteDefinition({ persistence: store });
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/Learn/", sourceRevisionId: "r1" }).ok, true);
    const expected = site.snapshot("current");
    assert.equal(expected.ok, true);
    let escaped: SiteDefinitionReadSnapshot | undefined;
    const result = store.runReadSnapshot((snapshot) => {
      escaped = snapshot;
      const actual = site.snapshotInReadSnapshot("current", snapshot);
      assert.equal(actual.ok, true);
      if (!actual.ok || !expected.ok) return { ok: false as const, error: "snapshot" };
      assert.deepEqual(actual.value.claims, expected.value.claims);
      assert.deepEqual(actual.value.bytes, expected.value.bytes);
      assert.equal(actual.value.digest, expected.value.digest);
      return { ok: true as const, value: actual.value.digest };
    });
    assert.equal(result.ok, true);
    assert.notEqual(escaped, undefined);
    if (escaped === undefined) return;
    const expired = site.snapshotInReadSnapshot("current", escaped);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.error.code, "SITE_DEFINITION_STORAGE_FAILURE");
  });
});

test("SiteDefinition rejects foreign read capabilities", () => {
  withStore((store) => {
    const site = createSiteDefinition({ persistence: store });
    const foreign = { listRouteClaims: () => ({ ok: true as const, value: [] }) };
    const result = site.snapshotInReadSnapshot("published", foreign);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "SITE_DEFINITION_STORAGE_FAILURE");
  });
});
