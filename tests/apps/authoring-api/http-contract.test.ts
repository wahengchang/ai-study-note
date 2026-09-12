import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAuthoringReadFacade, createContentTypeAdministration, createContentTypeMigrationAdministration, createDomainApplication, createPersistencePluginActivationStatePort, createPersistencePluginSettingsStatePort } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createPublishedContentReadModel, getSiteContentSchemaEvidence } from "../../../core/content/index.js";
import { createFixedRootReleaseDelivery, createPublicDelivery } from "../../../core/delivery/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createProjectionPreview } from "../../../core/projection/index.js";
import { createSiteDefinition, type SiteDefinition } from "../../../core/site-definition/index.js";
import { createThemeHost, type ThemeIdentity } from "../../../core/theme-host/index.js";
import { createTaxonomy } from "../../../core/taxonomy/index.js";
import { authoringErrorStatuses, createAjvSchemaValidator, createAuthoringReleaseTransport, createLocalAuthoringClient, createLocalAuthoringCredentialAuthority, mediaArchiveBlockedErrorSchema, mediaRestoreRequiredErrorSchema, publishRevisionSuccessSchema, restoreRevisionSuccessSchema, startAuthoringApi, taxonomyCommandResultSchema, taxonomySnapshotSchema } from "../../../apps/authoring-api/index.js";
import type { AuthoringApiLogEvent, AuthoringCredentialAuthority, CmsAssets } from "../../../apps/authoring-api/index.js";

const origin = "http://127.0.0.1:43127";
const authority = "127.0.0.1:43127";
type Headers = Readonly<Record<string, string | readonly string[]>>;
type RawResponse = Readonly<{ status: number; body: string; headers: Readonly<Record<string, string | readonly string[] | undefined>> }>;
const cmsAssets: CmsAssets = {
  bootstrapPath: "assets/bootstrap-test.js",
  read(pathname) {
    return pathname === "/cms/assets/bootstrap-test.js" ? { bytes: new TextEncoder().encode("export {};"), contentType: "text/javascript; charset=utf-8", destination: "script" } : undefined;
  },
};
function installTheme(themesRoot: string): ThemeIdentity {
  const directory = path.join(themesRoot, "safe-theme");
  const runtime = new TextEncoder().encode("export default {};\n");
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(path.join(directory, "runtime.mjs"), runtime, { mode: 0o600 });
  const manifest = canonicalJsonBytes({ contract: "theme-manifest/v1", id: "safe-theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(runtime) }, resources: [] });
  if (!manifest.ok) throw new Error(manifest.error.code);
  writeFileSync(path.join(directory, "theme.json"), manifest.value, { mode: 0o600 });
  return { id: "safe-theme", version: "1.0.0", manifestHash: sha256Digest(manifest.value) };
}


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
function saveBody(revisionId: string, route: string, expectedCurrentRevisionId: string | null = null): string {
  return JSON.stringify({ contract: "save-revision-request/v1", revisionId, operationId: `operation-${revisionId}`, expectedCurrentRevisionId, schemaIdentity: { schemaId: "note", version: 1 }, content: { title: revisionId }, route, assetVersions: [], taxonomyTerms: [] });
}
function publishBody(expectedCurrentRevisionId: string, operationId = `publish-${expectedCurrentRevisionId}`): string {
  return JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId, operationId });
}
function restoreBody(sourceRevisionId: string, newRevisionId: string, operationId = `restore-${newRevisionId}`): string {
  return JSON.stringify({ contract: "restore-revision-request/v1", sourceRevisionId, newRevisionId, operationId });
}

function releaseOutput() {
  const bytes = new TextEncoder().encode("<main>release</main>\n");
  const provenance = { publishedRevisionIds: [], routeGraphDigest: sha256Digest(new TextEncoder().encode("routes")), mediaSelectionDigest: sha256Digest(new TextEncoder().encode("media")), theme: { id: "theme", version: "1.0.0", manifestHash: sha256Digest(new TextEncoder().encode("theme")) }, plugins: [], seo: { count: 0, digest: sha256Digest(new TextEncoder().encode("seo")) } };
  const routes = [{ route: "/release", filePath: "release/index.html" }];
  const files = [{ path: "release/index.html", bytes, digest: sha256Digest(bytes) }];
  const evidence = canonicalJsonBytes({ provenance, routes, files: files.map((file) => ({ path: file.path, digest: file.digest })) });
  if (!evidence.ok) throw new Error(evidence.error.code);
  return { contract: "renderer-output/v1" as const, rendererInputDigest: sha256Digest(new TextEncoder().encode("input")), provenance, routes, files, outputDigest: sha256Digest(evidence.value) };
}

function failureCode(response: RawResponse): string {
  const value: unknown = JSON.parse(response.body);
  if (value === null || typeof value !== "object" || !("code" in value) || typeof value.code !== "string") throw new Error("authoring failure response lacks a code");
  return value.code;
}
function failureOwner(response: RawResponse): string {
  const value: unknown = JSON.parse(response.body);
  if (value === null || typeof value !== "object" || !("owner" in value) || typeof value.owner !== "string") throw new Error("authoring failure response lacks an owner");
  return value.owner;
}
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

type Harness = Readonly<{ directory: string; persistence: PersistenceStore; siteDefinition: SiteDefinition; credentials: AuthoringCredentialAuthority; apiKey: string; log: readonly AuthoringApiLogEvent[]; digest(): string; publishCalls(): number; releaseProjectionCalls(): number; seedReleaseArtifact(): string }>;

async function withAuthoringApi(run: (harness: Harness) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-http-"));
  let close: (() => Promise<void>) | undefined; let closePersistence: (() => void) | undefined;
  try {
    const databasePath = path.join(directory, "cms.sqlite"); const installedRoot = path.join(directory, "installed"); const themesRoot = path.join(directory, "themes"); mkdirSync(installedRoot); mkdirSync(themesRoot);
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const persistence = openPersistence({ databasePath }); if (!persistence.ok) throw new Error(persistence.error.code); closePersistence = () => persistence.value.close();
    const schema = canonicalJsonBytes({ type: "object" }); if (!schema.ok) throw new Error(schema.error.code);
    assert.equal(persistence.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    const contentSchema = getSiteContentSchemaEvidence();
    assert.equal(persistence.value.registerSchemaVersion({ identity: contentSchema.identity, schemaBytes: contentSchema.schemaBytes, schemaDigest: contentSchema.schemaDigest }).ok, true);
    const pluginHost = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }), settingsState: createPersistencePluginSettingsStatePort({ persistence: persistence.value }) }); if (!pluginHost.ok) throw new Error(pluginHost.error.code);
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); if (!objects.ok) throw new Error(objects.error.code);
    const media = startDataMedia({ persistence: persistence.value, objectStore: objects.value }); if (!media.ok) throw new Error(media.error.code);
    const credentials = createLocalAuthoringCredentialAuthority({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") });
    assert.equal((await credentials.transition("provision")).ok, true);
    const apiKey = JSON.parse(readFileSync(path.join(directory, "config", "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string;
    const siteDefinition = createSiteDefinition({ persistence: persistence.value });
    const application = createDomainApplication({ persistence: persistence.value, siteDefinition, dataMedia: media.value, schemaValidator: createAjvSchemaValidator(), pluginHost: pluginHost.value, taxonomy: createTaxonomy({ persistence: persistence.value }) });
    let published = 0;
    const instrumentedApplication = { ...application, publishRevision: async (...args: Parameters<typeof application.publishRevision>) => {
      published += 1;
      return application.publishRevision(args[0]);
    } };
    const log: AuthoringApiLogEvent[] = [];
    const contentReadModel = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] }); if (!contentReadModel.ok) throw new Error(contentReadModel.error.code);
    const themeIdentity = installTheme(themesRoot);
    const themeHost = await createThemeHost({
      repositoryRoot: process.cwd(),
      installedThemesRoot: themesRoot,
      activationState: {
        async read() {
          const state = persistence.value.readThemeActivationState();
          if (!state.ok) throw new Error(state.error.code);
          return Object.freeze({ bytes: new Uint8Array(state.value.bytes), digest: state.value.digest });
        },
        async compareAndReplace(input) {
          const replaced = persistence.value.compareAndReplaceThemeActivationState({
            expectedDigest: input.expectedDigest,
            next: Object.freeze({ bytes: new Uint8Array(input.next.bytes), digest: input.next.digest }),
          });
          if (!replaced.ok) throw new Error(replaced.error.code);
          return replaced.value;
        },
      },
    }); if (!themeHost.ok) throw new Error(themeHost.error.code);
    const activation = await themeHost.value.getActivationSnapshot(); if (!activation.ok) throw new Error(activation.error.code);
    const activated = await themeHost.value.activate({ identity: themeIdentity, expectedActivationStateDigest: activation.value.stateDigest }); if (!activated.ok) throw new Error(activated.error.code);
    const projectionPreview = createProjectionPreview({ persistence: persistence.value, siteDefinition, dataMedia: media.value, contentReadModel: contentReadModel.value, themeHost: themeHost.value, pluginHost: pluginHost.value });
    let releaseProjections = 0;
    const releaseProjection = { ...projectionPreview, async produceRendererInput(request: Record<string, never>) { releaseProjections += 1; return projectionPreview.produceRendererInput(request); } };
    const authoringReadFacade = createAuthoringReadFacade({ persistence: persistence.value, siteDefinition, dataMedia: media.value, contentReadModel: contentReadModel.value });
    const contentTypeAdministration = createContentTypeAdministration({ persistence: persistence.value, validator: createAjvSchemaValidator() });
    const delivery = createPublicDelivery({ artifactsRoot: path.join(directory, "artifacts") }); if (!delivery.ok) throw new Error(delivery.error.code);
    const releaseDelivery = createFixedRootReleaseDelivery({ artifactsRoot: path.join(directory, "artifacts"), releaseRoot: path.join(directory, "release") }); if (!releaseDelivery.ok) throw new Error(releaseDelivery.error.code);
    const releaseTransport = createAuthoringReleaseTransport({ projection: releaseProjection, delivery: delivery.value, releaseDelivery: releaseDelivery.value });
    const contentTypeMigrationAdministration = createContentTypeMigrationAdministration({ persistence: persistence.value, validator: createAjvSchemaValidator() });
    const started = await startAuthoringApi({ domainApplication: instrumentedApplication, credentialAuthority: credentials, cmsAssets, logger: (event) => log.push(event), authoringReadFacade, contentTypeAdministration, contentTypeMigrationAdministration, projectionPreview, releaseTransport });
    if (!started.ok) throw new Error(`${started.error.code}（127.0.0.1:43127 是否已被佔用？）`);
    close = started.value.close;
    const digest = (): string => { const state = persistence.value.canonicalState(); if (!state.ok) throw new Error(state.error.code); return state.value.digest; };
    await run({ directory, persistence: persistence.value, siteDefinition, credentials, apiKey, log, digest, publishCalls: () => published, releaseProjectionCalls: () => releaseProjections, seedReleaseArtifact: () => { const seeded = delivery.value.deliver(releaseOutput()); if (!seeded.ok) throw new Error(seeded.error.code); return seeded.value.artifactDigest; } });
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

test("actual listener release transport is fixed-root, receipt-only, and never publishes or rebuilds redelivery", async () => {
  await withAuthoringApi(async ({ apiKey, digest, publishCalls, releaseProjectionCalls, seedReleaseArtifact }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority };
    const unauthenticated = [
      ["/v1/release/diagnose", { contract: "release-diagnose-request/v1" }],
      ["/v1/release/build", { contract: "release-build-request/v1" }],
      ["/v1/release", { contract: "release-request/v1", artifactDigest: sha256Digest(new TextEncoder().encode("artifact")) }],
      ["/v1/redeliver", { contract: "redeliver-request/v1", artifactDigest: sha256Digest(new TextEncoder().encode("artifact")) }],
    ] as const;
    for (const [pathname, body] of unauthenticated) {
      const rejected = await post(pathname, { "Content-Type": "application/json", Host: authority }, JSON.stringify(body));
      assert.equal(rejected.status, 401, rejected.body);
    }
    assert.equal(releaseProjectionCalls(), 0);
    const before = digest();
    const diagnosis = await post("/v1/release/diagnose", headers, JSON.stringify({ contract: "release-diagnose-request/v1" }));
    assert.equal(diagnosis.status, 200, diagnosis.body);
    assert.equal(JSON.parse(diagnosis.body).contract, "release-diagnosis/v1");
    const blocked = await post("/v1/release/build", headers, JSON.stringify({ contract: "release-build-request/v1" }));
    assert.equal(blocked.status, 422, blocked.body);
    assert.equal(publishCalls(), 0);
    const projectionsBeforeRelease = releaseProjectionCalls();
    const artifactDigest = seedReleaseArtifact();
    const rejectedDestination = await post("/v1/release", headers, JSON.stringify({ contract: "release-request/v1", artifactDigest, destination: "/tmp/forbidden" }));
    assert.equal(rejectedDestination.status, 400, rejectedDestination.body);
    const released = await post("/v1/release", headers, JSON.stringify({ contract: "release-request/v1", artifactDigest }));
    assert.equal(released.status, 200, released.body);
    const receipt = JSON.parse(released.body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(receipt).sort(), ["artifactDigest", "contract", "targetDigest"]);
    assert.equal(receipt.contract, "release-receipt/v1");
    assert.equal(typeof receipt.targetDigest, "string");
    assert.equal(released.body.includes("/release"), false);
    const redelivered = await post("/v1/redeliver", headers, JSON.stringify({ contract: "redeliver-request/v1", artifactDigest }));
    assert.equal(redelivered.status, 200, redelivered.body);
    assert.deepEqual(JSON.parse(redelivered.body), receipt);
    assert.equal(publishCalls(), 0);
    assert.equal(releaseProjectionCalls(), projectionsBeforeRelease);
    assert.equal(digest(), before);
    const unknown = await post("/v1/redeliver", headers, JSON.stringify({ contract: "redeliver-request/v1", artifactDigest: sha256Digest(new TextEncoder().encode("unknown")) }));
    assert.equal(unknown.status, 422, unknown.body);
    assert.equal(publishCalls(), 0);
  });
});

test("actual listener imports and lists a strictly redacted media asset", async () => {
  await withAuthoringApi(async ({ apiKey }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority };
    const imported = await post("/v1/media/import", headers, JSON.stringify({ contract: "media-import-request/v1", importId: "import-media-1", assetId: "asset-1", assetVersionId: "version-1", bytesBase64url: "bWVkaWEgYnl0ZXM", metadata: { mime: "text/plain", secret: "must-not-return" } }));
    assert.equal(imported.status, 200, imported.body);
    assert.equal(imported.body.includes("must-not-return"), false);
    const listed = await send("GET", "/v1/media", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(listed.status, 200, listed.body);
    const catalog = JSON.parse(listed.body) as { contract: string; items: readonly { contract: string; assetId: string; versions: readonly { contract: string; identity: { assetId: string; assetVersionId: string }; evidence: { byteLength: number }; availability: string }[] }[] };
    assert.equal(catalog.contract, "media-catalog/v1");
    assert.deepEqual(catalog.items.map((asset) => ({ contract: asset.contract, assetId: asset.assetId, versions: asset.versions.map((version) => ({ contract: version.contract, assetId: version.identity.assetId, assetVersionId: version.identity.assetVersionId, byteLength: version.evidence.byteLength, availability: version.availability })) })), [{ contract: "media-asset/v1", assetId: "asset-1", versions: [{ contract: "media-asset-version/v1", assetId: "asset-1", assetVersionId: "version-1", byteLength: 11, availability: "ready" }] }]);
    assert.equal(listed.body.includes("must-not-return"), false);
    const saved = await post("/v1/entries/media-entry/revisions", headers, JSON.stringify({ contract: "save-revision-request/v1", revisionId: "media-draft-1", operationId: "save-media-draft-1", expectedCurrentRevisionId: null, schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "media" }, route: "/media", assetVersions: [{ assetId: "asset-1", assetVersionId: "version-1" }], taxonomyTerms: [] }));
    assert.equal(saved.status, 200, saved.body);
    const published = await post("/v1/entries/media-entry/publish", headers, publishBody("media-draft-1", "publish-media-draft-1"));
    assert.equal(published.status, 200, published.body);
    const versioned = await post("/v1/media/asset-1/versions", headers, JSON.stringify({ contract: "media-version-replacement-request/v1", import: { importId: "import-media-2", assetVersionId: "version-2", bytesBase64url: "bmV3IG1lZGlh", metadata: { mime: "text/plain", secret: "must-not-return" } }, replacement: { entryId: "media-entry", revisionId: "media-draft-2", operationId: "replace-media-draft-1", expectedCurrentRevisionId: "media-draft-1", targetAssetVersion: { assetId: "asset-1", assetVersionId: "version-1" } } }));
    assert.equal(versioned.status, 200, versioned.body);
    assert.equal(versioned.body.includes("must-not-return"), false);
    assert.equal(JSON.parse(versioned.body).save.pointer.currentRevisionId, "media-draft-2");
    const detail = await send("GET", "/v1/media/asset-1", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(detail.status, 200, detail.body);
    assert.equal(detail.body.includes("must-not-return"), false);
    const missing = await send("GET", "/v1/media/absent-asset", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(missing.status, 404, missing.body);
    assert.equal(failureCode(missing), "MEDIA_ASSET_NOT_FOUND");
    const blocked = await post("/v1/media/asset-1/archive", headers, JSON.stringify({ contract: "media-archive-request/v1", assetVersionId: "version-1" }));
    assert.equal(blocked.status, 409, blocked.body);
    assert.equal(failureCode(blocked), "MEDIA_ARCHIVE_BLOCKED_PUBLISHED");
    const blockedError = mediaArchiveBlockedErrorSchema.safeParse(JSON.parse(blocked.body));
    assert.equal(blockedError.success, true, blocked.body);
    if (blockedError.success) {
      assert.deepEqual(blockedError.data.archiveImpact.assetVersion, { assetId: "asset-1", assetVersionId: "version-1" });
      assert.deepEqual(blockedError.data.archiveImpact.publishedReferences, [{ entryId: "media-entry", revisionId: "media-draft-1", assetVersion: { assetId: "asset-1", assetVersionId: "version-1" } }]);
    }
    const archived = await post("/v1/media/asset-1/archive", headers, JSON.stringify({ contract: "media-archive-request/v1", assetVersionId: "version-2" }));
    assert.equal(archived.status, 200, archived.body);
    assert.equal(JSON.parse(archived.body).asset.versions[1].availability, "archived");
    const restored = await post("/v1/media/asset-1/restore", headers, JSON.stringify({ contract: "media-restore-request/v1", assetVersionId: "version-2" }));
    assert.equal(restored.status, 200, restored.body);
    assert.equal(JSON.parse(restored.body).asset.versions[1].availability, "ready");
  });
});

test("lost media bytes project as missing and only a matching recovery restores them", async () => {
  await withAuthoringApi(async ({ apiKey, directory }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority } as const;
    const read = { Authorization: `Bearer ${apiKey}`, Host: authority } as const;
    const bytes = "bWVkaWEgYnl0ZXM";
    assert.equal((await post("/v1/media/import", headers, JSON.stringify({ contract: "media-import-request/v1", importId: "import-lost-1", assetId: "asset-lost", assetVersionId: "version-1", bytesBase64url: bytes, metadata: { mime: "text/plain" } }))).status, 200);
    for (const name of readdirSync(path.join(directory, "objects", "objects"))) rmSync(path.join(directory, "objects", "objects", name), { force: true });

    const detail = await send("GET", "/v1/media/asset-lost", read);
    assert.equal(detail.status, 200, detail.body);
    const projected = JSON.parse(detail.body) as { asset: { versions: readonly Readonly<{ availability: string; restoreCommand?: Readonly<{ recovery: string }> }>[] } };
    assert.equal(projected.asset.versions[0]?.availability, "missing");
    assert.equal(projected.asset.versions[0]?.restoreCommand?.recovery, "local-bytes-and-metadata");

    const required = await post("/v1/media/asset-lost/restore", headers, JSON.stringify({ contract: "media-restore-request/v1", assetVersionId: "version-1" }));
    assert.equal(required.status, 422, required.body);
    const requiredError = mediaRestoreRequiredErrorSchema.safeParse(JSON.parse(required.body));
    assert.equal(requiredError.success, true, required.body);
    if (requiredError.success) assert.deepEqual(requiredError.data.restoreCommands, [{ contract: "restore-asset-command/v1", command: "RestoreAsset", assetVersion: { assetId: "asset-lost", assetVersionId: "version-1" }, recovery: "local-bytes-and-metadata" }]);

    const mismatched = await post("/v1/media/asset-lost/restore", headers, JSON.stringify({ contract: "media-restore-request/v1", assetVersionId: "version-1", recovery: { bytesBase64url: "b3RoZXIgYnl0ZXM", metadata: { mime: "text/plain" } } }));
    assert.equal(mismatched.status, 422, mismatched.body);
    assert.equal(failureCode(mismatched), "MEDIA_RESTORE_MISMATCH");

    const restored = await post("/v1/media/asset-lost/restore", headers, JSON.stringify({ contract: "media-restore-request/v1", assetVersionId: "version-1", recovery: { bytesBase64url: bytes, metadata: { mime: "text/plain" } } }));
    assert.equal(restored.status, 200, restored.body);
    assert.equal(JSON.parse(restored.body).asset.versions[0].availability, "ready");
  });
});

test("Media bytes routes reject an oversized non-bytes envelope before any command", async () => {
  await withAuthoringApi(async ({ apiKey, digest }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority } as const;
    const before = digest();
    const oversizedMetadata = { mime: "text/plain", note: "n".repeat(70_000) };
    const envelopes: readonly Readonly<{ path: string; body: string }>[] = [
      { path: "/v1/media/import", body: JSON.stringify({ contract: "media-import-request/v1", importId: "import-envelope", assetId: "asset-1", assetVersionId: "version-1", bytesBase64url: "bWVkaWEgYnl0ZXM", metadata: oversizedMetadata }) },
      { path: "/v1/media/asset-1/versions", body: JSON.stringify({ contract: "media-version-replacement-request/v1", import: { importId: "import-envelope", assetVersionId: "version-2", bytesBase64url: "bWVkaWEgYnl0ZXM", metadata: oversizedMetadata }, replacement: { entryId: "entry", revisionId: "revision-2", operationId: "op-2", expectedCurrentRevisionId: "revision-1", targetAssetVersion: { assetId: "asset-1", assetVersionId: "version-1" } } }) },
      { path: "/v1/media/asset-1/restore", body: JSON.stringify({ contract: "media-restore-request/v1", assetVersionId: "version-1", recovery: { bytesBase64url: "bWVkaWEgYnl0ZXM", metadata: oversizedMetadata } }) },
    ];
    for (const item of envelopes) {
      const response = await post(item.path, headers, item.body);
      assert.equal(response.status, 400, `${item.path} envelope bound`);
      assert.equal(failureCode(response), "REQUEST_BODY_TOO_LARGE", `${item.path} envelope bound code`);
      assertResponseHeaders(response, `${item.path} envelope rejection`);
    }
    assert.equal(digest(), before, "envelope rejection performs zero canonical mutation");
  });
});

test("every Media route rejects hostile transport before Media or canonical mutation", async () => {
  await withAuthoringApi(async ({ apiKey, credentials, digest, log }) => {
    const json = { "Content-Type": "application/json" } as const;
    const bearer = { ...json, Authorization: `Bearer ${apiKey}`, Host: authority } as const;
    const routes: readonly Readonly<{ method: "GET" | "POST"; path: string; body?: string }>[] = [
      { method: "GET", path: "/v1/media" },
      { method: "POST", path: "/v1/media/import", body: "{}" },
      { method: "GET", path: "/v1/media/asset-1" },
      { method: "POST", path: "/v1/media/asset-1/versions", body: "{}" },
      { method: "POST", path: "/v1/media/asset-1/archive", body: "{}" },
      { method: "POST", path: "/v1/media/asset-1/restore", body: "{}" },
    ];
    const before = digest();
    for (const route of routes) {
      const hostile: readonly Readonly<{ headers: Headers; path?: string; method?: string; status: number; code: string }>[] = [
        { headers: json, status: 401, code: "AUTHORIZATION_REQUIRED" },
        { headers: { ...json, Authorization: "Basic abc" }, status: 401, code: "AUTHORIZATION_MALFORMED" },
        { headers: { ...json, Authorization: [`Bearer ${apiKey}`, `Bearer ${apiKey}`] }, status: 401, code: "AUTHORIZATION_DUPLICATE" },
        { headers: { ...json, Authorization: `Bearer asn_v1_${"C".repeat(43)}` }, status: 401, code: "AUTHORIZATION_INVALID" },
        { headers: { ...bearer, Cookie: "session=1" }, status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
        { headers: { ...bearer, Host: "localhost:43127" }, status: 421, code: "MISDIRECTED_REQUEST" },
        { headers: { ...bearer, Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }, status: 403, code: "ORIGIN_FORBIDDEN" },
        { headers: bearer, path: `${route.path}?key=1`, status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
        { headers: bearer, method: route.method === "GET" ? "POST" : "GET", status: 405, code: "METHOD_NOT_ALLOWED" },
      ];
      for (const attempt of hostile) {
        const method = attempt.method ?? route.method;
        const response = await send(method, attempt.path ?? route.path, attempt.headers, method === "POST" ? route.body : undefined);
        assert.equal(response.status, attempt.status, `${route.path} hostile status`);
        assert.equal(failureCode(response), attempt.code, `${route.path} hostile code`);
        assert.equal(response.body.includes("asn_"), false, `${route.path} must redact credential-shaped input`);
        assertResponseHeaders(response, `${route.path} hostile response`);
      }
    }
    for (const route of routes.filter((route) => route.path.includes("asset-1"))) {
      const encoded = await send(route.method, route.path.replace("asset-1", "asset%2D1"), bearer, route.body);
      assert.equal(encoded.status, 404, `${route.path} encoded identity`);
      assert.equal(failureCode(encoded), "ROUTE_NOT_FOUND");
    }
    const mediaOversized: readonly Readonly<{ path: string; body: string }>[] = [
      { path: "/v1/media/import", body: JSON.stringify({ contract: "media-import-request/v1", bytesBase64url: "A".repeat(4_194_304) }) },
      { path: "/v1/media/asset-1/versions", body: JSON.stringify({ contract: "media-version-replacement-request/v1", import: { bytesBase64url: "A".repeat(4_194_304) } }) },
      { path: "/v1/media/asset-1/restore", body: JSON.stringify({ contract: "media-restore-request/v1", recovery: { bytesBase64url: "A".repeat(4_194_304) } }) },
      { path: "/v1/media/asset-1/archive", body: "x".repeat(4_097) },
    ];
    for (const item of mediaOversized) {
      const response = await post(item.path, bearer, item.body);
      assert.equal(response.status, 400, `${item.path} body bound`);
      assert.equal(failureCode(response), "REQUEST_BODY_TOO_LARGE", `${item.path} body bound code`);
    }
    assert.deepEqual(await credentials.transition("rotate"), { ok: true, value: { generation: 2, status: "active" } });
    for (const route of routes) {
      const response = await send(route.method, route.path, bearer, route.body);
      assert.equal(response.status, 401, `${route.path} old credential`);
      assert.equal(failureCode(response), "AUTHORIZATION_INVALID");
    }
    assert.equal((await credentials.transition("revoke")).ok, true);
    for (const route of routes) {
      const response = await send(route.method, route.path, bearer, route.body);
      assert.equal(response.status, 401, `${route.path} revoked credential`);
      assert.equal(failureCode(response), "AUTHORIZATION_REVOKED");
    }
    assert.equal(digest(), before, "all rejected Media transport requests leave canonical state unchanged");
    assert.equal(JSON.stringify(log).includes("asn_"), false, "Media route logs must not contain credential-shaped input");
  });
});

test("actual listener resolves missing current editor Plugin block as a source-preserving Host diagnostic", async () => {
  await withAuthoringApi(async ({ apiKey, persistence }) => {
    const content = { contract: "site-content/v1", title: "plugin entry", blocks: [{ kind: "article", text: "文章內容" }, { kind: "interactive-demo", identity: { id: "missing-demo", version: "1.0.0" }, hook: "cms/editor-block/resolve", manifestHash: `sha256:${"d".repeat(64)}`, source: { html: "<button>run</button>", css: "button{}", javascript: "void 0" }, staticFallback: "替代內容" }], seo: {} };
    const bytes = canonicalJsonBytes(content);
    if (!bytes.ok) throw new Error(bytes.error.code);
    assert.equal(persistence.createRevision({ identity: { entryId: "plugin-entry", revisionId: "plugin-revision" }, schemaIdentity: { schemaId: "site-content", version: 1 }, contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value), lineage: { operationId: "save-plugin-entry", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(persistence.setEntryPointers({ entryId: "plugin-entry", currentRevisionId: "plugin-revision", lineage: { revisionId: "plugin-revision", operationId: "save-plugin-entry", operationKind: "SaveRevision" } }).ok, true);
    const resolved = await send("GET", "/v1/entries/plugin-entry/current/editor-blocks", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(resolved.status, 200);
    assertResponseHeaders(resolved, "editor block resolution");
    const dto = JSON.parse(resolved.body) as { items: readonly { status: string; source: unknown; diagnostic: { code: string; detail: { cause: string } } }[] };
    assert.equal(dto.items.length, 1);
    const item = dto.items[0];
    assert.notEqual(item, undefined);
    if (item === undefined) return;
    assert.equal(item.status, "missing");
    assert.deepEqual(item.source, { html: "<button>run</button>", css: "button{}", javascript: "void 0" });
    assert.equal(item.diagnostic.code, "PLUGIN_BLOCK_MISSING");
    assert.equal(item.diagnostic.detail.cause, "missing");
  });
});

test("actual listener resolves the durable active Theme and preserves the preview wire contract without mutation", async () => {
  await withAuthoringApi(async ({ apiKey, digest, persistence, siteDefinition }) => {
    const revisions = [
      { revisionId: "published", content: { contract: "site-content/v1", title: "published title", blocks: [{ kind: "article", text: "published text" }], seo: {} } },
      { revisionId: "draft", content: { contract: "site-content/v1", title: "draft title", blocks: [{ kind: "article", text: "draft text" }], seo: {} } },
      { revisionId: "only-draft", content: { contract: "site-content/v1", title: "only draft", blocks: [{ kind: "article", text: "only draft text" }], seo: {} } },
    ] as const;
    for (const revision of revisions) {
      const bytes = canonicalJsonBytes(revision.content);
      if (!bytes.ok) throw new Error(bytes.error.code);
      const entryId = revision.revisionId === "only-draft" ? "draft-only" : "preview-entry";
      assert.equal(persistence.createRevision({ identity: { entryId, revisionId: revision.revisionId }, schemaIdentity: { schemaId: "site-content", version: 1 }, contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value), lineage: { operationId: `save-${revision.revisionId}`, operationKind: "SaveRevision" } }).ok, true);
    }
    assert.equal(persistence.setEntryPointers({ entryId: "preview-entry", currentRevisionId: "published", publishedRevisionId: "published", lineage: { revisionId: "published", operationId: "publish-preview", operationKind: "PublishRevision" } }).ok, true);
    assert.equal(persistence.setEntryPointers({ entryId: "preview-entry", currentRevisionId: "draft", publishedRevisionId: "published", lineage: { revisionId: "draft", operationId: "save-draft", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(persistence.setEntryPointers({ entryId: "draft-only", currentRevisionId: "only-draft", lineage: { revisionId: "only-draft", operationId: "save-only-draft", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(siteDefinition.createPublishedClaim({ owner: "preview-entry", route: "/published-preview", sourceRevisionId: "published" }).ok, true);
    assert.equal(siteDefinition.createCurrentClaim({ owner: "preview-entry", route: "/current-preview", sourceRevisionId: "draft" }).ok, true);
    assert.equal(siteDefinition.createCurrentClaim({ owner: "draft-only", route: "/draft-only", sourceRevisionId: "only-draft" }).ok, true);
    const before = digest();
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } as const;
    const current = await post("/v1/preview", headers, JSON.stringify({ contract: "preview-request/v1", selection: "current", subject: { entryId: "preview-entry" } }));
    assert.equal(current.status, 200, current.body);
    assertResponseHeaders(current, "current preview");
    assert.deepEqual(Object.keys(JSON.parse(current.body) as object).sort(), ["contentDigest", "contract", "document", "revisionId", "selection", "subject"]);
    assert.equal(current.body.includes("draft text"), true);
    const published = await post("/v1/preview", headers, JSON.stringify({ contract: "preview-request/v1", selection: "published", subject: { entryId: "preview-entry" } }));
    assert.equal(published.status, 200, published.body);
    assertResponseHeaders(published, "published preview");
    assert.equal(published.body.includes("published text"), true);
    assert.equal(published.body.includes("draft text"), false);
    for (const [name, body, status, code] of [
      ["missing subject", { contract: "preview-request/v1", selection: "current", subject: { entryId: "missing" } }, 404, "SUBJECT_NOT_FOUND"],
      ["unpublished subject", { contract: "preview-request/v1", selection: "published", subject: { entryId: "draft-only" } }, 404, "SUBJECT_NOT_PUBLISHED"],
      ["browser Theme selector", { contract: "preview-request/v1", selection: "current", subject: { entryId: "preview-entry" }, themeIdentity: {} }, 400, "INVALID_REQUEST_BODY"],
    ] as const) {
      const response = await post("/v1/preview", headers, JSON.stringify(body));
      assert.equal(response.status, status, name);
      assert.equal(failureCode(response), code, name);
      assertResponseHeaders(response, name);
    }
    assert.equal(digest(), before, "preview 成功與拒絕皆不得改變 canonical state");
  });
});

test("CMS documents and manifest assets apply their independent Fetch Metadata gate", async () => {
  await withAuthoringApi(async ({ digest, log }) => {
    const before = digest();
    const document = await send("GET", "/cms/entries/new", { Host: authority, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
    assert.equal(document.status, 200);
    assert.match(document.body, /<script type="module" src="\/cms\/assets\/bootstrap-test\.js"><\/script>/u);
    const history = await send("GET", "/cms/entries", { Host: authority, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
    assert.equal(history.status, 200);
    const siteRoutes = await send("GET", "/cms/site/routes", { Host: authority, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
    assert.equal(siteRoutes.status, 200);
    assert.equal(log.at(-1)?.routeTemplate, "/cms/site/routes");
    assert.equal(document.headers["content-security-policy"] !== undefined, true);
    const asset = await send("GET", "/cms/assets/bootstrap-test.js", { Host: authority, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "script" });
    assert.equal(asset.status, 200);
    assert.equal(asset.body, "export {};");
    // module script fetch 實際會帶 exact same-origin Origin；只有 exact 值可通過。
    const moduleAsset = await send("GET", "/cms/assets/bootstrap-test.js", { Host: authority, Origin: origin, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "script" });
    assert.equal(moduleAsset.status, 200);
    const crossOriginAsset = await send("GET", "/cms/assets/bootstrap-test.js", { Host: authority, Origin: "https://attacker.example", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "script" });
    assert.equal(crossOriginAsset.status, 403);
    assert.equal(failureCode(crossOriginAsset), "ORIGIN_FORBIDDEN");
    const wrongDestination = await send("GET", "/cms/assets/bootstrap-test.js", { Host: authority, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "style" });
    assert.equal(wrongDestination.status, 403);
    const encoded = await send("GET", "/cms/entries/a%2Fb", { Host: authority, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
    assert.equal(encoded.status, 404);
    const query = await send("GET", "/cms?ticket=leak", { Host: authority, "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
    assert.equal(query.status, 403);
    assert.equal(digest(), before);
  });
});

/** `Origin` 的省略是 GET 專屬的瀏覽器行為；把它擴到 state-changing method 會讓同源證明只剩 Fetch Metadata。 */
test("authenticated /v1 routes admit originless same-origin GET but never an originless state change", async () => {
  await withAuthoringApi(async ({ apiKey, digest }) => {
    const before = digest();
    const fetchMetadata = { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" } as const;
    const bearer = { Host: authority, Authorization: `Bearer ${apiKey}` } as const;
    const previewBody = JSON.stringify({ contract: "preview-request/v1", selection: "current", subject: { entryId: "absent" } });
    const json = { ...bearer, "Content-Type": "application/json" } as const;
    for (const [name, response, status] of [
      ["originless same-origin GET", await send("GET", "/v1/entries", { ...bearer, ...fetchMetadata }), 200],
      ["exact Origin GET", await send("GET", "/v1/entries", { ...bearer, Origin: origin, ...fetchMetadata }), 200],
      ["cross-site GET", await send("GET", "/v1/entries", { ...bearer, ...fetchMetadata, "Sec-Fetch-Site": "cross-site" }), 403],
      ["foreign Origin GET", await send("GET", "/v1/entries", { ...bearer, Origin: "https://attacker.example", ...fetchMetadata }), 403],
      ["originless same-origin POST", await post("/v1/preview", { ...json, ...fetchMetadata }, previewBody), 403],
      ["exact Origin POST", await post("/v1/entries/absent/seo-analysis/nested", { ...json, Origin: origin, ...fetchMetadata }, previewBody), 404],
      ["CLI POST without Fetch Metadata", await post("/v1/entries/absent/seo-analysis/nested", json, previewBody), 404],
    ] as const) {
      assert.equal(response.status, status, name);
      if (status === 403) assert.equal(failureCode(response), "ORIGIN_FORBIDDEN", name);
      assertResponseHeaders(response, name);
    }
    assert.equal(digest(), before, "gate 的接受與拒絕皆不得改變 canonical state");
  });
});

test("typed client mints one browser ticket and browser exchange receives the sole session secret response", async () => {
  await withAuthoringApi(async ({ directory, apiKey }) => {
    const client = createLocalAuthoringClient({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") });
    const minted = await client.mintBrowserTicket();
    assert.equal(minted.ok, true);
    if (!minted.ok) return;
    assert.match(minted.value.ticket, /^asn_bt_v1_[A-Za-z0-9_-]{43}$/u);
    assert.equal(minted.value.ticket.includes(apiKey), false);
    const exchange = await fetch(`${origin}/_local/browser-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ contract: "browser-session-exchange/v1", ticket: minted.value.ticket }),
    });
    assert.equal(exchange.status, 200);
    const session = await exchange.json() as { contract: string; generation: number; apiKey: string };
    assert.deepEqual(session, { contract: "browser-session/v1", generation: 1, apiKey });
    const replay = await fetch(`${origin}/_local/browser-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ contract: "browser-session-exchange/v1", ticket: minted.value.ticket }),
    });
    assert.equal(replay.status, 401);
    assert.equal((await replay.text()).includes(minted.value.ticket), false);
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

test("actual listener publishes the current revision with a safe receipt and rejects stale current", async () => {
  await withAuthoringApi(async ({ apiKey, persistence, digest, publishCalls, log }) => {
    assert.equal((await post("/v1/entries/entry/revisions", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, saveBody("draft-1", "/published"))).status, 200);
    const beforePublish = digest();
    const canaryOperationId = `asn_bt_v1_${"B".repeat(43)}`;
    const published = await post("/v1/entries/entry/publish", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, publishBody("draft-1", canaryOperationId));
    assert.equal(published.status, 200);
    assertResponseHeaders(published, "publish success");
    assert.equal(published.body.includes("asn_"), false, "safe receipt 不得回吐 ticket canary");
    assert.equal(published.body.includes("[REDACTED]"), true);
    const receipt = publishRevisionSuccessSchema.safeParse(JSON.parse(published.body));
    assert.equal(receipt.success, true);
    if (!receipt.success) return;
    assert.deepEqual(receipt.data.publishedPointer, { currentRevisionId: "draft-1", publishedRevisionId: "draft-1" });
    assert.deepEqual(receipt.data.publishedRoute, { normalizedRoute: "/published", owner: "entry", sourceRevisionId: "draft-1" });
    assert.equal(receipt.data.lineageIdentity.entryId, "entry");
    assert.equal(receipt.data.lineageIdentity.revisionId, "draft-1");
    assert.equal(publishCalls(), 1);
    assert.notEqual(digest(), beforePublish);
    assert.deepEqual(persistence.getEntryPointers("entry"), { ok: true, value: { entryId: "entry", currentRevisionId: "draft-1", publishedRevisionId: "draft-1" } });
    assert.deepEqual(log.at(-1), { requestId: log.at(-1)?.requestId ?? "", stableEventCode: "AUTHORING_REQUEST_OK", method: "POST", routeTemplate: "/v1/entries/:entryId/publish", status: 200 });
    assert.equal(JSON.stringify(log).includes("asn_"), false, "log 不得回吐 credential／ticket 形狀字串");

    const beforeStale = digest();
    const stale = await post("/v1/entries/entry/publish", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, publishBody("stale", "publish-stale"));
    assert.equal(stale.status, 409); assert.equal(failureCode(stale), "CURRENT_REVISION_MISMATCH");
    assert.equal(digest(), beforeStale, "stale publish 不得改變 canonical state");
    assert.equal(publishCalls(), 2, "stale request 已通過 transport 並抵達 DomainApplication");
  });
});

test("actual listener restores an immutable source as new current while preserving published", async () => {
  await withAuthoringApi(async ({ apiKey, persistence, digest, log }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    assert.equal((await post("/v1/entries/entry/revisions", headers, saveBody("source", "/source"))).status, 200);
    assert.equal((await post("/v1/entries/entry/publish", headers, publishBody("source"))).status, 200);
    assert.equal((await post("/v1/entries/entry/revisions", headers, saveBody("later", "/source", "source"))).status, 200);
    const before = digest();
    const restored = await post("/v1/entries/entry/restore", headers, restoreBody("source", "restored"));
    assert.equal(restored.status, 201);
    assertResponseHeaders(restored, "restore success");
    const receipt = restoreRevisionSuccessSchema.safeParse(JSON.parse(restored.body));
    assert.equal(receipt.success, true);
    if (!receipt.success) return;
    assert.equal(receipt.data.revision.restoredFromRevisionId, "source");
    assert.deepEqual(receipt.data.pointer, { currentRevisionId: "restored", publishedRevisionId: "source" });
    assert.equal(receipt.data.currentRoute.sourceRevisionId, "restored");
    assert.notEqual(digest(), before);
    assert.deepEqual(persistence.getEntryPointers("entry"), { ok: true, value: { entryId: "entry", currentRevisionId: "restored", publishedRevisionId: "source" } });
    assert.deepEqual(log.at(-1), { requestId: log.at(-1)?.requestId ?? "", stableEventCode: "AUTHORING_REQUEST_OK", method: "POST", routeTemplate: "/v1/entries/:entryId/restore", status: 201 });
  });
});

test("RestoreRevision transport rejects malformed and unauthenticated requests before command execution", async () => {
  await withAuthoringApi(async ({ apiKey, digest, log }) => {
    const before = digest();
    const cases: readonly Readonly<{ method: string; headers: Headers; body?: string; status: number; code: string }>[] = [
      { method: "POST", headers: { "Content-Type": "application/json" }, body: restoreBody("source", "restored"), status: 401, code: "AUTHORIZATION_REQUIRED" },
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ contract: "restore-revision-request/v1", sourceRevisionId: "source", newRevisionId: "restored", operationId: "op", extra: true }), status: 400, code: "INVALID_REQUEST_BODY" },
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, status: 405, code: "METHOD_NOT_ALLOWED" },
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "text/plain" }, body: restoreBody("source", "restored"), status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    ];
    for (const item of cases) {
      const response = await send(item.method, "/v1/entries/entry/restore", item.headers, item.body);
      assert.equal(response.status, item.status);
      assert.equal(failureCode(response), item.code);
      assert.equal(log.at(-1)?.routeTemplate, "/v1/entries/:entryId/restore");
      assertResponseHeaders(response, "restore rejection");
    }
    assert.equal(digest(), before);
  });
});

test("typed client proves then publishes and fails closed before connecting", async () => {
  await withAuthoringApi(async ({ directory }) => {
    const client = createLocalAuthoringClient({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") });
    assert.equal((await client.saveRevision({ entryId: "entry", request: JSON.parse(saveBody("client-draft", "/client-published")) })).ok, true);
    const published = await client.publishRevision({ entryId: "entry", request: JSON.parse(publishBody("client-draft", "client-publish")) });
    assert.equal(published.ok, true);
    if (published.ok) assert.equal(published.value.publishedPointer.publishedRevisionId, "client-draft");
    assert.deepEqual(await client.publishRevision({ entryId: "a/b", request: JSON.parse(publishBody("client-draft")) }), { ok: false, error: { code: "INVALID_CLIENT_REQUEST" } });
    assert.deepEqual(await client.publishRevision({ entryId: "entry", request: { contract: "publish-revision-request/v1", expectedCurrentRevisionId: "client-draft", operationId: "publish", extra: true } as never }), { ok: false, error: { code: "INVALID_CLIENT_REQUEST" } });
    assert.deepEqual(await client.publishRevision({ entryId: "entry", request: { contract: "publish-revision-request/v1", expectedCurrentRevisionId: "client-draft" } as never }), { ok: false, error: { code: "INVALID_CLIENT_REQUEST" } });
  });
});

test("publish rejections stay outside the command seam and canonical state", async () => {
  await withAuthoringApi(async ({ apiKey, credentials, digest, publishCalls, log }) => {
    const json = { "Content-Type": "application/json" } as const;
    const bearer = { ...json, Authorization: `Bearer ${apiKey}` } as const;
    const oversized = JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId: "draft", operationId: "x".repeat(4_096) });
    const cases: readonly Readonly<{ name: string; method?: string; path?: string; headers: Headers; body?: string; status: number; code: string; template?: AuthoringApiLogEvent["routeTemplate"]; remediation?: string }>[] = [
      { name: "missing key", headers: json, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_REQUIRED" },
      { name: "malformed scheme", headers: { ...json, Authorization: "Basic abc" }, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_MALFORMED" },
      { name: "malformed key shape", headers: { ...json, Authorization: "Bearer invalid" }, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_MALFORMED" },
      { name: "duplicate key", headers: { ...json, Authorization: [`Bearer ${apiKey}`, `Bearer ${apiKey}`] }, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_DUPLICATE" },
      { name: "invalid key", headers: { ...json, Authorization: `Bearer asn_v1_${"C".repeat(43)}` }, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_INVALID" },
      { name: "cookie transport", headers: { ...bearer, Cookie: "session=1" }, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      { name: "query transport", path: "/v1/entries/entry/publish?key=1", headers: bearer, body: publishBody("draft"), status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      // Host 不符時 request URL 不落在核准 origin，route 無法歸屬，log 只能記 `unmatched`。
      { name: "evil host", headers: { ...bearer, Host: "localhost:43127" }, body: publishBody("draft"), status: 421, code: "MISDIRECTED_REQUEST", template: "unmatched" },
      { name: "x-forwarded-for", headers: { ...bearer, "X-Forwarded-For": "203.0.113.1" }, body: publishBody("draft"), status: 421, code: "MISDIRECTED_REQUEST" },
      { name: "forwarded", headers: { ...bearer, Forwarded: "for=203.0.113.1" }, body: publishBody("draft"), status: 421, code: "MISDIRECTED_REQUEST" },
      { name: "evil origin", headers: { ...bearer, Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }, body: publishBody("draft"), status: 403, code: "ORIGIN_FORBIDDEN" },
      { name: "exact origin without same-origin fetch metadata", headers: { ...bearer, Origin: origin, "Sec-Fetch-Site": "cross-site" }, body: publishBody("draft"), status: 403, code: "ORIGIN_FORBIDDEN" },
      { name: "OPTIONS", method: "OPTIONS", headers: bearer, status: 405, code: "METHOD_NOT_ALLOWED" },
      { name: "GET", method: "GET", headers: bearer, status: 405, code: "METHOD_NOT_ALLOWED" },
      { name: "unsupported media type", headers: { ...bearer, "Content-Type": "text/plain" }, body: publishBody("draft"), status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
      { name: "invalid schema", headers: bearer, body: JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId: "draft", operationId: "op", extra: true }), status: 400, code: "INVALID_REQUEST_BODY" },
      { name: "invalid json", headers: bearer, body: "{", status: 400, code: "INVALID_REQUEST_BODY" },
      // publish 的 body 上限是 save 的 1/1024；remediation 必須指出這個 route 自己的上限。
      { name: "oversized body", headers: bearer, body: oversized, status: 400, code: "REQUEST_BODY_TOO_LARGE", remediation: "PublishRevision request 不得超過 4 KiB。" },
      { name: "percent-encoded entryId", path: "/v1/entries/a%2Fb/publish", headers: bearer, body: publishBody("draft"), status: 404, code: "ROUTE_NOT_FOUND", template: "unmatched" },
    ];
    const before = digest();
    for (const item of cases) {
      const response = await send(item.method ?? "POST", item.path ?? "/v1/entries/entry/publish", item.headers, item.body);
      assert.equal(response.status, item.status, `${item.name} status`);
      assert.equal(failureCode(response), item.code, `${item.name} code`);
      assert.equal(response.body.includes("asn_"), false, `${item.name} 不得回吐 credential 形狀字串`);
      if (item.remediation !== undefined) assert.equal((JSON.parse(response.body) as { remediation: { message: string } }).remediation.message, item.remediation, `${item.name} remediation`);
      assert.equal(log.at(-1)?.routeTemplate, item.template ?? "/v1/entries/:entryId/publish", `${item.name} routeTemplate`);
      assertResponseHeaders(response, item.name);
    }
    assert.equal(publishCalls(), 0, "所有 transport rejection 都不得執行 PublishRevision");
    assert.equal(digest(), before, "所有 transport rejection 都不得改變 canonical state");
    assert.equal(JSON.stringify(log).includes("asn_"), false, "log 不得回吐 credential 形狀字串");

    // contract §7：rotate 之後舊 key 一律 401，且不得抵達 command seam。
    assert.deepEqual(await credentials.transition("rotate"), { ok: true, value: { generation: 2, status: "active" } });
    const rotated = await post("/v1/entries/entry/publish", bearer, publishBody("draft"));
    assert.equal(rotated.status, 401); assert.equal(failureCode(rotated), "AUTHORIZATION_INVALID");

    assert.equal((await credentials.transition("revoke")).ok, true);
    const revoked = await post("/v1/entries/entry/publish", bearer, publishBody("draft"));
    assert.equal(revoked.status, 401); assert.equal(failureCode(revoked), "AUTHORIZATION_REVOKED");
    assert.equal(publishCalls(), 0);
    assert.equal(digest(), before, "old／revoked key 的 401 不得改變 canonical state");
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

test("an unsafe credential store answers 503 without disclosing the key or running a command", async () => {
  await withAuthoringApi(async ({ apiKey, directory, digest, log }) => {
    const before = digest();
    chmodSync(path.join(directory, "config", "ai-study-note", "local-authoring-v1.json"), 0o644);
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority } as const;
    const attempts: readonly Readonly<{ method: "GET" | "POST"; path: string; body?: string }>[] = [
      { method: "GET", path: "/v1/entries" },
      { method: "POST", path: "/v1/entries/entry/revisions", body: saveBody("revision-1", "/saved") },
      { method: "POST", path: "/v1/entries/entry/restore", body: restoreBody("revision-1", "restored") },
    ];
    for (const attempt of attempts) {
      const response = await send(attempt.method, attempt.path, headers, attempt.body);
      assert.equal(response.status, 503, `${attempt.path} credential store status`);
      assert.equal(failureCode(response), "INTERNAL_SERVER_ERROR", `${attempt.path} credential store code`);
      assert.equal(response.body.includes(apiKey), false, `${attempt.path} must not disclose the key`);
      assert.equal(response.body.includes("asn_"), false, `${attempt.path} must redact credential-shaped output`);
      assertResponseHeaders(response, `${attempt.path} credential store rejection`);
      assert.equal(log.at(-1)?.status, 503);
    }
    assert.equal(digest(), before, "an unsafe credential store runs no command and mutates nothing");
  });
});

test("every rejected transport shape fails closed with its contract status and mutates nothing", async () => {
  await withAuthoringApi(async ({ apiKey, log, digest }) => {
    const json = { "Content-Type": "application/json" } as const;
    const bearer = { ...json, Authorization: `Bearer ${apiKey}` } as const;
    const oversized = JSON.stringify({ contract: "save-revision-request/v1", content: "x".repeat(4_194_305) });
    const cases: readonly Readonly<{ name: string; method?: string; path?: string; headers: Headers; body?: string; status: number; code: string; remediation?: string }>[] = [
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
      { name: "GET", method: "GET", path: "/v1/entries/entry/publish", headers: bearer, status: 405, code: "METHOD_NOT_ALLOWED" },
      { name: "unsupported media type", headers: { ...bearer, "Content-Type": "text/plain" }, body: saveBody("r", "/a"), status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
      { name: "oversized body", headers: bearer, body: oversized, status: 400, code: "REQUEST_BODY_TOO_LARGE", remediation: "SaveRevision request 不得超過 4 MiB。" },
      { name: "invalid json", headers: bearer, body: "{", status: 400, code: "INVALID_REQUEST_BODY" },
      { name: "percent-encoded entryId", path: "/v1/entries/a%2Fb/revisions", headers: bearer, body: saveBody("r", "/a"), status: 404, code: "ROUTE_NOT_FOUND" },
      { name: "browser ticket rejects malformed body", path: "/_local/browser-tickets", headers: bearer, body: "{}", status: 400, code: "INVALID_REQUEST_BODY" },
      { name: "server proof rejects cookie", path: "/_local/server-proof", headers: { ...json, Cookie: "session=1" }, body: "{}", status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      { name: "server proof rejects query", path: "/_local/server-proof?key=1", headers: json, body: "{}", status: 401, code: "AUTHORIZATION_ALTERNATE_TRANSPORT" },
      // proof route 的上限是 4 KiB；remediation 不得沿用 SaveRevision 的 4 MiB 說明。
      { name: "server proof rejects oversized challenge", path: "/_local/server-proof", headers: json, body: JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: 1, nonce: "a".repeat(4_096) }), status: 400, code: "REQUEST_BODY_TOO_LARGE", remediation: "server-proof challenge 不得超過 4 KiB。" },
    ];

    const before = digest();
    for (const item of cases) {
      const response = await send(item.method ?? "POST", item.path ?? "/v1/entries/entry/revisions", item.headers, item.body);
      assert.equal(response.status, item.status, `${item.name} status`);
      assert.equal(failureCode(response), item.code, `${item.name} code`);
      assert.equal(response.body.includes("asn_"), false, `${item.name} 不得回吐 credential 形狀字串`);
      if (item.remediation !== undefined) assert.equal((JSON.parse(response.body) as { remediation: { message: string } }).remediation.message, item.remediation, `${item.name} remediation`);
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
      const client = createLocalAuthoringClient(credentialLocation(directory));
      assert.deepEqual(await client.saveRevision({ entryId: "entry", request: JSON.parse(saveBody("rogue-revision", "/rogue")) }), { ok: false, error: { code: "AUTHORING_SERVER_PROOF_INVALID" } });
      assert.deepEqual(await client.publishRevision({ entryId: "entry", request: JSON.parse(publishBody("rogue-revision")) }), { ok: false, error: { code: "AUTHORING_SERVER_PROOF_INVALID" } });
      assert.deepEqual(seen.map((item) => item.url), ["/_local/server-proof", "/_local/server-proof"], "偽造 proof 之後不得再送出 command request");
      assert.equal(seen.every((item) => item.authorization === undefined), true, "任何 request 都不得帶 Authorization header");
      assert.equal(JSON.stringify(seen).includes("asn_"), false, "rogue listener 不得看到 credential 形狀字串");
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a replaced connection between server proof and authenticated commands fails closed without the Bearer", async () => {
  const { directory, apiKey } = await provisionedDirectory();
  try {
    await withRogueListener((received) => {
      if (received.url !== "/_local/server-proof") return { status: 200, body: "{}" };
      const challenge = JSON.parse(received.body) as { generation: number; nonce: string };
      const mac = createHmac("sha256", apiKey).update(`authoring-server-proof/v1\0${origin}\0${challenge.generation}\0${challenge.nonce}`).digest("base64url");
      // proof 本身有效，但 listener 立刻關掉 connection：authenticated command 只能落在新 socket 上。
      return { status: 200, headers: { Connection: "close" }, body: JSON.stringify({ contract: "authoring-server-proof/v1", generation: challenge.generation, nonce: challenge.nonce, mac }) };
    }, async (seen) => {
      const client = createLocalAuthoringClient(credentialLocation(directory));
      assert.deepEqual(await client.saveRevision({ entryId: "entry", request: JSON.parse(saveBody("changed-revision", "/changed")) }), { ok: false, error: { code: "AUTHORING_CONNECTION_CHANGED" } });
      assert.deepEqual(await client.publishRevision({ entryId: "entry", request: JSON.parse(publishBody("changed-revision")) }), { ok: false, error: { code: "AUTHORING_CONNECTION_CHANGED" } });
      assert.deepEqual(seen.map((item) => item.url), ["/_local/server-proof", "/_local/server-proof"]);
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

test("actual listener admits only flat taxonomy routes and maps stale or duplicate commands to 409", async () => {
  await withAuthoringApi(async ({ apiKey }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority };
    const created = await post("/v1/taxonomies", headers, JSON.stringify({ contract: "taxonomy-create-request/v1", taxonomyId: "topics", label: "Topics" }));
    assert.equal(created.status, 201);
    assertResponseHeaders(created, "taxonomy create");
    const createdBody = taxonomySnapshotSchema.parse(JSON.parse(created.body));
    assert.deepEqual(createdBody.taxonomy, { taxonomyId: "topics", label: "Topics" }, "taxonomy identity is flat and has no parent binding");

    const parentRejected = await post("/v1/taxonomies", headers, JSON.stringify({ contract: "taxonomy-create-request/v1", taxonomyId: "nested", label: "Nested", parentTermId: "topics" }));
    assert.equal(parentRejected.status, 400);
    assert.equal(failureCode(parentRejected), "INVALID_REQUEST_BODY");
    assertResponseHeaders(parentRejected, "taxonomy parent rejection");

    const createdTerm = await post("/v1/taxonomies/topics/commands", headers, JSON.stringify({ contract: "taxonomy-command/v1", kind: "create-term", termId: "alpha", label: "Alpha", slug: "alpha", order: 10, expectedStateDigest: createdBody.stateDigest }));
    assert.equal(createdTerm.status, 200);
    assertResponseHeaders(createdTerm, "taxonomy term create");
    const commandBody = taxonomyCommandResultSchema.parse(JSON.parse(createdTerm.body));
    assert.deepEqual(commandBody.snapshot.terms, [{ taxonomyId: "topics", termId: "alpha", label: "Alpha", slug: "alpha", order: 10, state: "live" }]);

    const stale = await post("/v1/taxonomies/topics/commands", headers, JSON.stringify({ contract: "taxonomy-command/v1", kind: "create-term", termId: "beta", label: "Beta", slug: "beta", order: 20, expectedStateDigest: createdBody.stateDigest }));
    assert.equal(stale.status, 409);
    assert.equal(failureCode(stale), "TAXONOMY_STATE_CONFLICT");
    assert.equal(failureOwner(stale), "Taxonomy");
    assertResponseHeaders(stale, "taxonomy stale command");

    const duplicate = await post("/v1/taxonomies/topics/commands", headers, JSON.stringify({ contract: "taxonomy-command/v1", kind: "create-term", termId: "alpha", label: "Alpha again", slug: "alpha-again", order: 20, expectedStateDigest: commandBody.snapshot.stateDigest }));
    assert.equal(duplicate.status, 409);
    assert.equal(failureCode(duplicate), "TAXONOMY_CONFLICT");
    assert.equal(failureOwner(duplicate), "Taxonomy");
    assertResponseHeaders(duplicate, "taxonomy duplicate command");

    const wrongMethod = await send("GET", "/v1/taxonomies/topics/commands", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(wrongMethod.status, 405);
    assertResponseHeaders(wrongMethod, "taxonomy command wrong method");
    const malformedRoute = await post("/v1/taxonomies/topics/commands/extra", headers, JSON.stringify({}));
    assert.equal(malformedRoute.status, 404);
    assertResponseHeaders(malformedRoute, "taxonomy malformed route");
  });
});

test("CMS SEO domain failure code 具有契約化 HTTP status", () => {
  assert.deepEqual(authoringErrorStatuses("INVALID_SEO_ANALYSIS_REQUEST"), [422]);
  assert.deepEqual(authoringErrorStatuses("CMS_SEO_ANALYSIS_FAILED"), [500]);
});

test("actual listener projects an approvable Content Type migration preview", async () => {
  await withAuthoringApi(async ({ apiKey }) => {
    const response = await post("/v1/content-types/note/migrations/preview", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority }, JSON.stringify({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [] }));
    assert.equal(response.status, 200, response.body);
    const body = JSON.parse(response.body) as { contract: string; kind: string; sourceSchemaIdentity: { schemaId: string; version: number }; targetSchemaIdentity: { schemaId: string; version: number }; mappingIdentity: string; affectedPointers: unknown[]; historicalRevisions: unknown[]; mapping: unknown[]; blockedRows: unknown[]; stateDigest: string };
    assert.equal(body.contract, "content-type-migration/v1");
    assert.equal(body.kind, "preview");
    assert.deepEqual(body.sourceSchemaIdentity, { schemaId: "note", version: 1 });
    assert.deepEqual(body.targetSchemaIdentity, { schemaId: "note", version: 2 });
    assert.equal(typeof body.mappingIdentity, "string");
    assert.equal(typeof body.stateDigest, "string");
    assert.deepEqual({ affectedPointers: body.affectedPointers, historicalRevisions: body.historicalRevisions, mapping: body.mapping, blockedRows: body.blockedRows }, { affectedPointers: [], historicalRevisions: [], mapping: [], blockedRows: [] });
    assertResponseHeaders(response, "Content Type migration preview");
    const execution = await post("/v1/content-types/note/migrations", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority }, JSON.stringify({ contract: "content-type-migration/v1", kind: "command", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [], expectedStateDigest: body.stateDigest, operationId: "content-type-migration-preview", replacements: [] }));
    assert.equal(execution.status, 200, execution.body);
    const outcome = JSON.parse(execution.body) as { contract: string; kind: string; operationId: string; targetSchemaIdentity: { schemaId: string; version: number }; afterDigest: string; stateDigest: string; replacements: unknown[]; pointers: unknown[] };
    assert.deepEqual({ contract: outcome.contract, kind: outcome.kind, operationId: outcome.operationId, targetSchemaIdentity: outcome.targetSchemaIdentity, replacements: outcome.replacements, pointers: outcome.pointers }, { contract: "content-type-migration/v1", kind: "execution", operationId: "content-type-migration-preview", targetSchemaIdentity: { schemaId: "note", version: 2 }, replacements: [], pointers: [] });
    assert.equal(typeof outcome.afterDigest, "string");
    assert.equal(typeof outcome.stateDigest, "string");
    assertResponseHeaders(execution, "Content Type migration execution");
  });
});

// Migration route 自成 route class：`/v1/content-types/:schemaId` 不得因為 migrations 需要 POST
// 而被放寬成可 POST，否則會落到 Hono 預設 404（text/plain、無 security header）。
test("content-type detail route still rejects POST with the contract 405 envelope", async () => {
  await withAuthoringApi(async ({ apiKey }) => {
    const response = await post("/v1/content-types/note", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Host: authority }, JSON.stringify({}));
    assert.equal(response.status, 405, response.body);
    const body = JSON.parse(response.body) as { contract: string; code: string; owner: string };
    assert.equal(body.contract, "authoring-error/v1");
    assert.equal(body.code, "METHOD_NOT_ALLOWED");
    assert.equal(body.owner, "AuthoringApi");
    assertResponseHeaders(response, "content-type detail POST");
  });
});

test("migration routes log their own route template and reject GET", async () => {
  await withAuthoringApi(async ({ apiKey, log }) => {
    const bearer = { Authorization: `Bearer ${apiKey}`, Host: authority };
    const rejected = await send("GET", "/v1/content-types/note/migrations", bearer);
    assert.equal(rejected.status, 405, rejected.body);
    assertResponseHeaders(rejected, "migrations GET");
    await post("/v1/content-types/note/migrations/preview", { ...bearer, "Content-Type": "application/json" }, JSON.stringify({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [] }));
    assert.equal(log.some((event) => event.routeTemplate === "/v1/content-types/:schemaId/migrations/preview"), true, "preview 必須記錄自己的 route template");
    assert.equal(log.some((event) => event.routeTemplate === "/v1/content-types/:schemaId/migrations"), true, "GET 拒絕必須記錄 migrations route template");
  });
});

test("actual listener reads isolated route graphs and commits only a dual-digest-bound ChangeRoute", async () => {
  await withAuthoringApi(async ({ apiKey, digest, log }) => {
    const headers = { Authorization: `Bearer ${apiKey}`, Host: authority, "Content-Type": "application/json" } as const;
    assert.equal((await post("/v1/entries/route-entry/revisions", headers, saveBody("r1", "/published"))).status, 200);
    assert.equal((await post("/v1/entries/route-entry/publish", headers, publishBody("r1"))).status, 200);
    const draft = await post("/v1/entries/route-entry/revisions", headers, saveBody("r2", "/published", "r1"));
    assert.equal(draft.status, 200, draft.body);
    const before = digest();
    const current = await send("GET", "/v1/site/routes?selection=current", { Authorization: `Bearer ${apiKey}`, Host: authority });
    const published = await send("GET", "/v1/site/routes?selection=published", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(current.status, 200, current.body);
    assert.equal(published.status, 200, published.body);
    const currentGraph = JSON.parse(current.body) as { contract: string; digest: string; claims: readonly { graph: string; normalizedRoute: string; owner: string; sourceRevisionId: string }[] };
    const publishedGraph = JSON.parse(published.body) as { digest: string; claims: readonly { normalizedRoute: string }[] };
    assert.equal(currentGraph.contract, "route-graph/v1");
    assert.deepEqual(currentGraph.claims, [{ graph: "current", normalizedRoute: "/published", owner: "route-entry", sourceRevisionId: "r2" }]);
    assert.deepEqual(publishedGraph.claims, [{ graph: "published", normalizedRoute: "/published", owner: "route-entry", sourceRevisionId: "r1" }]);
    assert.equal(current.body.includes("bytes"), false);
    assert.equal(digest(), before);

    const prepared = await post("/v1/site/routes/change", headers, JSON.stringify({ contract: "route-change-proposal-request/v1", expectedRouteGraphDigests: { current: currentGraph.digest, published: publishedGraph.digest }, graph: "current", owner: "route-entry", route: "/Changed/", sourceRevisionId: "r2" }));
    assert.equal(prepared.status, 200, prepared.body);
    const proposal = JSON.parse(prepared.body);
    const changed = await post("/v1/site/routes/change", headers, JSON.stringify({ contract: "change-route-command/v1", operationId: "route-change", proposal }));
    assert.equal(changed.status, 200, changed.body);
    const receipt = JSON.parse(changed.body) as { contract: string; claim: { normalizedRoute: string }; resultingDigests: { published: string } };
    assert.equal(receipt.contract, "change-route-success/v1");
    assert.equal(receipt.claim.normalizedRoute, "/changed");
    assert.equal(receipt.resultingDigests.published, publishedGraph.digest);
    assert.notEqual(digest(), before);

    const stale = await post("/v1/site/routes/change", headers, JSON.stringify({ contract: "change-route-command/v1", operationId: "stale", proposal }));
    assert.equal(stale.status, 409, stale.body);
    assert.equal(failureCode(stale), "STALE_ROUTE_PROPOSAL");
    const hostile = await send("GET", "/v1/site/routes?selection=current&extra=1", { Authorization: `Bearer ${apiKey}`, Host: authority });
    assert.equal(hostile.status, 401, hostile.body);
    assert.equal(failureCode(hostile), "AUTHORIZATION_ALTERNATE_TRANSPORT");
    assert.equal(log.some((event) => String(event.routeTemplate) === "/v1/site/routes"), true);
    assert.equal(JSON.stringify(log).includes("asn_"), false);
  });
});
