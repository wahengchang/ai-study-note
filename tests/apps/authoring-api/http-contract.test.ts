import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import { createLocalAuthoringClient, createLocalAuthoringCredentialAuthority, startAuthoringApi } from "../../../apps/authoring-api/index.js";
import type { AuthoringApiLogEvent, AuthoringCredentialAuthority } from "../../../apps/authoring-api/index.js";

const origin = "http://127.0.0.1:43127";
const authority = "127.0.0.1:43127";
type Headers = Readonly<Record<string, string | readonly string[]>>;
type RawResponse = Readonly<{ status: number; body: string; headers: Readonly<Record<string, string | readonly string[] | undefined>> }>;

function send(method: string, pathname: string, headers: Headers, body?: string): Promise<RawResponse> {
  const deferred = Promise.withResolvers<RawResponse>();
  const request = nodeRequest({ host: "127.0.0.1", port: 43127, path: pathname, method, headers: headers as Record<string, string | string[]> }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => deferred.resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: response.headers }));
  });
  request.on("error", deferred.reject);
  request.end(body);
  return deferred.promise;
}
function post(pathname: string, headers: Headers, body: string): Promise<RawResponse> { return send("POST", pathname, headers, body); }
function saveBody(revisionId: string, route: string): string {
  return JSON.stringify({ contract: "save-revision-request/v1", revisionId, operationId: `operation-${revisionId}`, schemaIdentity: { schemaId: "note", version: 1 }, content: { title: revisionId }, route, assetVersions: [] });
}
function failureCode(response: RawResponse): string { return (JSON.parse(response.body) as { code: string }).code; }
/** contract §7：每個 response 都必須帶四個固定 security header，且不得回任何 CORS header。 */
function assertResponseHeaders(response: RawResponse, label: string): void {
  assert.equal(response.headers["cache-control"], "no-store, no-cache", `${label} cache-control`);
  assert.equal(response.headers.pragma, "no-cache", `${label} pragma`);
  assert.equal(response.headers["x-content-type-options"], "nosniff", `${label} nosniff`);
  assert.equal(response.headers["referrer-policy"], "no-referrer", `${label} referrer-policy`);
  assert.equal(Object.keys(response.headers).some((name) => name.startsWith("access-control-") || name === "location"), false, `${label} 不得回 CORS header 或 redirect`);
}

function shippedSaveRevision(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<Readonly<{ code: number | null; stdout: string; stderr: string }>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "apps/authoring-api/save-revision-cli.ts", ...args], { cwd: process.cwd(), env: environment });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

type Harness = Readonly<{ directory: string; persistence: PersistenceStore; credentials: AuthoringCredentialAuthority; apiKey: string; log: readonly AuthoringApiLogEvent[]; digest(): string }>;

async function withAuthoringApi(run: (harness: Harness) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-http-"));
  let close: (() => Promise<void>) | undefined; let closePersistence: (() => void) | undefined;
  try {
    const databasePath = path.join(directory, "cms.sqlite"); const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const persistence = openPersistence({ databasePath }); if (!persistence.ok) throw new Error(persistence.error.code); closePersistence = () => persistence.value.close();
    const schema = canonicalJsonBytes({ type: "object" }); if (!schema.ok) throw new Error(schema.error.code);
    assert.equal(persistence.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    const pluginHost = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }) }); if (!pluginHost.ok) throw new Error(pluginHost.error.code);
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); if (!objects.ok) throw new Error(objects.error.code);
    const media = startDataMedia({ persistence: persistence.value, objectStore: objects.value }); if (!media.ok) throw new Error(media.error.code);
    const credentials = createLocalAuthoringCredentialAuthority({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") });
    assert.equal((await credentials.transition("provision")).ok, true);
    const apiKey = JSON.parse(readFileSync(path.join(directory, "config", "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string;
    const application = createDomainApplication({ persistence: persistence.value, siteDefinition: createSiteDefinition({ persistence: persistence.value }), dataMedia: media.value, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: pluginHost.value });
    const log: AuthoringApiLogEvent[] = [];
    const started = await startAuthoringApi({ domainApplication: application, credentialAuthority: credentials, logger: (event) => log.push(event) });
    if (!started.ok) throw new Error(`${started.error.code}（127.0.0.1:43127 是否已被佔用？）`);
    close = started.value.close;
    const digest = (): string => { const state = persistence.value.canonicalState(); if (!state.ok) throw new Error(state.error.code); return state.value.digest; };
    await run({ directory, persistence: persistence.value, credentials, apiKey, log, digest });
  } finally { if (close !== undefined) await close(); closePersistence?.(); rmSync(directory, { recursive: true, force: true }); }
}

test("actual listener proves current credential and saves a revision", async () => {
  await withAuthoringApi(async ({ apiKey }) => {
    const proofNonce = "a".repeat(43);
    const proof = await fetch(`${origin}/_local/server-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: 1, nonce: proofNonce }) });
    assert.equal(proof.status, 200);
    const proofBody = await proof.json() as { mac: string };
    assert.equal(proofBody.mac, createHmac("sha256", apiKey).update(`authoring-server-proof/v1\0${origin}\0${1}\0${proofNonce}`).digest("base64url"));

    const saved = await post("/v1/entries/entry/revisions", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority }, saveBody("revision-1", "/saved"));
    assert.equal(saved.status, 200);
    const body = JSON.parse(saved.body) as { contract: string; entryId: string; revision: { revisionId: string }; pointer: { currentRevisionId: string } };
    assert.equal(body.contract, "save-revision-success/v1"); assert.equal(body.entryId, "entry");
    assert.equal(body.revision.revisionId, "revision-1"); assert.equal(body.pointer.currentRevisionId, "revision-1");
    assertResponseHeaders(saved, "save success");
  });
});

test("same client connection completes server proof before authenticated SaveRevision", async () => {
  await withAuthoringApi(async ({ directory }) => {
    const result = await createLocalAuthoringClient({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") }).saveRevision({
      entryId: "entry",
      request: JSON.parse(saveBody("client-revision", "/client")),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.pointer.currentRevisionId, "client-revision");
  });
});

test("shipped cms:save-revision command saves through the actual listener", async () => {
  await withAuthoringApi(async ({ directory, persistence }) => {
    const input = path.join(directory, "request.json");
    writeFileSync(input, saveBody("command-revision", "/command"));
    const command = await shippedSaveRevision(["--entry-id", "entry", "--input", input], { ...process.env, HOME: directory, XDG_CONFIG_HOME: path.join(directory, "config") });
    assert.equal(command.code, 0); assert.equal(command.stdout, "AUTHORING_SAVE_REVISION_OK\n"); assert.equal(command.stderr, "");
    const pointer = persistence.getEntryPointers("entry");
    assert.deepEqual(pointer, { ok: true, value: { entryId: "entry", currentRevisionId: "command-revision" } });
  });
});

test("every rejected transport shape fails closed with its contract status and mutates nothing", async () => {
  await withAuthoringApi(async ({ apiKey, log, digest }) => {
    const json = { "Content-Type": "application/json" } as const;
    const bearer = { ...json, Authorization: `Bearer ${apiKey}` } as const;
    const oversized = JSON.stringify({ contract: "save-revision-request/v1", content: "x".repeat(4_194_305) });
    const cases: readonly Readonly<{ name: string; method?: string; path?: string; headers: Headers; body?: string; status: number; code: string }>[] = [
      { name: "missing key", headers: json, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_REQUIRED" },
      { name: "malformed scheme", headers: { ...json, Authorization: "Basic abc" }, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_MALFORMED" },
      { name: "malformed key shape", headers: { ...json, Authorization: "Bearer asn_v1_short" }, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_MALFORMED" },
      { name: "duplicate key", headers: { ...json, Authorization: [`Bearer ${apiKey}`, `Bearer ${apiKey}`] }, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_DUPLICATE" },
      { name: "invalid key", headers: { ...json, Authorization: `Bearer asn_v1_${"B".repeat(43)}` }, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_INVALID" },
      { name: "cookie transport", headers: { ...bearer, Cookie: "session=1" }, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      { name: "query transport", path: "/v1/entries/entry/revisions?key=1", headers: bearer, body: saveBody("r", "/a"), status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      { name: "evil host", headers: { ...bearer, Host: "localhost:43127" }, body: saveBody("r", "/a"), status: 421, code: "MISDIRECTED_REQUEST" },
      { name: "x-forwarded-for", headers: { ...bearer, "X-Forwarded-For": "203.0.113.1" }, body: saveBody("r", "/a"), status: 421, code: "MISDIRECTED_REQUEST" },
      { name: "forwarded", headers: { ...bearer, Forwarded: "for=203.0.113.1" }, body: saveBody("r", "/a"), status: 421, code: "MISDIRECTED_REQUEST" },
      { name: "evil origin", headers: { ...bearer, Origin: "http://evil.test", "Sec-Fetch-Site": "cross-site" }, body: saveBody("r", "/a"), status: 403, code: "ORIGIN_FORBIDDEN" },
      { name: "exact origin without same-origin fetch metadata", headers: { ...bearer, Origin: origin, "Sec-Fetch-Site": "cross-site" }, body: saveBody("r", "/a"), status: 403, code: "ORIGIN_FORBIDDEN" },
      { name: "OPTIONS", method: "OPTIONS", headers: bearer, status: 405, code: "METHOD_NOT_ALLOWED" },
      { name: "GET", method: "GET", headers: bearer, status: 405, code: "METHOD_NOT_ALLOWED" },
      { name: "unsupported media type", headers: { ...bearer, "Content-Type": "text/plain" }, body: saveBody("r", "/a"), status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
      { name: "oversized body", headers: bearer, body: oversized, status: 400, code: "REQUEST_BODY_TOO_LARGE" },
      { name: "invalid json", headers: bearer, body: "{", status: 400, code: "INVALID_REQUEST_BODY" },
      { name: "percent-encoded entryId", path: "/v1/entries/a%2Fb/revisions", headers: bearer, body: saveBody("r", "/a"), status: 404, code: "ROUTE_NOT_FOUND" },
      { name: "unlisted /_local route", path: "/_local/browser-tickets", headers: bearer, body: "{}", status: 404, code: "ROUTE_NOT_FOUND" },
      { name: "server proof rejects cookie", path: "/_local/server-proof", headers: { ...json, Cookie: "session=1" }, body: "{}", status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      { name: "server proof rejects query", path: "/_local/server-proof?key=1", headers: json, body: "{}", status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
    ];

    const before = digest();
    for (const item of cases) {
      const response = await send(item.method ?? "POST", item.path ?? "/v1/entries/entry/revisions", item.headers, item.body);
      assert.equal(response.status, item.status, `${item.name} status`);
      assert.equal(failureCode(response), item.code, `${item.name} code`);
      assert.equal(response.body.includes("asn_"), false, `${item.name} 不得回吐 credential 形狀字串`);
      assertResponseHeaders(response, item.name);
    }
    assert.equal(digest(), before, "被拒絕的 request 不得執行任何 canonical mutation");
    assert.equal(log.length, cases.length);
    assert.deepEqual(log.map((event) => event.status), cases.map((item) => item.status));
    assert.equal(log.every((event) => event.stableEventCode === "AUTHORING_REQUEST_REJECTED"), true);
    assert.equal(JSON.stringify(log).includes("asn_"), false);
    assert.equal(log.every((event) => Object.keys(event).sort().join(",") === "method,requestId,routeTemplate,stableEventCode,status"), true);
  });
});

test("credential rotation and revoke invalidate the previous key on the actual listener", async () => {
  await withAuthoringApi(async ({ apiKey, credentials, digest }) => {
    const before = digest();
    const bearer = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } as const;

    assert.deepEqual(await credentials.transition("rotate"), { ok: true, value: { generation: 2, status: "active" } });
    const afterRotate = await post("/v1/entries/entry/revisions", bearer, saveBody("r", "/a"));
    assert.equal(afterRotate.status, 401); assert.equal(failureCode(afterRotate), "AUTHORIZATION_INVALID");
    const staleGeneration = await post("/_local/server-proof", { "Content-Type": "application/json" }, JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: 1, nonce: "a".repeat(43) }));
    assert.equal(staleGeneration.status, 401); assert.equal(failureCode(staleGeneration), "SERVER_PROOF_GENERATION_MISMATCH");

    assert.deepEqual(await credentials.transition("revoke"), { ok: true, value: { generation: 3, status: "revoked" } });
    const afterRevoke = await post("/v1/entries/entry/revisions", { "Content-Type": "application/json", Authorization: `Bearer asn_v1_${"C".repeat(43)}` }, saveBody("r", "/a"));
    assert.equal(afterRevoke.status, 401); assert.equal(failureCode(afterRevoke), "AUTHORIZATION_REVOKED");
    const revokedProof = await post("/_local/server-proof", { "Content-Type": "application/json" }, JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: 3, nonce: "a".repeat(43) }));
    assert.equal(revokedProof.status, 401); assert.equal(failureCode(revokedProof), "AUTHORIZATION_REVOKED");

    assert.equal(digest(), before, "rotate／revoke 之後的 401 不得執行任何 canonical mutation");
  });
});

test("no response or log echoes a credential-shaped string", async () => {
  await withAuthoringApi(async ({ apiKey, log }) => {
    const bearer = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } as const;
    const success = await post("/v1/entries/canary/revisions", bearer, saveBody("revision-canary", `/${apiKey}`));
    assert.equal(success.status, 200);
    assert.equal(success.body.includes(apiKey), false, "success DTO 不得回吐 credential 形狀字串");
    assert.equal(success.body.includes("asn_v1_"), false);
    assert.equal(success.body.includes("[REDACTED]"), true);

    const conflict = await post("/v1/entries/other/revisions", bearer, saveBody("revision-canary", `/${apiKey}`));
    assert.equal(conflict.body.includes("asn_v1_"), false, "error DTO 不得回吐 credential 形狀字串");
    assert.equal(JSON.stringify(log).includes("asn_"), false);
  });
});

type RogueRequest = Readonly<{ method: string; url: string; authorization: string | undefined; body: string }>;
type RogueReply = Readonly<{ status: number; headers?: Readonly<Record<string, string>>; body: string }>;

/** 佔用 fixed origin 的假 listener：用來證明 client 在 proof 通過前不會送出 Bearer。 */
async function withRogueListener(reply: (received: RogueRequest) => RogueReply, run: (seen: readonly RogueRequest[]) => Promise<void>): Promise<void> {
  const seen: RogueRequest[] = [];
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const received: RogueRequest = { method: incoming.method ?? "", url: incoming.url ?? "", authorization: incoming.headers.authorization, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(received);
      const answer = reply(received);
      outgoing.writeHead(answer.status, { "Content-Type": "application/json", ...answer.headers });
      outgoing.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(43127, "127.0.0.1", resolve));
  try { await run(seen); } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

function credentialLocation(directory: string): Readonly<{ homeDirectory: string; xdgConfigHome: string }> {
  return { homeDirectory: directory, xdgConfigHome: path.join(directory, "config") };
}
async function provisionedDirectory(): Promise<Readonly<{ directory: string; apiKey: string }>> {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-client-"));
  assert.equal((await createLocalAuthoringCredentialAuthority(credentialLocation(directory)).transition("provision")).ok, true);
  return { directory, apiKey: JSON.parse(readFileSync(path.join(directory, "config", "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string };
}

test("a rogue listener on the fixed origin never receives the Bearer credential", async () => {
  const { directory } = await provisionedDirectory();
  try {
    const forged = { contract: "authoring-server-proof/v1", generation: 1, nonce: "a".repeat(43), mac: "A".repeat(43) };
    await withRogueListener((received) => received.url === "/_local/server-proof"
      ? { status: 200, body: JSON.stringify({ ...forged, nonce: (JSON.parse(received.body) as { nonce: string }).nonce }) }
      : { status: 200, body: "{}" }, async (seen) => {
      const result = await createLocalAuthoringClient(credentialLocation(directory)).saveRevision({ entryId: "entry", request: JSON.parse(saveBody("rogue-revision", "/rogue")) });
      assert.deepEqual(result, { ok: false, error: { code: "AUTHORING_SERVER_PROOF_INVALID" } });
      assert.deepEqual(seen.map((item) => item.url), ["/_local/server-proof"], "偽造 proof 之後不得再送出 SaveRevision request");
      assert.equal(seen.every((item) => item.authorization === undefined), true, "任何 request 都不得帶 Authorization header");
      assert.equal(JSON.stringify(seen).includes("asn_"), false, "rogue listener 不得看到 credential 形狀字串");
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a replaced connection between server proof and SaveRevision fails closed without the Bearer", async () => {
  const { directory, apiKey } = await provisionedDirectory();
  try {
    await withRogueListener((received) => {
      if (received.url !== "/_local/server-proof") return { status: 200, body: "{}" };
      const challenge = JSON.parse(received.body) as { generation: number; nonce: string };
      const mac = createHmac("sha256", apiKey).update(`authoring-server-proof/v1\0${origin}\0${challenge.generation}\0${challenge.nonce}`).digest("base64url");
      // proof 本身有效，但 listener 立刻關掉 connection：SaveRevision 只能落在新 socket 上。
      return { status: 200, headers: { Connection: "close" }, body: JSON.stringify({ contract: "authoring-server-proof/v1", generation: challenge.generation, nonce: challenge.nonce, mac }) };
    }, async (seen) => {
      const result = await createLocalAuthoringClient(credentialLocation(directory)).saveRevision({ entryId: "entry", request: JSON.parse(saveBody("changed-revision", "/changed")) });
      assert.deepEqual(result, { ok: false, error: { code: "AUTHORING_CONNECTION_CHANGED" } });
      assert.deepEqual(seen.map((item) => item.url), ["/_local/server-proof"]);
      assert.equal(seen.every((item) => item.authorization === undefined), true);
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("the client rejects an in-process request whose serialized body the listener would reject", async () => {
  const { directory } = await provisionedDirectory();
  try {
    const request = { ...(JSON.parse(saveBody("undefined-content", "/undefined")) as Record<string, unknown>), content: undefined };
    const result = await createLocalAuthoringClient(credentialLocation(directory)).saveRevision({ entryId: "entry", request: request as never });
    assert.deepEqual(result, { ok: false, error: { code: "INVALID_CLIENT_REQUEST" } }, "JSON.stringify 會丟掉 undefined content，必須在送出前擋下");
    assert.deepEqual(await createLocalAuthoringClient(credentialLocation(directory)).saveRevision({ entryId: "a/b", request: JSON.parse(saveBody("r", "/a")) }), { ok: false, error: { code: "INVALID_CLIENT_REQUEST" } });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
