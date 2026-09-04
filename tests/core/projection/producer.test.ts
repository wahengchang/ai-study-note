import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createProjection } from "../../../core/projection/index.js";

function digest(value: Uint8Array | string): `sha256:${string}` {
  return sha256Digest(typeof value === "string" ? new TextEncoder().encode(value) : value);
}

test("Projection 封存已啟用 Theme 與公開 Plugin 的完整 verified bytes", async () => {
  const contentBytes = canonicalJsonBytes({ title: "公開內容" });
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
