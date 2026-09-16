import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_ENVELOPE_LIMIT, prepareMediaUpload, type PrepareMediaUploadResult, type PreparedMediaUpload } from "../../../apps/authoring-api/multipart.js";
import type { MediaUploadSink } from "../../../core/application/index.js";

const boundary = "----cmsMediaBoundary";
const fileBytes = "media bytes";

function metadataBytes(json: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(json)); }

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
  return merged;
}

function uploadBytes(metadata: unknown = { contract: "media-import-metadata/v2", title: "照片" }, filename = "photo.txt"): Uint8Array {
  return concat([
    new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n`),
    metadataBytes(metadata),
    new TextEncoder().encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`),
    new TextEncoder().encode(fileBytes),
    new TextEncoder().encode(`\r\n--${boundary}--\r\n`),
  ]);
}

async function prepare(chunks: readonly Uint8Array[], contentType: string | null = `multipart/form-data; boundary=${boundary}`): Promise<PrepareMediaUploadResult> {
  return prepareMediaUpload({ body: streamOf(chunks), contentType });
}

/** 扮演 library：把 sink 交給 source，並回傳實際收到的 file part bytes。 */
async function readUpload(prepared: PreparedMediaUpload): Promise<Uint8Array> {
  const written: Uint8Array[] = [];
  const sink: MediaUploadSink = { write(chunk) { written.push(chunk.slice()); return { ok: true, value: undefined }; } };
  await prepared.source(sink);
  assert.equal(prepared.framingFailure(), undefined);
  return concat(written);
}

test("multipart framing accepts every chunk boundary, including a CRLF split across chunks", async () => {
  const bytes = uploadBytes();
  for (let cut = 1; cut <= bytes.byteLength; cut += 1) {
    const prepared = await prepare([bytes.subarray(0, cut), bytes.subarray(cut)]);
    assert.equal(prepared.ok, true, `cut=${cut}`);
    if (!prepared.ok) continue;
    assert.equal(prepared.value.filename, "photo.txt", `cut=${cut}`);
    assert.equal(new TextDecoder().decode(await readUpload(prepared.value)), fileBytes, `cut=${cut}`);
  }
  // 結尾 delimiter 與其 CRLF 分別落在不同 chunk 也要成立。
  const tail = bytes.byteLength - 2;
  const splitTail = await prepare([bytes.subarray(0, tail), bytes.subarray(tail, tail + 1), bytes.subarray(tail + 1)]);
  assert.equal(splitTail.ok, true);
  if (splitTail.ok) assert.equal(new TextDecoder().decode(await readUpload(splitTail.value)), fileBytes);
});

test("multipart framing rejects trailing bytes, truncation, and malformed envelopes", async () => {
  const bytes = uploadBytes();

  const trailing = await prepare([concat([bytes, new TextEncoder().encode("trailing")])]);
  assert.equal(trailing.ok, true);
  if (trailing.ok) {
    await assert.rejects(readUpload(trailing.value));
    assert.equal(trailing.value.framingFailure(), "INVALID_REQUEST_BODY");
  }

  const truncated = await prepare([bytes.subarray(0, bytes.byteLength - 6)]);
  assert.equal(truncated.ok, true);
  if (truncated.ok) await assert.rejects(readUpload(truncated.value));

  // 結尾 delimiter 之後只送出一個 CR 就結束（缺 LF）同樣是截斷。
  const loneCarriageReturn = await prepare([bytes.subarray(0, bytes.byteLength - 1)]);
  assert.equal(loneCarriageReturn.ok, true);
  if (loneCarriageReturn.ok) await assert.rejects(readUpload(loneCarriageReturn.value));

  const oversizedEnvelope = await prepare([uploadBytes({ contract: "media-import-metadata/v2", title: "x".repeat(MEDIA_ENVELOPE_LIMIT + 1) })]);
  assert.equal(oversizedEnvelope.ok, false);
  if (!oversizedEnvelope.ok) assert.equal(oversizedEnvelope.code, "REQUEST_BODY_TOO_LARGE");

  const missingFilePart = await prepare([new TextEncoder().encode(`--${boundary}--\r\n`)]);
  assert.equal(missingFilePart.ok, false);
  if (!missingFilePart.ok) assert.equal(missingFilePart.code, "INVALID_REQUEST_BODY");

  const reversedParts = await prepare([concat([
    new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.txt"\r\n\r\n${fileBytes}\r\n`),
    new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{}\r\n--${boundary}--\r\n`),
  ])]);
  assert.equal(reversedParts.ok, false);

  const notMultipart = await prepare([bytes], "application/json");
  assert.equal(notMultipart.ok, false);
  if (!notMultipart.ok) assert.equal(notMultipart.code, "UNSUPPORTED_MEDIA_TYPE");
});
