import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";

import type { ContentTypeAdministration, CurrentEntryAdministration, CurrentMediaLibrary, CurrentTaxonomyAdministration } from "../../core/application/index.js";
import type { MessageRemediation } from "../../core/foundation/index.js";

import type { Context } from "hono";
import type { AuthoringCredentialAuthority } from "./credential-store.js";


import { createBrowserBootstrapState } from "./browser-bootstrap.js";
import type { CmsAsset, CmsAssets } from "./cms-assets.js";
import { API_KEY_PATTERN, AUTHORING_AUTHORITY, AUTHORING_HOST, AUTHORING_ORIGIN, AUTHORING_PORT, AUTHORING_RESOURCE_ID_PATTERN, redactSecrets } from "./origin.js";
import { cptEntryCatalogSchema, cptEntrySearchRequestSchema, cptEntrySearchResultSchema, cptEntryCreateRequestSchema, cptEntryDeleteRequestSchema, cptEntryDeletedSchema, cptEntrySaveRequestSchema, cptEntrySchema, currentTaxonomyCatalogSchema, currentTaxonomySnapshotSchema, currentTaxonomyCreateSchema, currentTaxonomyCommandSchema, authoringErrorSchema, authoringErrorStatuses, mediaAssetDetailV2Schema, mediaAssetReferencedErrorSchema, mediaAssetV2Schema, mediaCatalogV2Schema, mediaDeleteReceiptSchema, mediaDeleteRequestSchema, mediaImportMetadataSchema, mediaMetadataSaveRequestSchema, mediaReplaceRequestSchema, browserSessionExchangeSchema, browserSessionSchema, browserTicketMintRequestSchema, browserTicketSchema, contentTypeCatalogSchema, contentTypeSchema, createContentTypeRequestSchema, serverProofChallengeSchema } from "./transport-contracts.js";
import { prepareMediaUpload, type PreparedMediaUpload } from "./multipart.js";
import type { DataMediaFailure } from "../../core/media/index.js";
import type { BrowserSessionDto, BrowserTicketDto, MediaAssetReferencedErrorDto, TransportCode } from "./transport-contracts.js";
import type { CurrentMediaLibraryResult } from "../../core/application/index.js";


import { replaceContentTypeRequestSchema } from "./transport-contracts.js";

const ORIGIN = AUTHORING_ORIGIN;
const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;
const CMS_DOCUMENT_HEADERS = {
  ...SECURITY_HEADERS,
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'",
} as const;
const ERROR_REMEDIATION: Record<TransportCode, string> = {
  INVALID_REQUEST_FRAMING: "請修正 HTTP request framing。",
  MISDIRECTED_REQUEST: "請使用核准的本機 Authoring API origin。",
  ORIGIN_FORBIDDEN: "請從核准的 same-origin CMS 或本機 CLI 呼叫。",
  AUTHORIZATION_REQUIRED: "請提供目前有效的本機 Authoring API credential。",
  AUTHORIZATION_MALFORMED: "請提供目前有效的本機 Authoring API credential。",
  AUTHORIZATION_DUPLICATE: "請提供目前有效的本機 Authoring API credential。",
  AUTHORIZATION_ALTERNATE_TRANSPORT: "請提供目前有效的本機 Authoring API credential。",
  AUTHORIZATION_INVALID: "請提供目前有效的本機 Authoring API credential。",
  AUTHORIZATION_REVOKED: "請提供目前有效的本機 Authoring API credential。",
  SERVER_PROOF_GENERATION_MISMATCH: "請提供目前有效的本機 Authoring API credential。",
  BROWSER_BOOTSTRAP_INVALID: "請重新由本機 CMS launcher 建立 browser session。",
  INVALID_REQUEST_BODY: "請修正 versioned JSON request。",
  REQUEST_BODY_TOO_LARGE: "請縮小 request body 至該 route 允許的上限。",
  ROUTE_NOT_FOUND: "請使用已核准的 Authoring API route。",
  METHOD_NOT_ALLOWED: "請使用 route 核准的 HTTP method。",
  UNSUPPORTED_MEDIA_TYPE: "請使用 application/json UTF-8 request body。",
  INTERNAL_SERVER_ERROR: "Authoring API 暫時無法完成 request，請稍後重試。",
};
/** 每個 route 的 body 上限與其 remediation 綁在同一處，避免上限與訊息各自漂移。 */
const ENTRY_BODY_LIMIT = 1_048_576;
const ENTRY_BODY_LIMIT_REMEDIATION = "Entry request 不得超過 1 MiB。";
const PROOF_BODY_LIMIT = 4_096;
const PROOF_BODY_LIMIT_REMEDIATION = "server-proof challenge 不得超過 4 KiB。";
/** Current media library 的唯一 bytes 上限；檔案以 streaming 寫入 staged file，永不整檔進記憶體。 */
const MEDIA_UPLOAD_REMEDIATION = "Media 檔案不得超過 400 MiB，metadata envelope 不得超過 64 KiB。";
export type { TransportCode } from "./transport-contracts.js";
export type AuthoringApiLogEvent = Readonly<{
  requestId: string;
  stableEventCode: "AUTHORING_REQUEST_OK" | "AUTHORING_REQUEST_REJECTED" | "AUTHORING_REQUEST_FAILED";
  method: "GET" | "POST" | "OPTIONS" | "OTHER" | "UNPARSED";
  routeTemplate: "/cms" | "/cms/content-types" | "/cms/content-types/new" | "/cms/content-types/:typeId" | "/cms/content/:typeId" | "/cms/taxonomies" | "/cms/taxonomies/new" | "/cms/taxonomies/:taxonomyId" | "/cms/media" | "/cms/media/import" | "/cms/media/:assetId" | "/cms/media/:assetId/thumbnail" | "/cms/assets/:asset" | "/v1/media" | "/v1/media/import" | "/v1/media/:assetId" | "/v1/media/:assetId/replace" | "/v1/media/:assetId/metadata" | "/v1/media/:assetId/delete" | "/v1/taxonomies" | "/v1/taxonomies/:taxonomyId" | "/v1/taxonomies/:taxonomyId/commands" | "/v1/content-types" | "/v1/content-types/:typeId" | "/v1/content-types/:typeId/entries" | "/v1/content-types/:typeId/entries/search" | "/v1/content-types/:typeId/entries/:entryId" | "/v1/content-types/:typeId/entries/:entryId/delete" | "/_local/server-proof" | "/_local/browser-tickets" | "/_local/browser-session" | "unmatched";
  status: number;
}>;
export type AuthoringApiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: "AUTHORING_SERVER_START_FAILED"; owner: "AuthoringApi"; subjectIds: readonly []; remediation: MessageRemediation }> }>;
export interface RunningAuthoringApi { readonly origin: typeof ORIGIN; close(): Promise<void>; }
export type StartAuthoringApiInput = Readonly<{ credentialAuthority: AuthoringCredentialAuthority; cmsAssets: CmsAssets; logger: (event: AuthoringApiLogEvent) => void; contentTypeAdministration: ContentTypeAdministration; currentEntryAdministration: CurrentEntryAdministration; currentTaxonomyAdministration: CurrentTaxonomyAdministration; currentMediaLibrary: CurrentMediaLibrary }>;

type RouteTemplate = AuthoringApiLogEvent["routeTemplate"];
type HeaderMap = ReadonlyMap<string, readonly string[]>;
type RouteClass = "cms-document" | "cms-asset" | "media-thumbnail" | "media" | "media-import" | "media-replace" | "media-metadata" | "media-delete" | "media-detail" | "content-types" | "content-type" | "taxonomies" | "taxonomy" | "taxonomy-commands" | "proof" | "browser-ticket" | "browser-session" | "content-type-entries" | "content-type-entry" | "content-type-entry-delete" | "content-type-entry-search" | "unknown";
const READ_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["media", "media-detail", "media-thumbnail", "content-types", "content-type", "taxonomies", "taxonomy", "content-type-entries", "content-type-entry"]);
const POST_READ_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["content-types", "content-type", "taxonomies", "content-type-entries", "content-type-entry", "content-type-entry-search"]);
const AUTHENTICATED_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["media", "media-import", "media-replace", "media-metadata", "media-delete", "media-detail", "content-types", "content-type", "taxonomies", "taxonomy", "taxonomy-commands", "content-type-entries", "content-type-entry", "content-type-entry-delete", "content-type-entry-search"]);

function headersOf(incoming: IncomingMessage): HeaderMap {
  const map = new Map<string, string[]>();
  for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
    const name = incoming.rawHeaders[index]; const value = incoming.rawHeaders[index + 1];
    if (name === undefined || value === undefined) continue;
    const key = name.toLowerCase(); const values = map.get(key) ?? []; values.push(value); map.set(key, values);
  }
  return map;
}
function values(headers: HeaderMap, name: string): readonly string[] { return headers.get(name) ?? []; }
function one(headers: HeaderMap, name: string): string | undefined { const found = values(headers, name); return found.length === 1 ? found[0] : undefined; }
/** dynamic ID 與 asset path 都不接受 percent encoding，防止 URL 與 canonical identity 脫節。 */
function routeFor(pathname: string): RouteClass {
  if (pathname === "/cms" || pathname === "/cms/media" || pathname === "/cms/media/import" || pathname === "/cms/content-types" || pathname === "/cms/content-types/new" || pathname === "/cms/taxonomies" || pathname === "/cms/taxonomies/new" || (/^\/cms\/(?:content|content-types|taxonomies|media)\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice(pathname.lastIndexOf("/") + 1)))) return "cms-document";
  if (/^\/cms\/media\/[^/%?#/]+\/thumbnail$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/cms/media/".length, -"/thumbnail".length))) return "media-thumbnail";
  if (/^\/cms\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(pathname)) return "cms-asset";
  if (pathname === "/_local/server-proof") return "proof";
  if (pathname === "/_local/browser-tickets") return "browser-ticket";
  if (pathname === "/_local/browser-session") return "browser-session";
  if (pathname === "/v1/media") return "media";
  if (pathname === "/v1/media/import") return "media-import";
  const mediaSubRoute = (suffix: string): boolean => /^\/v1\/media\/[^/%?#/]+\/[a-z]+$/u.test(pathname) && pathname.endsWith(`/${suffix}`) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length, -(`/${suffix}`).length));
  if (mediaSubRoute("replace")) return "media-replace";
  if (mediaSubRoute("metadata")) return "media-metadata";
  if (mediaSubRoute("delete")) return "media-delete";
  if (/^\/v1\/media\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length))) return "media-detail";
  if (pathname === "/v1/content-types") return "content-types";
  if (/^\/v1\/content-types\/[^/%?#/]+\/entries\/search$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length, -"/entries/search".length))) return "content-type-entry-search";
  if (/^\/v1\/content-types\/[^/%?#/]+\/entries\/[^/%?#/]+\/delete$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length).split("/")[0] ?? "") && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice(0, -"/delete".length).split("/").at(-1) ?? "")) return "content-type-entry-delete";
  if (/^\/v1\/content-types\/[^/%?#/]+\/entries\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length).split("/")[0] ?? "") && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice(pathname.lastIndexOf("/") + 1))) return "content-type-entry";
  if (/^\/v1\/content-types\/[^/%?#/]+\/entries$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length).split("/")[0] ?? "")) return "content-type-entries";
  if (/^\/v1\/content-types\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length))) return "content-type";
  if (pathname === "/v1/taxonomies") return "taxonomies";
  if (/^\/v1\/taxonomies\/[^/%?#/]+\/commands$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/taxonomies/".length, -"/commands".length))) return "taxonomy-commands";
  if (/^\/v1\/taxonomies\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/taxonomies/".length))) return "taxonomy";
  return "unknown";
}
function templateFor(route: RouteClass, pathname: string): RouteTemplate {
  if (route === "cms-document") {
    if (pathname === "/cms") return "/cms";
    if (pathname === "/cms/media") return "/cms/media";
    if (pathname === "/cms/media/import") return "/cms/media/import";
    if (pathname === "/cms/content-types") return "/cms/content-types";
    if (pathname === "/cms/content-types/new") return "/cms/content-types/new";
    if (pathname === "/cms/taxonomies") return "/cms/taxonomies";
    if (pathname === "/cms/taxonomies/new") return "/cms/taxonomies/new";
    if (pathname.startsWith("/cms/content-types/")) return "/cms/content-types/:typeId";
    if (pathname.startsWith("/cms/content/")) return "/cms/content/:typeId";
    if (pathname.startsWith("/cms/taxonomies/")) return "/cms/taxonomies/:taxonomyId";
    return "/cms/media/:assetId";
  }
  if (route === "cms-asset") return "/cms/assets/:asset";
  if (route === "media-thumbnail") return "/cms/media/:assetId/thumbnail";
  if (route === "media") return "/v1/media";
  if (route === "media-import") return "/v1/media/import";
  if (route === "media-replace") return "/v1/media/:assetId/replace";
  if (route === "media-metadata") return "/v1/media/:assetId/metadata";
  if (route === "media-delete") return "/v1/media/:assetId/delete";
  if (route === "media-detail") return "/v1/media/:assetId";
  if (route === "content-types") return "/v1/content-types";
  if (route === "content-type") return "/v1/content-types/:typeId";
  if (route === "content-type-entries") return "/v1/content-types/:typeId/entries";
  if (route === "content-type-entry-search") return "/v1/content-types/:typeId/entries/search";
  if (route === "content-type-entry") return "/v1/content-types/:typeId/entries/:entryId";
  if (route === "content-type-entry-delete") return "/v1/content-types/:typeId/entries/:entryId/delete";
  if (route === "taxonomies") return "/v1/taxonomies";
  if (route === "taxonomy") return "/v1/taxonomies/:taxonomyId";
  if (route === "taxonomy-commands") return "/v1/taxonomies/:taxonomyId/commands";
  if (route === "proof") return "/_local/server-proof";
  if (route === "browser-ticket") return "/_local/browser-tickets";
  if (route === "browser-session") return "/_local/browser-session";
  return "unmatched";
}
function methodFor(method: string | undefined): AuthoringApiLogEvent["method"] { return method === "GET" ? "GET" : method === "POST" ? "POST" : method === "OPTIONS" ? "OPTIONS" : "OTHER"; }
/** 所有 JSON response 在送出前一律 redact；success DTO 也會回吐呼叫端提供的 route／ID。 */
function response(body: unknown, status: number, extra: Readonly<Record<string, string>> = {}): Response { return new Response(redactSecrets(JSON.stringify(body)), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra } }); }
function errorResponse(requestId: string, code: TransportCode, status: number, owner: "AuthoringApi" | "AuthoringCredential" = "AuthoringApi", remediation = ERROR_REMEDIATION[code]): Response { return response({ contract: "authoring-error/v1", requestId, code, owner, subjectIds: [], remediation: { kind: "message", message: remediation } }, status); }
/** 僅 bootstrap success DTO 可繞過通用 redact；呼叫端必須先以 strict schema 驗證。 */
function bootstrapSecretResponse(body: BrowserTicketDto | BrowserSessionDto, status: 200 | 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}
function cmsDocumentResponse(assets: CmsAssets): Response {
  const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CMS Workspace</title></head><body><div id="root"><main aria-busy="true"><h1>CMS 工作台載入中</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`;
  return new Response(html, { status: 200, headers: { ...CMS_DOCUMENT_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
function cmsAssetResponse(asset: CmsAsset): Response {
  return new Response(asset.bytes as unknown as BodyInit, { status: 200, headers: { ...SECURITY_HEADERS, "Content-Type": asset.contentType } });
}
function framingOk(headers: HeaderMap, incoming: IncomingMessage): boolean {
  if (incoming.url === undefined || !incoming.url.startsWith("/") || incoming.url.startsWith("//") || one(headers, "expect") !== undefined || one(headers, "upgrade") !== undefined) return false;
  const contentLength = values(headers, "content-length"); const transferEncoding = values(headers, "transfer-encoding");
  if (contentLength.length > 1 || transferEncoding.length > 1 || (contentLength.length > 0 && transferEncoding.length > 0)) return false;
  if (contentLength.length === 1 && !/^(0|[1-9][0-9]*)$/u.test(contentLength[0] ?? "")) return false;
  if (contentLength.length === 1 && !Number.isSafeInteger(Number(contentLength[0]))) return false;
  return transferEncoding.length === 0 || transferEncoding[0] === "chunked";
}

function canonicalRequestTarget(incoming: IncomingMessage): boolean {
  const target = incoming.url;
  if (target === undefined) return false;
  const query = target.indexOf("?");
  const rawPath = query === -1 ? target : target.slice(0, query);
  if (/(?:^|\/)(?:\.|%2e)(?:\.|%2e)?(?:\/|$)/iu.test(rawPath)) return false;
  try {
    return new URL(target, ORIGIN).pathname === rawPath;
  } catch {
    return false;
  }
}

/** 內容工作台只接受無 query 的 `/cms/content/:typeId` canonical UUID。 */
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function cmsDocumentTargetOk(route: RouteClass, pathname: string, target: string | undefined): boolean {
  if (target === undefined || target.includes("#")) return false;
  if (route === "cms-asset") return !target.includes("?");
  return !target.includes("?") && (!pathname.startsWith("/cms/content/") || canonicalUuid.test(pathname.slice("/cms/content/".length)));
}

function hostOk(headers: HeaderMap): boolean { return one(headers, "host") === AUTHORING_AUTHORITY && values(headers, "forwarded").length === 0 && [...headers.keys()].every((name) => !name.startsWith("x-forwarded-")); }
function originOk(headers: HeaderMap, route: RouteClass, assetDestination: CmsAsset["destination"] | undefined, method: string): boolean {
  const origin = values(headers, "origin"); const fetchSite = values(headers, "sec-fetch-site"); const fetchMode = values(headers, "sec-fetch-mode"); const fetchDestination = values(headers, "sec-fetch-dest");
  const localOrigin = origin.length === 0 || (origin.length === 1 && origin[0] === ORIGIN);
  if (route === "cms-document") {
    return localOrigin
      && values(headers, "authorization").length === 0
      && values(headers, "cookie").length === 0
      && (
        (fetchSite.length === 0 && fetchMode.length === 0 && fetchDestination.length === 0)
        || (fetchSite.length === 1 && (fetchSite[0] === "none" || fetchSite[0] === "same-origin") && fetchMode.length === 1 && fetchMode[0] === "navigate" && fetchDestination.length === 1 && fetchDestination[0] === "document")
      );
  }
  if (route === "cms-asset" || route === "media-thumbnail") {
    const destination = route === "media-thumbnail" ? "image" : assetDestination;
    return localOrigin
      && values(headers, "authorization").length === 0
      && values(headers, "cookie").length === 0
      && destination !== undefined
      && (
        (fetchSite.length === 0 && fetchMode.length === 0 && fetchDestination.length === 0)
        || (fetchSite.length === 1 && fetchSite[0] === "same-origin" && fetchMode.length <= 1 && fetchDestination.length === 1 && fetchDestination[0] === destination)
      );
  }
  if (route === "proof") return origin.length === 0 && fetchSite.length === 0 && values(headers, "authorization").length === 0;
  if (route === "browser-ticket") return origin.length === 0 && [...headers.keys()].every((name) => !name.startsWith("sec-fetch-"));
  if (route === "browser-session") return origin.length === 1 && origin[0] === ORIGIN && (fetchSite.length === 0 || (fetchSite.length === 1 && fetchSite[0] === "same-origin")) && values(headers, "authorization").length === 0;
  if (!AUTHENTICATED_ROUTES.has(route)) return true;
  // Fetch 只在 non-GET/HEAD 或 CORS-tainted request 附加 `Origin`，故 same-origin `GET` 合法省略；
  // state-changing method 必定帶 `Origin`，因此省略在此一律拒絕，不讓它成為同源證明的繞道。
  const omittedOrigin = origin.length === 0 && (method === "GET" || method === "HEAD");
  const browser = (omittedOrigin || (origin.length === 1 && origin[0] === ORIGIN)) && (fetchSite.length === 0 || (fetchSite.length === 1 && fetchSite[0] === "same-origin"));
  const cli = origin.length === 0 && fetchSite.length === 0 && [...headers.keys()].every((name) => !name.startsWith("sec-fetch-"));
  return browser || cli;
}
function jsonMediaType(headers: HeaderMap): boolean { const contentType = one(headers, "content-type"); return contentType === "application/json" || contentType === "application/json; charset=utf-8"; }
async function boundedJson(request: Request, limit: number): Promise<Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false; code: "INVALID_REQUEST_BODY" | "REQUEST_BODY_TOO_LARGE" }>> {
  const contentLength = request.headers.get("content-length"); if (contentLength !== null && Number(contentLength) > limit) return { ok: false, code: "REQUEST_BODY_TOO_LARGE" };
  const reader = request.body?.getReader(); if (reader === undefined) return { ok: false, code: "INVALID_REQUEST_BODY" };
  const parts: Uint8Array[] = []; let total = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; if (total > limit) { await reader.cancel(); return { ok: false, code: "REQUEST_BODY_TOO_LARGE" }; } parts.push(item.value); } } catch { return { ok: false, code: "INVALID_REQUEST_BODY" }; }
  const bytes = new Uint8Array(total); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { ok: false, code: "INVALID_REQUEST_BODY" }; }
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, code: "INVALID_REQUEST_BODY" }; }
}
function authorization(headers: HeaderMap): Readonly<{ ok: true; candidate: string }> | Readonly<{ ok: false; code: TransportCode }> {
  const all = values(headers, "authorization"); if (all.length === 0) return { ok: false, code: "AUTHORIZATION_REQUIRED" }; if (all.length !== 1) return { ok: false, code: "AUTHORIZATION_DUPLICATE" };
  const header = all[0] ?? ""; const candidate = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return API_KEY_PATTERN.test(candidate) ? { ok: true, candidate } : { ok: false, code: "AUTHORIZATION_MALFORMED" };
}
function credentialError(requestId: string, admission: Awaited<ReturnType<AuthoringCredentialAuthority["openAdmission"]>>): Response {
  if (!admission.ok && admission.error.code === "CREDENTIAL_REVOKED") return errorResponse(requestId, "AUTHORIZATION_REVOKED", 401, "AuthoringCredential");
  return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 503, "AuthoringCredential", "請修復本機 Authoring API credential store 後重試。");
}
/**
 * 兩個 Media failure 必須投影它們的 remediation evidence；evidence 缺失或不符 strict schema 時
 * 退回 redacted `authoring-error/v1`（同一 status），不得以 generic 500 抹掉安全的 Media error。
 */
/**
 * 被引用時不得 Replace／Delete；這個 failure 必須帶完整且已排序的 usage evidence，
 * 因此以 exact contract 單獨投影，並在 evidence 不符時退回 redacted `authoring-error/v1`。
 */
function mediaError(
  safe: Readonly<{ requestId: string; code: string; owner: string; subjectIds: readonly string[]; remediation: MessageRemediation }>,
  descriptor: Readonly<Record<string, PropertyDescriptor>>,
): MediaAssetReferencedErrorDto | undefined {
  if (safe.code !== "MEDIA_ASSET_REFERENCED") return undefined;
  const parsed = mediaAssetReferencedErrorSchema.safeParse({ contract: "media-asset-referenced/v2", ...safe, usage: descriptor.usage?.value });
  return parsed.success ? parsed.data : undefined;
}
async function authenticatedJson(context: Context, input: StartAuthoringApiInput, bodyLimit: number, oversizedRemediation: string, handle: (requestId: string, entryId: string, body: unknown) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  if (values(headers, "authorization").length === 0) {
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, bodyLimit);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? oversizedRemediation : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    return handle(requestId, context.req.param("entryId") ?? "", body.value);
  }
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try {
    if (!admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, bodyLimit);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? oversizedRemediation : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    const entryId = context.req.param("entryId") ?? "";
    return handle(requestId, entryId, body.value);
  } finally { admission.value.dispose(); }
}
/** Multipart 版本沿用既有認證分支：無 Bearer 時由 same-origin admission 決定，Cookie／query 一律拒絕。 */
async function authenticatedUpload(context: Context, input: StartAuthoringApiInput, handle: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  if (values(headers, "authorization").length === 0) return handle(requestId);
  const parsedAuthorization = authorization(headers);
  if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission();
  if (!admission.ok) return credentialError(requestId, admission);
  try {
    return admission.value.verifyBearer(parsedAuthorization.candidate) ? await handle(requestId) : errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
  } finally { admission.value.dispose(); }
}

/** 讀 multipart 的前半段（metadata part）並回傳把 file part 交給 library 串流處理的 handle。 */
async function beginMediaUpload(context: Context, requestId: string): Promise<Readonly<{ ok: true; value: PreparedMediaUpload }> | Readonly<{ ok: false; response: Response }>> {
  const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  const prepared = await prepareMediaUpload({ body: context.req.raw.body ?? undefined, contentType: one(headers, "content-type") ?? null });
  if (prepared.ok) return prepared;
  return { ok: false, response: errorResponse(requestId, prepared.code, prepared.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400, "AuthoringApi", MEDIA_UPLOAD_REMEDIATION) };
}

/** framing 錯誤只在 file part 串流結束後才會出現，因此必須覆寫 library 的 staging failure。 */
function finishMediaUpload<T>(requestId: string, upload: PreparedMediaUpload, result: CurrentMediaLibraryResult<T>, successStatus: 200 | 201): Response {
  const framing = upload.framingFailure();
  if (framing !== undefined) return errorResponse(requestId, framing, 400, "AuthoringApi", MEDIA_UPLOAD_REMEDIATION);
  if (!result.ok) return currentMediaError(requestId, result.error);
  return mediaAssetV2Schema.safeParse(result.value).success ? response(result.value, successStatus) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
}

/** Current media library 的 failure 一律經既有 status 表；referenced 必須投影完整 usage evidence。 */
function currentMediaError(requestId: string, failure: DataMediaFailure): Response {
  const status = authoringErrorStatuses(failure.code)?.[0];
  if (status === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const safe = { requestId, code: failure.code, owner: failure.owner, subjectIds: failure.subjectIds, remediation: failure.remediation };
  const specialized = mediaError(safe, Object.getOwnPropertyDescriptors(failure));
  if (specialized !== undefined) return response(specialized, status);
  const body = { contract: "authoring-error/v1" as const, ...safe };
  return authoringErrorSchema.safeParse(body).success ? response(body, status) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
}

async function authenticatedRead(context: Context, input: StartAuthoringApiInput, handle: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const incoming = (context.env as { incoming: IncomingMessage }).incoming; const headers = headersOf(incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  if (values(headers, "authorization").length === 0) return handle(requestId);
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try { return admission.value.verifyBearer(parsedAuthorization.candidate) ? handle(requestId) : errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential"); } finally { admission.value.dispose(); }
}
function facadeError(requestId: string, error: Readonly<{ code: string; owner: string; subjectIds: readonly string[]; remediation: MessageRemediation }>): Response {
  const status = authoringErrorStatuses(error.code)?.[0];
  return status === undefined ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response({ contract: "authoring-error/v1", requestId, code: error.code, owner: error.owner, subjectIds: error.subjectIds, remediation: error.remediation }, status);
}
export async function startAuthoringApi(input: StartAuthoringApiInput): Promise<AuthoringApiResult<RunningAuthoringApi>> {
  const app = new Hono();
  const bootstrap = createBrowserBootstrapState();
  app.post("/_local/server-proof", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT); if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? PROOF_BODY_LIMIT_REMEDIATION : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    const parsed = serverProofChallengeSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (admission.value.generation !== parsed.data.generation) return errorResponse(requestId, "SERVER_PROOF_GENERATION_MISMATCH", 401, "AuthoringCredential");
      const socket = (context.env as { incoming: IncomingMessage }).incoming.socket;
      bootstrap.grantProof(socket, { generation: admission.value.generation, proofNonce: parsed.data.nonce });
      return response({ contract: "authoring-server-proof/v1", generation: admission.value.generation, nonce: parsed.data.nonce, mac: admission.value.createServerProof(parsed.data.nonce) }, 200);
    } finally { admission.value.dispose(); }
  });
  app.post("/_local/browser-tickets", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    const parsedAuthorization = authorization(headers);
    if (!parsedAuthorization.ok) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi");
    const parsed = browserTicketMintRequestSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const admission = await input.credentialAuthority.openAdmission();
    if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (!admission.value.verifyBearer(parsedAuthorization.candidate) || admission.value.generation !== parsed.data.generation) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
      const socket = (context.env as { incoming: IncomingMessage }).incoming.socket;
      const ticket = bootstrap.mint(socket, parsed.data);
      if (ticket === undefined) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
      const dto = { contract: "browser-ticket/v1" as const, ...ticket };
      if (!browserTicketSchema.safeParse(dto).success) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
      return bootstrapSecretResponse(dto, 201);
    } finally { admission.value.dispose(); }
  });
  app.post("/_local/browser-session", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0 || values(headers, "authorization").length > 0) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi");
    const parsed = browserSessionExchangeSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const admission = await input.credentialAuthority.openAdmission();
    if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (!bootstrap.consume({ ticket: parsed.data.ticket, generation: admission.value.generation })) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
      const apiKey = admission.value.takeBrowserSessionApiKey();
      if (apiKey === undefined) return errorResponse(requestId, "BROWSER_BOOTSTRAP_INVALID", 401);
      const dto = { contract: "browser-session/v1" as const, generation: admission.value.generation, apiKey };
      if (!browserSessionSchema.safeParse(dto).success) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
      return bootstrapSecretResponse(dto, 200);
    } finally { admission.value.dispose(); }
  });
  app.get("/v1/media", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentMediaLibrary.list();
    return result.ok && mediaCatalogV2Schema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : currentMediaError(requestId, result.error);
  }));
  app.get("/v1/media/:assetId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentMediaLibrary.get(context.req.param("assetId") ?? "");
    return result.ok && mediaAssetDetailV2Schema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : currentMediaError(requestId, result.error);
  }));
  app.get("/cms/media/:assetId/thumbnail", async (context) => {
    const requestId = randomUUID();
    const result = await input.currentMediaLibrary.readThumbnail(context.req.param("assetId") ?? "");
    if (!result.ok) return currentMediaError(requestId, result.error);
    return new Response(result.value.bytes as unknown as BodyInit, { status: 200, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png" } });
  });
  app.post("/v1/media/import", async (context) => authenticatedUpload(context, input, async (requestId) => {
    const prepared = await beginMediaUpload(context, requestId);
    if (!prepared.ok) return prepared.response;
    const metadata = mediaImportMetadataSchema.safeParse(prepared.value.metadata);
    if (!metadata.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentMediaLibrary.importAsset({ filename: prepared.value.filename, metadata: metadata.data, source: prepared.value.source });
    return finishMediaUpload(requestId, prepared.value, result, 201);
  }));
  app.post("/v1/media/:assetId/replace", async (context) => authenticatedUpload(context, input, async (requestId) => {
    const prepared = await beginMediaUpload(context, requestId);
    if (!prepared.ok) return prepared.response;
    const request = mediaReplaceRequestSchema.safeParse(prepared.value.metadata);
    if (!request.success || request.data.assetId !== (context.req.param("assetId") ?? "")) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentMediaLibrary.replaceAsset({ filename: prepared.value.filename, metadata: request.data.metadata, request: request.data, source: prepared.value.source });
    return finishMediaUpload(requestId, prepared.value, result, 200);
  }));
  app.post("/v1/media/:assetId/metadata", async (context) => authenticatedJson(context, input, 65_536, "Media metadata request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = mediaMetadataSaveRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.assetId !== (context.req.param("assetId") ?? "")) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentMediaLibrary.saveMetadata(parsed.data);
    return result.ok && mediaAssetV2Schema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : currentMediaError(requestId, result.error);
  }));
  app.post("/v1/media/:assetId/delete", async (context) => authenticatedJson(context, input, 4_096, "Media delete request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    const parsed = mediaDeleteRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.assetId !== (context.req.param("assetId") ?? "")) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentMediaLibrary.deleteAsset(parsed.data);
    return result.ok && mediaDeleteReceiptSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : currentMediaError(requestId, result.error);
  }));
  app.get("/v1/taxonomies", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentTaxonomyAdministration.list();
    return result.ok && currentTaxonomyCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/taxonomies", async (context) => authenticatedJson(context, input, 65_536, "Taxonomy create request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = currentTaxonomyCreateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentTaxonomyAdministration.create(parsed.data);
    return result.ok && currentTaxonomySnapshotSchema.safeParse(result.value).success ? response(result.value, 201) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/taxonomies/:taxonomyId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentTaxonomyAdministration.get(context.req.param("taxonomyId") ?? "");
    return result.ok && currentTaxonomySnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/taxonomies/:taxonomyId/commands", async (context) => authenticatedJson(context, input, 65_536, "Taxonomy command request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = currentTaxonomyCommandSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentTaxonomyAdministration.command(context.req.param("taxonomyId") ?? "", parsed.data);
    return result.ok && currentTaxonomySnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/content-types/:typeId/entries", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentEntryAdministration.catalog({ typeId: context.req.param("typeId") ?? "" });
    return result.ok && cptEntryCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:typeId/entries/search", async (context) => authenticatedJson(context, input, ENTRY_BODY_LIMIT, ENTRY_BODY_LIMIT_REMEDIATION, async (requestId, _entryId, body) => {
    const typeId = context.req.param("typeId") ?? "";
    const parsed = cptEntrySearchRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.typeId !== typeId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentEntryAdministration.search({ typeId, request: parsed.data });
    return result.ok && cptEntrySearchResultSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:typeId/entries", async (context) => authenticatedJson(context, input, ENTRY_BODY_LIMIT, ENTRY_BODY_LIMIT_REMEDIATION, async (requestId, _entryId, body) => {
    const typeId = context.req.param("typeId") ?? "";
    const parsed = cptEntryCreateRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.content.typeId !== typeId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentEntryAdministration.create({ typeId, request: parsed.data });
    return result.ok && cptEntrySchema.safeParse(result.value).success ? response(result.value, 201) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/content-types/:typeId/entries/:entryId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.currentEntryAdministration.get({ typeId: context.req.param("typeId") ?? "", entryId: context.req.param("entryId") ?? "" });
    return result.ok && cptEntrySchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:typeId/entries/:entryId", async (context) => authenticatedJson(context, input, ENTRY_BODY_LIMIT, ENTRY_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const typeId = context.req.param("typeId") ?? "";
    const parsed = cptEntrySaveRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.content.typeId !== typeId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentEntryAdministration.save({ typeId, entryId, request: parsed.data });
    return result.ok && cptEntrySchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:typeId/entries/:entryId/delete", async (context) => authenticatedJson(context, input, ENTRY_BODY_LIMIT, ENTRY_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const parsed = cptEntryDeleteRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.currentEntryAdministration.delete({ typeId: context.req.param("typeId") ?? "", entryId, request: parsed.data });
    return result.ok && cptEntryDeletedSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/content-types", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.contentTypeAdministration.list();
    return result.ok && contentTypeCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/content-types/:typeId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.contentTypeAdministration.get({ typeId: context.req.param("typeId") ?? "" });
    return result.ok && contentTypeSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types", async (context) => authenticatedJson(context, input, 1_048_576, "Content type request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = createContentTypeRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.contentTypeAdministration.create(parsed.data);
    return result.ok && contentTypeSchema.safeParse(result.value).success ? response(result.value, 201) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:typeId", async (context) => authenticatedJson(context, input, 1_048_576, "Content type request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = replaceContentTypeRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.contentTypeAdministration.replace({ typeId: context.req.param("typeId") ?? "", definition: parsed.data });
    return result.ok && contentTypeSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));

  const server = createAdaptorServer({ fetch: async (request, env) => {
    const incoming = env.incoming as IncomingMessage;
    const headers = headersOf(incoming);
    const requestId = randomUUID();
    const parsed = request.url.startsWith(ORIGIN) ? new URL(request.url) : undefined;
    const pathname = parsed?.pathname ?? "";
    const route = routeFor(pathname);
    const asset = route === "cms-asset" ? input.cmsAssets.read(pathname) : undefined;
    let result: Response;
    if (!framingOk(headers, incoming)) { result = errorResponse(requestId, "INVALID_REQUEST_FRAMING", 400, "AuthoringApi"); result.headers.set("Connection", "close"); }
    else if (!hostOk(headers)) result = errorResponse(requestId, "MISDIRECTED_REQUEST", 421);
    else if (!canonicalRequestTarget(incoming)) result = errorResponse(requestId, "INVALID_REQUEST_FRAMING", 400, "AuthoringApi");
    else if ((route === "cms-document" || route === "cms-asset") && (!cmsDocumentTargetOk(route, pathname, incoming.url) || values(headers, "cookie").length !== 0 || values(headers, "authorization").length !== 0)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "media-thumbnail" && (parsed?.search.length !== 0 || values(headers, "cookie").length !== 0 || values(headers, "authorization").length !== 0)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "cms-asset" && asset === undefined) result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if (!originOk(headers, route, asset?.destination, request.method)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "unknown") result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if ((route === "cms-document" || route === "cms-asset" || route === "media-thumbnail") && request.method !== "GET") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405);
    else if (READ_ROUTES.has(route) && request.method !== "GET" && !(POST_READ_ROUTES.has(route) && request.method === "POST")) result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405, "AuthoringApi", ERROR_REMEDIATION.METHOD_NOT_ALLOWED);
    else if (route === "cms-document") result = cmsDocumentResponse(input.cmsAssets);
    else if (route === "cms-asset" && asset !== undefined) result = cmsAssetResponse(asset);
    else if (!READ_ROUTES.has(route) && request.method !== "POST") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405, "AuthoringApi", ERROR_REMEDIATION.METHOD_NOT_ALLOWED);
    else result = await app.fetch(request, env);
    const event: AuthoringApiLogEvent = { requestId, stableEventCode: result.status >= 500 ? "AUTHORING_REQUEST_FAILED" : result.status >= 400 ? "AUTHORING_REQUEST_REJECTED" : "AUTHORING_REQUEST_OK", method: methodFor(incoming.method), routeTemplate: templateFor(route, pathname), status: result.status };
    try { input.logger(event); } catch { /* sink fault 不得影響 transport */ }
    return result;
  }, overrideGlobalObjects: false, autoCleanupIncoming: true }) as Server;
  const rejected = (): AuthoringApiResult<RunningAuthoringApi> => ({ ok: false, error: { code: "AUTHORING_SERVER_START_FAILED", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: "Authoring API listener 無法啟動。" } } });
  server.on("clientError", (_error, socket) => { rawBadRequest(socket, input.logger); });
  server.on("checkContinue", (_request, socket) => { rawBadRequest(socket, input.logger); });
  server.on("upgrade", (_request, socket) => { rawBadRequest(socket, input.logger); });
  const started = await new Promise<boolean>((resolve) => { server.once("error", () => resolve(false)); server.listen(AUTHORING_PORT, AUTHORING_HOST, () => resolve(true)); });
  if (!started) { server.close(); return rejected(); }
  let closed = false;
  return { ok: true, value: { origin: ORIGIN, close: async () => { if (closed) return; closed = true; bootstrap.clear(); await new Promise<void>((resolve, reject) => server.close((error) => error === undefined || (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ERR_SERVER_NOT_RUNNING") ? resolve() : reject(new Error("AUTHORING_SERVER_CLOSE_FAILED")))); } } };
}
type RawResponder = Readonly<{ writable: boolean; end(data: string): unknown; destroy?(): unknown }>;
function rawBadRequest(socket: RawResponder, logger: StartAuthoringApiInput["logger"]): void { const requestId = randomUUID(); try { logger({ requestId, stableEventCode: "AUTHORING_REQUEST_REJECTED", method: "UNPARSED", routeTemplate: "unmatched", status: 400 }); } catch { /* sink fault 已隔離 */ } if (socket.writable) socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store, no-cache\r\nPragma: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n${JSON.stringify({ contract: "authoring-error/v1", requestId, code: "INVALID_REQUEST_FRAMING", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: ERROR_REMEDIATION.INVALID_REQUEST_FRAMING } })}`); else socket.destroy?.(); }
