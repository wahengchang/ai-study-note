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
  const themeSource = "export function render(input) { return { contract: 'theme-render-output/v1', pages: input.routes.map((route) => ({ route: route.normalizedRoute, language: 'zh-Hant', bodyHtml: '<h1>' + input.entries[0].content.title + '</h1>', stylesheetResources: [] })) }; }";
  const themeManifest = { contract: "theme-manifest/v1" as const, id: "theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(new TextEncoder().encode(themeSource)) }, resources: [] };
  const themeIdentity = { id: themeManifest.id, version: themeManifest.version, manifestHash: digest(themeManifest) };
  const content = { contract: "site-content/v1" as const, title: "公開內容", blocks: [{ kind: "article" as const, text: "內容" }], seo: {} };
  const extension = pluginSource === undefined ? undefined : (() => {
    const manifest = { manifestVersion: "plugin-manifest/v1" as const, id: "assets", version: "1.0.0", trustedLocal: true as const, hookContract: "plugin-hooks/v1" as const, capabilities: ["public-assets-emitter" as const], entry: { file: "entry.mjs", digest: sha256Digest(new TextEncoder().encode(pluginSource)) }, callbacks: [{ hook: "public/assets/emit" as const, exportName: "emit", priority: 0 }], resources: [] };
    return { manifest, identity: { id: manifest.id, version: manifest.version, hookContract: manifest.hookContract, manifestHash: digest(manifest), capabilities: manifest.capabilities } };
  })();
  const media = { contract: "renderer-media/v1" as const, references: [], assets: [], objects: [] };
  const identities = extension === undefined ? [] : [extension.identity];
  const plugins = { activationStateDigest: digest({ contract: "plugin-activation-state/v2", active: identities, reactivationRequired: [] }), settingsStateDigest: digest({ contract: "plugin-settings-state/v1", records: [] }), identities, renderers: extension === undefined ? [] : [{ identity: extension.identity, manifest: extension.manifest, entryBytesBase64url: Buffer.from(pluginSource!).toString("base64url"), entryDigest: extension.manifest.entry.digest, resources: [], callbacks: extension.manifest.callbacks }], seo: { status: "omitted" as const, pages: [], omissionDigest: digest({ omissions: [] }) } };
  const claims = [{ normalizedRoute: "/guide", owner: "note", sourceRevisionId: "published" }];
  const payload = { contract: "renderer-input/v1" as const, selection: { publishedRevisionIds: [{ entryId: "note", revisionId: "published" }], routeGraphDigest: digest({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims }), mediaSelectionDigest: digest({ contract: "renderer-media-selection/v1", references: [], assets: [], objects: [] }), taxonomySelectionDigest: digest({ contract: "renderer-taxonomy-selection/v1", entries: [{ entryId: "note", revisionId: "published", taxonomyBindings: [] }] }) }, entries: [{ entryId: "note", revisionId: "published", schemaIdentity: { schemaId: "note", version: 1 }, content, contentDigest: digest(content), taxonomyBindings: [] }], routes: { contract: "route-graph-snapshot/v1" as const, normalization: "route-normalization/v1" as const, graph: "published" as const, claims }, media, theme: { identity: themeIdentity, manifest: themeManifest, activationStateDigest: digest({ contract: "theme-activation-state/v1", active: themeIdentity }), files: [{ role: "runtime" as const, file: "runtime.mjs", digest: themeManifest.runtime.digest, bytesBase64url: Buffer.from(themeSource).toString("base64url") }] }, plugins };
  const input = { ...payload, inputDigest: digest(payload) }; const bytes = canonical(input); return { bytes, inputDigest: input.inputDigest, bytesDigest: sha256Digest(bytes) };
}

test("相同 immutable renderer input 會交付相同的 Theme artifact", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "renderer-delivery-"));
  try { const renderer = createStaticRenderer(); const first = await renderer.render(artifact()); const second = await renderer.render(artifact()); assert.equal(first.ok && second.ok, true); if (!first.ok || !second.ok) return; assert.deepEqual(first.value, second.value); const delivery = createPublicDelivery({ artifactsRoot: root }); assert.equal(delivery.ok, true); if (!delivery.ok) return; const result = delivery.value.deliver(first.value); assert.equal(result.ok, true); if (!result.ok) return; assert.match(readFileSync(path.join(result.value.directory, first.value.routes[0]?.filePath ?? ""), "utf8"), /<body><h1>公開內容<\/h1><\/body>/u); } finally { rmSync(root, { recursive: true, force: true }); }
});
test("Plugin 發出的非 HTML asset 會通過 Renderer 與 Delivery 的同一 path profile", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "renderer-delivery-"));
  try { const rendered = await createStaticRenderer().render(artifact("export function emit() { return { contract: 'public-assets-emit-output/v1', files: [{ path: 'assets/site.css', bytesBase64: 'Ym9keXtjb2xvcjpibGFja30=' }] }; }")); assert.equal(rendered.ok, true); if (!rendered.ok) return; const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") }); assert.equal(delivery.ok, true); if (!delivery.ok) return; const delivered = delivery.value.deliver(rendered.value); assert.equal(delivered.ok, true); if (!delivered.ok) return; assert.equal(readFileSync(path.join(delivered.value.directory, "assets/site.css"), "utf8"), "body{color:black}"); } finally { rmSync(root, { recursive: true, force: true }); }
});
