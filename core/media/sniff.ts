import type { DataMediaFailureCode, DataMediaResult } from "./contracts.js";
import { mediaFailureMessages } from "./failures.js";
import { readRasterDimensions, type RasterFormat } from "./raster.js";

export type { RasterFormat };
export type MediaFamily = "raster" | "pdf" | "audio" | "video" | "text";
export type SniffedMedia = Readonly<{
  family: MediaFamily;
  mimeType: string;
  raster?: Readonly<{ format: RasterFormat; width: number; height: number }>;
}>;

/** 縮圖解碼必須先知道尺寸是否落在可處理範圍；這是唯一的 raster 像素上限。 */
export const MAX_RASTER_PIXELS = 250_000_000;

const rasterExtensions: Readonly<Record<RasterFormat, readonly string[]>> = {
  png: ["png"],
  jpeg: ["jpg", "jpeg", "jfif"],
  gif: ["gif"],
};
/**
 * 副檔名 allowlist 以**偵測到的 MIME** 為鍵，而不是 family：否則 MP3 bytes 命名成 `.wav`
 * 或 MP4 bytes 命名成 `.webm` 都會落在同一個 family 而通過，讓 `originalFilename` 與
 * `mimeType` 互相矛盾。
 */
const mimeExtensions: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": ["pdf"],
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "m4b"],
  "audio/wav": ["wav"],
  "audio/ogg": ["ogg", "oga"],
  "audio/flac": ["flac"],
  "audio/webm": ["weba"],
  "video/mp4": ["mp4", "m4v"],
  "video/quicktime": ["mov"],
  "video/webm": ["webm"],
  "video/ogg": ["ogv"],
  "text/plain": ["txt", "md", "markdown", "csv", "log", "json"],
};
// 主動內容與執行檔一律拒絕；即使 bytes 被改名成安全副檔名，magic 仍會在此攔下。
const rejectedMagic: readonly Readonly<{ name: string; bytes: readonly number[]; offset?: number }>[] = [
  { name: "dos-executable", bytes: [0x4d, 0x5a] },
  { name: "elf-executable", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: "macho-executable", bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: "macho-executable", bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: "macho-executable", bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { name: "macho-executable", bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: "java-class", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: "zip-archive", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "wasm-module", bytes: [0x00, 0x61, 0x73, 0x6d] },
  { name: "script-shebang", bytes: [0x23, 0x21] },
];

function sniffFailure<T>(code: DataMediaFailureCode): DataMediaResult<T> {
  return { ok: false, error: { code, owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: mediaFailureMessages[code] } } };
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + prefix.length) return false;
  return prefix.every((byte, index) => bytes[offset + index] === byte);
}
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function fileExtension(filename: string): string | undefined {
  const base = filename.slice(Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 以檔案內容決定 family／MIME：前端宣告的 Content-Type 只是 advisory，一律不參與判定。
 * 副檔名只用來否決「內容與副檔名不一致」與區分同一 magic 的 audio／video 變體。
 *
 * `truncated` 代表 head 只是整個檔案的前綴（呼叫端的 head window 有上限）。純文字判定必須
 * 知道這件事：窗尾切在多位元組字元中間是取樣造成的，不是無效 UTF-8。
 */
export function sniffMediaType(input: Readonly<{ head: Uint8Array; filename: string; truncated?: boolean }>): DataMediaResult<SniffedMedia> {
  const head = input.head;
  if (!(head instanceof Uint8Array) || head.byteLength === 0) return sniffFailure("MEDIA_UNSUPPORTED_TYPE");
  for (const magic of rejectedMagic) if (startsWith(head, magic.bytes, magic.offset ?? 0)) return sniffFailure("MEDIA_UNSUPPORTED_TYPE");
  const extension = fileExtension(input.filename);
  const content = detectContent(head, extension, input.truncated === true);
  if (content === undefined) return sniffFailure("MEDIA_UNSUPPORTED_TYPE");
  const allowed = content.raster === undefined ? mimeExtensions[content.mimeType] ?? [] : rasterExtensions[content.raster.format];
  // 副檔名缺失時不否決；帶著不符的副檔名（例如把 SVG 改名成 .png、把 MP3 改名成 .wav）必須 fail closed。
  if (extension !== undefined && !allowed.includes(extension)) return sniffFailure("MEDIA_TYPE_MISMATCH");
  return { ok: true, value: content };
}

function detectContent(head: Uint8Array, extension: string | undefined, truncated: boolean): SniffedMedia | undefined {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return rasterContent(head, "png", "image/png");
  if (startsWith(head, [0xff, 0xd8, 0xff])) return rasterContent(head, "jpeg", "image/jpeg");
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") return rasterContent(head, "gif", "image/gif");
  if (ascii(head, 0, 5) === "%PDF-") return { family: "pdf", mimeType: "application/pdf" };
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && head[1] !== undefined && (head[1] & 0xe0) === 0xe0)) return { family: "audio", mimeType: "audio/mpeg" };
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE") return { family: "audio", mimeType: "audio/wav" };
  if (ascii(head, 0, 4) === "OggS") return { family: extension === "ogv" ? "video" : "audio", mimeType: extension === "ogv" ? "video/ogg" : "audio/ogg" };
  if (ascii(head, 0, 4) === "fLaC") return { family: "audio", mimeType: "audio/flac" };
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return { family: extension === "weba" ? "audio" : "video", mimeType: extension === "weba" ? "audio/webm" : "video/webm" };
  if (ascii(head, 4, 4) === "ftyp") return isoBaseMedia(head, extension);
  return textContent(head, truncated);
}

function isoBaseMedia(head: Uint8Array, extension: string | undefined): SniffedMedia | undefined {
  const brand = ascii(head, 8, 4);
  if (brand === "qt  " || extension === "mov") return { family: "video", mimeType: "video/quicktime" };
  if (extension === "m4a" || extension === "m4b") return { family: "audio", mimeType: "audio/mp4" };
  return { family: "video", mimeType: "video/mp4" };
}

/** 純文字只在前 1 MiB 判定；媒體庫不對外提供原始 bytes，因此錯判不會讓主動內容被執行。 */
function textContent(head: Uint8Array, truncated: boolean): SniffedMedia | undefined {
  let text: string;
  // head 被截斷時以 stream 模式解碼：窗尾未完成的多位元組序列會被保留而不是判成錯誤，
  // 否則單純「檔案比 head window 大」就能讓合法的 CJK 純文字被拒。真正無效的 bytes
  // 仍然會 throw，因為 stream 只寬待「合法序列的前綴」。
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: truncated }); } catch { return undefined; }
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code < 0x20 || code === 0x7f) return undefined;
  }
  const trimmed = text.replace(/^\uFEFF/u, "").trimStart().toLowerCase();
  // XML／HTML／SVG 與 shebang script 是主動內容，即使改名成 .txt 或加上 BOM 也必須拒絕。
  if (trimmed.startsWith("<") || trimmed.startsWith("#!")) return undefined;
  return { family: "text", mimeType: "text/plain" };
}

/** 尺寸解析只有 raster codec 一份實作，避免 sniff 與 decoder 各自漂移。 */
function rasterContent(head: Uint8Array, format: RasterFormat, mimeType: string): SniffedMedia | undefined {
  const dimensions = readRasterDimensions({ head, format });
  return dimensions === undefined ? undefined : { family: "raster", mimeType, raster: { format, ...dimensions } };
}
