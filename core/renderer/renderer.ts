import path from "node:path";

import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import { parseRendererInput, type RendererInput, type RendererInputArtifact } from "../projection/index.js";
import { isArtifactFilePath } from "./contracts.js";
import type { RenderedFile, RendererFailure, RendererOutput, RendererResult, StaticRenderer } from "./contracts.js";
import { loadVerifiedRendererModule } from "./module-loader.js";

type Callback = Readonly<{ id: string; hook: "public/block/render" | "public/assets/emit"; priority: number; callback: (input: unknown, facade: unknown) => unknown; resources: RendererInput["plugins"]["renderers"][number]["resources"] }>;
type ThemePage = Readonly<{ route: string; language: string; bodyHtml: string; stylesheetResources: readonly string[] }>;
type SeoPage = Readonly<{ title: string; description?: string; canonical: string; jsonLd?: JsonValue }>;

function failure(code: RendererFailure["code"]): RendererResult<never> { return Object.freeze({ ok: false, error: Object.freeze({ code, owner: "Renderer", subjectIds: Object.freeze([]), remediation: Object.freeze({ kind: "message", message: "Renderer 無法從已封存的公開輸入建立 artifact。" }) }) }); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function routePath(route: string): string { return `pages/${sha256Digest(new TextEncoder().encode(route)).slice("sha256:".length)}/index.html`; }
/**
 * artifact 內的檔案位置與公開 URL 是兩件事：
 *
 *   normalizedRoute `/a/b`  ──manifest.routes──▶  file `pages/<digest>/index.html`
 *          │                                                  │
 *          └── 公開 URL `<basePath>a/b/`  ◀── PublicDelivery／Pages 依 route 服務
 *
 * 瀏覽器以公開 URL（而非 artifact 路徑）解析文件內的相對 URL，因此頁內資源必須以
 * route 深度計算相對路徑；改用固定兩層的 artifact 路徑會在 route 深度不是兩段、
 * 或部署在 GitHub Pages project base path 之下時指向不存在的位置。
 */
function routeDirectory(route: string): string { return route === "/" ? "." : route.slice(1); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!); }
function escapeScript(value: string): string { return value.replace(/[<>&\u2028\u2029]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]!); }
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;
function thenable(value: unknown): boolean { try { return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function"; } catch { return true; } }
function observeRejectedPromise(value: unknown): void { try { if (value instanceof NativePromise) void nativePromiseThen.call(value, undefined, () => undefined); } catch {} }
function frozen<T>(value: T): T { if (value !== null && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) frozen(child); Object.freeze(value); } return value; }
function outputRecord(value: unknown, keys: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || thenable(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(value);
    if (own.some((key) => typeof key !== "string" || (!keys.includes(key) && !optional.includes(key))) || !keys.every((key) => own.includes(key))) return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of [...keys, ...optional]) {
      if (!own.includes(key)) continue;
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}
function outputArray(value: unknown): readonly unknown[] | null { if (!Array.isArray(value) || thenable(value)) return null; try { const descriptors = Object.getOwnPropertyDescriptors(value); const length = Object.getOwnPropertyDescriptor(value, "length"); if (length === undefined || !("value" in length) || typeof length.value !== "number") return null; const result: unknown[] = []; for (let index = 0; index < length.value; index += 1) { const descriptor = descriptors[String(index)]; if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null; result.push(descriptor.value); } return Reflect.ownKeys(value).length === length.value + 1 ? result : null; } catch { return null; } }
function base64(value: unknown): Uint8Array | null { if (typeof value !== "string") return null; try { const bytes = new Uint8Array(Buffer.from(value, "base64")); return Buffer.from(bytes).toString("base64") === value ? bytes : null; } catch { return null; } }
function outputFiles(items: readonly Readonly<{ path: string; bytes: Uint8Array }>[], files: RenderedFile[], paths: Set<string>): boolean { for (const item of items) { if (!isArtifactFilePath(item.path) || paths.has(item.path)) return false; paths.add(item.path); files.push(Object.freeze({ path: item.path, bytes: copyBytes(item.bytes), digest: sha256Digest(item.bytes) })); } return true; }
function blockOutput(value: unknown): string | null { observeRejectedPromise(value); const output = outputRecord(value, ["contract", "html"]); return output?.contract === "public-block-render-output/v1" && typeof output.html === "string" ? output.html : null; }
function assetOutput(value: unknown): readonly Readonly<{ path: string; bytes: Uint8Array }>[] | null { observeRejectedPromise(value); const output = outputRecord(value, ["contract", "files"]); const items = output?.contract === "public-assets-emit-output/v1" ? outputArray(output.files) : null; if (items === null) return null; const files = []; for (const item of items) { const file = outputRecord(item, ["path", "bytesBase64"]); const bytes = file === null ? null : base64(file.bytesBase64); if (file === null || typeof file.path !== "string" || bytes === null) return null; files.push(Object.freeze({ path: file.path, bytes })); } return Object.freeze(files); }
function themeOutput(value: unknown, routes: readonly string[]): readonly ThemePage[] | null {
  observeRejectedPromise(value); const output = outputRecord(value, ["contract", "pages"]); const items = output?.contract === "theme-render-output/v1" ? outputArray(output.pages) : null; if (items === null) return null;
  const expected = new Set(routes); const pages: ThemePage[] = [];
  for (const item of items) { const page = outputRecord(item, ["route", "language", "bodyHtml", "stylesheetResources"]); const styles = page === null ? null : outputArray(page.stylesheetResources); if (page === null || typeof page.route !== "string" || typeof page.language !== "string" || page.language.length === 0 || typeof page.bodyHtml !== "string" || styles === null || !styles.every((style) => typeof style === "string") || !expected.delete(page.route)) return null; pages.push(Object.freeze({ route: page.route, language: page.language, bodyHtml: page.bodyHtml, stylesheetResources: Object.freeze([...styles] as string[]) })); }
  return expected.size === 0 ? Object.freeze(pages) : null;
}
function parseSiteUrl(value: unknown): string | null { if (typeof value !== "string" || /[\r\n\0]/u.test(value)) return null; try { const url = new URL(value); if (url.protocol !== "https:" || url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0 || url.pathname !== "/" && !url.pathname.endsWith("/") || url.href !== value) return null; return url.href; } catch { return null; } }
function seo(input: RendererInput): Readonly<{ pages: ReadonlyMap<string, SeoPage>; siteUrl?: string; indexing?: "allow" | "disallow"; count: number; digest: Digest }> | null {
  const snapshot = input.plugins.seo;
  if (snapshot.status === "omitted") return Object.freeze({ pages: new Map(), count: 0, digest: snapshot.omissionDigest });
  const siteUrl = snapshot.publicSiteUrl === undefined ? undefined : parseSiteUrl(snapshot.publicSiteUrl);
  const indexing = snapshot.indexing;
  if (siteUrl === null || (siteUrl === undefined) !== (indexing === undefined) || (indexing !== undefined && indexing !== "allow" && indexing !== "disallow")) return null;
  const knownRoutes = new Set(input.routes.claims.map((route) => route.normalizedRoute));
  const pages = new Map<string, SeoPage>();
  for (const item of snapshot.pages) {
    if (!knownRoutes.has(item.route) || pages.has(item.route) || /[\r\n\0]/u.test(item.canonicalUrl) || (item.title !== undefined && !item.title.length) || (item.description !== undefined && !item.description.length)) return null;
    try { if (new URL(item.canonicalUrl).protocol !== "https:") return null; } catch { return null; }
    if (item.jsonLd !== undefined && !canonicalJsonBytes(item.jsonLd).ok) return null;
    pages.set(item.route, Object.freeze({ title: item.title ?? "", ...(item.description === undefined ? {} : { description: item.description }), canonical: item.canonicalUrl, ...(item.jsonLd === undefined ? {} : { jsonLd: item.jsonLd }) }));
  }
  if (pages.size > 0 && siteUrl === undefined) return null;
  const evidence = canonicalJsonBytes({ pages: snapshot.pages, ...(siteUrl === undefined ? {} : { publicSiteUrl: siteUrl, indexing }) });
  return !evidence.ok ? null : Object.freeze({ pages, ...(siteUrl === undefined ? {} : { siteUrl, indexing }), count: pages.size + (siteUrl === undefined ? 0 : 1), digest: sha256Digest(evidence.value) });
}
function jsonLd(value: JsonValue): string | null {
  const bytes = canonicalJsonBytes(value);
  return bytes.ok ? escapeScript(new TextDecoder().decode(bytes.value)) : null;
}
function head(page: ThemePage, title: string, stylesheetPaths: readonly string[], seoPage?: SeoPage): string {
  const links = stylesheetPaths.map((stylesheet) => `<link rel="stylesheet" href="${escapeHtml(path.posix.relative(routeDirectory(page.route), stylesheet))}">`).join("");
  const structuredData = seoPage?.jsonLd === undefined ? "" : jsonLd(seoPage.jsonLd);
  const seo = seoPage === undefined || structuredData === null ? "" : `${seoPage.description === undefined ? "" : `<meta name="description" content="${escapeHtml(seoPage.description)}">`}<link rel="canonical" href="${escapeHtml(seoPage.canonical)}"><meta property="og:title" content="${escapeHtml(seoPage.title || title)}">${seoPage.description === undefined ? "" : `<meta property="og:description" content="${escapeHtml(seoPage.description)}">`}<meta property="og:url" content="${escapeHtml(seoPage.canonical)}"><meta property="og:type" content="article">${seoPage.jsonLd === undefined ? "" : `<script type="application/ld+json">${structuredData}</script>`}`;
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${links}<title>${escapeHtml(seoPage?.title || title)}</title>${seo}`;
}
async function load(bytes: Uint8Array, manifestHash: Digest, exports: readonly string[]): Promise<Readonly<Record<string, unknown>> | null> { const result = await loadVerifiedRendererModule({ entryBytes: bytes, manifestHash, requiredExports: exports }); return result?.namespace ?? null; }

class Renderer implements StaticRenderer {
  async render(artifact: RendererInputArtifact): Promise<RendererResult<RendererOutput>> {
    const parsed = parseRendererInput(artifact.bytes); if (!parsed.ok || parsed.value.bytesDigest !== artifact.bytesDigest || parsed.value.input.inputDigest !== artifact.inputDigest) return failure("INVALID_RENDERER_INPUT"); const input = parsed.value.input;
    if (input.media.references.length > 0 || input.media.assets.length > 0 || input.media.objects.length > 0) return failure("PUBLIC_MEDIA_UNSUPPORTED");
    for (const entry of input.entries) { const bytes = canonicalJsonBytes(entry.content); if (!bytes.ok || sha256Digest(bytes.value) !== entry.contentDigest) return failure("RENDERER_INPUT_DIGEST_MISMATCH"); }
    const runtime = input.theme.files.find((file) => file.role === "runtime"); if (runtime === undefined) return failure("INVALID_RENDERER_INPUT"); const theme = await load(Buffer.from(runtime.bytesBase64url, "base64url"), input.theme.identity.manifestHash, ["render"]); if (theme === null || typeof theme.render !== "function") return failure("RENDERER_MODULE_INVALID");
    const blocks: Callback[] = []; const assets: Callback[] = [];
    for (const renderer of input.plugins.renderers) { const module = await load(Buffer.from(renderer.entryBytesBase64url, "base64url"), renderer.identity.manifestHash, renderer.callbacks.map((callback) => callback.exportName)); if (module === null) return failure("RENDERER_MODULE_INVALID"); for (const declaration of renderer.callbacks) { const callback = module[declaration.exportName]; if (typeof callback !== "function") return failure("RENDERER_MODULE_INVALID"); const item: Callback = Object.freeze({ id: renderer.identity.id, hook: declaration.hook, priority: declaration.priority, callback: callback as Callback["callback"], resources: renderer.resources }); (declaration.hook === "public/block/render" ? blocks : assets).push(item); } }
    const order = (left: Callback, right: Callback) => left.priority - right.priority || compare(left.id, right.id) || compare(left.hook, right.hook); blocks.sort(order); assets.sort(order); const publicInput = frozen(input); const rendered = new Map<string, string[]>(); const routes = input.routes.claims;
    for (const route of routes) { const target = rendered.get(`${route.owner}\0${route.sourceRevisionId}`) ?? []; for (const item of blocks) { let output: unknown; try { output = item.callback(publicInput, frozen({ capability: "public-block-renderer" as const, route: route.normalizedRoute, entryId: route.owner, revisionId: route.sourceRevisionId, resources: item.resources })); } catch { return failure("RENDERER_CALLBACK_FAILED"); } const html = blockOutput(output); if (html === null) return failure("RENDERER_CALLBACK_RESULT_INVALID"); target.push(html); } rendered.set(`${route.owner}\0${route.sourceRevisionId}`, target); }
    const pluginFiles: Readonly<{ path: string; bytes: Uint8Array }>[] = []; for (const item of assets) { let output: unknown; try { output = item.callback(publicInput, frozen({ capability: "public-assets-emitter" as const, resources: item.resources })); } catch { return failure("RENDERER_CALLBACK_FAILED"); } const files = assetOutput(output); if (files === null) return failure("RENDERER_CALLBACK_RESULT_INVALID"); pluginFiles.push(...files); }
    let themed: unknown; try { themed = (theme.render as (input: unknown, facade: unknown) => unknown)(frozen({ contract: "theme-render-input/v1" as const, selection: input.selection, entries: input.entries.map((entry) => Object.freeze({ ...entry, blocks: Object.freeze(rendered.get(`${entry.entryId}\0${entry.revisionId}`) ?? []) })), routes, media: input.media, resources: input.theme.files }), frozen({ capability: "theme-renderer" as const })); } catch { return failure("RENDERER_CALLBACK_FAILED"); }
    const pages = themeOutput(themed, routes.map((route) => route.normalizedRoute)); if (pages === null) return failure("RENDERER_CALLBACK_RESULT_INVALID"); const seoEvidence = seo(input); if (seoEvidence === null) return failure("SEO_CONTRIBUTION_CONFLICT");
    const themeResources = new Map(input.theme.files.filter((file) => file.role === "resource").map((file) => [file.file, file])); const themeFiles: Readonly<{ path: string; bytes: Uint8Array }>[] = []; const stylesheetPaths = new Map<string, string>();
    for (const page of pages) for (const stylesheet of page.stylesheetResources) { const resource = themeResources.get(stylesheet); if (resource === undefined) return failure("SEO_CONTRIBUTION_CONFLICT"); const artifactPath = `assets/theme/${resource.digest.slice("sha256:".length)}.css`; const prior = stylesheetPaths.get(stylesheet); if (prior !== undefined && prior !== artifactPath) return failure("RENDER_OUTPUT_CONFLICT"); stylesheetPaths.set(stylesheet, artifactPath); }
    for (const [resource, artifactPath] of stylesheetPaths) { const file = themeResources.get(resource); if (file === undefined) return failure("RENDER_OUTPUT_CONFLICT"); themeFiles.push(Object.freeze({ path: artifactPath, bytes: new Uint8Array(Buffer.from(file.bytesBase64url, "base64url")) })); }
    const entries = new Map(input.entries.map((entry) => [`${entry.entryId}\0${entry.revisionId}`, entry])); const documents: Readonly<{ path: string; bytes: Uint8Array }>[] = [];
    for (const page of pages) { const route = routes.find((claim) => claim.normalizedRoute === page.route); const entry = route === undefined ? undefined : entries.get(`${route.owner}\0${route.sourceRevisionId}`); if (entry === undefined) return failure("RENDER_OUTPUT_CONFLICT"); const styles = page.stylesheetResources.map((resource) => stylesheetPaths.get(resource)!); documents.push(Object.freeze({ path: routePath(page.route), bytes: new TextEncoder().encode(`<!doctype html><html lang="${escapeHtml(page.language)}"><head>${head(page, entry.content.title, styles, seoEvidence.pages.get(page.route))}</head><body>${page.bodyHtml}</body></html>`) })); }
    const siteFiles: Readonly<{ path: string; bytes: Uint8Array }>[] = []; if (seoEvidence.siteUrl !== undefined) { const urls = routes.map((route) => new URL(route.normalizedRoute === "/" ? "" : `${route.normalizedRoute.slice(1)}/`, seoEvidence.siteUrl).href).sort(compare); const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc></url>`).join("")}</urlset>\n`; const robots = `User-agent: *\n${seoEvidence.indexing === "disallow" ? "Disallow" : "Allow"}: /\nSitemap: ${seoEvidence.siteUrl}sitemap.xml\n`; siteFiles.push(Object.freeze({ path: "sitemap.xml", bytes: new TextEncoder().encode(sitemap) }), Object.freeze({ path: "robots.txt", bytes: new TextEncoder().encode(robots) })); }
    const files: RenderedFile[] = []; const paths = new Set<string>(); if (!outputFiles(pluginFiles, files, paths) || !outputFiles(themeFiles, files, paths) || !outputFiles(documents, files, paths) || !outputFiles(siteFiles, files, paths)) return failure("RENDER_OUTPUT_CONFLICT"); files.sort((left, right) => compare(left.path, right.path)); const routeFiles = documents.map((page) => Object.freeze({ route: pages.find((candidate) => routePath(candidate.route) === page.path)!.route, filePath: page.path })).sort((left, right) => compare(left.route, right.route));
    const provenance = Object.freeze({ publishedRevisionIds: Object.freeze(input.selection.publishedRevisionIds.map((item) => Object.freeze({ ...item }))), routeGraphDigest: input.selection.routeGraphDigest, mediaSelectionDigest: input.selection.mediaSelectionDigest, theme: Object.freeze({ ...input.theme.identity }), plugins: Object.freeze(input.plugins.identities.map((item) => Object.freeze({ id: item.id, version: item.version, manifestHash: item.manifestHash }))), seo: Object.freeze({ count: seoEvidence.count, digest: seoEvidence.digest }) }); const evidence = canonicalJsonBytes({ provenance, routes: routeFiles, files: files.map((file) => ({ path: file.path, digest: file.digest })) }); return !evidence.ok ? failure("RENDER_OUTPUT_CONFLICT") : Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-output/v1", rendererInputDigest: artifact.inputDigest, provenance, routes: Object.freeze(routeFiles), files: Object.freeze(files), outputDigest: sha256Digest(evidence.value) }) });
  }
}
export function createStaticRenderer(): StaticRenderer { return new Renderer(); }
