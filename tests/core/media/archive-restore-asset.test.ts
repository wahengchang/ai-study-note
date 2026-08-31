import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("ArchiveAsset changes only availability and RestoreAsset re-enables verified bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "archive-restore-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "media") });
    assert.equal(objects.ok, true);
    if (!objects.ok) return;
    const media = createDataMedia({ persistence: opened.value, objectStore: objects.value });
    assert.equal(media.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1, 2, 3]), metadata: { type: "image" } }).ok, true);
    const archived = media.archiveAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(archived.ok, true);
    assert.equal(archived.ok && archived.value.availability, "archived");
    const restored = media.restoreAsset({ assetId: "asset", assetVersionId: "v1" });
    assert.equal(restored.ok, true);
    assert.equal(restored.ok && restored.value.availability, "ready");
    opened.value.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
