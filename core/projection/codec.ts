import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest } from "../foundation/index.js";

import type { ParsedPreviewInput, ParsedRendererInput, PreviewInput, ProjectionFailureCode, ProjectionResult, RendererInput } from "./contracts.js";
import { projectionFailure } from "./failures.js";

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors && "value" in descriptors[key]!);
  } catch { return false; }
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]); }
function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freeze(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)]))) as T;
}
function parse(bytes: Uint8Array, contract: "renderer-input/v1" | "preview-input/v1", digestKey: "inputDigest" | "previewDigest", failure: ProjectionFailureCode): ProjectionResult<Record<string, unknown>> {
  if (!(bytes instanceof Uint8Array)) return { ok: false, error: projectionFailure(failure) };
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return { ok: false, error: projectionFailure(failure) }; }
  const keys = contract === "renderer-input/v1"
    ? ["contract", "inputDigest", "selection", "entries", "routes", "media", "theme", "plugins"]
    : ["contract", "previewDigest", "subject", "selection", "entry", "route", "media", "theme", "plugins"];
  if (!exact(value, keys) || value.contract !== contract || typeof value[digestKey] !== "string" || !isDigest(value[digestKey])) return { ok: false, error: projectionFailure(failure) };
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !equalBytes(canonical.value, bytes)) return { ok: false, error: projectionFailure(failure) };
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== digestKey));
  const digestBytes = canonicalJsonBytes(unsigned);
  if (!digestBytes.ok || sha256Digest(digestBytes.value) !== value[digestKey]) return { ok: false, error: projectionFailure(failure) };
  return { ok: true, value: freeze(value) };
}

export function parseRendererInput(bytes: Uint8Array): ProjectionResult<ParsedRendererInput> {
  const parsed = parse(bytes, "renderer-input/v1", "inputDigest", "INVALID_RENDERER_INPUT");
  if (!parsed.ok) return parsed;
  // 已驗證 contract、canonical bytes 與 digest；consumer-visible document 保持 immutable。
  const input = parsed.value as RendererInput;
  return { ok: true, value: Object.freeze({ input, bytesDigest: sha256Digest(copyBytes(bytes)) }) };
}

export function parsePreviewInput(bytes: Uint8Array): ProjectionResult<ParsedPreviewInput> {
  const parsed = parse(bytes, "preview-input/v1", "previewDigest", "INVALID_PREVIEW_INPUT");
  if (!parsed.ok) return parsed;
  // 已驗證 contract、canonical bytes 與 digest；consumer-visible document 保持 immutable。
  const input = parsed.value as PreviewInput;
  return { ok: true, value: Object.freeze({ input, bytesDigest: sha256Digest(copyBytes(bytes)) }) };
}
