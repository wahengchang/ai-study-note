import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type CurrentMediaAssetRecord, type PersistenceStore, type ReplaceEntryMediaReferencesInput } from "../../../core/persistence/index.js";

function temporaryDatabase(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "current-media-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

function withStore(run: (store: PersistenceStore) => void): void {
  const fixture = temporaryDatabase();
  const migrated = migrateDatabase({ databasePath: fixture.databasePath });
  assert.equal(migrated.ok, true);
  const opened = openPersistence({ databasePath: fixture.databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    run(opened.value);
  } finally {
    opened.value.close();
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

function asset(assetId: string, overrides: Partial<CurrentMediaAssetRecord> = {}): CurrentMediaAssetRecord {
  return {
    assetId,
    slug: `asset-${assetId}`,
    title: `標題 ${assetId}`,
    altText: null,
    caption: "",
    description: "",
    originalFilename: `${assetId}.txt`,
    mimeType: "text/plain",
    byteLength: 12,
    checksum: sha256Digest(new TextEncoder().encode(assetId)),
    uploadedAt: "2026-09-16T03:00:00.000Z",
    ...overrides,
  };
}

test("0014 migration creates current media asset storage and reference ledger", () => {
  const fixture = temporaryDatabase();
  try {
    const migrated = migrateDatabase({ databasePath: fixture.databasePath });
    assert.equal(migrated.ok, true);
    if (!migrated.ok) return;
    assert.deepEqual(migrated.value.appliedMigrationIds.slice(-1), ["0014-add-current-media-assets"]);
    assert.equal(migrated.value.currentMigrationId, "0014-add-current-media-assets");

    const rerun = migrateDatabase({ databasePath: fixture.databasePath });
    assert.equal(rerun.ok, true);
    if (!rerun.ok) return;
    assert.deepEqual(rerun.value, { appliedMigrationIds: [], currentMigrationId: "0014-add-current-media-assets" });
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("current media assets round-trip with defensive copies and stable ordering", () => {
  withStore((store) => {
    const second = asset("asset-b");
    const input = {
      ...asset("asset-a"),
      title: "圖片",
      altText: "替代文字" as string | null,
      caption: "說明",
      description: "描述",
      originalFilename: "photo.png",
      mimeType: "image/png",
      byteLength: 4_096,
      image: { width: 800, height: 600 },
      thumbnail: { digest: sha256Digest(new TextEncoder().encode("thumbnail")), byteLength: 128, width: 320, height: 240 },
    };
    assert.equal(store.createCurrentMediaAsset(input).ok, true);
    assert.equal(store.createCurrentMediaAsset(second).ok, true);
    // 呼叫端在寫入後改動輸入物件，durable row 不得跟著改變。
    input.title = "被改壞";
    input.image.width = 1;

    const read = store.getCurrentMediaAsset("asset-a");
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(read.value, {
      assetId: "asset-a",
      slug: "asset-asset-a",
      title: "圖片",
      altText: "替代文字",
      caption: "說明",
      description: "描述",
      originalFilename: "photo.png",
      mimeType: "image/png",
      byteLength: 4_096,
      checksum: sha256Digest(new TextEncoder().encode("asset-a")),
      uploadedAt: "2026-09-16T03:00:00.000Z",
      image: { width: 800, height: 600 },
      thumbnail: { digest: sha256Digest(new TextEncoder().encode("thumbnail")), byteLength: 128, width: 320, height: 240 },
    });
    // 回傳值必須是 fresh copy，而不是持久層共用的物件。
    assert.notEqual(read.value.image, input.image);

    const listed = store.listCurrentMediaAssets();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.deepEqual(listed.value.map((record) => record.assetId), ["asset-a", "asset-b"]);
    assert.equal(store.getCurrentMediaAsset("absent").ok, false);
    assert.equal(store.createCurrentMediaAsset(asset("asset-a")).ok, false);
  });
});

test("current media asset writes validate canonical record shape", () => {
  withStore((store) => {
    const invalid: readonly unknown[] = [
      { ...asset("a"), checksum: "not-a-digest" },
      { ...asset("a"), byteLength: -1 },
      { ...asset("a"), byteLength: 1.5 },
      { ...asset("a"), uploadedAt: "2026-09-16 03:00:00" },
      { ...asset("a"), title: "" },
      { ...asset("a"), altText: 5 },
      { ...asset("a"), image: { width: 10, height: 0 } },
      { ...asset("a"), thumbnail: { digest: sha256Digest(new TextEncoder().encode("t")), byteLength: 1, width: 1, height: 1 } },
      { ...asset("a"), image: { width: 10, height: 10 }, thumbnail: { digest: "sha256:", byteLength: 1, width: 1, height: 1 } },
    ];
    for (const value of invalid) {
      const created = store.createCurrentMediaAsset(value as CurrentMediaAssetRecord);
      assert.equal(created.ok, false);
      if (created.ok) continue;
      assert.equal(created.error.code, "INVALID_PERSISTENCE_INPUT");
    }
    const listed = store.listCurrentMediaAssets();
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.value.length, 0);
  });
});

test("current media references are ordered, deduplicated, and block deletion", () => {
  withStore((store) => {
    assert.equal(store.createCurrentMediaAsset(asset("asset-a")).ok, true);
    assert.equal(store.createCurrentMediaAsset(asset("asset-b")).ok, true);

    const replaced = store.replaceEntryMediaReferences({ entryId: "entry-2", status: "published", assetIds: ["asset-b", "asset-a"] });
    assert.equal(replaced.ok, true);
    if (!replaced.ok) return;
    assert.deepEqual(replaced.value, [
      { entryId: "entry-2", status: "published" },
      { entryId: "entry-2", status: "published" },
    ]);
    assert.equal(store.replaceEntryMediaReferences({ entryId: "entry-1", status: "draft", assetIds: ["asset-a"] }).ok, true);

    const usage = store.listCurrentMediaReferences("asset-a");
    assert.equal(usage.ok, true);
    if (!usage.ok) return;
    assert.deepEqual(usage.value, [
      { entryId: "entry-1", status: "draft" },
      { entryId: "entry-2", status: "published" },
    ]);

    // entry 重新 Save 時整批覆寫，舊 reference 立即釋放。
    assert.equal(store.replaceEntryMediaReferences({ entryId: "entry-1", status: "published", assetIds: [] }).ok, true);
    const released = store.listCurrentMediaReferences("asset-a");
    assert.equal(released.ok, true);
    if (!released.ok) return;
    assert.deepEqual(released.value, [{ entryId: "entry-2", status: "published" }]);

    const blocked = store.deleteCurrentMediaAsset("asset-a");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error.code, "CURRENT_MEDIA_REFERENCE_CONFLICT");
    assert.equal(store.getCurrentMediaAsset("asset-a").ok, true);

    const duplicated = store.replaceEntryMediaReferences({ entryId: "entry-3", status: "draft", assetIds: ["asset-a", "asset-a"] });
    assert.equal(duplicated.ok, false);
    const foreign = store.replaceEntryMediaReferences({ entryId: "entry-3", status: "draft", assetIds: ["absent"] });
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.error.code, "CURRENT_MEDIA_ASSET_NOT_FOUND");
    // boundary 輸入不受型別保護：非 canonical status 必須 fail closed。
    const invalidStatus: unknown = { entryId: "entry-3", status: "unknown", assetIds: [] };
    assert.equal(store.replaceEntryMediaReferences(invalidStatus as ReplaceEntryMediaReferencesInput).ok, false);

    assert.equal(store.replaceEntryMediaReferences({ entryId: "entry-2", status: "draft", assetIds: [] }).ok, true);
    assert.equal(store.deleteCurrentMediaAsset("asset-a").ok, true);
    assert.equal(store.getCurrentMediaAsset("asset-a").ok, false);
    assert.equal(store.deleteCurrentMediaAsset("asset-a").ok, false);
  });
});

test("replacing a current media asset keeps its identity and updates byte evidence", () => {
  withStore((store) => {
    assert.equal(store.createCurrentMediaAsset(asset("asset-a")).ok, true);
    const replaced = store.replaceCurrentMediaAsset(asset("asset-a", { title: "更新", byteLength: 20, mimeType: "image/png", image: { width: 4, height: 4 } }));
    assert.equal(replaced.ok, true);
    const read = store.getCurrentMediaAsset("asset-a");
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.value.title, "更新");
    assert.equal(read.value.byteLength, 20);
    assert.deepEqual(read.value.image, { width: 4, height: 4 });
    assert.equal(read.value.thumbnail, undefined);
    assert.equal(store.replaceCurrentMediaAsset(asset("absent")).ok, false);
  });
});

test("failed current media mutation leaves the canonical state unchanged", () => {
  withStore((store) => {
    assert.equal(store.createCurrentMediaAsset(asset("asset-a")).ok, true);
    const before = store.canonicalState();
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.equal(before.value.counts.currentMediaAssets, 1);
    assert.equal(before.value.counts.currentMediaReferences, 0);

    const decision = store.runTransaction<true, string>((transaction) => {
      assert.equal(transaction.createCurrentMediaAsset(asset("asset-b")).ok, true);
      assert.equal(transaction.replaceEntryMediaReferences({ entryId: "entry-1", status: "draft", assetIds: ["asset-b"] }).ok, true);
      return { ok: false, error: "ABORT" };
    });
    assert.equal(decision.ok, false);
    assert.equal(store.getCurrentMediaAsset("asset-b").ok, false);

    const after = store.canonicalState();
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.value.digest, before.value.digest);
  });
});

test("canonical state binds current media records and references", () => {
  withStore((store) => {
    const empty = store.canonicalState();
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    assert.equal(empty.value.counts.currentMediaAssets, 0);
    assert.equal(empty.value.counts.currentMediaReferences, 0);

    assert.equal(store.createCurrentMediaAsset(asset("asset-a")).ok, true);
    assert.equal(store.replaceEntryMediaReferences({ entryId: "entry-1", status: "published", assetIds: ["asset-a"] }).ok, true);
    const populated = store.canonicalState();
    assert.equal(populated.ok, true);
    if (!populated.ok) return;
    assert.equal(populated.value.counts.currentMediaAssets, 1);
    assert.equal(populated.value.counts.currentMediaReferences, 1);
    assert.notEqual(populated.value.digest, empty.value.digest);
    const payload = new TextDecoder("utf-8", { fatal: true }).decode(populated.value.bytes);
    assert.equal(payload.includes("\"currentMediaAssets\""), true);
    assert.equal(payload.includes("\"currentMediaReferences\""), true);
    assert.equal(payload.includes("asset-a"), true);
    assert.equal(payload.includes("\"entryStatus\":\"published\""), true);
  });
});
