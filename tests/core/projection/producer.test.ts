import assert from "node:assert/strict";
import test from "node:test";

import { createPublishedContentReadModel } from "../../../core/content/index.js";
import { createProjection } from "../../../core/projection/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";

function digest(value: Uint8Array | string): `sha256:${string}` {
  return sha256Digest(typeof value === "string" ? new TextEncoder().encode(value) : value);
}

function contentReadModel() {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) throw new Error();
  return model.value;
}

test("Projection 封存已啟用 Theme 與公開 Plugin 的完整 verified bytes", async () => {
  const contentBytes = canonicalJsonBytes({ contract: "site-content/v1", title: "公開內容", blocks: [] });
  assert.equal(contentBytes.ok, true);
  if (!contentBytes.ok) return;
  const routeDigest = digest("route");
  const themeSource = "export function render() { return { contract: 'theme-render-output/v1', files: [] }; }";
  const pluginSource = "export function renderBlock() { return { contract: 'public-block-render-output/v1', html: '' }; }";
  const themeManifestHash = digest("theme-manifest");
  const pluginManifestHash = digest("plugin-manifest");
  const activePluginStateDigest = digest("plugin-state");
  const projection = createProjection({
    persistence: {
      getEntryPointers: () => ({ ok: true, value: { entryId: "entry", currentRevisionId: "rev", publishedRevisionId: "rev" } }),
      getRevision: () => ({ ok: true, value: { identity: { entryId: "entry", revisionId: "rev" }, schemaIdentity: { schemaId: "schema", version: 1 }, contentBytes: contentBytes.value, contentDigest: digest(contentBytes.value), lineage: { operationId: "operation", operationKind: "publish" } } }),
    } as never,
    siteDefinition: {
      snapshot: () => ({ ok: true, value: { contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: [{ graph: "published", normalizedRoute: "/guide", owner: "entry", sourceRevisionId: "rev" }], bytes: new Uint8Array(), digest: routeDigest } }),
    } as never,
    dataMedia: {
      resolvePublishedSelection: () => ({ ok: true, value: { entryId: "entry", revisionId: "rev", assets: [] } }),
    } as never,
    contentReadModel: contentReadModel(),
    themeHost: {
      resolveActiveRendererSource: async () => ({ ok: true, value: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1", manifestHash: themeManifestHash }, activeStateDigest: digest("theme-state"), entryBytes: new TextEncoder().encode(themeSource), entryDigest: digest(themeSource), resources: [] } }),
      getActiveSnapshot: async () => ({ ok: true, value: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1", manifestHash: themeManifestHash }, digest: digest("theme-state") } }),
    } as never,
    pluginHost: {
      resolveActivePublicRenderers: async () => ({ ok: true, value: [{ identity: { id: "plugin", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: pluginManifestHash }, activeStateDigest: activePluginStateDigest, entryBytes: new TextEncoder().encode(pluginSource), resources: [], callbacks: [{ hook: "public/block/render", exportName: "renderBlock", priority: 0 }] }] }),
      getActiveSnapshot: async () => ({ ok: true, value: { identities: [{ id: "plugin", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: pluginManifestHash }], digest: activePluginStateDigest } }),
    } as never,
  });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const first = await projection.value.producePublishedRendererInput();
  const second = await projection.value.producePublishedRendererInput();
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  const input = JSON.parse(new TextDecoder().decode(first.value.bytes));
  assert.equal(input.theme.entrySourceBase64, Buffer.from(themeSource).toString("base64"));
  assert.equal(input.plugins[0].entryDigest, digest(pluginSource));
  assert.deepEqual(input.plugins[0].callbacks, [{ hook: "public/block/render", exportName: "renderBlock", priority: 0 }]);
});

test("沒有 public renderer Plugin 時，期間的 activation 變更仍讓 published projection 失效", async () => {
  const contentBytes = canonicalJsonBytes({ contract: "site-content/v1", title: "公開內容", blocks: [] });
  assert.equal(contentBytes.ok, true);
  if (!contentBytes.ok) return;
  const themeSource = "export function render() { return { contract: 'theme-render-output/v1', files: [] }; }";
  const themeState = digest("theme-state");
  let pluginStateReads = 0;
  const projection = createProjection({
    persistence: {
      getEntryPointers: () => ({ ok: true, value: { entryId: "entry", currentRevisionId: "rev", publishedRevisionId: "rev" } }),
      getRevision: () => ({ ok: true, value: { identity: { entryId: "entry", revisionId: "rev" }, schemaIdentity: { schemaId: "schema", version: 1 }, contentBytes: contentBytes.value, contentDigest: digest(contentBytes.value), lineage: { operationId: "operation", operationKind: "publish" } } }),
    } as never,
    siteDefinition: {
      snapshot: () => ({ ok: true, value: { contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: [{ graph: "published", normalizedRoute: "/guide", owner: "entry", sourceRevisionId: "rev" }], bytes: new Uint8Array(), digest: digest("route") } }),
    } as never,
    dataMedia: { resolvePublishedSelection: () => ({ ok: true, value: { entryId: "entry", revisionId: "rev", assets: [] } }) } as never,
    contentReadModel: contentReadModel(),
    themeHost: {
      resolveActiveRendererSource: async () => ({ ok: true, value: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1", manifestHash: digest("theme-manifest") }, activeStateDigest: themeState, entryBytes: new TextEncoder().encode(themeSource), entryDigest: digest(themeSource), resources: [] } }),
      getActiveSnapshot: async () => ({ ok: true, value: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1", manifestHash: digest("theme-manifest") }, digest: themeState } }),
    } as never,
    pluginHost: {
      resolveActivePublicRenderers: async () => ({ ok: true, value: [] }),
      getActiveSnapshot: async () => { pluginStateReads += 1; return { ok: true, value: { identities: [], digest: digest(`plugin-state-${pluginStateReads}`) } }; },
    } as never,
  });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const result = await projection.value.producePublishedRendererInput();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "PUBLISHED_SELECTION_STALE");
});
