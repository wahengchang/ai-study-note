import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDataMedia, createLocalMediaObjectStore } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

test("local import persists a ready version and resolves only verified final bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "local-media-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite"); assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath }); assert.equal(opened.ok, true); if (!opened.ok) return;
    const objectStore = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); assert.equal(objectStore.ok, true); if (!objectStore.ok) return;
    const media = createDataMedia({ persistence: opened.value, objectStore: objectStore.value });
    const imported = media.importLocal({ importId: "import-1", assetId: "asset-1", assetVersionId: "version-1", bytes: new TextEncoder().encode("media bytes"), metadata: { mime: "text/plain" } });
    assert.equal(imported.ok, true); if (!imported.ok) return;
    assert.equal(imported.value.availability, "ready");
    const resolved = media.getReadyAssetVersion({ assetId: "asset-1", assetVersionId: "version-1" });
    assert.equal(resolved.ok, true);
    opened.value.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
