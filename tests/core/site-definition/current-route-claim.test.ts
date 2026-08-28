import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createSiteDefinition, normalizeRoute } from "../../../core/site-definition/index.js";

test("route normalization is NFC full-fold slash canonical and claims reject collisions", () => {
  assert.equal(normalizeRoute("/Café/")?.normalizedRoute, "/café");
  assert.equal(normalizeRoute("/Cafe\u0301")?.normalizedRoute, "/café");
  assert.equal(normalizeRoute("/Straße/")?.normalizedRoute, "/strasse");
  assert.equal(normalizeRoute("/Learn//Guide/")?.normalizedRoute, "/learn/guide");
  assert.equal(normalizeRoute("/a/../b"), null);
  const directory = mkdtempSync(path.join(tmpdir(), "route-claim-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const schema = canonicalJsonBytes({ type: "object" }); const content = canonicalJsonBytes({ title: "x" }); assert.equal(schema.ok && content.ok, true); if (!schema.ok || !content.ok) return;
    assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    for (const entryId of ["entry-a", "entry-b"]) assert.equal(opened.value.createRevision({ identity: { entryId, revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: `save-${entryId}`, operationKind: "SaveRevision" } }).ok, true);
    const site = createSiteDefinition({ persistence: opened.value });
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/Straße/", sourceRevisionId: "r1" }).ok, true);
    const conflict = site.createCurrentClaim({ owner: "entry-b", route: "/STRASSE", sourceRevisionId: "r1" }); assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.error.code, "ROUTE_CONFLICT");
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
