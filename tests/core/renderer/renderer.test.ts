import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";
import { routeSnapshotDigest } from "../../../core/site-definition/index.js";

function canonical(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical");
  return result.value;
}
function digest(value: unknown): `sha256:${string}` { return sha256Digest(canonical(value)); }
function artifact(input: Readonly<{ themeSource?: string; pluginSource?: string; media?: boolean; seo?: boolean; indexing?: "allow" | "disallow"; routes?: readonly string[]; stylesheet?: boolean }> = {}) {
  const claimedRoutes = input.routes ?? ["/guide"];
  const stylesheetResources = input.stylesheet ? "['assets/theme.css']" : "[]";
  const themeSource = input.themeSource ?? `export function render(input) { return { contract: 'theme-render-output/v1', pages: input.routes.map((route) => ({ route: route.normalizedRoute, language: 'zh-Hant', bodyHtml: '<h1>' + input.entries[0].content.title + '</h1>' + input.entries[0].blocks.join(''), stylesheetResources: ${stylesheetResources} })) }; }`;
  const themeStylesheet = "body{color:#000}";
  const pluginSource = input.pluginSource ?? "export function block(input) { return { contract: 'public-block-render-output/v1', html: '<aside>' + input.entries[0].content.title + '</aside>' }; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [{ path: 'assets/plugin.txt', bytesBase64: 'cGx1Z2lu' }] }; }";
  const content = { contract: "site-content/v1" as const, title: "公開", blocks: [{ kind: "article" as const, text: "公開內容" }], seo: {} };
  const objectDigest = sha256Digest(new Uint8Array([0]));
  const media = input.media ? { contract: "renderer-media/v1" as const, references: [{ entryId: "entry", revisionId: "r1", assetVersion: { assetId: "asset", assetVersionId: "v1" } }], assets: [{ identity: { assetId: "asset", assetVersionId: "v1" }, objectDigest, byteLength: 1, metadata: {}, metadataDigest: digest({}) }], objects: [{ objectDigest, byteLength: 1, bytesBase64url: "AA" }] } : { contract: "renderer-media/v1" as const, references: [], assets: [], objects: [] };
  const themeResources = input.stylesheet ? [{ file: "assets/theme.css", digest: sha256Digest(new TextEncoder().encode(themeStylesheet)) }] : [];
  const manifest = { contract: "theme-manifest/v1" as const, id: "theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(new TextEncoder().encode(themeSource)) }, resources: themeResources };
  const themeIdentity = { id: manifest.id, version: manifest.version, manifestHash: sha256Digest(canonical(manifest)) };
  const pluginManifest = { manifestVersion: "plugin-manifest/v1" as const, id: "plugin", version: "1.0.0", trustedLocal: true as const, hookContract: "plugin-hooks/v1" as const, capabilities: ["public-assets-emitter" as const, "public-block-renderer" as const], entry: { file: "entry.mjs", digest: sha256Digest(new TextEncoder().encode(pluginSource)) }, callbacks: [{ hook: "public/assets/emit" as const, exportName: "assets", priority: 10 }, { hook: "public/block/render" as const, exportName: "block", priority: 10 }], resources: [] };
  const identity = { id: "plugin", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: sha256Digest(canonical(pluginManifest)), capabilities: pluginManifest.capabilities };
  const activeStateDigest = digest({ contract: "plugin-activation-state/v2", active: [identity], reactivationRequired: [] });
  const claims = claimedRoutes.map((normalizedRoute, index) => ({ normalizedRoute, owner: index === 0 ? "entry" : `entry${index}`, sourceRevisionId: index === 0 ? "r1" : `r${index + 1}` }));
  const entries = claims.map((claimed) => ({ entryId: claimed.owner, revisionId: claimed.sourceRevisionId, schemaIdentity: { schemaId: "note", version: 1 }, content, contentDigest: sha256Digest(canonical(content)) }));
  const selection = { publishedRevisionIds: entries.map((entry) => ({ entryId: entry.entryId, revisionId: entry.revisionId })), routeGraphDigest: routeSnapshotDigest("published", claims)!, mediaSelectionDigest: digest({ contract: "renderer-media-selection/v1", references: media.references, assets: media.assets.map(({ identity: assetIdentity, objectDigest, byteLength, metadata, metadataDigest }) => ({ identity: assetIdentity, objectDigest, byteLength, metadata, metadataDigest })), objects: media.objects.map(({ objectDigest, byteLength }) => ({ objectDigest, byteLength })) }) };
  const payload = {
    contract: "renderer-input/v1" as const,
    selection,
    entries,
    routes: { contract: "route-graph-snapshot/v1" as const, normalization: "route-normalization/v1" as const, graph: "published" as const, claims },
    media,
    theme: { identity: themeIdentity, manifest, activationStateDigest: digest({ contract: "theme-activation-state/v1", active: themeIdentity }), files: [{ role: "runtime" as const, file: "runtime.mjs", digest: manifest.runtime.digest, bytesBase64url: Buffer.from(themeSource).toString("base64url") }, ...themeResources.map((resource) => ({ role: "resource" as const, file: resource.file, digest: resource.digest, bytesBase64url: Buffer.from(themeStylesheet).toString("base64url") }))] },
    plugins: { activationStateDigest: activeStateDigest, settingsStateDigest: digest({ contract: "plugin-settings-state/v1", records: [] }), identities: [identity], renderers: [{ identity, manifest: pluginManifest, entryBytesBase64url: Buffer.from(pluginSource).toString("base64url"), entryDigest: sha256Digest(new TextEncoder().encode(pluginSource)), resources: [], callbacks: [{ hook: "public/assets/emit" as const, exportName: "assets", priority: 10 }, { hook: "public/block/render" as const, exportName: "block", priority: 10 }] }], seo: input.seo ? { status: "available" as const, pages: [{ route: "/guide", title: "SEO 公開", description: "說明", canonicalUrl: "https://example.test/guide/", jsonLd: { "@context": "https://schema.org", "@type": "Article" } }], publicSiteUrl: "https://example.test/", indexing: input.indexing ?? "allow", omissionDigest: digest({ omissions: [] }) } : { status: "omitted" as const, pages: [], omissionDigest: digest({ omissions: [] }) } },
  };
  const full = { ...payload, inputDigest: sha256Digest(canonical(payload)) };
  const bytes = canonical(full);
  return { bytes, inputDigest: full.inputDigest, bytesDigest: sha256Digest(bytes) };
}

test("Renderer 只執行通過 strict parser 的封存 Theme 與 Plugin bytes", async () => {
  const result = await createStaticRenderer().render(artifact());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.routes, [{ route: "/guide", filePath: result.value.routes[0]!.filePath }]);
  assert.match(new TextDecoder().decode(result.value.files.find((file) => file.path === result.value.routes[0]!.filePath)!.bytes), /<body><h1>公開<\/h1><aside>公開<\/aside><\/body>/u);
  assert.equal(new TextDecoder().decode(result.value.files.find((file) => file.path === "assets/plugin.txt")!.bytes), "plugin");
});

test("Renderer produces ordered SEO head and public site files from prepared contributions", async () => {
  const result = await createStaticRenderer().render(artifact({ seo: true }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const page = new TextDecoder().decode(result.value.files.find((file) => file.path === result.value.routes[0]!.filePath)!.bytes);
  assert.match(page, /<title>SEO 公開<\/title><meta name="description" content="說明"><link rel="canonical" href="https:\/\/example\.test\/guide\/">/u);
  assert.match(new TextDecoder().decode(result.value.files.find((file) => file.path === "sitemap.xml")!.bytes), /https:\/\/example\.test\/guide\//u);
  assert.match(new TextDecoder().decode(result.value.files.find((file) => file.path === "robots.txt")!.bytes), /Sitemap: https:\/\/example\.test\/sitemap\.xml/u);
});

test("Renderer 依 sealed SEO indexing 輸出精確 robots 規則", async () => {
  const result = await createStaticRenderer().render(artifact({ seo: true, indexing: "disallow" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(new TextDecoder().decode(result.value.files.find((file) => file.path === "robots.txt")!.bytes), "User-agent: *\nDisallow: /\nSitemap: https://example.test/sitemap.xml\n");
});

test("Renderer 在載入 module 前拒絕 media evidence", async () => {
  const result = await createStaticRenderer().render(artifact({ media: true }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "PUBLIC_MEDIA_UNSUPPORTED");
});

test("Renderer 拒絕 dependency graph 與 Promise callback", async () => {
  const dependency = await createStaticRenderer().render(artifact({ themeSource: "import 'node:fs'; export function render() {}" }));
  assert.equal(dependency.ok, false);
  if (!dependency.ok) assert.equal(dependency.error.code, "RENDERER_MODULE_INVALID");
  const promise = await createStaticRenderer().render(artifact({ pluginSource: "export function block() { return Promise.reject(new Error('x')); } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }" }));
  assert.equal(promise.ok, false);
  if (!promise.ok) assert.equal(promise.error.code, "RENDERER_CALLBACK_RESULT_INVALID");
});

test("Renderer 將 hostile callback 結果視為無效而非讓 getter 或 thenable 逸出", async () => {
  const getter = await createStaticRenderer().render(artifact({ pluginSource: "export function block() { const value = { contract: 'public-block-render-output/v1' }; Object.defineProperty(value, 'html', { enumerable: true, get() { throw new Error('getter'); } }); return value; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }" }));
  assert.equal(getter.ok, false);
  if (!getter.ok) assert.equal(getter.error.code, "RENDERER_CALLBACK_RESULT_INVALID");
  const thenExport = await createStaticRenderer().render(artifact({ pluginSource: "export const then = () => {}; export function block() { return { contract: 'public-block-render-output/v1', html: '' }; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }" }));
  assert.equal(thenExport.ok, false);
  if (!thenExport.ok) assert.equal(thenExport.error.code, "RENDERER_MODULE_INVALID");
  const proxy = await createStaticRenderer().render(artifact({ pluginSource: "export function block() { return new Proxy({}, { getPrototypeOf() { throw new Error('proxy'); } }); } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }" }));
  assert.equal(proxy.ok, false);
  if (!proxy.ok) assert.equal(proxy.error.code, "RENDERER_CALLBACK_RESULT_INVALID");
});

test("頁內 stylesheet 相對 URL 以公開 route 深度計算，而非 artifact 檔案位置", async () => {
  const result = await createStaticRenderer().render(artifact({ routes: ["/guide", "/a/b/c"], stylesheet: true }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const hrefFor = (route: string): string | undefined => {
    const filePath = result.value.routes.find((item) => item.route === route)?.filePath;
    const page = new TextDecoder().decode(result.value.files.find((file) => file.path === filePath)!.bytes);
    return /<link rel="stylesheet" href="([^"]+)">/u.exec(page)?.[1];
  };
  const stylesheet = result.value.files.find((file) => file.path.startsWith("assets/theme/"))!.path;
  // 公開 URL 為 `<basePath><route>/`；相對 URL 必須從該 URL 解析回 artifact 根目錄。
  assert.equal(hrefFor("/guide"), `../${stylesheet}`);
  assert.equal(hrefFor("/a/b/c"), `../../../${stylesheet}`);
  for (const route of ["/guide", "/a/b/c"]) {
    assert.equal(new URL(hrefFor(route)!, `https://example.test/repository/${route.slice(1)}/`).href, `https://example.test/repository/${stylesheet}`);
  }
});
