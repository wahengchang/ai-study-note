import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import { validatePluginActivationIdentity } from "../plugin-host/index.js";
import { normalizeRoute } from "../site-definition/index.js";
import { parseThemeManifest } from "../theme-host/index.js";

import { equalBytes, exact, freeze, mediaSelectionDigest, routeSelectionDigest } from "./canonical.js";
import type { ParsedPreviewInput, ParsedRendererInput, PreviewInput, ProjectionFailureCode, ProjectionResult, RendererInput, RendererMedia } from "./contracts.js";
import { projectionFailure } from "./failures.js";

const base64url = /^[A-Za-z0-9_-]*$/;

function digest(value: unknown): value is Digest { return typeof value === "string" && isDigest(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function ascending(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || values[index - 1]! < value); }

// digest 只由 payload 自身推導，無法認證來源；strict parse 必須把每個 evidence 欄位重新算回 bytes，
// 否則 consumer 會拿到型別宣稱為 RendererInput、內容卻任意的 document。
function canonicalDigest(value: unknown, expected: unknown): boolean {
  if (!digest(expected)) return false;
  const bytes = canonicalJsonBytes(value);
  return bytes.ok && sha256Digest(bytes.value) === expected;
}
function embedded(value: unknown, byteLength: unknown, expected: unknown): boolean {
  if (typeof value !== "string" || !base64url.test(value) || !count(byteLength) || !digest(expected)) return false;
  const bytes = Buffer.from(value, "base64url");
  // 重新編碼比對可排除非 canonical 的 base64url（帶 padding 或 trailing bit 非零）。
  return bytes.byteLength === byteLength && bytes.toString("base64url") === value && sha256Digest(bytes) === expected;
}

function rendererEntry(value: unknown): boolean {
  return exact(value, ["entryId", "revisionId", "schemaIdentity", "content", "contentDigest"])
    && text(value.entryId) && text(value.revisionId)
    && exact(value.schemaIdentity, ["schemaId", "version"]) && text(value.schemaIdentity.schemaId) && count(value.schemaIdentity.version)
    && canonicalDigest(value.content as JsonValue, value.contentDigest);
}
function mediaReference(value: unknown): boolean {
  return exact(value, ["entryId", "revisionId", "assetVersion"]) && text(value.entryId) && text(value.revisionId)
    && exact(value.assetVersion, ["assetId", "assetVersionId"]) && text(value.assetVersion.assetId) && text(value.assetVersion.assetVersionId);
}
function mediaAsset(value: unknown): boolean {
  return exact(value, ["identity", "objectDigest", "byteLength", "metadata", "metadataDigest"])
    && exact(value.identity, ["assetId", "assetVersionId"]) && text(value.identity.assetId) && text(value.identity.assetVersionId)
    && digest(value.objectDigest) && count(value.byteLength) && canonicalDigest(value.metadata as JsonValue, value.metadataDigest);
}
function mediaObject(value: unknown): boolean {
  return exact(value, ["objectDigest", "byteLength", "bytesBase64url"]) && embedded(value.bytesBase64url, value.byteLength, value.objectDigest);
}
// tuple 排序的分隔字元必須與 producer 完全一致（NUL），否則含空白等字元的 id
// 會排出不同順序，讓 parser 拒絕合法的 producer 輸出。
function assetKey(identity: Readonly<{ assetId: string; assetVersionId: string }>): string { return `${identity.assetId}\u0000${identity.assetVersionId}`; }
function media(value: unknown): value is RendererMedia {
  if (!exact(value, ["contract", "references", "assets", "objects"]) || value.contract !== "renderer-media/v1") return false;
  const references = value.references as readonly Record<string, never>[];
  const assets = value.assets as readonly Record<string, never>[];
  const objects = value.objects as readonly Record<string, never>[];
  if (!Array.isArray(references) || !references.every(mediaReference)) return false;
  if (!Array.isArray(assets) || !assets.every(mediaAsset) || !Array.isArray(objects) || !objects.every(mediaObject)) return false;
  const identities = assets.map((asset) => assetKey(asset.identity));
  if (!ascending(identities) || !ascending(objects.map((object) => String(object.objectDigest)))) return false;
  if (!ascending(references.map((reference) => `${reference.entryId}\u0000${reference.revisionId}\u0000${assetKey(reference.assetVersion)}`))) return false;
  // 每個 reference 必須解析到 asset、每個 asset 必須解析到內嵌 object，且宣告的 byteLength 一致。
  const declared = new Set(identities);
  const byObject = new Map(objects.map((object) => [String(object.objectDigest), object]));
  if (!references.every((reference) => declared.has(assetKey(reference.assetVersion)))) return false;
  return assets.every((asset) => byObject.get(String(asset.objectDigest))?.byteLength === asset.byteLength);
}
function theme(value: unknown): boolean {
  if (!exact(value, ["identity", "manifest", "files"]) || !Array.isArray(value.files)) return false;
  const identity: unknown = value.identity;
  if (!exact(identity, ["id", "version", "manifestHash"]) || !text(identity.id) || !text(identity.version) || !digest(identity.manifestHash)) return false;
  const encoded = canonicalJsonBytes(value.manifest);
  if (!encoded.ok) return false;
  // 重用 ThemeHost 的 manifest parser seam，避免 Projection 另外複製一份 manifest 規則。
  const parsed = parseThemeManifest(encoded.value);
  if (!parsed.ok || parsed.value.identity.id !== identity.id || parsed.value.identity.version !== identity.version || parsed.value.identity.manifestHash !== identity.manifestHash) return false;
  const files = value.files as readonly unknown[];
  const declared = [{ role: "runtime", file: parsed.value.manifest.runtime }, ...parsed.value.manifest.resources.map((file) => ({ role: "resource", file }))];
  return files.length === declared.length && files.every((entry, index) => {
    const expected = declared[index]!;
    return exact(entry, ["role", "file", "digest", "bytesBase64url"]) && entry.role === expected.role && entry.file === expected.file.file
      && entry.digest === expected.file.digest && typeof entry.bytesBase64url === "string"
      && embedded(entry.bytesBase64url, Buffer.from(entry.bytesBase64url, "base64url").byteLength, expected.file.digest);
  });
}
function plugins(value: unknown): boolean {
  if (!exact(value, ["activeStateDigest", "identities"]) || !digest(value.activeStateDigest) || !Array.isArray(value.identities)) return false;
  return (value.identities as readonly unknown[]).every((identity) => validatePluginActivationIdentity(identity).ok);
}
function claim(value: unknown): boolean {
  if (!exact(value, ["normalizedRoute", "owner", "sourceRevisionId"]) || !text(value.normalizedRoute) || !text(value.owner) || !text(value.sourceRevisionId)) return false;
  // route 必須已經是 route-normalization/v1 的固定點，否則 consumer 會拿到未正規化的 public route。
  return normalizeRoute(value.normalizedRoute)?.normalizedRoute === value.normalizedRoute;
}

function validRendererInput(value: Record<string, unknown>): boolean {
  const selection: unknown = value.selection;
  const routes: unknown = value.routes;
  const entries = value.entries as readonly Record<string, never>[];
  if (!exact(selection, ["publishedRevisionIds", "routeGraphDigest", "mediaSelectionDigest"]) || !digest(selection.routeGraphDigest) || !Array.isArray(selection.publishedRevisionIds)) return false;
  if (!Array.isArray(entries) || !entries.every(rendererEntry) || !ascending(entries.map((entry) => `${entry.entryId}\u0000${entry.revisionId}`))) return false;
  if (!exact(routes, ["contract", "normalization", "graph", "claims"]) || routes.contract !== "route-graph-snapshot/v1" || routes.normalization !== "route-normalization/v1" || routes.graph !== "published") return false;
  const claims = routes.claims as readonly Record<string, never>[];
  if (!Array.isArray(claims) || !claims.every(claim)) return false;
  if (new Set(claims.map((value) => String(value.owner))).size !== claims.length || new Set(claims.map((value) => String(value.normalizedRoute))).size !== claims.length) return false;
  if (!media(value.media) || !theme(value.theme) || !plugins(value.plugins)) return false;
  if (mediaSelectionDigest(value.media) !== selection.mediaSelectionDigest) return false;
  const selected = selection.publishedRevisionIds as readonly Record<string, never>[];
  if (selected.length !== entries.length || !selected.every((item) => exact(item, ["entryId", "revisionId"]) && text(item.entryId) && text(item.revisionId))) return false;
  // renderer 固定 published-only：每個 selection 必須恰好對應一個 entry 與一個 route claim。
  const bySelection = new Map(selected.map((item) => [String(item.entryId), String(item.revisionId)]));
  if (bySelection.size !== selected.length || !entries.every((entry) => bySelection.get(String(entry.entryId)) === String(entry.revisionId))) return false;
  return claims.length === selected.length && claims.every((item) => bySelection.get(String(item.owner)) === String(item.sourceRevisionId));
}

function validPreviewInput(value: Record<string, unknown>): boolean {
  const subject: unknown = value.subject;
  const selection: unknown = value.selection;
  if (!exact(subject, ["entryId"]) || !text(subject.entryId)) return false;
  if (!exact(selection, ["mode", "selectedRevision", "routeSelectionDigest", "mediaSelectionDigest"]) || (selection.mode !== "current" && selection.mode !== "published")) return false;
  if (!exact(selection.selectedRevision, ["entryId", "revisionId"]) || !text(selection.selectedRevision.entryId) || !text(selection.selectedRevision.revisionId)) return false;
  if (!rendererEntry(value.entry) || !claim(value.route) || !media(value.media) || !theme(value.theme) || !plugins(value.plugins)) return false;
  const entry = value.entry as Readonly<{ entryId: string; revisionId: string }>;
  const route = value.route as Readonly<{ normalizedRoute: string; owner: string; sourceRevisionId: string }>;
  // Preview 只輸出單一 subject：entry、route 與 selection 必須全部指向同一組 entryId／revisionId。
  if (entry.entryId !== subject.entryId || route.owner !== subject.entryId) return false;
  if (selection.selectedRevision.entryId !== subject.entryId || selection.selectedRevision.revisionId !== entry.revisionId || route.sourceRevisionId !== entry.revisionId) return false;
  return mediaSelectionDigest(value.media) === selection.mediaSelectionDigest && routeSelectionDigest(selection.mode, route) === selection.routeSelectionDigest;
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
  const valid = contract === "renderer-input/v1" ? validRendererInput(value) : validPreviewInput(value);
  return valid ? { ok: true, value: freeze(value) } : { ok: false, error: projectionFailure(failure) };
}

export function parseRendererInput(bytes: Uint8Array): ProjectionResult<ParsedRendererInput> {
  const parsed = parse(bytes, "renderer-input/v1", "inputDigest", "INVALID_RENDERER_INPUT");
  if (!parsed.ok) return parsed;
  // 已驗證 contract、canonical bytes、digest 與完整結構；consumer-visible document 保持 immutable。
  const input = parsed.value as RendererInput;
  return { ok: true, value: Object.freeze({ input, bytesDigest: sha256Digest(copyBytes(bytes)) }) };
}

export function parsePreviewInput(bytes: Uint8Array): ProjectionResult<ParsedPreviewInput> {
  const parsed = parse(bytes, "preview-input/v1", "previewDigest", "INVALID_PREVIEW_INPUT");
  if (!parsed.ok) return parsed;
  // 已驗證 contract、canonical bytes、digest 與完整結構；consumer-visible document 保持 immutable。
  const input = parsed.value as PreviewInput;
  return { ok: true, value: Object.freeze({ input, bytesDigest: sha256Digest(copyBytes(bytes)) }) };
}
