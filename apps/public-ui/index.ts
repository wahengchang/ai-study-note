import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { createPublicDelivery, type ArtifactFileSnapshot } from "../../core/delivery/index.js";
import { isArtifactFilePath } from "../../core/renderer/index.js";
import type { Digest, MessageRemediation } from "../../core/foundation/index.js";

const HOST = "127.0.0.1";
const SUCCESS_HEADERS = { "Cache-Control": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;
const ERROR_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;

export type PublicUiFailure = Readonly<{ code: "PUBLIC_UI_INVALID_INPUT" | "PUBLIC_UI_ARTIFACT_INVALID" | "PUBLIC_UI_SERVER_START_FAILED"; owner: "PublicUi"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type PublicUiResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: PublicUiFailure }>;
export type StartPublicUiInput = Readonly<{ artifactsRoot: string; artifactDigest: Digest; basePath: string; port?: number }>;
export type RunningPublicUi = Readonly<{ origin: string; basePath: string; close(): Promise<void> }>;

type Snapshot = Readonly<{ routes: ReadonlyMap<string, ArtifactFileSnapshot>; assets: ReadonlyMap<string, ArtifactFileSnapshot> }>;

function failure(code: PublicUiFailure["code"]): PublicUiResult<never> {
  const message: Record<PublicUiFailure["code"], string> = {
    PUBLIC_UI_INVALID_INPUT: "請提供有效的 immutable artifact 根目錄、digest、子路徑與本機連接埠。",
    PUBLIC_UI_ARTIFACT_INVALID: "Public UI 只能服務經驗證的 immutable artifact。",
    PUBLIC_UI_SERVER_START_FAILED: "本機 Public UI listener 無法啟動。",
  };
  return { ok: false, error: { code, owner: "PublicUi", subjectIds: [], remediation: { kind: "message", message: message[code] } } };
}

function validBasePath(value: unknown): value is string { return typeof value === "string" && /^\/(?:[a-z0-9][a-z0-9_-]*\/)*$/u.test(value); }
function validPort(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 65_535; }
function contentType(file: string): string { if (file.endsWith(".html")) return "text/html; charset=utf-8"; if (file.endsWith(".css")) return "text/css; charset=utf-8"; if (file.endsWith(".js")) return "text/javascript; charset=utf-8"; if (file.endsWith(".json")) return "application/json; charset=utf-8"; if (file.endsWith(".svg")) return "image/svg+xml"; if (file.endsWith(".png")) return "image/png"; if (file.endsWith(".webp")) return "image/webp"; return "application/octet-stream"; }

function respond(response: ServerResponse, status: number, body: string, headers: Readonly<Record<string, string>> = {}): void { response.writeHead(status, { ...ERROR_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...headers }); response.end(body); }
function rawPath(requestUrl: string | undefined): string | undefined { if (requestUrl === undefined || !requestUrl.startsWith("/") || requestUrl.startsWith("//")) return undefined; const pathname = requestUrl.split(/[?#]/u, 1)[0] ?? ""; return pathname.includes("%") || pathname.includes("\\") || pathname.includes("//") || pathname.includes("..") ? undefined : pathname; }

function routeFor(basePath: string, pathname: string): string | undefined {
  if (pathname === basePath) return "/";
  if (!pathname.startsWith(basePath) || !pathname.endsWith("/")) return undefined;
  const relative = pathname.slice(basePath.length);
  return relative.length === 0 ? "/" : `/${relative.slice(0, -1)}`;
}

function serve(request: IncomingMessage, response: ServerResponse, input: Readonly<{ basePath: string; snapshot: Snapshot }>): void {
  if (request.method !== "GET" && request.method !== "HEAD") return respond(response, 405, "Method Not Allowed\n", { Allow: "GET, HEAD" });
  const pathname = rawPath(request.url);
  if (pathname === undefined || !pathname.startsWith(input.basePath)) return respond(response, 404, "Not Found\n");
  const route = routeFor(input.basePath, pathname);
  const asset = route === undefined ? (() => { const relative = pathname.slice(input.basePath.length); return isArtifactFilePath(relative) ? input.snapshot.assets.get(relative) : undefined; })() : undefined;
  const file = route === undefined ? asset : input.snapshot.routes.get(route);
  if (file === undefined) return respond(response, 404, "Not Found\n");
  const etag = `"${file.digest}"`;
  if (request.headers["if-none-match"] === etag) { response.writeHead(304, { ...SUCCESS_HEADERS, ETag: etag }); response.end(); return; }
  response.writeHead(200, { ...SUCCESS_HEADERS, "Content-Type": contentType(file.path), "Content-Length": file.bytes.byteLength, ETag: etag });
  response.end(request.method === "HEAD" ? undefined : file.bytes);
}

export async function startPublicUi(input: StartPublicUiInput): Promise<PublicUiResult<RunningPublicUi>> {
  if (input === null || typeof input !== "object" || typeof input.artifactsRoot !== "string" || !path.isAbsolute(input.artifactsRoot) || !validBasePath(input.basePath) || (input.port !== undefined && !validPort(input.port))) return failure("PUBLIC_UI_INVALID_INPUT");
  const delivery = createPublicDelivery({ artifactsRoot: input.artifactsRoot });
  if (!delivery.ok) return failure("PUBLIC_UI_ARTIFACT_INVALID");
  const artifact = delivery.value.loadVerifiedArtifact({ artifactDigest: input.artifactDigest });
  if (!artifact.ok) return failure("PUBLIC_UI_ARTIFACT_INVALID");
  const files = new Map(artifact.value.files.map((file) => [file.path, file]));
  const routes = new Map(artifact.value.manifest.routes.map((route) => [route.route, files.get(route.filePath)]).filter((item): item is [string, ArtifactFileSnapshot] => item[1] !== undefined));
  if (routes.size !== artifact.value.manifest.routes.length) return failure("PUBLIC_UI_ARTIFACT_INVALID");
  const pageFiles = new Set(artifact.value.manifest.routes.map((route) => route.filePath));
  const assets = new Map(artifact.value.files.filter((file) => !pageFiles.has(file.path)).map((file) => [file.path, file]));
  const server = createServer((request, response) => serve(request, response, { basePath: input.basePath, snapshot: { routes, assets } }));
  const listening = Promise.withResolvers<boolean>();
  server.once("error", () => listening.resolve(false));
  server.listen(input.port ?? 43_128, HOST, () => listening.resolve(true));
  if (!(await listening.promise)) { server.close(); return failure("PUBLIC_UI_SERVER_START_FAILED"); }
  const address = server.address();
  if (address === null || typeof address === "string") { server.close(); return failure("PUBLIC_UI_SERVER_START_FAILED"); }
  return { ok: true, value: Object.freeze({ origin: `http://${HOST}:${(address as AddressInfo).port}`, basePath: input.basePath, close: () => close(server) }) };
}

function close(server: Server): Promise<void> { const closed = Promise.withResolvers<void>(); server.close((error) => error === undefined || (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ERR_SERVER_NOT_RUNNING") ? closed.resolve() : closed.reject(error)); return closed.promise; }
