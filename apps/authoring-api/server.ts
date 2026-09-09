import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";

import type { AuthoringContentType, AuthoringEntryDetail, AuthoringEntryPointerRevision, AuthoringEntryRevision, AuthoringReadFacade, AuthoringReadFailure, DomainApplication, DomainApplicationFailure, PublishRevisionSuccess, SaveRevisionSuccess } from "../../core/application/index.js";
import type { JsonValue, MessageRemediation } from "../../core/foundation/index.js";
import { parsePreviewInput, renderPreviewDocument, type ProjectionPreview } from "../../core/projection/index.js";
import type { ThemeIdentity } from "../../core/theme-host/index.js";
import type { Context } from "hono";
import type { AuthoringCredentialAuthority } from "./credential-store.js";
import { createBrowserBootstrapState } from "./browser-bootstrap.js";
import type { CmsAsset, CmsAssets } from "./cms-assets.js";
import { API_KEY_PATTERN, AUTHORING_AUTHORITY, AUTHORING_HOST, AUTHORING_ORIGIN, AUTHORING_PORT, redactSecrets } from "./origin.js";
import { authoringErrorStatuses, browserSessionExchangeSchema, browserSessionSchema, browserTicketMintRequestSchema, browserTicketSchema, contentTypeCreateRequestSchema, contentTypeListSchema, contentTypeSchema, entryDetailSchema, entryListSchema, entryRevisionListSchema, previewDocumentSchema, previewRequestSchema, publishRevisionRequestSchema, saveRevisionRequestSchema, serverProofChallengeSchema } from "./transport-contracts.js";
import type { BrowserSessionDto, BrowserTicketDto, ContentTypeDto, EntryDetailDto, EntryListDto, EntryRevisionListDto, PreviewDocumentDto, PublishRevisionSuccessDto, SaveRevisionSuccessDto, TransportCode } from "./transport-contracts.js";

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
const PREVIEW_BODY_LIMIT = 4_096;
const PROOF_BODY_LIMIT = 4_096;
const SAVE_BODY_LIMIT_REMEDIATION = "SaveRevision request 不得超過 4 MiB。";
const PUBLISH_BODY_LIMIT_REMEDIATION = "PublishRevision request 不得超過 4 KiB。";
const PREVIEW_BODY_LIMIT_REMEDIATION = "Preview request 不得超過 4 KiB。";
const PROOF_BODY_LIMIT_REMEDIATION = "server-proof challenge 不得超過 4 KiB。";
export type { TransportCode } from "./transport-contracts.js";
export type AuthoringApiLogEvent = Readonly<{ requestId: string; stableEventCode: "AUTHORING_REQUEST_OK" | "AUTHORING_REQUEST_REJECTED" | "AUTHORING_REQUEST_FAILED"; method: "GET" | "POST" | "OPTIONS" | "OTHER" | "UNPARSED"; routeTemplate: "/cms" | "/cms/entries" | "/cms/entries/new" | "/cms/entries/:entryId" | "/cms/assets/:asset" | "/v1/content-types" | "/v1/content-types/:schemaId" | "/v1/entries" | "/v1/entries/:entryId" | "/v1/entries/:entryId/revisions" | "/v1/entries/:entryId/publish" | "/v1/preview" | "/_local/server-proof" | "/_local/browser-tickets" | "/_local/browser-session" | "unmatched"; status: number }>;
export type AuthoringApiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: "AUTHORING_SERVER_START_FAILED"; owner: "AuthoringApi"; subjectIds: readonly []; remediation: MessageRemediation }> }>;
export interface RunningAuthoringApi { readonly origin: typeof ORIGIN; close(): Promise<void>; }
export type StartAuthoringApiInput = Readonly<{ domainApplication: DomainApplication; authoringReadFacade: AuthoringReadFacade; projectionPreview: ProjectionPreview; themeIdentity: ThemeIdentity; credentialAuthority: AuthoringCredentialAuthority; cmsAssets: CmsAssets; logger: (event: AuthoringApiLogEvent) => void }>;

type RouteTemplate = AuthoringApiLogEvent["routeTemplate"];
type HeaderMap = ReadonlyMap<string, readonly string[]>;
type RouteClass = "cms-document" | "cms-asset" | "content-types" | "content-type" | "entries" | "entry" | "entry-revisions" | "save" | "publish" | "preview" | "proof" | "browser-ticket" | "browser-session" | "unknown";


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
  if (pathname === "/cms" || pathname === "/cms/entries" || pathname === "/cms/entries/new" || /^\/cms\/entries\/[^/%?#]+$/u.test(pathname)) return "cms-document";
  if (/^\/cms\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(pathname)) return "cms-asset";
  if (pathname === "/_local/server-proof") return "proof";
  if (pathname === "/_local/browser-tickets") return "browser-ticket";
  if (pathname === "/_local/browser-session") return "browser-session";
  if (pathname === "/v1/content-types") return "content-types";
  if (/^\/v1\/content-types\/[^/%?#]+$/u.test(pathname)) return "content-type";
  if (pathname === "/v1/entries") return "entries";
  if (/^\/v1\/entries\/[^/%?#]+\/revisions$/u.test(pathname)) return "entry-revisions";
  if (/^\/v1\/entries\/[^/%?#]+\/publish$/u.test(pathname)) return "publish";
  if (/^\/v1\/entries\/[^/%?#]+$/u.test(pathname)) return "entry";
  return pathname === "/v1/preview" ? "preview" : "unknown";
}
function templateFor(route: RouteClass, pathname: string): RouteTemplate {
  if (route === "cms-document") return pathname === "/cms" ? "/cms" : pathname === "/cms/entries" ? "/cms/entries" : pathname === "/cms/entries/new" ? "/cms/entries/new" : "/cms/entries/:entryId";
  if (route === "cms-asset") return "/cms/assets/:asset";
  if (route === "content-types") return "/v1/content-types";
  if (route === "content-type") return "/v1/content-types/:schemaId";
  if (route === "entries") return "/v1/entries";
  if (route === "entry") return "/v1/entries/:entryId";
  if (route === "entry-revisions" || route === "save") return "/v1/entries/:entryId/revisions";
  if (route === "publish") return "/v1/entries/:entryId/publish";
  if (route === "preview") return "/v1/preview";
  return route === "proof" ? "/_local/server-proof" : route === "browser-ticket" ? "/_local/browser-tickets" : route === "browser-session" ? "/_local/browser-session" : "unmatched";
}
function methodFor(method: string | undefined): AuthoringApiLogEvent["method"] { return method === "GET" ? "GET" : method === "POST" ? "POST" : method === "OPTIONS" ? "OPTIONS" : "OTHER"; }
function methodAllowed(route: RouteClass, method: string): boolean {
  if (route === "cms-document" || route === "cms-asset" || route === "content-type" || route === "entries" || route === "entry") return method === "GET";
  if (route === "content-types" || route === "entry-revisions") return method === "GET" || method === "POST";
  return route === "save" || route === "publish" || route === "preview" || route === "proof" || route === "browser-ticket" || route === "browser-session" ? method === "POST" : false;
}
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
function originOk(headers: HeaderMap, route: RouteClass, assetDestination: CmsAsset["destination"] | undefined): boolean {
  const origin = values(headers, "origin"); const fetchSite = values(headers, "sec-fetch-site");
  if (route === "cms-document") return origin.length === 0 && values(headers, "authorization").length === 0 && values(headers, "cookie").length === 0 && fetchSite.length === 1 && (fetchSite[0] === "none" || fetchSite[0] === "same-origin") && one(headers, "sec-fetch-mode") === "navigate" && one(headers, "sec-fetch-dest") === "document";
  if (route === "cms-asset") return (origin.length === 0 || (origin.length === 1 && origin[0] === ORIGIN)) && values(headers, "authorization").length === 0 && values(headers, "cookie").length === 0 && fetchSite.length === 1 && fetchSite[0] === "same-origin" && assetDestination !== undefined && one(headers, "sec-fetch-dest") === assetDestination;
  if (route === "proof") return origin.length === 0 && fetchSite.length === 0 && values(headers, "authorization").length === 0;
  if (route === "browser-ticket") return origin.length === 0 && [...headers.keys()].every((name) => !name.startsWith("sec-fetch-"));
  if (route === "browser-session") return origin.length === 1 && origin[0] === ORIGIN && fetchSite.length === 1 && fetchSite[0] === "same-origin" && values(headers, "authorization").length === 0;
  if (!["content-types", "content-type", "entries", "entry", "entry-revisions", "save", "publish", "preview"].includes(route)) return true;
  const browser = (origin.length === 0 || (origin.length === 1 && origin[0] === ORIGIN)) && fetchSite.length === 1 && fetchSite[0] === "same-origin";
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
function domainError(requestId: string, error: DomainApplicationFailure): Response {
  const descriptor = Object.getOwnPropertyDescriptors(error); const code = descriptor.code?.value; const owner = descriptor.owner?.value; const subjectIds = descriptor.subjectIds?.value; const remediation = descriptor.remediation?.value;
  if (typeof code !== "string" || typeof owner !== "string" || !Array.isArray(subjectIds) || !subjectIds.every((id) => typeof id === "string") || typeof remediation !== "object" || remediation === null || Object.getPrototypeOf(remediation) !== Object.prototype) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const rem = Object.getOwnPropertyDescriptors(remediation); if (rem.kind?.value !== "message" || typeof rem.message?.value !== "string") return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const statuses = authoringErrorStatuses(code);
  const status = statuses?.[0];
  if (status === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  return response({ contract: "authoring-error/v1", requestId, code, owner, subjectIds, remediation: { kind: "message", message: rem.message.value } }, status);
}
/** read seam 的 remediation 與 code 綁在同一處，讓 CMS client 能直接顯示可行動的訊息。 */
const AUTHORING_READ_REMEDIATION: Record<AuthoringReadFailure["code"], string> = {
  INVALID_CONTENT_TYPE: "只接受 Article v1 的 exact schema identity 與 canonical schema。",
  CONTENT_TYPE_CONFLICT: "該 content type 版本已註冊，無需重複建立。",
  CONTENT_TYPE_NOT_FOUND: "找不到該 content type。",
  ENTRY_NOT_FOUND: "找不到該內容項目。",
  AUTHORING_READ_FAILED: "Authoring read seam 無法完成 request。",
};
function authoringReadError(requestId: string, error: AuthoringReadFailure): Response {
  const status = authoringErrorStatuses(error.code)?.[0] ?? 500;
  return response({ contract: "authoring-error/v1", requestId, code: error.code, owner: error.owner, subjectIds: error.subjectIds, remediation: { kind: "message", message: AUTHORING_READ_REMEDIATION[error.code] } }, status);
}
function contentTypeSuccess(value: AuthoringContentType): ContentTypeDto { return { contract: "content-type/v1", schemaIdentity: { ...value.schemaIdentity }, schema: value.schema, schemaDigest: value.schemaDigest }; }
function entryRevisionSuccess(value: AuthoringEntryPointerRevision): EntryDetailDto["current"] { return { revisionId: value.revisionId, schemaIdentity: { ...value.schemaIdentity }, content: value.content, contentDigest: value.contentDigest, route: value.route, lineage: { ...value.lineage } }; }
/** history item 只在該 revision 仍持有 current／published claim 時帶 route。 */
function entryHistorySuccess(value: AuthoringEntryRevision): EntryRevisionListDto["items"][number] { return { revisionId: value.revisionId, schemaIdentity: { ...value.schemaIdentity }, content: value.content, contentDigest: value.contentDigest, ...(value.route === undefined ? {} : { route: value.route }), lineage: { ...value.lineage }, references: value.references.map((reference) => ({ ...reference })), ...(value.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: value.restoredFromRevisionId }) }; }
function entryDetailSuccess(value: AuthoringEntryDetail): EntryDetailDto { return { contract: "entry-detail/v1", entryId: value.entryId, current: entryRevisionSuccess(value.current), ...(value.published === undefined ? {} : { published: entryRevisionSuccess(value.published) }) }; }
/** subject 缺席與未發佈都是 404，但 remediation 必須說明是預覽 subject 而不是未知 route。 */
function previewError(requestId: string, code: string): Response {
  if (code === "SUBJECT_NOT_FOUND") return errorResponse(requestId, "ROUTE_NOT_FOUND", 404, "AuthoringApi", "找不到此預覽 subject 的內容項目。");
  if (code === "SUBJECT_NOT_PUBLISHED") return errorResponse(requestId, "ROUTE_NOT_FOUND", 404, "AuthoringApi", "此內容項目尚未發佈，只能預覽目前版本。");
  return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
}
function saveSuccess(value: SaveRevisionSuccess): SaveRevisionSuccessDto { return {
  contract: "save-revision-success/v1", entryId: value.revision.identity.entryId,
  revision: { revisionId: value.revision.identity.revisionId, schemaIdentity: value.revision.schemaIdentity, contentDigest: value.revision.contentDigest, lineage: value.revision.lineage },
  references: value.references.map((item) => ({ assetId: item.assetVersion.assetId, assetVersionId: item.assetVersion.assetVersionId })).sort((a, b) => a.assetId === b.assetId ? a.assetVersionId < b.assetVersionId ? -1 : a.assetVersionId > b.assetVersionId ? 1 : 0 : a.assetId < b.assetId ? -1 : 1),
  pointer: value.currentPointer.publishedRevisionId === undefined ? { currentRevisionId: value.currentPointer.currentRevisionId } : { currentRevisionId: value.currentPointer.currentRevisionId, publishedRevisionId: value.currentPointer.publishedRevisionId },
  currentRoute: { normalizedRoute: value.currentClaim.normalizedRoute, owner: value.currentClaim.owner, sourceRevisionId: value.currentClaim.sourceRevisionId }, lineageIdentity: value.lineageIdentity, stateDigest: value.stateDigest, activePluginStateDigest: value.activePluginStateDigest,
}; }

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

async function authenticatedV1(context: Context, input: StartAuthoringApiInput, handle: (requestId: string, headers: HeaderMap) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try {
    if (!admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    return await handle(requestId, headers);
  } finally { admission.value.dispose(); }
}
async function authenticatedRead(context: Context, input: StartAuthoringApiInput, handle: (requestId: string) => Promise<Response>): Promise<Response> {
  return authenticatedV1(context, input, async (requestId, headers) => {
    if (values(headers, "transfer-encoding").length !== 0 || (one(headers, "content-length") !== undefined && one(headers, "content-length") !== "0")) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    return handle(requestId);
  });
}
async function authenticatedJson(context: Context, input: StartAuthoringApiInput, bodyLimit: number, oversizedRemediation: string, handle: (requestId: string, entryId: string | undefined, body: unknown) => Promise<Response>): Promise<Response> {
  return authenticatedV1(context, input, async (requestId, headers) => {
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, bodyLimit);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? oversizedRemediation : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    return handle(requestId, context.req.param("entryId"), body.value);
  });
}

export async function startAuthoringApi(input: StartAuthoringApiInput): Promise<AuthoringApiResult<RunningAuthoringApi>> {
  if (input === null || typeof input !== "object" || input.authoringReadFacade === null || typeof input.authoringReadFacade !== "object" || typeof input.authoringReadFacade.listEntries !== "function" || input.projectionPreview === null || typeof input.projectionPreview !== "object" || typeof input.projectionPreview.preview !== "function" || input.themeIdentity === null || typeof input.themeIdentity !== "object") return { ok: false, error: { code: "AUTHORING_SERVER_START_FAILED", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: "Article workspace preview composition 缺少必要 seam。" } } };
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
  app.post("/v1/content-types", async (context) => authenticatedJson(context, input, PUBLISH_BODY_LIMIT, PUBLISH_BODY_LIMIT_REMEDIATION, async (requestId, _entryId, body) => {
    const parsed = contentTypeCreateRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const created = input.authoringReadFacade.createContentType(parsed.data);
    if (!created.ok) return authoringReadError(requestId, created.error);
    const dto = contentTypeSuccess(created.value); return contentTypeSchema.safeParse(dto).success ? response(dto, 201) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/content-types", async (context) => authenticatedRead(context, input, async (requestId) => {
    const listed = input.authoringReadFacade.listContentTypes();
    if (!listed.ok) return authoringReadError(requestId, listed.error);
    const dto = { contract: "content-type-list/v1" as const, items: listed.value.map(contentTypeSuccess) };
    return contentTypeListSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/content-types/:schemaId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const schemaId = context.req.param("schemaId"); if (schemaId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const found = input.authoringReadFacade.getContentType(schemaId);
    if (!found.ok) return authoringReadError(requestId, found.error);
    const dto = contentTypeSuccess(found.value); return contentTypeSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/entries", async (context) => authenticatedRead(context, input, async (requestId) => {
    const listed = input.authoringReadFacade.listEntries();
    if (!listed.ok) return authoringReadError(requestId, listed.error);
    const dto: EntryListDto = { contract: "entry-list/v1", items: listed.value.map((item) => ({ ...item })) };
    return entryListSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/entries/:entryId", async (context) => authenticatedRead(context, input, async (requestId) => {
    const entryId = context.req.param("entryId"); if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const found = input.authoringReadFacade.getEntry(entryId);
    if (!found.ok) return authoringReadError(requestId, found.error);
    const dto = entryDetailSuccess(found.value); return entryDetailSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.get("/v1/entries/:entryId/revisions", async (context) => authenticatedRead(context, input, async (requestId) => {
    const entryId = context.req.param("entryId"); if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const listed = input.authoringReadFacade.listEntryRevisions(entryId);
    if (!listed.ok) return authoringReadError(requestId, listed.error);
    const dto: EntryRevisionListDto = { contract: "entry-revision-list/v1", entryId, items: listed.value.map(entryHistorySuccess) };
    return entryRevisionListSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/preview", async (context) => authenticatedJson(context, input, PREVIEW_BODY_LIMIT, PREVIEW_BODY_LIMIT_REMEDIATION, async (requestId, _entryId, body) => {
    const parsed = previewRequestSchema.safeParse(body); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const artifact = await input.projectionPreview.preview({ selection: parsed.data.selection, subject: parsed.data.subject, themeIdentity: input.themeIdentity });
    if (!artifact.ok) return previewError(requestId, artifact.error.code);
    const preview = parsePreviewInput(artifact.value.bytes); if (!preview.ok) return previewError(requestId, preview.error.code);
    const rendered = renderPreviewDocument(preview.value); if (!rendered.ok) return previewError(requestId, rendered.error.code);
    const dto: PreviewDocumentDto = { ...rendered.value, selection: parsed.data.selection };
    return previewDocumentSchema.safeParse(dto).success ? response(dto, 200) : errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  }));
  app.post("/v1/entries/:entryId/revisions", async (context) => authenticatedJson(context, input, SAVE_BODY_LIMIT, SAVE_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const parsed = saveRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.saveRevision({ entryId, ...parsed.data, content: parsed.data.content as JsonValue });
    return command.ok ? response(saveSuccess(command.value), 200) : domainError(requestId, command.error);
  }));
  app.post("/v1/entries/:entryId/publish", async (context) => authenticatedJson(context, input, PUBLISH_BODY_LIMIT, PUBLISH_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const parsed = publishRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.publishRevision({ entryId, expectedCurrentRevisionId: parsed.data.expectedCurrentRevisionId, operationId: parsed.data.operationId });
    if (!command.ok) return domainError(requestId, command.error);
    const receipt = publishSuccess(command.value);
    return receipt === undefined ? errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500) : response(receipt, 200);
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
    else if (!originOk(headers, route, asset?.destination)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "unknown") result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if ((route === "cms-document" || route === "cms-asset") && request.method !== "GET") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405);
    else if (route === "cms-document") result = cmsDocumentResponse(input.cmsAssets);
    else if (route === "cms-asset" && asset !== undefined) result = cmsAssetResponse(asset);
    else if (!methodAllowed(route, request.method)) result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405, "AuthoringApi", ERROR_REMEDIATION.METHOD_NOT_ALLOWED);
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
