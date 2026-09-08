import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAuthoringReadFacade } from "../../../core/application/index.js";
import { createPublishedContentReadModel } from "../../../core/content/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";

/**
 * Content Type read 只由 `listSchemaVersions()` 的 code-unit 排序決定選版：
 * 同一 schemaId 必須回傳最新 version，跨 schemaId 不得互相干擾。
 */
test("Content Type read 對同一 schemaId 回傳最新 version 並拒絕未知與非法識別碼", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-read-content-type-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    const objectsRoot = path.join(directory, "objects");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objectStore = createLocalMediaObjectStore({ objectsRoot }); assert.equal(objectStore.ok, true); if (!objectStore.ok) return;
    const dataMedia = startDataMedia({ persistence: opened.value, objectStore: objectStore.value }); assert.equal(dataMedia.ok, true); if (!dataMedia.ok) return;
    const contentReadModel = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] }); assert.equal(contentReadModel.ok, true); if (!contentReadModel.ok) return;

    for (const [schemaId, version, title] of [["article", 1, "v1"], ["article", 2, "v2"], ["zeta", 1, "other"]] as const) {
      const bytes = canonicalJsonBytes({ type: "object", title }); assert.equal(bytes.ok, true); if (!bytes.ok) return;
      assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId, version }, schemaBytes: bytes.value, schemaDigest: sha256Digest(bytes.value) }).ok, true);
    }

    const facade = createAuthoringReadFacade({ persistence: opened.value, siteDefinition: createSiteDefinition({ persistence: opened.value }), dataMedia: dataMedia.value, contentReadModel: contentReadModel.value });
    const catalog = await facade.listContentTypes();
    assert.equal(catalog.ok, true);
    if (catalog.ok) assert.deepEqual(catalog.value.items.map((item) => `${item.schemaIdentity.schemaId}@${item.schemaIdentity.version}`), ["article@1", "article@2", "zeta@1"]);

    const latest = await facade.getContentType({ schemaId: "article" });
    assert.equal(latest.ok, true);
    if (latest.ok) assert.equal(latest.value.schemaIdentity.version, 2);
    const other = await facade.getContentType({ schemaId: "zeta" });
    assert.equal(other.ok, true);
    if (other.ok) assert.equal(other.value.schemaIdentity.version, 1);

    const missing = await facade.getContentType({ schemaId: "unknown" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "CONTENT_TYPE_NOT_FOUND");
    const invalid = await facade.getContentType({ schemaId: ".." });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error.code, "INVALID_AUTHORING_READ_INPUT");
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
