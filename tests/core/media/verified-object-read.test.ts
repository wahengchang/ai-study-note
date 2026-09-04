import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalMediaObjectStore, startDataMedia, type DataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

function withMedia(action: (input: Readonly<{ media: DataMedia }>) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "verified-media-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const root = path.join(directory, "objects");
    const objectStore = createLocalMediaObjectStore({ objectsRoot: root });
    assert.equal(objectStore.ok, true);
    if (!objectStore.ok) return;
    const started = startDataMedia({ persistence: opened.value, objectStore: objectStore.value });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    action({ media: started.value });
    opened.value.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("readReadyObject returns verified fresh object and metadata bytes", () => {
  withMedia(({ media }) => {
    const imported = media.importLocal({ importId: "import-1", assetId: "asset-1", assetVersionId: "version-1", bytes: new TextEncoder().encode("verified bytes"), metadata: { mime: "text/plain" } });
    assert.equal(imported.ok, true);
    const first = media.readReadyObject({ assetId: "asset-1", assetVersionId: "version-1" });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    first.value.bytes[0] = 0;
    first.value.asset.metadataBytes[0] = 0;
    const second = media.readReadyObject({ assetId: "asset-1", assetVersionId: "version-1" });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(new TextDecoder().decode(second.value.bytes), "verified bytes");
    assert.notEqual(second.value.asset.metadataBytes[0], 0);
  });
});
