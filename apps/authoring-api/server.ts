import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { z } from "zod";

import type { DomainApplication, DomainApplicationFailure, SaveRevisionSuccess } from "../../core/application/index.js";
import type { JsonValue, MessageRemediation } from "../../core/foundation/index.js";
import type { AuthoringCredentialAuthority } from "./credential-store.js";

const ORIGIN = "http://127.0.0.1:43127";
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
  REQUEST_BODY_TOO_LARGE: "SaveRevision request 不得超過 4 MiB。",
  ROUTE_NOT_FOUND: "請使用已核准的 Authoring API route。",
  METHOD_NOT_ALLOWED: "請使用 route 核准的 HTTP method。",
  UNSUPPORTED_MEDIA_TYPE: "請使用 application/json UTF-8 request body。",
  INTERNAL_SERVER_ERROR: "Authoring API 暫時無法完成 request，請稍後重試。",
};
export type TransportCode = "INVALID_REQUEST_FRAMING" | "MISDIRECTED_REQUEST" | "ORIGIN_FORBIDDEN" | "AUTHORIZATION_REQUIRED" | "AUTHORIZATION_MALFORMED" | "AUTHORIZATION_DUPLICATE" | "AUTHORIZATION_ALTERNATE_TRANSPORT" | "AUTHORIZATION_INVALID" | "AUTHORIZATION_REVOKED" | "SERVER_PROOF_GENERATION_MISMATCH" | "INVALID_REQUEST_BODY" | "REQUEST_BODY_TOO_LARGE" | "ROUTE_NOT_FOUND" | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "INTERNAL_SERVER_ERROR";
export type AuthoringApiLogEvent = Readonly<{ requestId: string; stableEventCode: "AUTHORING_REQUEST_OK" | "AUTHORING_REQUEST_REJECTED" | "AUTHORING_REQUEST_FAILED"; method: "POST" | "OPTIONS" | "OTHER" | "UNPARSED"; routeTemplate: "/v1/entries/:entryId/revisions" | "/_local/server-proof" | "unmatched"; status: number }>;
export type AuthoringApiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: "AUTHORING_SERVER_START_FAILED"; owner: "AuthoringApi"; subjectIds: readonly []; remediation: MessageRemediation }> }>;
export interface RunningAuthoringApi { readonly origin: typeof ORIGIN; close(): Promise<void>; }
export type StartAuthoringApiInput = Readonly<{ domainApplication: DomainApplication; credentialAuthority: AuthoringCredentialAuthority; logger: (event: AuthoringApiLogEvent) => void }>;

type RouteTemplate = AuthoringApiLogEvent["routeTemplate"];
type HeaderMap = ReadonlyMap<string, readonly string[]>;
type RouteClass = "save" | "proof" | "unknown";
const saveSchema = z.object({
  contract: z.literal("save-revision-request/v1"),
  revisionId: z.string(), operationId: z.string(),
  schemaIdentity: z.object({ schemaId: z.string(), version: z.number().int().safe().positive() }).strict(),
  content: z.unknown(), route: z.string(),
  assetVersions: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
}).strict();
const proofSchema = z.object({ contract: z.literal("authoring-server-proof-challenge/v1"), generation: z.number().int().safe().positive(), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();

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
function routeFor(pathname: string): RouteClass { return pathname === "/_local/server-proof" ? "proof" : /^\/v1\/entries\/[^/]+\/revisions$/u.test(pathname) ? "save" : "unknown"; }
function templateFor(route: RouteClass): RouteTemplate { return route === "save" ? "/v1/entries/:entryId/revisions" : route === "proof" ? "/_local/server-proof" : "unmatched"; }
function methodFor(method: string | undefined): AuthoringApiLogEvent["method"] { return method === "POST" ? "POST" : method === "OPTIONS" ? "OPTIONS" : "OTHER"; }
function response(body: unknown, status: number, extra: Readonly<Record<string, string>> = {}): Response { return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra } }); }
function errorResponse(requestId: string, code: TransportCode, status: number, owner: "AuthoringApi" | "AuthoringCredential" = "AuthoringApi", remediation = ERROR_REMEDIATION[code]): Response { return response({ contract: "authoring-error/v1", requestId, code, owner, subjectIds: [], remediation: { kind: "message", message: remediation } }, status); }
function framingOk(headers: HeaderMap, incoming: IncomingMessage): boolean {
  if (incoming.url === undefined || !incoming.url.startsWith("/") || incoming.url.startsWith("//") || one(headers, "expect") !== undefined || one(headers, "upgrade") !== undefined) return false;
  const contentLength = values(headers, "content-length"); const transferEncoding = values(headers, "transfer-encoding");
  if (contentLength.length > 1 || transferEncoding.length > 1 || (contentLength.length > 0 && transferEncoding.length > 0)) return false;
  if (contentLength.length === 1 && !/^(0|[1-9][0-9]*)$/u.test(contentLength[0] ?? "")) return false;
  if (contentLength.length === 1 && !Number.isSafeInteger(Number(contentLength[0]))) return false;
  return transferEncoding.length === 0 || transferEncoding[0] === "chunked";
}
function hostOk(headers: HeaderMap): boolean { return one(headers, "host") === "127.0.0.1:43127" && values(headers, "forwarded").length === 0 && [...headers.keys()].every((name) => !name.startsWith("x-forwarded-")); }
function originOk(headers: HeaderMap, route: RouteClass): boolean {
  const origin = values(headers, "origin"); const fetchSite = values(headers, "sec-fetch-site");
  if (route === "proof") return origin.length === 0 && fetchSite.length === 0 && values(headers, "authorization").length === 0;
  if (route !== "save") return true;
  const browser = origin.length === 1 && origin[0] === ORIGIN && fetchSite.length === 1 && fetchSite[0] === "same-origin";
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
  const match = /^Bearer (asn_v1_[A-Za-z0-9_-]{43})$/u.exec(all[0] ?? ""); return match?.[1] === undefined ? { ok: false, code: "AUTHORIZATION_MALFORMED" } : { ok: true, candidate: match[1] };
}
function credentialError(requestId: string, admission: Awaited<ReturnType<AuthoringCredentialAuthority["openAdmission"]>>): Response {
  if (!admission.ok && admission.error.code === "CREDENTIAL_REVOKED") return errorResponse(requestId, "AUTHORIZATION_REVOKED", 401, "AuthoringCredential");
  return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 503, "AuthoringCredential", "請修復本機 Authoring API credential store 後重試。");
}
function redacted(value: string): string { return value.replace(/asn_(?:v1|bt_v1)_[A-Za-z0-9_-]+/gu, "[REDACTED]"); }
function domainError(requestId: string, error: DomainApplicationFailure): Response {
  const descriptor = Object.getOwnPropertyDescriptors(error); const code = descriptor.code?.value; const owner = descriptor.owner?.value; const subjectIds = descriptor.subjectIds?.value; const remediation = descriptor.remediation?.value;
  if (typeof code !== "string" || typeof owner !== "string" || !Array.isArray(subjectIds) || !subjectIds.every((id) => typeof id === "string") || typeof remediation !== "object" || remediation === null || Object.getPrototypeOf(remediation) !== Object.prototype) return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const rem = Object.getOwnPropertyDescriptors(remediation); if (rem.kind?.value !== "message" || typeof rem.message?.value !== "string") return errorResponse(requestId, "INTERNAL_SERVER_ERROR", 500);
  const conflicts = new Set(["CURRENT_REVISION_MISMATCH", "MEDIA_REFERENCE_CONFLICT", "ROUTE_CONFLICT", "ROUTE_CHANGE_REQUIRED", "STALE_ROUTE_PROPOSAL", "PLUGIN_IDENTITY_CONFLICT", "ACTIVATION_STATE_CONFLICT", "ACTIVE_PLUGIN_IDENTITY_MISMATCH"]);
  const invalid = new Set(["INVALID_SAVE_REVISION_REQUEST", "INVALID_PUBLISH_REVISION_REQUEST", "MEDIA_REFERENCE_NOT_FOUND", "SCHEMA_INVALID", "MEDIA_UNAVAILABLE", "PLUGIN_NOT_FOUND", "PLUGIN_NOT_ACTIVE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING", "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CAPABILITY_DENIED", "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED"]);
  const status = conflicts.has(code) ? 409 : invalid.has(code) ? 422 : 500;
  return response({ contract: "authoring-error/v1", requestId, code: redacted(code), owner: redacted(owner), subjectIds: subjectIds.map(redacted), remediation: { kind: "message", message: redacted(rem.message.value) } }, status);
}
function saveSuccess(value: SaveRevisionSuccess): Readonly<Record<string, unknown>> { return {
  contract: "save-revision-success/v1", entryId: value.revision.identity.entryId,
  revision: { revisionId: value.revision.identity.revisionId, schemaIdentity: value.revision.schemaIdentity, contentDigest: value.revision.contentDigest, lineage: value.revision.lineage },
  references: value.references.map((item) => ({ assetId: item.assetVersion.assetId, assetVersionId: item.assetVersion.assetVersionId })).sort((a, b) => a.assetId === b.assetId ? a.assetVersionId < b.assetVersionId ? -1 : a.assetVersionId > b.assetVersionId ? 1 : 0 : a.assetId < b.assetId ? -1 : 1),
  pointer: value.currentPointer.publishedRevisionId === undefined ? { currentRevisionId: value.currentPointer.currentRevisionId } : { currentRevisionId: value.currentPointer.currentRevisionId, publishedRevisionId: value.currentPointer.publishedRevisionId },
  currentRoute: { normalizedRoute: value.currentClaim.normalizedRoute, owner: value.currentClaim.owner, sourceRevisionId: value.currentClaim.sourceRevisionId }, lineageIdentity: value.lineageIdentity, stateDigest: value.stateDigest, activePluginStateDigest: value.activePluginStateDigest,
}; }

export async function startAuthoringApi(input: StartAuthoringApiInput): Promise<AuthoringApiResult<RunningAuthoringApi>> {
  const app = new Hono();
  app.post("/_local/server-proof", async (context) => {
    const requestId = randomUUID(); const headers = headersOf((context.env as { incoming: IncomingMessage }).incoming);
    if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
    const body = await boundedJson(context.req.raw, 4_096); if (!body.ok) return errorResponse(requestId, body.code, 400);
    const parsed = proofSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try { if (admission.value.generation !== parsed.data.generation) return errorResponse(requestId, "SERVER_PROOF_GENERATION_MISMATCH", 401, "AuthoringCredential"); return response({ contract: "authoring-server-proof/v1", generation: admission.value.generation, nonce: parsed.data.nonce, mac: admission.value.createServerProof(parsed.data.nonce) }, 200); } finally { admission.value.dispose(); }
  });
  app.post("/v1/entries/:entryId/revisions", async (context) => {
    const requestId = randomUUID(); const incoming = (context.env as { incoming: IncomingMessage }).incoming; const headers = headersOf(incoming);
    if (values(headers, "cookie").length > 0 || new URL(context.req.url).search.length > 0) return errorResponse(requestId, "AUTHORIZATION_ALTERNATE_TRANSPORT", 401);
    const parsedAuthorization = authorization(headers); if (!parsedAuthorization.ok) return errorResponse(requestId, parsedAuthorization.code, 401);
    const admission = await input.credentialAuthority.openAdmission(); if (!admission.ok) return credentialError(requestId, admission);
    try {
      if (!admission.value.verifyBearer(parsedAuthorization.candidate)) return errorResponse(requestId, "AUTHORIZATION_INVALID", 401, "AuthoringCredential");
      if (!jsonMediaType(headers)) return errorResponse(requestId, "UNSUPPORTED_MEDIA_TYPE", 415);
      const body = await boundedJson(context.req.raw, 4_194_304); if (!body.ok) return errorResponse(requestId, body.code, 400);
      const parsed = saveSchema.safeParse(body.value); if (!parsed.success) return errorResponse(requestId, "INVALID_REQUEST_BODY", 400);
      const command = await input.domainApplication.saveRevision({ entryId: context.req.param("entryId"), ...parsed.data, content: parsed.data.content as JsonValue });
      return command.ok ? response(saveSuccess(command.value), 200) : domainError(requestId, command.error);
    } finally { admission.value.dispose(); }
  });

  const server = createAdaptorServer({ fetch: async (request, env) => {
    const incoming = env.incoming as IncomingMessage; const headers = headersOf(incoming); const requestId = randomUUID(); const parsed = request.url.startsWith(ORIGIN) ? new URL(request.url) : undefined; const pathname = parsed?.pathname ?? ""; const route = routeFor(pathname); let result: Response;
    if (!framingOk(headers, incoming)) { result = errorResponse(requestId, "INVALID_REQUEST_FRAMING", 400, "AuthoringApi"); result.headers.set("Connection", "close"); }
    else if (!hostOk(headers)) result = errorResponse(requestId, "MISDIRECTED_REQUEST", 421);
    else if (!originOk(headers, route)) result = errorResponse(requestId, "ORIGIN_FORBIDDEN", 403);
    else if (route === "unknown") result = errorResponse(requestId, "ROUTE_NOT_FOUND", 404);
    else if (request.method !== "POST") result = errorResponse(requestId, "METHOD_NOT_ALLOWED", 405, "AuthoringApi", ERROR_REMEDIATION.METHOD_NOT_ALLOWED);
    else result = await app.fetch(request, env);
    const event: AuthoringApiLogEvent = { requestId, stableEventCode: result.status >= 500 ? "AUTHORING_REQUEST_FAILED" : result.status >= 400 ? "AUTHORING_REQUEST_REJECTED" : "AUTHORING_REQUEST_OK", method: methodFor(incoming.method), routeTemplate: templateFor(route), status: result.status };
    try { input.logger(event); } catch { /* sink fault 不得影響 transport */ }
    return result;
  }, overrideGlobalObjects: false, autoCleanupIncoming: true }) as Server;
  const rejected = (): AuthoringApiResult<RunningAuthoringApi> => ({ ok: false, error: { code: "AUTHORING_SERVER_START_FAILED", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: "Authoring API listener 無法啟動。" } } });
  server.on("clientError", (_error, socket) => { rawBadRequest(socket, input.logger); });
  server.on("checkContinue", (_request, socket) => { rawBadRequest(socket, input.logger); });
  server.on("upgrade", (_request, socket) => { rawBadRequest(socket, input.logger); });
  const started = await new Promise<boolean>((resolve) => { server.once("error", () => resolve(false)); server.listen(43127, "127.0.0.1", () => resolve(true)); });
  if (!started) { server.close(); return rejected(); }
  let closed = false;
  return { ok: true, value: { origin: ORIGIN, close: async () => { if (closed) return; closed = true; await new Promise<void>((resolve, reject) => server.close((error) => error === undefined || (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ERR_SERVER_NOT_RUNNING") ? resolve() : reject(new Error("AUTHORING_SERVER_CLOSE_FAILED")))); } } };
}
type RawResponder = Readonly<{ writable: boolean; end(data: string): unknown; destroy?(): unknown }>;
function rawBadRequest(socket: RawResponder, logger: StartAuthoringApiInput["logger"]): void { const requestId = randomUUID(); try { logger({ requestId, stableEventCode: "AUTHORING_REQUEST_REJECTED", method: "UNPARSED", routeTemplate: "unmatched", status: 400 }); } catch { /* sink fault 已隔離 */ } if (socket.writable) socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store, no-cache\r\nPragma: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n${JSON.stringify({ contract: "authoring-error/v1", requestId, code: "INVALID_REQUEST_FRAMING", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: ERROR_REMEDIATION.INVALID_REQUEST_FRAMING } })}`); else socket.destroy?.(); }
