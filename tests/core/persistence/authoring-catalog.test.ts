import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("authoring collection reads are code-unit sorted and return defensive bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-catalog-"));
  const databasePath = path.join(directory, "cms.sqlite");
  try {
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const schema = canonicalJsonBytes({ type: "object" }); const content = canonicalJsonBytes({ title: "A" });
    assert.equal(schema.ok, true); assert.equal(content.ok, true); if (!schema.ok || !content.ok) return;
    for (const schemaId of ["zeta", "article"]) assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId, version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    assert.equal(opened.value.createRevision({ identity: { entryId: "entry-b", revisionId: "r-b" }, schemaIdentity: { schemaId: "article", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: "op-b", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(opened.value.createRevision({ identity: { entryId: "entry-a", revisionId: "r-a" }, schemaIdentity: { schemaId: "article", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: "op-a", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(opened.value.setEntryPointers({ entryId: "entry-b", currentRevisionId: "r-b", lineage: { revisionId: "r-b", operationId: "op-b", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(opened.value.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r-a", lineage: { revisionId: "r-a", operationId: "op-a", operationKind: "SaveRevision" } }).ok, true);
    const schemas = opened.value.listSchemaVersions(); assert.equal(schemas.ok, true); if (schemas.ok) { assert.deepEqual(schemas.value.map((item) => item.identity.schemaId), ["article", "zeta"]); schemas.value[0]?.schemaBytes.fill(0); const again = opened.value.listSchemaVersions(); assert.equal(again.ok, true); if (again.ok) assert.deepEqual(again.value[0]?.schemaBytes, schema.value); }
    const pointers = opened.value.listEntryPointers(); assert.equal(pointers.ok, true); if (pointers.ok) assert.deepEqual(pointers.value.map((item) => item.entryId), ["entry-a", "entry-b"]);
    const revisions = opened.value.listEntryRevisions("entry-b"); assert.equal(revisions.ok, true); if (revisions.ok) assert.deepEqual(revisions.value.map((item) => item.identity.revisionId), ["r-b"]);
    const lineage = opened.value.listEntryPointerLineage("entry-b"); assert.equal(lineage.ok, true); if (lineage.ok) assert.equal(lineage.value[0]?.lineageIdentity.operationId, "op-b");
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
