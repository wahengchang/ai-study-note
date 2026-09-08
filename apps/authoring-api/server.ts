import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

import type { AuthoringEntryV1, CmsSeoAnalysisSuccess, DomainApplication, DomainApplicationFailure, PluginManagementSnapshotV1, PublishRevisionSuccess, SaveRevisionSuccess } from "../../core/application/index.js";
import type { JsonValue, MessageRemediation } from "../../core/foundation/index.js";
import type { Context } from "hono";
import type { AuthoringCredentialAuthority } from "./credential-store.js";
import { API_KEY_PATTERN, AUTHORING_AUTHORITY, AUTHORING_HOST, AUTHORING_ORIGIN, AUTHORING_PORT, redactSecrets } from "./origin.js";
import { authoringErrorStatuses, browserSessionExchangeSchema, browserTicketMintRequestSchema, cmsSeoAnalysisRequestSchema, pluginActivationRequestSchema, pluginSettingsReplaceRequestSchema, publishRevisionRequestSchema, saveRevisionRequestSchema, serverProofChallengeSchema } from "./transport-contracts.js";
import type { PublishRevisionSuccessDto, SaveRevisionSuccessDto, TransportCode } from "./transport-contracts.js";

const ORIGIN = AUTHORING_ORIGIN;
const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
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
export type { TransportCode } from "./transport-contracts.js";
export type AuthoringApiLogEvent = Readonly<{ requestId: string; stableEventCode: "AUTHORING_REQUEST_OK" | "AUTHORING_REQUEST_REJECTED" | "AUTHORING_REQUEST_FAILED"; method: "GET" | "POST" | "OPTIONS" | "OTHER" | "UNPARSED"; routeTemplate: "/v1/entries/:entryId/revisions" | "/v1/entries/:entryId/publish" | "/v1/entries/:entryId/current" | "/v1/entries/:entryId/seo-analysis" | "/v1/plugins" | "/v1/plugins/activate" | "/v1/plugins/settings" | "/_local/server-proof" | "/_local/browser-tickets" | "/_local/browser-session" | "unmatched"; status: number }>;
export type AuthoringApiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: "AUTHORING_SERVER_START_FAILED"; owner: "AuthoringApi"; subjectIds: readonly []; remediation: MessageRemediation }> }>;
export interface RunningAuthoringApi { readonly origin: typeof ORIGIN; close(): Promise<void>; }
export type StartAuthoringApiInput = Readonly<{ domainApplication: DomainApplication; credentialAuthority: AuthoringCredentialAuthority; logger: (event: AuthoringApiLogEvent) => void; cmsAssetsRoot?: string }>;

type RouteTemplate = AuthoringApiLogEvent["routeTemplate"];
type HeaderMap = ReadonlyMap<string, readonly string[]>;
type RouteClass = "save" | "publish" | "proof" | "browserTickets" | "browserSession" | "plugins" | "pluginActivate" | "pluginSettings" | "entryCurrent" | "seoAnalysis" | "cms" | "unknown";

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
/** entryId 只接受單一未經 percent-encoding 的 path segment；`%` 會讓 decode 後的 ID 與 URL 不再一一對應。 */
function routeFor(pathname: string): RouteClass {
  if (pathname === "/_local/server-proof") return "proof";
  if (pathname === "/_local/browser-tickets") return "browserTickets";
  if (pathname === "/_local/browser-session") return "browserSession";
  if (pathname === "/v1/plugins") return "plugins";
  if (pathname === "/v1/plugins/activate") return "pluginActivate";
  if (pathname === "/v1/plugins/settings") return "pluginSettings";
  if (/^\/v1\/entries\/[^/%?#]+\/revisions$/u.test(pathname)) return "save";
  if (/^\/v1\/entries\/[^/%?#]+\/current$/u.test(pathname)) return "entryCurrent";
  if (/^\/v1\/entries\/[^/%?#]+\/seo-analysis$/u.test(pathname)) return "seoAnalysis";
  if (pathname === "/cms" || pathname === "/cms/" || /^\/cms\/assets\/[A-Za-z0-9._-]+$/u.test(pathname)) return "cms";
  return /^\/v1\/entries\/[^/%?#]+\/publish$/u.test(pathname) ? "publish" : "unknown";
}
function templateFor(route: RouteClass): RouteTemplate {
  return route === "save" ? "/v1/entries/:entryId/revisions" : route === "publish" ? "/v1/entries/:entryId/publish" : route === "entryCurrent" ? "/v1/entries/:entryId/current" : route === "seoAnalysis" ? "/v1/entries/:entryId/seo-analysis" : route === "browserTickets" ? "/_local/browser-tickets" : route === "browserSession" ? "/_local/browser-session" : route === "plugins" ? "/v1/plugins" : route === "pluginActivate" ? "/v1/plugins/activate" : route === "pluginSettings" ? "/v1/plugins/settings" : route === "proof" ? "/_local/server-proof" : "unmatched";
}
function methodFor(method: string | undefined): AuthoringApiLogEvent["method"] { return method === "GET" ? "GET" : method === "POST" ? "POST" : method === "OPTIONS" ? "OPTIONS" : "OTHER"; }
/** 所有 JSON response 在送出前一律 redact；success DTO 也會回吐呼叫端提供的 route／ID。 */
function response(body: unknown, status: number, extra: Readonly<Record<string, string>> = {}): Response { return new Response(redactSecrets(JSON.stringify(body)), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra } }); }
function errorResponse(requestId: string, code: TransportCode, status: number, owner: "AuthoringApi" | "AuthoringCredential" = "AuthoringApi", remediation = ERROR_REMEDIATION[code]): Response { return response({ contract: "authoring-error/v1", requestId, code, owner, subjectIds: [], remediation: { kind: "message", message: remediation } }, status); }
function framingOk(headers: HeaderMap, incoming: IncomingMessage): boolean {
  if (incoming.url === undefined || !incoming.url.startsWith("/") || incoming.url.startsWith("//") || one(headers, "expect") !== undefined || one(headers, "upgrade") !== undefined) return false;
  const contentLength = values(headers, "content-length"); const transferEncoding = values(headers, "transfer-encoding");
  if (contentLength.length > 1 || transferEncoding.length > 1 || (contentLength.length > 0 && transferEncoding.length > 0)) return false;
  if (contentLength.length === 1 && !/^(0|[1-9][0-9]*)$/u.test(contentLength[0] ?? "")) return false;
  if (contentLength.length === 1 && !Number.isSafeInteger(Number(contentLength[0]))) return false;
  return transferEncoding.length === 0 || transferEncoding[0] === "chunked";
}
function hostOk(headers: HeaderMap): boolean { return one(headers, "host") === AUTHORING_AUTHORITY && values(headers, "forwarded").length === 0 && [...headers.keys()].every((name) => !name.startsWith("x-forwarded-")); }
function originOk(headers: HeaderMap, route: RouteClass): boolean {
  const origin = values(headers, "origin"); const fetchSite = values(headers, "sec-fetch-site");
  if (route === "proof") return origin.length === 0 && fetchSite.length === 0 && values(headers, "authorization").length === 0;
  if (route === "browserTickets") return origin.length === 0 && fetchSite.length === 0;
  const browser = origin.length === 1 && origin[0] === ORIGIN && fetchSite.length === 1 && fetchSite[0] === "same-origin";
  if (route === "browserSession") return browser && values(headers, "authorization").length === 0;
  const browserRead = fetchSite.length === 1 && fetchSite[0] === "same-origin" && (origin.length === 0 || origin.length === 1 && origin[0] === ORIGIN);
  const cli = origin.length === 0 && fetchSite.length === 0 && [...headers.keys()].every((name) => !name.startsWith("sec-fetch-"));
  if (route === "pluginActivate" || route === "pluginSettings" || route === "seoAnalysis") return browser;
  if (route === "plugins" || route === "entryCurrent") return browserRead;
  if (route === "cms") return values(headers, "authorization").length === 0 && origin.length === 0 && (fetchSite.length === 0 || fetchSite.length === 1 && (fetchSite[0] === "none" || fetchSite[0] === "same-origin"));
  return route === "save" || route === "publish" ? browser || cli : true;
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
    const entryId = context.req.param("entryId");
    if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    return handle(requestId, entryId, body.value);
  } finally { admission.value.dispose(); }
}

async function authenticatedRead(context: Context, input: StartAuthoringApiInput, handle: (requestId: string, entryId: string | undefined) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0 || one(headers, "content-type") !== undefined || one(headers, "content-length") !== undefined || one(headers, "transfer-encoding") !== undefined) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try {
    if (!admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    return handle(requestId, context.req.param("entryId"));
  } finally { admission.value.dispose(); }
}

async function authenticatedPluginJson(context: Context, input: StartAuthoringApiInput, handle: (requestId: string, body: unknown) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
  if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
  const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
  const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
  try {
    if (!admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, PUBLISH_BODY_LIMIT);
    if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? PUBLISH_BODY_LIMIT_REMEDIATION : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    return handle(requestId, body.value);
  } finally { admission.value.dispose(); }
}

export async function startAuthoringApi(input: StartAuthoringApiInput): Promise<AuthoringApiResult<RunningAuthoringApi>> {
  const app = new Hono();
  const proofSockets = new WeakMap<object, Readonly<{ generation: number; nonce: string; expiresAt: number }>>();
  const browserTickets = new Map<string, Readonly<{ apiKey: string; generation: number; expiresAt: number }>>();
  const browserSessionResponse = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
  app.post("/_local/server-proof", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT); if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", body.code === "REQUEST_BODY_TOO_LARGE" ? PROOF_BODY_LIMIT_REMEDIATION : ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    const parsed = serverProofChallengeSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try { if (admission.value.generation !== parsed.data.generation) return errorResponse(requestId, "SERVER_PROOF_GENERATION_MISMATCH", 401, "AuthoringCredential"); proofSockets.set((context.env as { incoming: IncomingMessage }).incoming.socket, Object.freeze({ generation: admission.value.generation, nonce: parsed.data.nonce, expiresAt: Date.now() + 5_000 })); return response({ contract: "authoring-server-proof/v1", generation: admission.value.generation, nonce: parsed.data.nonce, mac: admission.value.createServerProof(parsed.data.nonce) }, 200); } finally { admission.value.dispose(); }
  });
  app.post("/_local/browser-tickets", async (context) => {
    const requestId = randomUUID(); const incoming = (context.env as { incoming: IncomingMessage }).incoming; const headers = headersOf(incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0 || !jsonMediaType(headers)) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT); if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    const parsed = browserTicketMintRequestSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const proof = proofSockets.get(incoming.socket); proofSockets.delete(incoming.socket);
    if (proof === undefined || proof.expiresAt < Date.now() || proof.generation !== parsed.data.generation || proof.nonce !== parsed.data.proofNonce) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (admission.value.generation !== proof.generation || !admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
      const ticket = `asn_bt_v1_${randomBytes(32).toString("base64url")}`;
      browserTickets.set(ticket, Object.freeze({ apiKey: parsedAuthorization.candidate, generation: admission.value.generation, expiresAt: Date.now() + 60_000 }));
      return new Response(JSON.stringify({ contract: "browser-ticket/v1", generation: admission.value.generation, ticket, expiresInSeconds: 60 }), { status: 201, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
    } finally { admission.value.dispose(); }
  });
  app.post("/_local/browser-session", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0 || !jsonMediaType(headers)) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    const body = await boundedJson(context.req.raw, PROOF_BODY_LIMIT); if (!body.ok) return errorResponse(requestId, body.code, 400, "AuthoringApi", ERROR_REMEDIATION.INVALID_REQUEST_BODY);
    const parsed = browserSessionExchangeSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const ticket = browserTickets.get(parsed.data.ticket); browserTickets.delete(parsed.data.ticket);
    if (ticket === undefined || ticket.expiresAt < Date.now()) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (admission.value.generation !== ticket.generation || !admission.value.verifyBearer(ticket.apiKey)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
      return browserSessionResponse({ contract: "browser-session/v1", generation: ticket.generation, apiKey: ticket.apiKey });
    } finally { admission.value.dispose(); }
  });
  app.post("/v1/entries/:entryId/revisions", async (context) => authenticatedJson(context, input, SAVE_BODY_LIMIT, SAVE_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const parsed = saveRevisionRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const command = await input.domainApplication.saveRevision({ entryId, revisionId: parsed.data.revisionId, operationId: parsed.data.operationId, expectedCurrentRevisionId: parsed.data.expectedCurrentRevisionId, schemaIdentity: parsed.data.schemaIdentity, content: parsed.data.content as JsonValue, route: parsed.data.route, assetVersions: parsed.data.assetVersions });
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
  app.get("/v1/plugins", async (context) => authenticatedRead(context, input, async (requestId) => {
    const listed = await input.domainApplication.listPlugins();
    return listed.ok ? response(listed.value satisfies PluginManagementSnapshotV1, 200) : domainError(requestId, listed.error);
  }));
  app.post("/v1/plugins/activate", async (context) => authenticatedPluginJson(context, input, async (requestId, body) => {
    const parsed = pluginActivationRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const activated = await input.domainApplication.activatePlugin(parsed.data as Parameters<DomainApplication["activatePlugin"]>[0]);
    return activated.ok ? response({ contract: "plugin-activation-success/v1", activationStateDigest: activated.value.activationStateDigest }, 200) : domainError(requestId, activated.error);
  }));
  app.post("/v1/plugins/settings", async (context) => authenticatedPluginJson(context, input, async (requestId, body) => {
    const parsed = pluginSettingsReplaceRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const replaced = await input.domainApplication.replacePluginSettings(parsed.data as Parameters<DomainApplication["replacePluginSettings"]>[0]);
    return replaced.ok ? response({ contract: "plugin-settings-replace-success/v1", settingsStateDigest: replaced.value.settingsStateDigest }, 200) : domainError(requestId, replaced.error);
  }));
  app.get("/v1/entries/:entryId/current", async (context) => authenticatedRead(context, input, async (requestId, entryId) => {
    if (entryId === undefined) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
    const current = await input.domainApplication.readCurrentEntry({ entryId });
    return current.ok ? response(current.value satisfies AuthoringEntryV1, 200) : domainError(requestId, current.error);
  }));
  app.post("/v1/entries/:entryId/seo-analysis", async (context) => authenticatedJson(context, input, PUBLISH_BODY_LIMIT, PUBLISH_BODY_LIMIT_REMEDIATION, async (requestId, entryId, body) => {
    const parsed = cmsSeoAnalysisRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.entryId !== entryId) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const result = await input.domainApplication.analyzeCmsSeo(parsed.data as Parameters<DomainApplication["analyzeCmsSeo"]>[0]);
    return result.ok ? response(result.value satisfies CmsSeoAnalysisSuccess, 200) : domainError(requestId, result.error);
  }));
  const cmsRoot = input.cmsAssetsRoot === undefined ? undefined : resolve(input.cmsAssetsRoot);
  app.get("/cms/*", (context) => {
    if (cmsRoot === undefined) return new Response(null, { status: 404, headers: SECURITY_HEADERS });
    const pathname = new URL(context.req.url).pathname;
    const relative = pathname === "/cms" || pathname === "/cms/" ? "index.html" : pathname.slice("/cms/".length);
    const target = resolve(cmsRoot, relative);
    if (!target.startsWith(`${cmsRoot}${sep}`) && target !== cmsRoot) return new Response(null, { status: 404, headers: SECURITY_HEADERS });
    try {
      if (!statSync(target).isFile()) return new Response(null, { status: 404, headers: SECURITY_HEADERS });
      const contentType = target.endsWith(".html") ? "text/html; charset=utf-8" : target.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream";
      return new Response(readFileSync(target), { status: 200, headers: { ...SECURITY_HEADERS, "Content-Type": contentType, "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    } catch { return new Response(null, { status: 404, headers: SECURITY_HEADERS }); }
  });

  const server = createAdaptorServer({ fetch: async (request, env) => {
    const incoming = env.incoming as IncomingMessage; const headers = headersOf(incoming); const requestId = randomUUID(); const parsed = request.url.startsWith(ORIGIN) ? new URL(request.url) : undefined; const pathname = parsed?.pathname ?? ""; const route = routeFor(pathname); let result: Response;
    if (!framingOk(headers, incoming)) { result = errorResponse(requestId, "INVALID_REQUEST_FRAMING", 400, "AuthoringApi"); result.headers.set("Connection", "close"); }
    else if (!hostOk(headers)) result = errorResponse(requestId, "MISDIRECTED_REQUEST", 421);
    else if (!originOk(headers, route)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "unknown") result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if ((route === "plugins" || route === "entryCurrent" || route === "cms") ? request.method !== "GET" : request.method !== "POST") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405, "AuthoringApi", ERROR_REMEDIATION.METHOD_NOT_ALLOWED);
    else result = await app.fetch(request, env);
    const event: AuthoringApiLogEvent = { requestId, stableEventCode: result.status >= 500 ? "AUTHORING_REQUEST_FAILED" : result.status >= 400 ? "AUTHORING_REQUEST_REJECTED" : "AUTHORING_REQUEST_OK", method: methodFor(incoming.method), routeTemplate: templateFor(route), status: result.status };
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
  return { ok: true, value: { origin: ORIGIN, close: async () => { if (closed) return; closed = true; await new Promise<void>((resolve, reject) => server.close((error) => error === undefined || (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ERR_SERVER_NOT_RUNNING") ? resolve() : reject(new Error("AUTHORING_SERVER_CLOSE_FAILED")))); } } };
}
type RawResponder = Readonly<{ writable: boolean; end(data: string): unknown; destroy?(): unknown }>;
function rawBadRequest(socket: RawResponder, logger: StartAuthoringApiInput["logger"]): void { const requestId = randomUUID(); try { logger({ requestId, stableEventCode: "AUTHORING_REQUEST_REJECTED", method: "UNPARSED", routeTemplate: "unmatched", status: 400 }); } catch { /* sink fault 已隔離 */ } if (socket.writable) socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store, no-cache\r\nPragma: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n${JSON.stringify({ contract: "authoring-error/v1", requestId, code: "INVALID_REQUEST_FRAMING", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: ERROR_REMEDIATION.INVALID_REQUEST_FRAMING } })}`); else socket.destroy?.(); }
