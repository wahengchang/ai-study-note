import assert from "node:assert/strict";
import test from "node:test";

import { createDomainApplication } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest, type JsonValue } from "../../../core/foundation/index.js";
import type { DataMedia } from "../../../core/media/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import type { CmsSeoAnalysisInputV1, PluginHost } from "../../../core/plugin-host/index.js";
import type { SiteDefinition } from "../../../core/site-definition/index.js";

const schemaIdentity = Object.freeze({ schemaId: "site-content", version: 1 });
const content = Object.freeze({ contract: "site-content/v1", title: "SEO article", blocks: Object.freeze([]), seo: Object.freeze({}) }) as JsonValue;
const contentBytes = canonical(content);
const settingsDigest = sha256Digest(new TextEncoder().encode("settings"));
const identity = Object.freeze({ id: "seo-basics", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: sha256Digest(new TextEncoder().encode("manifest")), capabilities: Object.freeze(["cms-seo-analysis"] as const) });

function canonical(value: JsonValue): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("測試資料必須可 canonicalize");
  return result.value;
}

function request(overrides: Partial<Record<"entryId" | "expectedCurrentRevisionId" | "route", string>> = {}) {
  const body = {
    entryId: overrides.entryId ?? "entry-a",
    expectedCurrentRevisionId: overrides.expectedCurrentRevisionId ?? "revision-a",
    schemaIdentity,
    content,
    route: overrides.route ?? "/guide",
  };
  const bytes = canonicalJsonBytes(body);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error("測試 request 必須可 canonicalize");
  return { contract: "cms-seo-analysis-request/v1" as const, ...body, documentDigest: sha256Digest(bytes.value) };
}

function application(input: Readonly<{ currentRevisionId?: string; currentRoute?: string; schemaValid?: boolean; resolveCanonical?: boolean }> = {}) {
  const calls: CmsSeoAnalysisInputV1[] = [];
  const currentRevisionId = input.currentRevisionId ?? "revision-a";
  const persistence = {
    getEntryPointers(entryId: string) {
      return entryId === "entry-a"
        ? { ok: true as const, value: { entryId, currentRevisionId } }
        : { ok: false as const, error: { code: "ENTRY_POINTER_NOT_FOUND" } };
    },
    getRevision() {
      return { ok: true as const, value: { identity: { entryId: "entry-a", revisionId: currentRevisionId }, schemaIdentity, contentBytes, contentDigest: sha256Digest(contentBytes) } };
    },
    getSchemaVersion() {
      return { ok: true as const, value: { identity: schemaIdentity, schemaBytes: canonical({ type: "object" }), schemaDigest: sha256Digest(new TextEncoder().encode("schema")) } };
    },
  } as unknown as PersistenceStore;
  const siteDefinition = {
    snapshot() {
      return { ok: true as const, value: { claims: [{ owner: "entry-a", sourceRevisionId: currentRevisionId, normalizedRoute: input.currentRoute ?? "/guide" }] } };
    },
    resolvePublicRouteUrl(value: Readonly<{ publicSiteUrl: string; normalizedRoute: string }>) {
      return input.resolveCanonical === false
        ? { ok: false as const, error: { code: "INVALID_PUBLIC_ROUTE_URL" } }
        : { ok: true as const, value: `https://example.test${value.normalizedRoute}/` };
    },
  } as unknown as SiteDefinition;
  const pluginHost = {
    async getSettingsSnapshot() {
      return { ok: true as const, value: { stateDigest: settingsDigest, records: [{ identity, settingsContract: "seo-plugin-settings/v1" as const, settings: { contract: "seo-plugin-settings/v1" as const, publicSiteUrl: "https://example.test/", indexing: "allow" as const }, settingsDigest }] } };
    },
    async analyzeCmsSeo(value: CmsSeoAnalysisInputV1) {
      calls.push(value);
      return { ok: true as const, value: { status: "available" as const, preview: { title: "SEO title", canonicalPath: "/guide" }, suggestions: [], diagnostics: [] } };
    },
  } as unknown as PluginHost;
  return { application: createDomainApplication({ persistence, siteDefinition, dataMedia: {} as DataMedia, schemaValidator: { validate: () => ({ ok: input.schemaValid ?? true }) }, pluginHost }), calls };
}

test("CMS SEO analysis 在 callback 前驗證 entry、current revision、route 與 schema content", async () => {
  const current = application();
  const response = await current.application.analyzeCmsSeo(request());
  assert.equal(response.ok, true);
  if (response.ok) assert.equal(response.value.preview?.canonicalUrl, "https://example.test/guide/");
  assert.equal(current.calls.length, 1);

  const missing = application();
  const missingResponse = await missing.application.analyzeCmsSeo(request({ entryId: "missing" }));
  assert.equal(missingResponse.ok, false);
  if (!missingResponse.ok) assert.equal(missingResponse.error.code, "ENTRY_NOT_FOUND");
  assert.equal(missing.calls.length, 0);

  const stale = application({ currentRevisionId: "revision-b" });
  const staleResponse = await stale.application.analyzeCmsSeo(request());
  assert.equal(staleResponse.ok, false);
  if (!staleResponse.ok) assert.equal(staleResponse.error.code, "CURRENT_REVISION_MISMATCH");
  assert.equal(stale.calls.length, 0);

  const changedRoute = application({ currentRoute: "/other" });
  const routeResponse = await changedRoute.application.analyzeCmsSeo(request());
  assert.equal(routeResponse.ok, false);
  if (!routeResponse.ok) assert.equal(routeResponse.error.code, "INVALID_SEO_ANALYSIS_REQUEST");
  assert.equal(changedRoute.calls.length, 0);

  const invalid = application({ schemaValid: false });
  const invalidResponse = await invalid.application.analyzeCmsSeo(request());
  assert.equal(invalidResponse.ok, false);
  if (!invalidResponse.ok) assert.equal(invalidResponse.error.code, "SCHEMA_INVALID");
  assert.equal(invalid.calls.length, 0);
});

test("CMS SEO analysis 只能透過 SiteDefinition 建立 canonical URL", async () => {
  const value = application({ resolveCanonical: false });
  const response = await value.application.analyzeCmsSeo(request());
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.error.code, "CMS_SEO_ANALYSIS_FAILED");
  assert.equal(value.calls.length, 1);
});
