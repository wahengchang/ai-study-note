import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDomainApplication, createPersistencePluginActivationStatePort } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createPluginHost } from "../../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import { createLocalAuthoringCredentialAuthority, startAuthoringApi } from "../../../apps/authoring-api/index.js";

const origin = "http://127.0.0.1:43127";

function post(pathname: string, headers: Readonly<Record<string, string>>, body: string): Promise<Readonly<{ status: number; body: string }>> {
  const deferred = Promise.withResolvers<Readonly<{ status: number; body: string }>>();
  const request = nodeRequest(`${origin}${pathname}`, { method: "POST", headers }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => deferred.resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
  });
  request.on("error", deferred.reject); request.end(body);
  return deferred.promise;
}

test("actual listener proves current credential and saves a revision", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "authoring-http-")); let close: (() => Promise<void>) | undefined; let closePersistence: (() => void) | undefined;
  try {
    const databasePath = path.join(directory, "cms.sqlite"); const installedRoot = path.join(directory, "installed"); mkdirSync(installedRoot);
    assert.equal(migrateDatabase({ databasePath }).ok, true); const persistence = openPersistence({ databasePath }); if (!persistence.ok) throw new Error(persistence.error.code); closePersistence = () => persistence.value.close();
    const schema = canonicalJsonBytes({ type: "object" }); if (!schema.ok) throw new Error(schema.error.code);
    assert.equal(persistence.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
    const pluginHost = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installedRoot, activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }) }); if (!pluginHost.ok) throw new Error(pluginHost.error.code);
    const objects = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "objects") }); if (!objects.ok) throw new Error(objects.error.code);
    const media = startDataMedia({ persistence: persistence.value, objectStore: objects.value }); if (!media.ok) throw new Error(media.error.code);
    const authority = createLocalAuthoringCredentialAuthority({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") }); assert.equal((await authority.transition("provision")).ok, true);
    const key = JSON.parse(readFileSync(path.join(directory, "config", "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string;
    const app = createDomainApplication({ persistence: persistence.value, siteDefinition: createSiteDefinition({ persistence: persistence.value }), dataMedia: media.value, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: pluginHost.value });
    const started = await startAuthoringApi({ domainApplication: app, credentialAuthority: authority, logger: () => undefined }); if (!started.ok) throw new Error(started.error.code); close = started.value.close;
    const proofNonce = "a".repeat(43); const proof = await fetch(`${origin}/_local/server-proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: 1, nonce: proofNonce }) });
    assert.equal(proof.status, 200); const proofBody = await proof.json() as { mac: string }; assert.equal(proofBody.mac, createHmac("sha256", key).update(`authoring-server-proof/v1\0${origin}\0${1}\0${proofNonce}`).digest("base64url"));
    const saved = await post("/v1/entries/entry/revisions", { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Host: "127.0.0.1:43127" }, JSON.stringify({ contract: "save-revision-request/v1", revisionId: "revision-1", operationId: "operation-1", schemaIdentity: { schemaId: "note", version: 1 }, content: { title: "saved" }, route: "/saved", assetVersions: [] }));
    assert.equal(saved.status, 200); const body = JSON.parse(saved.body) as { contract: string; entryId: string; revision: { revisionId: string }; pointer: { currentRevisionId: string } }; assert.equal(body.contract, "save-revision-success/v1"); assert.equal(body.entryId, "entry"); assert.equal(body.revision.revisionId, "revision-1"); assert.equal(body.pointer.currentRevisionId, "revision-1");
    const invalid = await post("/v1/entries/entry/revisions", { "Content-Type": "application/json", Host: "127.0.0.1:43127" }, "{}"); assert.equal(invalid.status, 401);
  } finally { if (close !== undefined) await close(); closePersistence?.(); rmSync(directory, { recursive: true, force: true }); }
});
