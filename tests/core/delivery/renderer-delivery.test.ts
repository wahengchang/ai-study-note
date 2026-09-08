import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function canonical(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); assert.equal(result.ok, true); if (!result.ok) throw new Error("canonical"); return result.value; }
function digest(value: unknown) { return sha256Digest(canonical(value)); }
function artifact(pluginSource?: string) {
  const themeSource = "export function render(input) { return { contract: 'theme-render-output/v1', pages: input.routes.map((route) => ({ route: route.normalizedRoute, html: '<h1>' + input.entries[0].content.title + '</h1>' })) }; }";
  const themeManifest = { contract: "theme-manifest/v1" as const, id: "theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(new TextEncoder().encode(themeSource)) }, resources: [] };
  const content = { contract: "site-content/v1" as const, title: "公開內容", blocks: [{ kind: "article" as const, text: "內容" }] };
  const identity = pluginSource === undefined ? undefined : (() => {
    const manifest = { manifestVersion: "plugin-manifest/v1" as const, id: "assets", version: "1.0.0", trustedLocal: true as const, hookContract: "plugin-hooks/v1" as const, capabilities: ["public-assets-emitter" as const], entry: { file: "entry.mjs", digest: sha256Digest(new TextEncoder().encode(pluginSource)) }, callbacks: [{ hook: "public/assets/emit" as const, exportName: "emit", priority: 0 }], resources: [] };
    return { manifest, identity: { id: manifest.id, version: manifest.version, hookContract: manifest.hookContract, manifestHash: digest(manifest) } };
  })();
  const media = { contract: "renderer-media/v1" as const, references: [], assets: [], objects: [] };
  const plugins = identity === undefined ? { activeStateDigest: digest({ contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] }), identities: [], renderers: [] } : { activeStateDigest: digest({ contract: "plugin-activation-state/v2", active: [identity.identity], reactivationRequired: [] }), identities: [identity.identity], renderers: [{ identity: identity.identity, manifest: identity.manifest, entryBytesBase64url: Buffer.from(pluginSource ?? "").toString("base64url"), entryDigest: identity.manifest.entry.digest, resources: [], callbacks: identity.manifest.callbacks }] };
  const payload = { contract: "renderer-input/v1" as const, selection: { publishedRevisionIds: [{ entryId: "note", revisionId: "published" }], routeGraphDigest: digest({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: [{ normalizedRoute: "/guide", owner: "note", sourceRevisionId: "published" }] }), mediaSelectionDigest: digest({ contract: "renderer-media-selection/v1", references: [], assets: [], objects: [] }) }, entries: [{ entryId: "note", revisionId: "published", schemaIdentity: { schemaId: "note", version: 1 }, content, contentDigest: digest(content) }], routes: { contract: "route-graph-snapshot/v1" as const, normalization: "route-normalization/v1" as const, graph: "published" as const, claims: [{ normalizedRoute: "/guide", owner: "note", sourceRevisionId: "published" }] }, media, theme: { identity: { id: themeManifest.id, version: themeManifest.version, manifestHash: digest(themeManifest) }, manifest: themeManifest, files: [{ role: "runtime" as const, file: "runtime.mjs", digest: themeManifest.runtime.digest, bytesBase64url: Buffer.from(themeSource).toString("base64url") }] }, plugins };
  const input = { ...payload, inputDigest: digest(payload) };
  const bytes = canonical(input);
  return { bytes, inputDigest: input.inputDigest, bytesDigest: sha256Digest(bytes) };
}

test("相同 immutable renderer input 會交付相同的 Theme artifact", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "renderer-delivery-"));
  try {
    const renderer = createStaticRenderer();
    const first = await renderer.render(artifact());
    const second = await renderer.render(artifact());
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.deepEqual(first.value, second.value);
    const delivery = createPublicDelivery({ artifactsRoot: root });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const result = delivery.value.deliver(first.value);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(readFileSync(path.join(result.value.directory, first.value.routes[0]?.filePath ?? ""), "utf8"), "<h1>公開內容</h1>");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Plugin 發出的非 HTML asset 會通過 Renderer 與 Delivery 的同一 path profile", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "renderer-delivery-"));
  try {
    const rendered = await createStaticRenderer().render(artifact("export function emit() { return { contract: 'public-assets-emit-output/v1', files: [{ path: 'assets/site.css', bytesBase64: 'Ym9keXtjb2xvcjpibGFja30=' }] }; }"));
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const delivered = delivery.value.deliver(rendered.value);
    assert.equal(delivered.ok, true);
    if (!delivered.ok) return;
    assert.equal(readFileSync(path.join(delivered.value.directory, "assets/site.css"), "utf8"), "body{color:black}");
    const destination = path.join(root, "published");
    assert.equal(delivery.value.redeliver({ artifactDigest: delivered.value.artifactDigest, destination }).ok, true);
    assert.equal(readFileSync(path.join(destination, "assets/site.css"), "utf8"), "body{color:black}");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
