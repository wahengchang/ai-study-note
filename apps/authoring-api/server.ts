import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";

import type { AuthoringReadFacade, CmsEditorBlockResolutionsRequest, CmsSeoAnalysisRequest, ContentTypeAdministration, ContentTypeMigrationAdministration, DomainApplication, DomainApplicationFailure, ImportMediaRequest, PluginActivationRequest, PluginSettingsReplaceRequest, PublishRevisionSuccess, RestoreRevisionSuccess, SaveRevisionSuccess, TaxonomyCommand } from "../../core/application/index.js";
import type { JsonValue, MessageRemediation } from "../../core/foundation/index.js";
import { parsePreviewInput, renderPreviewDocument, type ProjectionPreview } from "../../core/projection/index.js";
import type { Context } from "hono";
import type { AuthoringCredentialAuthority } from "./credential-store.js";
import type { AuthoringReleaseTransport, ReleaseTransportFailureCode } from "./release-transport.js";
import { releaseBuildSchema, releaseBuildRequestSchema, releaseDiagnosisSchema, releaseDiagnoseRequestSchema, releaseReceiptSchema, releaseRequestSchema, redeliverRequestSchema } from "./transport-contracts.js";
import { createBrowserBootstrapState } from "./browser-bootstrap.js";
import type { CmsAsset, CmsAssets } from "./cms-assets.js";
import { API_KEY_PATTERN, AUTHORING_AUTHORITY, AUTHORING_HOST, AUTHORING_ORIGIN, AUTHORING_PORT, AUTHORING_RESOURCE_ID_PATTERN, redactSecrets } from "./origin.js";
import { authoringEntrySchema, authoringErrorSchema, authoringErrorStatuses, mediaArchiveBlockedErrorSchema, mediaRestoreRequiredErrorSchema, browserSessionExchangeSchema, browserSessionSchema, browserTicketMintRequestSchema, browserTicketSchema, cmsEditorBlockResolutionsSchema, cmsSeoAnalysisRequestSchema, cmsSeoAnalysisResponseSchema, contentTypeCatalogSchema, contentTypeMigrationCommandSchema, contentTypeMigrationOutcomeSchema, contentTypeMigrationProposalSchema, contentTypeSchema, createContentTypeRequestSchema, createTaxonomyRequestSchema, entryCatalogSchema, entryDetailSchema, entryRevisionCatalogSchema, mediaArchiveRequestSchema, mediaAssetDetailSchema, mediaCatalogSchema, mediaImportRequestSchema, mediaRestoreRequestSchema, mediaVersionReplacementReceiptSchema, mediaVersionRequestSchema, pluginActivationRequestSchema, pluginManagementSnapshotSchema, pluginSettingsReplaceRequestSchema, previewDocumentSchema, previewRequestSchema, publishRevisionRequestSchema, restoreRevisionRequestSchema, restoreRevisionSuccessSchema, saveRevisionRequestSchema, serverProofChallengeSchema, taxonomyCatalogSchema, taxonomyCommandResultSchema, taxonomyCommandSchema, taxonomySnapshotSchema } from "./transport-contracts.js";
import type { BrowserSessionDto, BrowserTicketDto, MediaArchiveBlockedErrorDto, MediaRestoreRequiredErrorDto, PublishRevisionSuccessDto, RestoreRevisionSuccessDto, SaveRevisionSuccessDto, TransportCode } from "./transport-contracts.js";

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
const SAVE_BODY_LIMIT = 4_194_304;
const PUBLISH_BODY_LIMIT = 4_096;
const PROOF_BODY_LIMIT = 4_096;
const SAVE_BODY_LIMIT_REMEDIATION = "SaveRevision request 不得超過 4 MiB。";
const PUBLISH_BODY_LIMIT_REMEDIATION = "PublishRevision request 不得超過 4 KiB。";
const PROOF_BODY_LIMIT_REMEDIATION = "server-proof challenge 不得超過 4 KiB。";
/** Media contract 的三個 bytes-carrying route 共用同一組 encoded/envelope 上限，避免 route 之間漂移。 */
const MEDIA_BYTES_BODY_LIMIT = 4_194_304;
const MEDIA_ENCODED_BYTES_LIMIT = 4_128_768;
const MEDIA_ENVELOPE_LIMIT = 65_536;
const MEDIA_ENVELOPE_REMEDIATION = "Media request 的非 bytes envelope 不得超過 64 KiB。";
export type { TransportCode } from "./transport-contracts.js";
export type AuthoringApiLogEvent = Readonly<{ requestId: string; stableEventCode: "AUTHORING_REQUEST_OK" | "AUTHORING_REQUEST_REJECTED" | "AUTHORING_REQUEST_FAILED"; method: "GET" | "POST" | "OPTIONS" | "OTHER" | "UNPARSED"; routeTemplate: "/cms" | "/cms/plugins" | "/cms/content-types" | "/cms/content-types/new" | "/cms/content-types/:schemaId" | "/cms/taxonomies" | "/cms/taxonomies/new" | "/cms/taxonomies/:taxonomyId" | "/cms/entries" | "/cms/entries/new" | "/cms/entries/:entryId" | "/cms/media" | "/cms/media/import" | "/cms/media/:assetId" | "/cms/assets/:asset" | "/v1/plugins" | "/v1/plugins/activate" | "/v1/plugins/settings" | "/v1/media" | "/v1/media/import" | "/v1/media/:assetId" | "/v1/media/:assetId/versions" | "/v1/media/:assetId/archive" | "/v1/media/:assetId/restore" | "/v1/entries/:entryId/current" | "/v1/entries/:entryId/current/editor-blocks" | "/v1/entries/:entryId/seo-analysis" | "/v1/content-types" | "/v1/content-types/:schemaId" | "/v1/content-types/:schemaId/migrations" | "/v1/content-types/:schemaId/migrations/preview" | "/v1/entries" | "/v1/entries/:entryId" | "/v1/entries/:entryId/revisions" | "/v1/entries/:entryId/publish" | "/v1/entries/:entryId/restore" | "/v1/taxonomies" | "/v1/taxonomies/:taxonomyId" | "/v1/taxonomies/:taxonomyId/commands" | "/v1/preview" | "/v1/release/diagnose" | "/v1/release/build" | "/v1/release" | "/v1/redeliver" | "/_local/server-proof" | "/_local/browser-tickets" | "/_local/browser-session" | "unmatched"; status: number }>;
export type AuthoringApiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: "AUTHORING_SERVER_START_FAILED"; owner: "AuthoringApi"; subjectIds: readonly []; remediation: MessageRemediation }> }>;
export interface RunningAuthoringApi { readonly origin: typeof ORIGIN; close(): Promise<void>; }
export type StartAuthoringApiInput = Readonly<{ domainApplication: DomainApplication; credentialAuthority: AuthoringCredentialAuthority; cmsAssets: CmsAssets; logger: (event: AuthoringApiLogEvent) => void; authoringReadFacade: AuthoringReadFacade; contentTypeAdministration: ContentTypeAdministration; contentTypeMigrationAdministration: ContentTypeMigrationAdministration; projectionPreview: ProjectionPreview; releaseTransport: AuthoringReleaseTransport }>;

type RouteTemplate = AuthoringApiLogEvent["routeTemplate"];
type HeaderMap = ReadonlyMap<string, readonly string[]>;
type RouteClass = "cms-document" | "cms-asset" | "plugins" | "plugin-activate" | "plugin-settings" | "media" | "media-import" | "media-version" | "media-detail" | "media-archive" | "media-restore" | "entry-current" | "editor-blocks" | "seo-analysis" | "content-types" | "content-type" | "content-type-migrations" | "entries" | "entry" | "entry-revisions" | "publish" | "restore" | "taxonomies" | "taxonomy" | "taxonomy-commands" | "preview" | "release-diagnose" | "release-build" | "release" | "redeliver" | "proof" | "browser-ticket" | "browser-session" | "unknown";
const READ_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["plugins", "media", "media-detail", "entry-current", "editor-blocks", "content-types", "content-type", "entries", "entry", "entry-revisions", "taxonomies", "taxonomy"]);
const POST_READ_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["content-types", "entry-revisions", "taxonomies"]);
const AUTHENTICATED_ROUTES: ReadonlySet<RouteClass> = new Set<RouteClass>(["plugins", "plugin-activate", "plugin-settings", "media", "media-import", "media-version", "media-detail", "media-archive", "media-restore", "entry-current", "editor-blocks", "seo-analysis", "content-types", "content-type", "content-type-migrations", "entries", "entry", "entry-revisions", "publish", "restore", "taxonomies", "taxonomy", "taxonomy-commands", "preview", "release-diagnose", "release-build", "release", "redeliver"]);


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
  if (pathname === "/cms" || pathname === "/cms/plugins" || pathname === "/cms/entries" || pathname === "/cms/entries/new" || pathname === "/cms/media" || pathname === "/cms/media/import" || pathname === "/cms/content-types" || pathname === "/cms/content-types/new" || pathname === "/cms/taxonomies" || pathname === "/cms/taxonomies/new" || (/^\/cms\/(?:entries|content-types|taxonomies|media)\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice(pathname.lastIndexOf("/") + 1)))) return "cms-document";
  if (/^\/cms\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(pathname)) return "cms-asset";
  if (pathname === "/_local/server-proof") return "proof";
  if (pathname === "/_local/browser-tickets") return "browser-ticket";
  if (pathname === "/_local/browser-session") return "browser-session";
  if (pathname === "/v1/plugins") return "plugins";
  if (pathname === "/v1/plugins/activate") return "plugin-activate";
  if (pathname === "/v1/plugins/settings") return "plugin-settings";
  if (pathname === "/v1/media") return "media";
  if (pathname === "/v1/media/import") return "media-import";
  if (/^\/v1\/media\/[^/%?#/]+\/versions$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length, -"/versions".length))) return "media-version";
  if (/^\/v1\/media\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length))) return "media-detail";
  if (/^\/v1\/media\/[^/%?#/]+\/archive$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length, -"/archive".length))) return "media-archive";
  if (/^\/v1\/media\/[^/%?#/]+\/restore$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/media/".length, -"/restore".length))) return "media-restore";
  if (/^\/v1\/entries\/[^/%?#/]+\/current$/u.test(pathname)) return "entry-current";
  if (/^\/v1\/entries\/[^/%?#/]+\/current\/editor-blocks$/u.test(pathname)) return "editor-blocks";
  if (/^\/v1\/entries\/[^/%?#/]+\/seo-analysis$/u.test(pathname)) return "seo-analysis";
  if (pathname === "/v1/content-types") return "content-types";
  if (/^\/v1\/content-types\/[^/%?#/]+\/migrations(?:\/preview)?$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length).split("/")[0] ?? "")) return "content-type-migrations";
  if (/^\/v1\/content-types\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/content-types/".length))) return "content-type";
  if (pathname === "/v1/entries") return "entries";
  if (/^\/v1\/entries\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/entries/".length))) return "entry";
  if (/^\/v1\/entries\/[^/%?#/]+\/revisions$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/entries/".length, -"/revisions".length))) return "entry-revisions";
  if (pathname === "/v1/taxonomies") return "taxonomies";
  if (/^\/v1\/taxonomies\/[^/%?#/]+\/commands$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/taxonomies/".length, -"/commands".length))) return "taxonomy-commands";
  if (/^\/v1\/taxonomies\/[^/%?#/]+$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/taxonomies/".length))) return "taxonomy";
  if (/^\/v1\/entries\/[^/%?#/]+\/restore$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/entries/".length, -"/restore".length))) return "restore";
  if (pathname === "/v1/release/diagnose") return "release-diagnose";
  if (pathname === "/v1/release/build") return "release-build";
  if (pathname === "/v1/release") return "release";
  if (pathname === "/v1/redeliver") return "redeliver";
  if (pathname === "/v1/preview") return "preview";
  return /^\/v1\/entries\/[^/%?#/]+\/publish$/u.test(pathname) && AUTHORING_RESOURCE_ID_PATTERN.test(pathname.slice("/v1/entries/".length, -"/publish".length)) ? "publish" : "unknown";
}
function templateFor(route: RouteClass, pathname: string): RouteTemplate {
  if (route === "cms-document") return pathname === "/cms" ? "/cms" : pathname === "/cms/plugins" ? "/cms/plugins" : pathname === "/cms/entries" ? "/cms/entries" : pathname === "/cms/entries/new" ? "/cms/entries/new" : pathname === "/cms/media" ? "/cms/media" : pathname === "/cms/media/import" ? "/cms/media/import" : pathname === "/cms/content-types" ? "/cms/content-types" : pathname === "/cms/content-types/new" ? "/cms/content-types/new" : pathname === "/cms/taxonomies" ? "/cms/taxonomies" : pathname === "/cms/taxonomies/new" ? "/cms/taxonomies/new" : pathname.startsWith("/cms/content-types/") ? "/cms/content-types/:schemaId" : pathname.startsWith("/cms/taxonomies/") ? "/cms/taxonomies/:taxonomyId" : pathname.startsWith("/cms/media/") ? "/cms/media/:assetId" : "/cms/entries/:entryId";
  if (route === "cms-asset") return "/cms/assets/:asset";
  if (route === "plugins") return "/v1/plugins";
  if (route === "plugin-activate") return "/v1/plugins/activate";
  if (route === "plugin-settings") return "/v1/plugins/settings";
  if (route === "media") return "/v1/media";
  if (route === "media-import") return "/v1/media/import";
  if (route === "media-version") return "/v1/media/:assetId/versions";
  if (route === "media-detail") return "/v1/media/:assetId";
  if (route === "media-archive") return "/v1/media/:assetId/archive";
  if (route === "media-restore") return "/v1/media/:assetId/restore";
  if (route === "entry-current") return "/v1/entries/:entryId/current";
  if (route === "editor-blocks") return "/v1/entries/:entryId/current/editor-blocks";
  if (route === "seo-analysis") return "/v1/entries/:entryId/seo-analysis";
  if (route === "content-types") return "/v1/content-types";
  if (route === "content-type") return "/v1/content-types/:schemaId";
  if (route === "content-type-migrations") return pathname.endsWith("/preview") ? "/v1/content-types/:schemaId/migrations/preview" : "/v1/content-types/:schemaId/migrations";
  if (route === "entries") return "/v1/entries";
  if (route === "entry") return "/v1/entries/:entryId";
  if (route === "entry-revisions") return "/v1/entries/:entryId/revisions";
  if (route === "taxonomies") return "/v1/taxonomies";
  if (route === "taxonomy") return "/v1/taxonomies/:taxonomyId";
  if (route === "taxonomy-commands") return "/v1/taxonomies/:taxonomyId/commands";
  if (route === "restore") return "/v1/entries/:entryId/restore";
  if (route === "release-diagnose") return "/v1/release/diagnose";
  if (route === "release-build") return "/v1/release/build";
  if (route === "release") return "/v1/release";
  if (route === "redeliver") return "/v1/redeliver";
  if (route === "preview") return "/v1/preview";
  return route === "publish" ? "/v1/entries/:entryId/publish" : route === "proof" ? "/_local/server-proof" : route === "browser-ticket" ? "/_local/browser-tickets" : route === "browser-session" ? "/_local/browser-session" : "unmatched";
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
  const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CMS Workspace</title></head><body><div id="root"><main><h1>CMS 工作台已鎖定</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`;
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
function hostOk(headers: HeaderMap): boolean { return one(headers, "host") === AUTHORING_AUTHORITY && values(headers, "forwarded").length === 0 && [...headers.keys()].every((name) => !name.startsWith("x-forwarded-")); }
function originOk(headers: HeaderMap, route: RouteClass, assetDestination: CmsAsset["destination"] | undefined, method: string): boolean {
  const origin = values(headers, "origin"); const fetchSite = values(headers, "sec-fetch-site");
  if (route === "cms-document") return origin.length === 0 && values(headers, "authorization").length === 0 && values(headers, "cookie").length === 0 && fetchSite.length === 1 && (fetchSite[0] === "none" || fetchSite[0] === "same-origin") && one(headers, "sec-fetch-mode") === "navigate" && one(headers, "sec-fetch-dest") === "document";
  // module script fetch 會帶 exact same-origin `Origin`；其餘 asset destination 則省略，兩者都必須是 same-origin。
  if (route === "cms-asset") return (origin.length === 0 || (origin.length === 1 && origin[0] === ORIGIN)) && values(headers, "authorization").length === 0 && values(headers, "cookie").length === 0 && fetchSite.length === 1 && fetchSite[0] === "same-origin" && assetDestination !== undefined && one(headers, "sec-fetch-dest") === assetDestination;
  if (route === "proof") return origin.length === 0 && fetchSite.length === 0 && values(headers, "authorization").length === 0;
  if (route === "browser-ticket") return origin.length === 0 && [...headers.keys()].every((name) => !name.startsWith("sec-fetch-"));
  if (route === "browser-session") return origin.length === 1 && origin[0] === ORIGIN && fetchSite.length === 1 && fetchSite[0] === "same-origin" && values(headers, "authorization").length === 0;
  if (!AUTHENTICATED_ROUTES.has(route)) return true;
  // Fetch 只在 non-GET/HEAD 或 CORS-tainted request 附加 `Origin`，故 same-origin `GET` 合法省略；
  // state-changing method 必定帶 `Origin`，因此省略在此一律拒絕，不讓它成為同源證明的繞道。
  const omittedOrigin = origin.length === 0 && (method === "GET" || method === "HEAD");
  const browser = (omittedOrigin || (origin.length === 1 && origin[0] === ORIGIN)) && fetchSite.length === 1 && fetchSite[0] === "same-origin";
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
function mediaBytesTooLarge(encoded: string): boolean { return encoded.length > MEDIA_ENCODED_BYTES_LIMIT; }
function mediaEnvelopeTooLarge(envelope: unknown): boolean { return new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MEDIA_ENVELOPE_LIMIT; }
function decodeCanonicalBase64url(value: string): Uint8Array | undefined {
  if (value.length > 4_128_768 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/u.test(value)) return undefined;
  try {
    const bytes = new Uint8Array(Buffer.from(value, "base64url"));
    return bytes.byteLength <= 3_096_576 && Buffer.from(bytes).toString("base64url") === value ? bytes : undefined;
  } catch {
    return undefined;
  }
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
function domainError(requestId: string, error: DomainApplicationFailure): Response {
  const descriptor = Object.getOwnPropertyDescriptors(error); const code = descriptor.code?.value; const owner = descriptor.owner?.value; const subjectIds = descriptor.subjectIds?.value; const remediation = descriptor.remediation?.value; const restoreCommands = descriptor.restoreCommands?.value;
  if (typeof code !== "string" || typeof owner !== "string" || !Array.isArray(subjectIds) || !subjectIds.every((id) => typeof id === "string") || typeof remediation !== "object" || remediation === null || Object.getPrototypeOf(remediation) !== Object.prototype) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const rem = Object.getOwnPropertyDescriptors(remediation); if (rem.kind?.value !== "message" || typeof rem.message?.value !== "string") return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const status = authoringErrorStatuses(code)?.[0];
  if (status === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const safe = { requestId, code, owner, subjectIds, remediation: { kind: "message" as const, message: rem.message.value } };
  const specialized = mediaError(safe, descriptor);
  if (specialized !== undefined) return response(specialized, status);
  const body = { contract: "authoring-error/v1" as const, ...safe, ...(restoreCommands === undefined ? {} : { restoreCommands }) };
  return authoringErrorSchema.safeParse(body).success ? response(body, status) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
}

/**
 * 兩個 Media failure 必須投影它們的 remediation evidence；evidence 缺失或不符 strict schema 時
 * 退回 redacted `authoring-error/v1`（同一 status），不得以 generic 500 抹掉安全的 Media error。
 */
function mediaError(
  safe: Readonly<{ requestId: string; code: string; owner: string; subjectIds: readonly string[]; remediation: MessageRemediation }>,
  descriptor: Readonly<Record<string, PropertyDescriptor>>,
): MediaArchiveBlockedErrorDto | MediaRestoreRequiredErrorDto | undefined {
  if (safe.code === "MEDIA_ARCHIVE_BLOCKED_PUBLISHED") {
    const parsed = mediaArchiveBlockedErrorSchema.safeParse({ contract: "media-archive-blocked/v1", ...safe, archiveImpact: descriptor.archiveImpact?.value });
    return parsed.success ? parsed.data : undefined;
  }
  if (safe.code === "MEDIA_RESTORE_REQUIRED") {
    const parsed = mediaRestoreRequiredErrorSchema.safeParse({ contract: "media-restore-required/v1", ...safe, restoreCommands: descriptor.restoreCommands?.value });
    return parsed.success ? parsed.data : undefined;
  }
  return undefined;
}
function saveSuccess(value: SaveRevisionSuccess): SaveRevisionSuccessDto { return {
  contract: "save-revision-success/v1", entryId: value.revision.identity.entryId,
  revision: { revisionId: value.revision.identity.revisionId, schemaIdentity: value.revision.schemaIdentity, contentDigest: value.revision.contentDigest, lineage: value.revision.lineage },
  references: value.references.map((item) => ({ assetId: item.assetVersion.assetId, assetVersionId: item.assetVersion.assetVersionId })).sort((a, b) => a.assetId === b.assetId ? a.assetVersionId < b.assetVersionId ? -1 : a.assetVersionId > b.assetVersionId ? 1 : 0 : a.assetId < b.assetId ? -1 : 1),
  pointer: value.currentPointer.publishedRevisionId === undefined ? { currentRevisionId: value.currentPointer.currentRevisionId } : { currentRevisionId: value.currentPointer.currentRevisionId, publishedRevisionId: value.currentPointer.publishedRevisionId },
  currentRoute: { normalizedRoute: value.currentClaim.normalizedRoute, owner: value.currentClaim.owner, sourceRevisionId: value.currentClaim.sourceRevisionId }, lineageIdentity: value.lineageIdentity, stateDigest: value.stateDigest, activePluginStateDigest: value.activePluginStateDigest,
}; }

function restoreSuccess(value: RestoreRevisionSuccess): RestoreRevisionSuccessDto | undefined {
  if (value.revision.restoredFromRevisionId === undefined) return undefined;
  return {
    contract: "restore-revision-success/v1", entryId: value.revision.identity.entryId,
    revision: { revisionId: value.revision.identity.revisionId, schemaIdentity: value.revision.schemaIdentity, contentDigest: value.revision.contentDigest, lineage: value.revision.lineage, restoredFromRevisionId: value.revision.restoredFromRevisionId },
    references: value.references.map((item) => ({ assetId: item.assetVersion.assetId, assetVersionId: item.assetVersion.assetVersionId })).sort((a, b) => a.assetId === b.assetId ? a.assetVersionId < b.assetVersionId ? -1 : a.assetVersionId > b.assetVersionId ? 1 : 0 : a.assetId < b.assetId ? -1 : 1),
    pointer: value.currentPointer.publishedRevisionId === undefined ? { currentRevisionId: value.currentPointer.currentRevisionId } : { currentRevisionId: value.currentPointer.currentRevisionId, publishedRevisionId: value.currentPointer.publishedRevisionId },
    currentRoute: { normalizedRoute: value.currentClaim.normalizedRoute, owner: value.currentClaim.owner, sourceRevisionId: value.currentClaim.sourceRevisionId }, lineageIdentity: value.lineageIdentity, stateDigest: value.stateDigest,
  };
}

/**
 * receipt 以 DTO type 標註，client 的 strict schema 與 server 投影一旦漂移就是 compile
 * error，而不是 runtime 的 `INVALID_SERVER_RESPONSE`。`publishedRevisionId` 在
 * `EntryPointerRecord` 上是 optional，缺值時只能 fail closed，不得送出缺欄位的 receipt。
 */
function publishSuccess(value: PublishRevisionSuccess): PublishRevisionSuccessDto | undefined {
  const publishedRevisionId = value.publishedPointer.publishedRevisionId;
  if (publishedRevisionId === undefined) return undefined;
  return {
    contract: "publish-revision-success/v1", entryId: value.revision.identity.entryId,
    revision: { revisionId: value.revision.identity.revisionId, schemaIdentity: value.revision.schemaIdentity, contentDigest: value.revision.contentDigest, lineage: value.revision.lineage },
    publishedPointer: { currentRevisionId: value.publishedPointer.currentRevisionId, publishedRevisionId },
    publishedRoute: { normalizedRoute: value.publishedClaim.normalizedRoute, owner: value.publishedClaim.owner, sourceRevisionId: value.publishedClaim.sourceRevisionId },
    lineageIdentity: value.lineageIdentity, stateDigest: value.stateDigest,
  };
}

async function authenticatedJson(context: Context, input: StartAuthoringApiInput, bodyLimit: number, oversizedRemediation: string, handle: (requestId: string, entryId: string, body: unknown) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
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
async function authenticatedRead(context: Context, input: StartAuthoringApiInput, handle: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try { return admission.value.verifyBearer(parsedAuthorization.candidate) ? handle(requestId) : errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential"); } finally { admission.value.dispose(); }
}
function facadeError(requestId: string, error: Readonly<{ code: string; owner: string; subjectIds: readonly string[]; remediation: MessageRemediation }>): Response {
  const status = authoringErrorStatuses(error.code)?.[0];
  return status === undefined ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response({ contract: "authoring-error/v1", requestId, code: error.code, owner: error.owner, subjectIds: error.subjectIds, remediation: error.remediation }, status);
}
function projectionError(requestId: string, error: unknown): Response {
  if (error === null || typeof error !== "object") return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const descriptor = Object.getOwnPropertyDescriptors(error);
  const code = descriptor.code?.value;
  const owner = descriptor.owner?.value;
  const subjectIds = descriptor.subjectIds?.value;
  const remediation = descriptor.remediation?.value;
  if (typeof code !== "string" || typeof owner !== "string" || !Array.isArray(subjectIds) || !subjectIds.every((id) => typeof id === "string") || remediation === null || typeof remediation !== "object" || Object.getPrototypeOf(remediation) !== Object.prototype) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const remediationDescriptor = Object.getOwnPropertyDescriptors(remediation);
  if (remediationDescriptor.kind?.value !== "message" || typeof remediationDescriptor.message?.value !== "string") return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const status = authoringErrorStatuses(code)?.[0];
  return status === undefined ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response({ contract: "authoring-error/v1", requestId, code, owner, subjectIds, remediation: { kind: "message", message: remediationDescriptor.message.value } }, status);
}


function releaseError(requestId: string, code: ReleaseTransportFailureCode): Response {
  const status = authoringErrorStatuses(code)?.[0];
  if (status === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const body = { contract: "authoring-error/v1" as const, requestId, code, owner: "Delivery" as const, subjectIds: [], remediation: { kind: "message" as const, message: "Release 無法安全完成。" } };
  return authoringErrorSchema.safeParse(body).success ? response(body, status) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
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
    const result = await input.domainApplication.listMedia();
    return result.ok && mediaCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/media/import", async (context) => authenticatedJson(context, input, MEDIA_BYTES_BODY_LIMIT, "Media import request 不得超過 4 MiB。", async (requestId, _entryId, body) => {
    const parsed = mediaImportRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    if (mediaBytesTooLarge(parsed.data.bytesBase64url) || mediaEnvelopeTooLarge({ ...parsed.data, bytesBase64url: undefined })) return errorResponse(requestId, "REQUEST_BODY_TOO_LARGE", 400, "AuthoringApi", MEDIA_ENVELOPE_REMEDIATION);
    const bytes = decodeCanonicalBase64url(parsed.data.bytesBase64url);
    if (bytes === undefined) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.importMedia({ importId: parsed.data.importId, assetId: parsed.data.assetId, assetVersionId: parsed.data.assetVersionId, bytes, metadata: parsed.data.metadata as JsonValue } satisfies ImportMediaRequest);
    return result.ok && mediaAssetDetailSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/media/:assetId/versions", async (context) => authenticatedJson(context, input, MEDIA_BYTES_BODY_LIMIT, "Media version request 不得超過 4 MiB。", async (requestId, _entryId, body) => {
    const parsed = mediaVersionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    if (mediaBytesTooLarge(parsed.data.import.bytesBase64url) || mediaEnvelopeTooLarge({ ...parsed.data, import: { ...parsed.data.import, bytesBase64url: undefined } })) return errorResponse(requestId, "REQUEST_BODY_TOO_LARGE", 400, "AuthoringApi", MEDIA_ENVELOPE_REMEDIATION);
    if (parsed.data.replacement.targetAssetVersion.assetId !== (context.req.param("assetId") ?? "") || parsed.data.import.assetVersionId === parsed.data.replacement.targetAssetVersion.assetVersionId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const bytes = decodeCanonicalBase64url(parsed.data.import.bytesBase64url);
    if (bytes === undefined) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.createMediaVersion({ importId: parsed.data.import.importId, assetId: context.req.param("assetId") ?? "", assetVersionId: parsed.data.import.assetVersionId, bytes, metadata: parsed.data.import.metadata as JsonValue, replacement: { ...parsed.data.replacement, targetAssetVersionId: parsed.data.replacement.targetAssetVersion.assetVersionId } });
    if (!result.ok) return domainError(requestId, result.error);
    const receipt = { contract: "media-version-replacement-receipt/v1" as const, version: result.value.version, save: saveSuccess(result.value.save), asset: result.value.asset };
    return mediaVersionReplacementReceiptSchema.safeParse(receipt).success ? response(receipt, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/media/:assetId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.getMedia({ assetId: context.req.param("assetId") ?? "" });
    return result.ok && mediaAssetDetailSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/media/:assetId/archive", async (context) => authenticatedJson(context, input, 4_096, "Media archive request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    const parsed = mediaArchiveRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.archiveMediaVersion({ assetId: context.req.param("assetId") ?? "", assetVersionId: parsed.data.assetVersionId });
    return result.ok && mediaAssetDetailSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/media/:assetId/restore", async (context) => authenticatedJson(context, input, MEDIA_BYTES_BODY_LIMIT, "Media restore request 不得超過 4 MiB。", async (requestId, _entryId, body) => {
    const parsed = mediaRestoreRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    if (mediaBytesTooLarge(parsed.data.recovery?.bytesBase64url ?? "") || mediaEnvelopeTooLarge({ ...parsed.data, recovery: parsed.data.recovery === undefined ? undefined : { ...parsed.data.recovery, bytesBase64url: undefined } })) return errorResponse(requestId, "REQUEST_BODY_TOO_LARGE", 400, "AuthoringApi", MEDIA_ENVELOPE_REMEDIATION);
    const bytes = parsed.data.recovery === undefined ? undefined : decodeCanonicalBase64url(parsed.data.recovery.bytesBase64url);
    if (parsed.data.recovery !== undefined && bytes === undefined) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.restoreMediaVersion({ assetId: context.req.param("assetId") ?? "", assetVersionId: parsed.data.assetVersionId, ...(parsed.data.recovery === undefined ? {} : { recovery: { bytes: bytes as Uint8Array, metadata: parsed.data.recovery.metadata as JsonValue } }) });
    return result.ok && mediaAssetDetailSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.get("/v1/plugins", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.listPlugins();
    return result.ok && pluginManagementSnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/plugins/activate", async (context) => authenticatedJson(context, input, 65_536, "Plugin activation request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = pluginActivationRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.activatePlugin(parsed.data as PluginActivationRequest);
    return result.ok && pluginManagementSnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/plugins/settings", async (context) => authenticatedJson(context, input, 65_536, "Plugin settings request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = pluginSettingsReplaceRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.replacePluginSettings(parsed.data as PluginSettingsReplaceRequest);
    return result.ok && pluginManagementSnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.get("/v1/entries/:entryId/current", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.readCurrentEntry(context.req.param("entryId") ?? "");
    return result.ok && authoringEntrySchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.get("/v1/entries/:entryId/current/editor-blocks", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.resolveCurrentCmsEditorBlocks({ contract: "cms-editor-block-resolutions-request/v1", entryId: context.req.param("entryId") ?? "" } satisfies CmsEditorBlockResolutionsRequest);
    return result.ok && cmsEditorBlockResolutionsSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/entries/:entryId/seo-analysis", async (context) => authenticatedJson(context, input, 4_194_304, "SEO analysis request 不得超過 4 MiB。", async (requestId, entryId, body) => {
    const parsed = cmsSeoAnalysisRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.entryId !== entryId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.analyzeCmsSeo({ ...parsed.data, content: parsed.data.content as JsonValue } as CmsSeoAnalysisRequest);
    return result.ok && cmsSeoAnalysisResponseSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/entries/:entryId/revisions", async (context) => authenticatedJson(context, input, SAVE_BODY_LIMIT, SAVE_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const parsed = saveRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.saveRevision({ entryId, ...parsed.data, content: parsed.data.content as JsonValue });
    return command.ok ? response(saveSuccess(command.value), 200) : domainError(requestId, command.error);
  }));
  app.post("/v1/entries/:entryId/publish", async (context) => authenticatedJson(context, input, PUBLISH_BODY_LIMIT, PUBLISH_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const parsed = publishRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.publishRevision({ entryId, expectedCurrentRevisionId: parsed.data.expectedCurrentRevisionId, operationId: parsed.data.operationId });
    if (!command.ok) return domainError(requestId, command.error);
    const receipt = publishSuccess(command.value);
    return receipt === undefined ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response(receipt, 200);
  }));
  app.post("/v1/entries/:entryId/restore", async (context) => authenticatedJson(context, input, PUBLISH_BODY_LIMIT, "RestoreRevision request 不得超過 4 KiB。", async (requestId, entryId, body) => {
    const parsed = restoreRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.restoreRevision({ entryId, sourceRevisionId: parsed.data.sourceRevisionId, revisionId: parsed.data.newRevisionId, operationId: parsed.data.operationId });
    if (!command.ok) return domainError(requestId, command.error);
    const receipt = restoreSuccess(command.value);
    return receipt === undefined || !restoreRevisionSuccessSchema.safeParse(receipt).success ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response(receipt, 201);
  }));
  app.get("/v1/taxonomies", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.listTaxonomies();
    return result.ok && taxonomyCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/taxonomies", async (context) => authenticatedJson(context, input, 65_536, "Taxonomy create request 不得超過 64 KiB。", async (requestId, _entryId, body) => {
    const parsed = createTaxonomyRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.createTaxonomy(parsed.data);
    return result.ok && taxonomySnapshotSchema.safeParse(result.value).success ? response(result.value, 201) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.get("/v1/taxonomies/:taxonomyId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.domainApplication.getTaxonomy(context.req.param("taxonomyId") ?? "");
    return result.ok && taxonomySnapshotSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.post("/v1/taxonomies/:taxonomyId/commands", async (context) => authenticatedJson(context, input, 1_048_576, "Taxonomy command request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = taxonomyCommandSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.executeTaxonomyCommand(context.req.param("taxonomyId") ?? "", parsed.data as TaxonomyCommand);
    return result.ok && taxonomyCommandResultSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : domainError(requestId, result.error);
  }));
  app.get("/v1/content-types", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.authoringReadFacade.listContentTypes();
    return result.ok && contentTypeCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/content-types/:schemaId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.authoringReadFacade.getContentType({ schemaId: context.req.param("schemaId") ?? "" });
    return result.ok && contentTypeSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types/:schemaId/migrations/preview", async (context) => authenticatedJson(context, input, 1_048_576, "Content type migration request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = contentTypeMigrationProposalSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.contentTypeMigrationAdministration.preview(context.req.param("schemaId") ?? "", parsed.data as never);
    if (!result.ok) return facadeError(requestId, result.error);
    return contentTypeMigrationOutcomeSchema.safeParse(result.value).success ? response(result.value, result.value.kind === "blocked" ? 422 : 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/content-types/:schemaId/migrations", async (context) => authenticatedJson(context, input, 1_048_576, "Content type migration request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = contentTypeMigrationCommandSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.contentTypeMigrationAdministration.execute(context.req.param("schemaId") ?? "", parsed.data as never);
    if (!result.ok) return facadeError(requestId, result.error);
    return contentTypeMigrationOutcomeSchema.safeParse(result.value).success ? response(result.value, result.value.kind === "blocked" ? 422 : 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/entries", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.authoringReadFacade.listEntries();
    return result.ok && entryCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/entries/:entryId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.authoringReadFacade.getEntry({ entryId: context.req.param("entryId") ?? "" });
    return result.ok && entryDetailSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.get("/v1/entries/:entryId/revisions", async (context) => authenticatedRead(context, input, async (requestId) => {
    const result = await input.authoringReadFacade.listEntryRevisions({ entryId: context.req.param("entryId") ?? "" });
    return result.ok && entryRevisionCatalogSchema.safeParse(result.value).success ? response(result.value, 200) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/content-types", async (context) => authenticatedJson(context, input, 1_048_576, "Content type request 不得超過 1 MiB。", async (requestId, _entryId, body) => {
    const parsed = createContentTypeRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.contentTypeAdministration.createInitial({ schemaId: parsed.data.schemaId, schema: parsed.data.schema as JsonValue });
    return result.ok && contentTypeSchema.safeParse(result.value).success ? response(result.value, 201) : result.ok ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : facadeError(requestId, result.error);
  }));
  app.post("/v1/release/diagnose", async (context) => authenticatedJson(context, input, 4_096, "Release diagnose request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    if (!releaseDiagnoseRequestSchema.safeParse(body).success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const diagnosis = await input.releaseTransport.diagnose();
    const dto = { contract: "release-diagnosis/v1" as const, ...diagnosis };
    return releaseDiagnosisSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/release/build", async (context) => authenticatedJson(context, input, 4_096, "Release build request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    if (!releaseBuildRequestSchema.safeParse(body).success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const built = await input.releaseTransport.build();
    if (!built.ok) return releaseError(requestId, built.error.code);
    const dto = { contract: "release-build/v1" as const, ...built.value };
    return releaseBuildSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/release", async (context) => authenticatedJson(context, input, 4_096, "Release request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    const parsed = releaseRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const released = input.releaseTransport.release(parsed.data);
    if (!released.ok) return releaseError(requestId, released.error.code);
    const dto = { contract: "release-receipt/v1" as const, ...released.value };
    return releaseReceiptSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/redeliver", async (context) => authenticatedJson(context, input, 4_096, "Redeliver request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    const parsed = redeliverRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const released = input.releaseTransport.redeliver(parsed.data);
    if (!released.ok) return releaseError(requestId, released.error.code);
    const dto = { contract: "release-receipt/v1" as const, ...released.value };
    return releaseReceiptSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/preview", async (context) => authenticatedJson(context, input, 4_096, "Preview request 不得超過 4 KiB。", async (requestId, _entryId, body) => {
    const parsed = previewRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const artifact = await input.projectionPreview.preview({ selection: parsed.data.selection, subject: parsed.data.subject });
    if (!artifact.ok) return projectionError(requestId, artifact.error);
    const preview = parsePreviewInput(artifact.value.bytes);
    if (!preview.ok) return projectionError(requestId, preview.error);
    const rendered = renderPreviewDocument(preview.value);
    if (!rendered.ok) return projectionError(requestId, rendered.error);
    const document = { selection: parsed.data.selection, ...rendered.value };
    return previewDocumentSchema.safeParse(document).success ? response(document, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
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
    else if ((route === "cms-document" || route === "cms-asset") && (parsed?.search.length !== 0 || values(headers, "cookie").length !== 0 || values(headers, "authorization").length !== 0)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "cms-asset" && asset === undefined) result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if (!originOk(headers, route, asset?.destination, request.method)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "unknown") result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if ((route === "cms-document" || route === "cms-asset") && request.method !== "GET") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405);
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
