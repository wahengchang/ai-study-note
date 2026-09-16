import type { MediaUploadSink, MediaUploadSource } from "../../core/application/index.js";

/**
 * Streaming multipart 唯一實作：bytes 從 request stream 直接進 media stage，永不整檔落地到
 * JavaScript buffer。part 順序固定為單一 `metadata` part 後接單一 `file` part，讓
 * Application 在讀任何 file byte 之前就能取得 metadata 與檔名並 fail closed。
 */
export type PreparedMediaUpload = Readonly<{
  filename: string;
  declaredContentType: string | null;
  metadata: unknown;
  source: MediaUploadSource;
  /** 串流結束後才可能發現的 framing 問題（缺少結尾 delimiter 等）。 */
  framingFailure(): "INVALID_REQUEST_BODY" | undefined;
}>;
export type MediaUploadFailureCode = "UNSUPPORTED_MEDIA_TYPE" | "INVALID_REQUEST_BODY" | "REQUEST_BODY_TOO_LARGE";
export type PrepareMediaUploadResult = Readonly<{ ok: true; value: PreparedMediaUpload }> | Readonly<{ ok: false; code: MediaUploadFailureCode }>;

export const MEDIA_ENVELOPE_LIMIT = 64 * 1024;
const headerBlockLimit = 8 * 1024;
const boundaryPattern = /^multipart\/form-data\s*;\s*boundary=(?:"([A-Za-z0-9'()+_,\-./:=? ]{1,70})"|([A-Za-z0-9'()+_,\-./:=?]{1,70}))$/u;

type Headers = Readonly<{ name: string | null; filename: string | null; contentType: string | null }>;

type FramingFailure = "INVALID_REQUEST_BODY" | "REQUEST_BODY_TOO_LARGE";
/** envelope 超限是 body 過大而不是 framing 錯誤，必須讓 client 看到可區分的 code。 */
class FramingError extends Error { constructor(readonly failure: FramingFailure) { super(failure); } }

function parseBoundary(contentType: string | null): Uint8Array | undefined {
  if (contentType === null) return undefined;
  const matched = boundaryPattern.exec(contentType.trim());
  const boundary = matched?.[1] ?? matched?.[2];
  if (boundary === undefined || boundary.endsWith(" ")) return undefined;
  return new TextEncoder().encode(`--${boundary}`);
}

function headerValue(block: string, key: string): string | null {
  const line = block.split("\r\n").find((candidate) => candidate.toLowerCase().startsWith(`${key}:`));
  return line === undefined ? null : line.slice(key.length + 1).trim();
}

function dispositionField(value: string | null, field: string): string | null {
  if (value === null) return null;
  // quoted-string 只支援我們自己 client 會送出的 `\"` escape；其餘一律視為 framing 錯誤由呼叫端處理。
  const matched = new RegExp(`${field}="((?:[^"\\\\]|\\\\.)*)"`, "u").exec(value);
  return matched === null ? null : matched[1]?.replace(/\\(.)/gu, "$1") ?? null;
}

export async function prepareMediaUpload(input: Readonly<{ body: ReadableStream<Uint8Array> | undefined; contentType: string | null }>): Promise<PrepareMediaUploadResult> {
  const boundary = parseBoundary(input.contentType);
  if (boundary === undefined) return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  const reader = input.body?.getReader();
  if (reader === undefined) return { ok: false, code: "INVALID_REQUEST_BODY" };
  const delimiter = new Uint8Array(boundary.byteLength + 2);
  delimiter.set(new TextEncoder().encode("\r\n"), 0);
  delimiter.set(boundary, 2);
  const scanner = new MultipartScanner(reader, delimiter);
  let framingFailure: "INVALID_REQUEST_BODY" | undefined;
  try {
    await scanner.expect(boundary);
    const metadataHeaders = await scanner.readHeaders();
    if (metadataHeaders.name !== "metadata" || metadataHeaders.filename !== null) throw new FramingError("INVALID_REQUEST_BODY");
    const metadataBytes = await scanner.readPart(MEDIA_ENVELOPE_LIMIT);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes);
    const metadata: unknown = JSON.parse(decoded);
    const fileHeaders = await scanner.readHeaders();
    if (fileHeaders.name !== "file" || fileHeaders.filename === null) throw new FramingError("INVALID_REQUEST_BODY");
    const filename = fileHeaders.filename;
    const declaredContentType = fileHeaders.contentType;
    const source: MediaUploadSource = async (sink) => {
      const closed = await scanner.streamPart(sink);
      if (!closed) { framingFailure = "INVALID_REQUEST_BODY"; throw new FramingError("INVALID_REQUEST_BODY"); }
    };
    return { ok: true, value: {
      filename,
      declaredContentType,
      metadata,
      source,
      framingFailure: () => framingFailure,
    } };
  } catch (error) {
    // framing、header、envelope 與 stream fault 一律是 400；file bytes 從未進入 canonical state。
    return { ok: false, code: error instanceof FramingError ? error.failure : "INVALID_REQUEST_BODY" };
  }
}

/**
 * 逐段掃描 multipart：只保留「可能是 delimiter」的尾端 bytes，其餘立即交給呼叫端，
 * 因此檔案大小不影響記憶體用量。
 */
class MultipartScanner {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly #delimiter: Uint8Array;
  #buffer = new Uint8Array(0);
  #done = false;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>, delimiter: Uint8Array) {
    this.#reader = reader;
    this.#delimiter = delimiter;
  }

  async #fill(): Promise<boolean> {
    if (this.#done) return false;
    const item = await this.#reader.read();
    if (item.done) { this.#done = true; return false; }
    const merged = new Uint8Array(this.#buffer.byteLength + item.value.byteLength);
    merged.set(this.#buffer, 0);
    merged.set(item.value, this.#buffer.byteLength);
    this.#buffer = merged;
    return true;
  }

  async #readAtLeast(length: number, limit: number): Promise<void> {
    while (this.#buffer.byteLength < length) {
      if (this.#buffer.byteLength > limit) throw new FramingError("INVALID_REQUEST_BODY");
      if (!(await this.#fill())) throw new FramingError("INVALID_REQUEST_BODY");
    }
  }

  #consume(length: number): Uint8Array {
    const head = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length).slice();
    return head;
  }

  async expect(prefix: Uint8Array): Promise<void> {
    await this.#readAtLeast(prefix.byteLength, headerBlockLimit);
    if (!sameBytes(this.#buffer.subarray(0, prefix.byteLength), prefix)) throw new FramingError("INVALID_REQUEST_BODY");
    this.#consume(prefix.byteLength);
  }

  async readHeaders(): Promise<Headers> {
    let text: string;
    for (;;) {
      const end = indexOf(this.#buffer, new TextEncoder().encode("\r\n\r\n"));
      if (end !== -1) { text = new TextDecoder("utf-8", { fatal: true }).decode(this.#consume(end + 4)); break; }
      if (this.#buffer.byteLength > headerBlockLimit) throw new FramingError("INVALID_REQUEST_BODY");
      if (!(await this.#fill())) throw new FramingError("INVALID_REQUEST_BODY");
    }
    const block = text.slice(0, -4);
    const disposition = headerValue(block, "content-disposition");
    if (disposition === null || !disposition.toLowerCase().startsWith("form-data")) throw new FramingError("INVALID_REQUEST_BODY");
    return { name: dispositionField(disposition, "name"), filename: dispositionField(disposition, "filename"), contentType: headerValue(block, "content-type") };
  }

  async readPart(limit: number): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const index = indexOf(this.#buffer, this.#delimiter);
      if (index !== -1) {
        const body = this.#consume(index);
        this.#consume(this.#delimiter.byteLength);
        if (total + body.byteLength > limit) throw new FramingError("REQUEST_BODY_TOO_LARGE");
        return concat([...parts, body]);
      }
      const tail = Math.max(0, this.#buffer.byteLength - (this.#delimiter.byteLength - 1));
      if (tail > 0) {
        const emit = this.#consume(tail);
        total += emit.byteLength;
        if (total > limit) throw new FramingError("REQUEST_BODY_TOO_LARGE");
        parts.push(emit);
      }
      if (!(await this.#fill())) throw new FramingError("INVALID_REQUEST_BODY");
    }
  }

  /**
   * 結尾 delimiter 之後只允許一個可選 CRLF，且必須是真正的 stream 結尾；尾隨 bytes 或
   * 截斷的 body 都代表請求不是 exact two-part multipart framing，不得讓它變成可選 asset。
   */
  async #endsAfterClosingDelimiter(): Promise<boolean> {
    // 每一輪都驗證整個累積 buffer，CRLF 被拆到兩個 chunk 時才不會誤判；EOF 時只接受完整的
    // 0 或 2 bytes，單獨一個 CR 代表 body 在 CRLF 中間被截斷。
    for (;;) {
      const remaining = this.#buffer;
      if (remaining.byteLength > 2) return false;
      if (remaining.byteLength === 1 && remaining[0] !== 0x0d) return false;
      if (remaining.byteLength === 2 && (remaining[0] !== 0x0d || remaining[1] !== 0x0a)) return false;
      if (!(await this.#fill())) return remaining.byteLength !== 1;
    }
  }

  /** 把 file part 的 bytes 直接灌進 sink；只回傳是否看到合法的結尾 delimiter。 */
  async streamPart(sink: MediaUploadSink): Promise<boolean> {
    for (;;) {
      const index = indexOf(this.#buffer, this.#delimiter);
      if (index !== -1) {
        const body = this.#consume(index);
        if (body.byteLength > 0 && !sink.write(body).ok) throw new FramingError("INVALID_REQUEST_BODY");
        this.#consume(this.#delimiter.byteLength);
        await this.#readAtLeast(2, headerBlockLimit);
        const trailer = this.#consume(2);
        if (trailer[0] !== 0x2d || trailer[1] !== 0x2d) return false;
        return this.#endsAfterClosingDelimiter();
      }
      const tail = Math.max(0, this.#buffer.byteLength - (this.#delimiter.byteLength - 1));
      if (tail > 0) {
        const emit = this.#consume(tail);
        if (!sink.write(emit).ok) throw new FramingError("INVALID_REQUEST_BODY");
      }
      if (!(await this.#fill())) return false;
    }
  }
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.byteLength === 0 || haystack.byteLength < needle.byteLength) return -1;
  const first = needle[0] ?? 0;
  const end = haystack.byteLength - needle.byteLength;
  for (let index = 0; index <= end; index += 1) {
    if (haystack[index] !== first) continue;
    if (sameBytes(haystack.subarray(index, index + needle.byteLength), needle)) return index;
  }
  return -1;
}
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
  return merged;
}
