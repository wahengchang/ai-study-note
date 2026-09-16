import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";

import { createCurrentMediaLibrary, type CurrentMediaLibrary, type MediaImportMetadataV2, type MediaUploadSource } from "../../../core/application/index.js";
import { canonicalJsonBytes } from "../../../core/foundation/index.js";
import { createCurrentMediaObjectStore, type CurrentMediaObjectStore } from "../../../core/media/index.js";
import { sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";

type Fixture = Readonly<{
  directory: string;
  persistence: PersistenceStore;
  library: CurrentMediaLibrary;
  objectStore: CurrentMediaObjectStore;
}>;

function openFixture(overrides: Readonly<{ objectStore?: (store: CurrentMediaObjectStore) => CurrentMediaObjectStore; decodeThumbnail?: () => undefined; ids?: string[] }> = {}): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "current-media-"));
  const migrated = migrateDatabase({ databasePath: path.join(directory, "cms.sqlite") });
  if (!migrated.ok) throw new Error(migrated.error.code);
  const opened = openPersistence({ databasePath: path.join(directory, "cms.sqlite") });
  if (!opened.ok) throw new Error(opened.error.code);
  const created = createCurrentMediaObjectStore({ objectsRoot: path.join(directory, "objects") });
  if (!created.ok) throw new Error(created.error.code);
  const objectStore = overrides.objectStore === undefined ? created.value : overrides.objectStore(created.value);
  const queue = overrides.ids === undefined ? undefined : [...overrides.ids];
  const created0 = createCurrentMediaLibrary({
    persistence: opened.value,
    objectStore,
    newStableId: queue === undefined ? randomUUID : () => queue.shift() ?? randomUUID(),
    now: () => new Date("2026-09-16T04:05:06.789Z"),
    ...(overrides.decodeThumbnail === undefined ? {} : { decodeThumbnail: overrides.decodeThumbnail }),
  });
  if (!created0.ok) throw new Error(created0.error.code);
  return { directory, persistence: opened.value, library: created0.value, objectStore: created.value };
}

function closeFixture(fixture: Fixture): void {
  fixture.persistence.close();
  rmSync(fixture.directory, { recursive: true, force: true });
}

function metadata(title: string, overrides: Partial<MediaImportMetadataV2> = {}): MediaImportMetadataV2 {
  return { contract: "media-import-metadata/v2", title, caption: "", description: "", ...overrides };
}

function upload(bytes: Uint8Array, chunkSize = 64 * 1024): MediaUploadSource {
  return async (sink) => {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      const written = sink.write(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
      if (!written.ok) throw new Error(written.error.code);
    }
  };
}

function stagingFiles(directory: string): readonly string[] {
  const staging = path.join(directory, "objects", "current", "staging");
  try { return readdirSync(staging); } catch { return []; }
}
function objectFiles(directory: string): readonly string[] {
  const objects = path.join(directory, "objects", "current", "objects");
  try { return readdirSync(objects); } catch { return []; }
}

/** 以 Node 內建 zlib + 自算 CRC 產生合法 PNG，避免測試相依影像工具。 */
function pngBytes(width: number, height: number, color: readonly [number, number, number] = [10, 200, 30]): Uint8Array {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[rowStart + 1 + x * 3] = color[0];
      raw[rowStart + 2 + x * 3] = color[1];
      raw[rowStart + 3 + x * 3] = color[2];
    }
  }
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const textBytes = (value: string): Uint8Array => new TextEncoder().encode(value);

test("current media library imports raster media with content-addressed thumbnail evidence", async () => {
  const fixture = openFixture();
  try {
    const image = pngBytes(8, 4);
    const imported = await fixture.library.importAsset({ filename: "photo.png", metadata: metadata("夏日照片", { altText: "山景", caption: "說明", description: "描述" }), source: upload(image) });
    assert.equal(imported.ok, true, JSON.stringify(imported));
    if (!imported.ok) return;
    const asset = imported.value;
    assert.equal(asset.contract, "media-asset/v2");
    assert.equal(asset.title, "夏日照片");
    assert.equal(asset.altText, "山景");
    assert.equal(asset.caption, "說明");
    assert.equal(asset.description, "描述");
    assert.equal(asset.originalFilename, "photo.png");
    assert.equal(asset.mimeType, "image/png");
    assert.equal(asset.byteLength, image.byteLength);
    assert.equal(asset.checksum, sha256Digest(image));
    assert.equal(asset.uploadedAt, "2026-09-16T04:05:06.789Z");
    assert.deepEqual(asset.image, { width: 8, height: 4 });
    assert.equal(asset.slug, "夏日照片");
    assert.notEqual(asset.thumbnail, null);
    assert.deepEqual(stagingFiles(fixture.directory), [], "成功匯入後不得留下 staging");
    assert.equal(objectFiles(fixture.directory).includes(asset.checksum.slice("sha256:".length)), true);

    const thumbnail = await fixture.library.readThumbnail(asset.assetId);
    assert.equal(thumbnail.ok, true);
    if (thumbnail.ok) {
      assert.equal(asset.thumbnail?.digest, sha256Digest(thumbnail.value.bytes));
      assert.equal(asset.thumbnail?.byteLength, thumbnail.value.bytes.byteLength);
      assert.equal(thumbnail.value.bytes.subarray(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]), true);
    }

    const catalog = await fixture.library.list();
    assert.equal(catalog.ok, true);
    if (catalog.ok) assert.deepEqual(catalog.value.items.map((item) => item.assetId), [asset.assetId]);
    const detail = await fixture.library.get(asset.assetId);
    assert.equal(detail.ok, true);
    if (detail.ok) {
      assert.deepEqual(detail.value.usage, []);
      assert.deepEqual(detail.value.asset, asset);
    }
    const missing = await fixture.library.get("absent-asset");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "MEDIA_ASSET_NOT_FOUND");
    const missingThumbnail = await fixture.library.readThumbnail("absent-asset");
    assert.equal(missingThumbnail.ok, false);
    if (!missingThumbnail.ok) assert.equal(missingThumbnail.error.code, "MEDIA_ASSET_NOT_FOUND");
  } finally {
    closeFixture(fixture);
  }
});

test("non-raster media import exposes safe metadata without thumbnail evidence", async () => {
  const fixture = openFixture();
  try {
    const cases: readonly Readonly<{ filename: string; bytes: Uint8Array; mimeType: string }>[] = [
      { filename: "file.pdf", bytes: textBytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n"), mimeType: "application/pdf" },
      { filename: "sound.wav", bytes: new Uint8Array([...textBytes("RIFF"), 0x24, 0, 0, 0, ...textBytes("WAVE"), 0, 0, 0, 0]), mimeType: "audio/wav" },
      { filename: "clip.mp4", bytes: new Uint8Array([0, 0, 0, 0x18, ...textBytes("ftypisom"), 0, 0, 0, 0, ...textBytes("isomiso2")]), mimeType: "video/mp4" },
      { filename: "song.m4a", bytes: new Uint8Array([0, 0, 0, 0x18, ...textBytes("ftypM4A "), 0, 0, 0, 0, ...textBytes("M4A mp42")]), mimeType: "audio/mp4" },
      { filename: "notes.txt", bytes: textBytes("純文字內容\nwith newline\n"), mimeType: "text/plain" },
      { filename: "notes", bytes: textBytes("no extension\n"), mimeType: "text/plain" },
    ];
    for (const item of cases) {
      const imported = await fixture.library.importAsset({ filename: item.filename, metadata: metadata(item.filename), source: upload(item.bytes) });
      assert.equal(imported.ok, true, `${item.filename} ${JSON.stringify(imported)}`);
      if (!imported.ok) continue;
      assert.equal(imported.value.mimeType, item.mimeType, item.filename);
      assert.equal(imported.value.thumbnail, null, item.filename);
      assert.equal(imported.value.image, null, item.filename);
      const thumbnail = await fixture.library.readThumbnail(imported.value.assetId);
      assert.equal(thumbnail.ok, false, item.filename);
    }
    const catalog = await fixture.library.list();
    assert.equal(catalog.ok && catalog.value.items.length, cases.length);
    assert.deepEqual(stagingFiles(fixture.directory), []);
  } finally {
    closeFixture(fixture);
  }
});

test("unsafe or spoofed uploads fail closed before any record or staging remains", async () => {
  const fixture = openFixture();
  try {
    const png = pngBytes(4, 4);
    const cases: readonly Readonly<{ filename: string; bytes: Uint8Array; code: string }>[] = [
      { filename: "vector.svg", bytes: textBytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "page.html", bytes: textBytes("<!doctype html><html><body>x</body></html>"), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "spoofed.png", bytes: textBytes('<svg xmlns="http://www.w3.org/2000/svg"/>'), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "renamed.svg", bytes: png, code: "MEDIA_TYPE_MISMATCH" },
      { filename: "note.txt", bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "lib.so", bytes: new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "bundle.zip", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "script.txt", bytes: textBytes("#!/bin/sh\nrm -rf /\n"), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "app.js", bytes: textBytes("alert(1)\n"), code: "MEDIA_TYPE_MISMATCH" },
      { filename: "module.mjs", bytes: textBytes("export const x = 1;\n"), code: "MEDIA_TYPE_MISMATCH" },
      { filename: "app.wasm", bytes: new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]), code: "MEDIA_UNSUPPORTED_TYPE" },
      // BOM 或空白後才出現 shebang 的 script 同樣不得被當成純文字。
      { filename: "note.txt", bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...textBytes("#!/usr/bin/env python3\n")]), code: "MEDIA_UNSUPPORTED_TYPE" },
      { filename: "note.txt", bytes: textBytes("   #!/bin/bash\n"), code: "MEDIA_UNSUPPORTED_TYPE" },
      // 副檔名必須與偵測到的 MIME 相符，不能只落在同一個 family。
      { filename: "song.wav", bytes: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]), code: "MEDIA_TYPE_MISMATCH" },
      { filename: "clip.webm", bytes: new Uint8Array([0, 0, 0, 0x18, ...textBytes("ftypisom"), 0, 0, 0, 0, ...textBytes("isomiso2")]), code: "MEDIA_TYPE_MISMATCH" },
      { filename: "sound.ogg", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]), code: "MEDIA_TYPE_MISMATCH" },
    ];
    const before = fixture.persistence.canonicalState();
    assert.equal(before.ok, true);
    for (const item of cases) {
      const imported = await fixture.library.importAsset({ filename: item.filename, metadata: metadata(item.filename), source: upload(item.bytes) });
      assert.equal(imported.ok, false, item.filename);
      if (!imported.ok) assert.equal(imported.error.code, item.code, item.filename);
    }
    const after = fixture.persistence.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest);
    const catalog = await fixture.library.list();
    assert.equal(catalog.ok && catalog.value.items.length, 0);
    assert.deepEqual(stagingFiles(fixture.directory), []);
    assert.deepEqual(objectFiles(fixture.directory), []);
  } finally {
    closeFixture(fixture);
  }
});

test("metadata save is CAS protected, slug-released, and read back exactly", async () => {
  const fixture = openFixture();
  try {
    const imported = await fixture.library.importAsset({ filename: "photo.png", metadata: metadata("原始標題"), source: upload(pngBytes(4, 4)) });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    const saved = await fixture.library.saveMetadata({ contract: "media-metadata-save-request/v2", assetId: imported.value.assetId, expectedStateDigest: imported.value.stateDigest, title: "新標題", slug: "new-slug", altText: null, caption: "新說明", description: "新描述" });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    if (!saved.ok) return;
    assert.equal(saved.value.title, "新標題");
    assert.equal(saved.value.slug, "new-slug");
    assert.equal(saved.value.altText, null);
    assert.equal(saved.value.caption, "新說明");
    assert.equal(saved.value.description, "新描述");
    // 檔案證據不得因 metadata Save 改變。
    assert.equal(saved.value.checksum, imported.value.checksum);
    assert.equal(saved.value.byteLength, imported.value.byteLength);
    assert.deepEqual(saved.value.thumbnail, imported.value.thumbnail);
    assert.notEqual(saved.value.stateDigest, imported.value.stateDigest);

    const stale = await fixture.library.saveMetadata({ contract: "media-metadata-save-request/v2", assetId: imported.value.assetId, expectedStateDigest: imported.value.stateDigest, title: "過期寫入", slug: "new-slug", altText: null, caption: "", description: "" });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "MEDIA_ASSET_STATE_CONFLICT");
    const reread = await fixture.library.get(imported.value.assetId);
    assert.equal(reread.ok, true);
    if (reread.ok) assert.equal(reread.value.asset.title, "新標題");

    const unknown = await fixture.library.saveMetadata({ contract: "media-metadata-save-request/v2", assetId: "absent", expectedStateDigest: imported.value.stateDigest, title: "x", slug: "x", altText: null, caption: "", description: "" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.error.code, "MEDIA_ASSET_NOT_FOUND");
    const invalid = await fixture.library.saveMetadata({ contract: "media-metadata-save-request/v2", assetId: imported.value.assetId, expectedStateDigest: saved.value.stateDigest, title: "   ", slug: "new-slug", altText: null, caption: "", description: "" });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error.code, "INVALID_MEDIA_LIBRARY_INPUT");
  } finally {
    closeFixture(fixture);
  }
});

test("replace keeps the stable asset ID and updates current byte evidence", async () => {
  const fixture = openFixture();
  try {
    const first = await fixture.library.importAsset({ filename: "photo.png", metadata: metadata("照片"), source: upload(pngBytes(4, 4)) });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const replacement = pngBytes(8, 8, [1, 2, 3]);
    const replaced = await fixture.library.replaceAsset({
      filename: "photo.png",
      metadata: metadata("照片", { slug: first.value.slug }),
      request: { contract: "media-replace-request/v2", assetId: first.value.assetId, expectedStateDigest: first.value.stateDigest, metadata: metadata("照片", { slug: first.value.slug }) },
      source: upload(replacement),
    });
    assert.equal(replaced.ok, true, JSON.stringify(replaced));
    if (!replaced.ok) return;
    assert.equal(replaced.value.assetId, first.value.assetId);
    assert.equal(replaced.value.slug, first.value.slug);
    assert.equal(replaced.value.checksum, sha256Digest(replacement));
    assert.equal(replaced.value.byteLength, replacement.byteLength);
    assert.deepEqual(replaced.value.image, { width: 8, height: 8 });
    assert.notEqual(replaced.value.thumbnail?.digest, first.value.thumbnail?.digest);
    assert.deepEqual(stagingFiles(fixture.directory), []);

    const stale = await fixture.library.replaceAsset({
      filename: "photo.png",
      metadata: metadata("照片"),
      request: { contract: "media-replace-request/v2", assetId: first.value.assetId, expectedStateDigest: first.value.stateDigest, metadata: metadata("照片") },
      source: upload(replacement),
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, "MEDIA_ASSET_STATE_CONFLICT");
    // stale CAS 不得寫入任何 bytes，也不得留下 staging。
    const after = await fixture.library.get(first.value.assetId);
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.value.asset.checksum, sha256Digest(replacement));
    assert.deepEqual(stagingFiles(fixture.directory), []);
    // 兩個版本的 original 與 thumbnail 各自內容尋址；被 CAS 擋下的 replace 不得留下任何 object。
    assert.equal(objectFiles(fixture.directory).length, 4);
  } finally {
    closeFixture(fixture);
  }
});

test("referenced assets reject replace and delete with complete deterministic usage", async () => {
  const fixture = openFixture();
  try {
    const imported = await fixture.library.importAsset({ filename: "photo.png", metadata: metadata("照片"), source: upload(pngBytes(4, 4)) });
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    const asset = imported.value;
    assert.equal(fixture.persistence.replaceEntryMediaReferences({ entryId: "entry-b", status: "published", assetIds: [asset.assetId] }).ok, true);
    assert.equal(fixture.persistence.replaceEntryMediaReferences({ entryId: "entry-a", status: "draft", assetIds: [asset.assetId] }).ok, true);
    const before = fixture.persistence.canonicalState();
    assert.equal(before.ok, true);

    const replacement = pngBytes(8, 8, [9, 9, 9]);
    const replaced = await fixture.library.replaceAsset({
      filename: "photo.png",
      metadata: metadata("照片"),
      request: { contract: "media-replace-request/v2", assetId: asset.assetId, expectedStateDigest: asset.stateDigest, metadata: metadata("照片") },
      source: upload(replacement),
    });
    assert.equal(replaced.ok, false);
    if (!replaced.ok) {
      assert.equal(replaced.error.code, "MEDIA_ASSET_REFERENCED");
      assert.deepEqual(replaced.error.usage, [
        { entryId: "entry-a", status: "draft" },
        { entryId: "entry-b", status: "published" },
      ]);
    }
    const deleted = await fixture.library.deleteAsset({ contract: "media-delete-request/v2", assetId: asset.assetId, expectedStateDigest: asset.stateDigest });
    assert.equal(deleted.ok, false);
    if (!deleted.ok) {
      assert.equal(deleted.error.code, "MEDIA_ASSET_REFERENCED");
      assert.deepEqual(deleted.error.usage?.map((usage) => usage.entryId), ["entry-a", "entry-b"]);
    }
    const after = fixture.persistence.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest, "referenced 阻擋必須零寫入");
    const detail = await fixture.library.get(asset.assetId);
    assert.equal(detail.ok, true);
    if (detail.ok) {
      assert.deepEqual(detail.value.usage, [{ entryId: "entry-a", status: "draft" }, { entryId: "entry-b", status: "published" }]);
      assert.equal(detail.value.asset.checksum, asset.checksum);
    }
    assert.deepEqual(stagingFiles(fixture.directory), []);

    // 解除引用後即可刪除，且 slug 立即釋放。
    assert.equal(fixture.persistence.replaceEntryMediaReferences({ entryId: "entry-a", status: "draft", assetIds: [] }).ok, true);
    assert.equal(fixture.persistence.replaceEntryMediaReferences({ entryId: "entry-b", status: "published", assetIds: [] }).ok, true);
    const deletedNow = await fixture.library.deleteAsset({ contract: "media-delete-request/v2", assetId: asset.assetId, expectedStateDigest: asset.stateDigest });
    assert.equal(deletedNow.ok, true, JSON.stringify(deletedNow));
    if (deletedNow.ok) assert.equal(deletedNow.value.releasedSlug, asset.slug);
    const gone = await fixture.library.get(asset.assetId);
    assert.equal(gone.ok, false);
    const claim = fixture.persistence.getGlobalSlugClaim(asset.slug);
    assert.equal(claim.ok, false);
    const reimported = await fixture.library.importAsset({ filename: "photo.png", metadata: metadata("照片"), source: upload(pngBytes(4, 4)) });
    assert.equal(reimported.ok, true);
    if (reimported.ok) assert.equal(reimported.value.slug, asset.slug);
  } finally {
    closeFixture(fixture);
  }
});

test("upload ceiling, envelope bounds, aborts, and storage faults leave no readable record", async () => {
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"];
  const fixture = openFixture({ ids });
  try {
    const before = fixture.persistence.canonicalState();
    assert.equal(before.ok, true);

    // client abort：source 在串流中丟出錯誤。
    const aborted = await fixture.library.importAsset({
      filename: "notes.txt",
      metadata: metadata("中止"),
      source: async (sink) => {
        sink.write(textBytes("partial"));
        throw new Error(`client aborted at ${fixture.directory}`);
      },
    });
    assert.equal(aborted.ok, false);
    if (!aborted.ok) {
      assert.equal(aborted.error.code, "MEDIA_STAGING_FAILURE");
      assert.equal(JSON.stringify(aborted.error).includes(fixture.directory), false, "不得洩漏 host path");
    }
    assert.deepEqual(stagingFiles(fixture.directory), []);

    // thumbnail fault：格式合法但無法解碼時不得建立 record。
    const faulted = openFixture({ decodeThumbnail: () => undefined });
    try {
      const thumbnailFault = await faulted.library.importAsset({ filename: "photo.png", metadata: metadata("照片"), source: upload(pngBytes(4, 4)) });
      assert.equal(thumbnailFault.ok, false);
      if (!thumbnailFault.ok) assert.equal(thumbnailFault.error.code, "MEDIA_THUMBNAIL_FAILURE");
      const catalog = await faulted.library.list();
      assert.equal(catalog.ok && catalog.value.items.length, 0);
      assert.deepEqual(stagingFiles(faulted.directory), []);
    } finally {
      closeFixture(faulted);
    }

    // checksum fault：staging 完成後 promote 前的雜湊驗證必須擋下被動過的 bytes。
    const tampered = openFixture({ objectStore: (store) => ({
      ...store,
      openStage: (request) => {
        const opened = store.openStage(request);
        if (!opened.ok) return opened;
        return { ok: true, value: { ...opened.value, finish: () => { const finished = opened.value.finish(); return finished.ok ? { ok: true, value: { checksum: sha256Digest(textBytes("different")), byteLength: finished.value.byteLength } } : finished; } } };
      },
    }) });
    try {
      const checksumFault = await tampered.library.importAsset({ filename: "notes.txt", metadata: metadata("checksum"), source: upload(textBytes("hello")) });
      assert.equal(checksumFault.ok, false);
      if (!checksumFault.ok) assert.equal(checksumFault.error.code, "MEDIA_FINAL_VERIFICATION_FAILURE");
      const catalog = await tampered.library.list();
      assert.equal(catalog.ok && catalog.value.items.length, 0);
      assert.deepEqual(stagingFiles(tampered.directory), []);
    } finally {
      closeFixture(tampered);
    }

    // promote fault：object 未落地時不得建立 record，也不得留下 staging。
    const failingPromote = openFixture({ objectStore: (store) => ({ ...store, promote: () => ({ ok: false, error: { code: "MEDIA_PROMOTION_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "promote fault" } } }) }) });
    try {
      const promoteFault = await failingPromote.library.importAsset({ filename: "notes.txt", metadata: metadata("promote"), source: upload(textBytes("hello")) });
      assert.equal(promoteFault.ok, false);
      if (!promoteFault.ok) assert.equal(promoteFault.error.code, "MEDIA_PROMOTION_FAILURE");
      const catalog = await failingPromote.library.list();
      assert.equal(catalog.ok && catalog.value.items.length, 0);
      assert.deepEqual(stagingFiles(failingPromote.directory), []);
    } finally {
      closeFixture(failingPromote);
    }
  } finally {
    closeFixture(fixture);
  }
});

test("a stage-release fault fails the operation before any record is committed", async () => {
  const fixture = openFixture({ objectStore: (store) => ({ ...store, releaseStage: () => ({ ok: false, error: { code: "MEDIA_STAGING_FAILURE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "release fault" } } }) }) });
  try {
    const before = fixture.persistence.canonicalState();
    const imported = await fixture.library.importAsset({ filename: "notes.txt", metadata: metadata("release"), source: upload(textBytes("hello")) });
    assert.equal(imported.ok, false);
    if (!imported.ok) assert.equal(imported.error.code, "MEDIA_STAGING_FAILURE");
    const catalog = await fixture.library.list();
    assert.equal(catalog.ok && catalog.value.items.length, 0, "release 失敗不得建立 record");
    const after = fixture.persistence.canonicalState();
    assert.equal(before.ok && after.ok && after.value.digest === before.value.digest, true);
  } finally {
    closeFixture(fixture);
  }
});

test("metadata that the response redactor would rewrite is rejected before it can be persisted", async () => {
  const fixture = openFixture();
  try {
    const credentialShaped = `asn_v1_${"C".repeat(43)}`;
    const imported = await fixture.library.importAsset({ filename: "notes.txt", metadata: metadata(`標題 ${credentialShaped}`), source: upload(textBytes("hello")) });
    assert.equal(imported.ok, false);
    if (!imported.ok) assert.equal(imported.error.code, "INVALID_MEDIA_LIBRARY_INPUT");
    const catalog = await fixture.library.list();
    assert.equal(catalog.ok && catalog.value.items.length, 0);
    // catalog digest 必須是 wire 內容的 JCS hash，redaction 不會改變任何已落地值。
    if (catalog.ok) {
      const bytes = canonicalJsonBytes({ contract: "media-catalog/v2", items: catalog.value.items });
      assert.equal(bytes.ok, true);
      if (bytes.ok) assert.equal(catalog.value.stateDigest, sha256Digest(bytes.value));
    }
  } finally {
    closeFixture(fixture);
  }
});

test("startup fails closed when staging cannot be swept", async () => {
  const fixture = openFixture();
  try {
    const directory = fixture.directory;
    writeFileSync(path.join(directory, "objects", "current", "staging", `${"c".repeat(64)}.partial`), "half written");
    const reopened = createCurrentMediaObjectStore({ objectsRoot: path.join(directory, "objects") });
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    const blocked = { ...reopened.value, sweepStages: () => ({ ok: false as const, error: { code: "MEDIA_STAGING_FAILURE" as const, owner: "DataMedia" as const, subjectIds: [], remediation: { kind: "message" as const, message: "sweep fault" } } }) };
    const restarted = createCurrentMediaLibrary({ persistence: fixture.persistence, objectStore: blocked, newStableId: randomUUID });
    assert.equal(restarted.ok, false);
    if (!restarted.ok) assert.equal(restarted.error.code, "MEDIA_STAGING_FAILURE");
  } finally {
    closeFixture(fixture);
  }
});

test("the 400 MiB raw file ceiling accepts the boundary and rejects one byte more", async () => {
  const fixture = openFixture();
  try {
    const ceiling = 400 * 1024 * 1024;
    const chunk = new TextEncoder().encode("a".repeat(64 * 1024));
    const repeated = (total: number): MediaUploadSource => async (sink) => {
      let written = 0;
      while (written < total) {
        const size = Math.min(chunk.byteLength, total - written);
        const result = sink.write(size === chunk.byteLength ? chunk : chunk.subarray(0, size));
        if (!result.ok) throw new Error(result.error.code);
        written += size;
      }
    };
    const accepted = await fixture.library.importAsset({ filename: "big.txt", metadata: metadata("大檔"), source: repeated(ceiling) });
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    if (accepted.ok) {
      assert.equal(accepted.value.byteLength, ceiling);
      assert.equal(accepted.value.thumbnail, null);
    }
    assert.deepEqual(stagingFiles(fixture.directory), []);

    const rejected = await fixture.library.importAsset({ filename: "too-big.txt", metadata: metadata("超限"), source: repeated(ceiling + 1) });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error.code, "MEDIA_SIZE_LIMIT_EXCEEDED");
    const catalog = await fixture.library.list();
    assert.equal(catalog.ok && catalog.value.items.length, 1, "超限不得建立任何 record");
    assert.deepEqual(stagingFiles(fixture.directory), []);
    const stored = objectFiles(fixture.directory);
    assert.equal(stored.length, 1);
    assert.equal(statSync(path.join(fixture.directory, "objects", "current", "objects", stored[0] ?? "")).size, ceiling);
  } finally {
    closeFixture(fixture);
  }
});

test("streaming import keeps process memory flat for a large file", async () => {
  const fixture = openFixture();
  try {
    // 64 MiB 遠大於任何「整檔進記憶體」實作可接受的水位；若 import 會 buffer 整個檔案，這裡必然超標。
    const total = 64 * 1024 * 1024;
    const chunk = new TextEncoder().encode("b".repeat(64 * 1024));
    const source: MediaUploadSource = async (sink) => {
      let written = 0;
      while (written < total) {
        const size = Math.min(chunk.byteLength, total - written);
        const result = sink.write(size === chunk.byteLength ? chunk : chunk.subarray(0, size));
        if (!result.ok) throw new Error(result.error.code);
        written += size;
      }
    };
    global.gc?.();
    const before = process.memoryUsage();
    const imported = await fixture.library.importAsset({ filename: "big.txt", metadata: metadata("大檔"), source });
    const after = process.memoryUsage();
    assert.equal(imported.ok, true, JSON.stringify(imported));
    if (imported.ok) assert.equal(imported.value.byteLength, total);
    const growth = after.heapUsed + after.external - before.heapUsed - before.external;
    assert.ok(growth < 16 * 1024 * 1024, `import 不得整檔進記憶體（growth=${growth}）`);
  } finally {
    closeFixture(fixture);
  }
});

test("staging and orphan objects are reconciled when the library starts", async () => {
  const fixture = openFixture();
  try {
    const directory = fixture.directory;
    const staging = path.join(directory, "objects", "current", "staging");
    const objects = path.join(directory, "objects", "current", "objects");
    writeFileSync(path.join(staging, `${"a".repeat(64)}.partial`), "half written");
    writeFileSync(path.join(objects, "b".repeat(64)), "orphan object");
    const reopened = createCurrentMediaObjectStore({ objectsRoot: path.join(directory, "objects") });
    assert.equal(reopened.ok, true);
    if (!reopened.ok) return;
    const restarted = createCurrentMediaLibrary({ persistence: fixture.persistence, objectStore: reopened.value, newStableId: randomUUID });
    assert.equal(restarted.ok, true);
    if (!restarted.ok) return;
    const catalog = await restarted.value.list();
    assert.equal(catalog.ok, true);
    assert.deepEqual(stagingFiles(directory), []);
    assert.deepEqual(objectFiles(directory), []);
  } finally {
    closeFixture(fixture);
  }
});
