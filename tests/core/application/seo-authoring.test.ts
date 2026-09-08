import assert from "node:assert/strict";
import test from "node:test";

import { createDomainApplication } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import type { PluginHost } from "../../../core/plugin-host/index.js";

const content = { contract: "site-content/v1", title: "Entry", blocks: [], seo: {} } as const;
const schemaIdentity = { schemaId: "site-content", version: 1 } as const;
const digest = (value: unknown): Digest => {
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok) throw new Error("test canonicalization");
  return sha256Digest(canonical.value);
};

function request(expectedCurrentRevisionId: string | null = null) {
  return {
    contract: "cms-seo-analysis-request/v1" as const,
    entryId: "entry-a",
    expectedCurrentRevisionId,
    schemaIdentity,
    content,
    route: "/notes/entry-a",
    documentDigest: digest({ entryId: "entry-a", expectedCurrentRevisionId, schemaIdentity, content, route: "/notes/entry-a" }),
  };
}

function application(host: PluginHost, currentRevisionId: string | null = null) {
  return createDomainApplication({
    persistence: {
      getSchemaVersion: () => ({ ok: true, value: { identity: schemaIdentity, schemaBytes: new Uint8Array(), schemaDigest: digest({ schema: 1 }) } }),
      getEntryPointers: () => currentRevisionId === null
        ? { ok: false, error: { code: "ENTRY_POINTER_NOT_FOUND" } }
        : { ok: true, value: { entryId: "entry-a", currentRevisionId } },
      getRevision: () => ({ ok: true, value: { schemaIdentity } }),
    } as never,
    siteDefinition: {} as never,
    dataMedia: {} as never,
    schemaValidator: { validate: () => ({ ok: true }) },
    pluginHost: host,
    contentReadModel: { read: () => ({ ok: true, value: { contract: "structured-content-artifact/v1", content, bytes: new Uint8Array(), digest: digest(content) } }) },
  });
}

test("CMS SEO analysis preserves nullable new-entry baseline and maps available and unavailable results", async () => {
  const producer = { identity: { id: "seo-basics", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: digest({ manifest: 1 }), capabilities: ["cms-seo-analysis"] as const }, hook: "cms/seo/analyze" as const, priority: 100, inputDigest: digest({ input: 1 }), outputDigest: digest({ output: 1 }), settingsDigest: digest({ settings: 1 }) };
  const availableHost = {
    analyzeCmsSeo: async () => ({ ok: true, value: { status: "available", preview: { title: "Entry", canonicalPath: "/notes/entry-a" }, suggestions: [{ code: "SEO_TITLE_MISSING", field: "title" }] as const, producers: [producer], settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/base/", indexing: "allow" as const }, settingsDigest: producer.settingsDigest } }),
    replaceSettings: async () => ({ ok: true, value: { digest: digest({ settingsState: 1 }), state: { contract: "plugin-settings-state/v1", records: [] } } }),
  } as unknown as PluginHost;
  const available = await application(availableHost).analyzeCmsSeo(request());
  assert.equal(available.ok, true, available.ok ? "" : available.error.code);
  if (available.ok) {
    assert.equal(available.value.result.status, "available");
    if (available.value.result.status === "available") assert.equal(available.value.result.preview.canonicalUrl, "https://example.test/base/notes/entry-a/");
  }

  const unavailableHost = { ...availableHost, analyzeCmsSeo: async () => ({ ok: true, value: { status: "unavailable", diagnostics: [] } }) } as unknown as PluginHost;
  const unavailable = await application(unavailableHost).analyzeCmsSeo(request());
  assert.equal(unavailable.ok, true);
  if (unavailable.ok) assert.equal(unavailable.value.result.status, "unavailable");
});

test("Plugin settings rejects malformed requests and delegates an exact settings CAS", async () => {
  let captured: unknown;
  const host = {
    replaceSettings: async (input: unknown) => {
      captured = input;
      return { ok: true, value: { digest: digest({ settingsState: 2 }), state: { contract: "plugin-settings-state/v1", records: [] } } };
    },
  } as unknown as PluginHost;
  const app = application(host);
  const invalid = await app.replacePluginSettings({} as never);
  assert.equal(invalid.ok, false);
  const identity = { id: "seo-basics", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest({ manifest: 1 }), capabilities: ["cms-seo-analysis"] as const };
  const settings = { contract: "seo-plugin-settings/v1" as const, publicSiteUrl: "https://example.test/", indexing: "allow" as const };
  const valid = await app.replacePluginSettings({ contract: "plugin-settings-replace-request/v1", identity, expectedSettingsStateDigest: digest({ state: 1 }), settingsContract: "seo-plugin-settings/v1", settings });
  assert.equal(valid.ok, true);
  assert.deepEqual(captured, { contract: "plugin-settings-replace-request/v1", identity, expectedSettingsStateDigest: digest({ state: 1 }), settingsContract: "seo-plugin-settings/v1", settings });
});
