import assert from "node:assert/strict";
import test from "node:test";

import { createDomainApplication } from "../../../core/application/index.js";
import type { DataMedia } from "../../../core/media/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import type { CmsEditorBlockResolution, CmsEditorBlockSource, PluginHost } from "../../../core/plugin-host/index.js";
import type { SiteDefinition } from "../../../core/site-definition/index.js";
import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue } from "../../../core/foundation/index.js";
import { createTaxonomy } from "../../../core/taxonomy/index.js";

const digest = (value: string): Digest => sha256Digest(new TextEncoder().encode(value));

function canonical(value: JsonValue): Uint8Array {
  const result = canonicalJsonBytes(value);
  if (result.ok === false) throw new Error("測試內容必須可 canonicalize");
  return result.value;
}
const manifestHash = digest("plugin manifest");
const source = Object.freeze({ html: "<button>run</button>", css: "button{}", javascript: "void 0" });
const content: JsonValue = Object.freeze({
  contract: "site-content/v1",
  title: "Plugin entry",
  blocks: Object.freeze([
    Object.freeze({ kind: "article", text: "保留文章內容" }),
    Object.freeze({ kind: "interactive-demo", identity: Object.freeze({ id: "demo", version: "1.0.0" }), hook: "cms/editor-block/resolve", manifestHash, source, staticFallback: "替代內容" }),
  ]),
  seo: Object.freeze({}),
});
const encoded = canonical(content);

function host(status: CmsEditorBlockResolution["status"], calls: CmsEditorBlockSource[]): PluginHost {
  return {
    async resolveCmsEditorBlock(input: CmsEditorBlockSource) {
      calls.push(input);
      const sourceBytes = canonical(input.source);
      const evidence = { ...input, sourceBytes, sourceDigest: sha256Digest(sourceBytes) };
      if (status === "active") return { ok: true, value: { status, source: evidence, output: Object.freeze({ rendered: "Host output" }), outputBytes: new Uint8Array([1]), outputDigest: digest("Host output"), activeStateDigest: digest("active") } };
      const code = status === "inactive" ? "PLUGIN_BLOCK_INACTIVE" : status === "missing" ? "PLUGIN_BLOCK_MISSING" : "PLUGIN_BLOCK_IDENTITY_CHANGED";
      const diagnostic = { code, owner: "PluginHost" as const, subjectIds: ["demo"], remediation: { kind: "message" as const, message: `${status} remediation` }, detail: { pluginId: "demo", hook: "cms/editor-block/resolve" as const, capability: "cms-editor-block-resolution" as const, entryId: "entry-a", cause: status } };
      return { ok: true, value: { status, source: evidence, diagnostic, activeStateDigest: digest("active") } };
    },
  } as unknown as PluginHost;
}

function application(status: CmsEditorBlockResolution["status"], calls: CmsEditorBlockSource[]) {
  const persistence = {
    getEntryPointers: () => ({ ok: true, value: { entryId: "entry-a", currentRevisionId: "revision-a" } }),
    getRevision: () => ({ ok: true, value: { identity: { entryId: "entry-a", revisionId: "revision-a" }, schemaIdentity: { schemaId: "site-content", version: 1 }, contentBytes: encoded, contentDigest: sha256Digest(encoded) } }),
    canonicalState: () => ({ ok: true, value: { digest: digest("state") } }),
  } as unknown as PersistenceStore;
  return createDomainApplication({ persistence, siteDefinition: {} as SiteDefinition, dataMedia: {} as DataMedia, schemaValidator: { validate: () => ({ ok: true }) }, pluginHost: host(status, calls), taxonomy: createTaxonomy({ persistence }) });
}

test("CMS editor block resolution 從 current canonical source 建立 minimal identity binding 並回傳 Host output", async () => {
  const calls: CmsEditorBlockSource[] = [];
  const result = await application("active", calls).resolveCurrentCmsEditorBlocks({ contract: "cms-editor-block-resolutions-request/v1", entryId: "entry-a" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(calls, [{ contract: "cms-editor-block-source/v1", entryId: "entry-a", revisionId: "revision-a", pluginIdentity: { id: "demo", version: "1.0.0", hook: "cms/editor-block/resolve", manifestHash }, source }]);
  const sourceBytes = canonical(source);
  assert.equal(result.value.items[0]?.sourceDigest, sha256Digest(sourceBytes));
  assert.equal(result.value.items[0]?.status, "active");
  assert.deepEqual(result.value.items[0]?.status === "active" ? result.value.items[0].output : undefined, { rendered: "Host output" });
});

test("CMS editor block resolution 保留 inactive、missing 與 identity-changed 的 source 與 Host diagnostic", async () => {
  for (const status of ["inactive", "missing", "identity-changed"] as const) {
    const calls: CmsEditorBlockSource[] = [];
    const result = await application(status, calls).resolveCurrentCmsEditorBlocks({ contract: "cms-editor-block-resolutions-request/v1", entryId: "entry-a" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const item = result.value.items[0];
    assert.notEqual(item, undefined);
    if (item === undefined || item.status === "active") continue;
    assert.equal(item.status, status);
    assert.deepEqual(item.source, source);
    assert.equal(item.diagnostic.code, status === "inactive" ? "PLUGIN_BLOCK_INACTIVE" : status === "missing" ? "PLUGIN_BLOCK_MISSING" : "PLUGIN_BLOCK_IDENTITY_CHANGED");
    assert.equal(item.diagnostic.detail?.cause, status);
  }
});
