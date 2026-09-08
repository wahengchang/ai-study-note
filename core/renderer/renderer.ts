import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";
import type { RendererInputArtifact, RendererInputV1 } from "../projection/index.js";
import { isArtifactFilePath } from "./contracts.js";
import type { PublicAssetsEmitOutput, PublicBlockRenderOutput, RenderedFile, RendererFailure, RendererOutput, RendererResult, StaticRenderer, ThemeRenderOutput } from "./contracts.js";
import { loadVerifiedRendererModule } from "./module-loader.js";

// Renderer 只讀 Foundation/Projection，因此以 renderer-input/v1 已宣告的 literal 收斂 extension contract。
const ThemeRendererContract = "theme-renderer/v1";
const PluginHookContract = "plugin-hooks/v1";

type PluginSource = RendererInputV1["plugins"][number];
type PluginCallback = Readonly<{ id: string; priority: number; callback: (input: unknown, facade: unknown) => unknown; resources: PluginSource["resources"] }>;

function error(code: RendererFailure["code"]): RendererResult<never> { return Object.freeze({ ok: false, error: Object.freeze({ code, owner: "Renderer", subjectIds: Object.freeze([]), remediation: Object.freeze({ kind: "message", message: "Renderer 無法從已封存的公開輸入建立 artifact。" }) }) }); }
function exact(value: unknown, keys: readonly string[]): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function thenable(value: unknown): boolean { return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as Readonly<{ then?: unknown }>).then === "function"; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function routePath(route: string): string | null {
  if (route === "/") return `pages/${sha256Digest(new TextEncoder().encode(route)).slice("sha256:".length)}/index.html`;
  if (!route.startsWith("/") || route.includes("//") || route.endsWith("/") || route.includes("\\") || route.includes("%") || /[\u0000-\u001f\u007f]/u.test(route)) return null;
  return `pages/${sha256Digest(new TextEncoder().encode(route)).slice("sha256:".length)}/index.html`;
}
const outputPath = isArtifactFilePath;
function canonicalBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string") return null;
  try {
    const bytes = new Uint8Array(Buffer.from(value, "base64"));
    return Buffer.from(bytes).toString("base64") === value ? bytes : null;
  } catch {
    return null;
  }
}
function verifiedBytes(base64: unknown, digest: unknown): Uint8Array | null {
  if (typeof digest !== "string" || !isDigest(digest)) return null;
  const bytes = canonicalBase64(base64);
  return bytes !== null && sha256Digest(bytes) === digest ? bytes : null;
}
function publicDeclarations(value: unknown): readonly Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }>[] | null {
  if (!Array.isArray(value)) return null;
  const declarations: Array<Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }>> = [];
  for (const item of value) {
    if (!exact(item, ["hook", "exportName", "priority"]) || (item.hook !== "public/block/render" && item.hook !== "public/assets/emit") || typeof item.exportName !== "string" || typeof item.priority !== "number" || !Number.isSafeInteger(item.priority)) return null;
    declarations.push(Object.freeze({ hook: item.hook, exportName: item.exportName, priority: item.priority }));
  }
  return Object.freeze(declarations);
}
// Renderer 依 owner 依賴矩陣不可 import core/content，但 renderer-input bytes 是不受信任輸入，
// 而 entries[].content 已宣告為 site-content/v1。這裡在 boundary 重驗同一 shape，
// 避免未經驗證的 content 形狀直接進入 Theme／Plugin callback。
function structuredSource(value: unknown): boolean {
  return exact(value, ["html", "css", "javascript"]) && typeof value.html === "string" && typeof value.css === "string" && typeof value.javascript === "string";
}
function structuredBlock(value: unknown): boolean {
  if (exact(value, ["kind", "text"])) return value.kind === "article" && typeof value.text === "string";
  if (exact(value, ["kind", "html", "staticFallback"])) return value.kind === "raw-full-page" && typeof value.html === "string" && typeof value.staticFallback === "string";
  return exact(value, ["kind", "pluginIdentity", "source", "staticFallback"])
    && value.kind === "interactive-demo"
    && exact(value.pluginIdentity, ["id", "version", "hookContract", "manifestHash"])
    && typeof value.pluginIdentity.id === "string" && typeof value.pluginIdentity.version === "string"
    && value.pluginIdentity.hookContract === PluginHookContract
    && typeof value.pluginIdentity.manifestHash === "string" && isDigest(value.pluginIdentity.manifestHash)
    && structuredSource(value.source) && typeof value.staticFallback === "string";
}
function structuredContent(value: unknown): boolean {
  if (!exact(value, ["contract", "title", "blocks", "seo"]) || value.contract !== "site-content/v1" || typeof value.title !== "string" || value.title.length === 0 || !Array.isArray(value.blocks) || !value.blocks.every((block) => structuredBlock(block))) return false;
  const seo = value.seo;
  if (seo === null || typeof seo !== "object" || Array.isArray(seo)) return false;
  const keys = Object.keys(seo);
  if (keys.some((key) => key !== "title" && key !== "description" && key !== "canonicalPath")) return false;
  const fields = seo as Record<string, unknown>;
  return (fields.title === undefined || typeof fields.title === "string" && fields.title.length > 0)
    && (fields.description === undefined || typeof fields.description === "string" && fields.description.length > 0)
    && (fields.canonicalPath === undefined || typeof fields.canonicalPath === "string" && fields.canonicalPath.length > 0);
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function outputFiles(input: readonly Readonly<{ path: string; bytes: Uint8Array }>[], files: RenderedFile[], paths: Set<string>): boolean {
  for (const file of input) {
    if (!outputPath(file.path) || paths.has(file.path)) return false;
    paths.add(file.path);
    files.push(Object.freeze({ path: file.path, bytes: copyBytes(file.bytes), digest: sha256Digest(file.bytes) }));
  }
  return true;
}
function blockOutput(value: unknown): string | null {
  if (thenable(value) || !exact(value, ["contract", "html"]) || value.contract !== "public-block-render-output/v1" || typeof value.html !== "string") return null;
  return (value as PublicBlockRenderOutput).html;
}
function assetOutput(value: unknown): readonly Readonly<{ path: string; bytes: Uint8Array }>[] | null {
  if (thenable(value) || !exact(value, ["contract", "files"]) || value.contract !== "public-assets-emit-output/v1" || !Array.isArray(value.files)) return null;
  const files: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
  for (const candidate of (value as PublicAssetsEmitOutput).files) {
    if (!exact(candidate, ["path", "bytesBase64"]) || !outputPath(candidate.path) || typeof candidate.bytesBase64 !== "string") return null;
    const bytes = canonicalBase64(candidate.bytesBase64);
    if (bytes === null) return null;
    files.push(Object.freeze({ path: candidate.path, bytes }));
  }
  return Object.freeze(files);
}
function themeOutput(value: unknown, expectedRoutes: readonly string[]): readonly Readonly<{ path: string; route: string; language: string; bodyHtml: string; stylesheetResources: readonly string[] }>[] | null {
  if (thenable(value) || !exact(value, ["contract", "pages"]) || value.contract !== "theme-render-output/v1" || !Array.isArray(value.pages)) return null;
  const expected = new Set(expectedRoutes);
  const pages: Array<Readonly<{ path: string; route: string; language: string; bodyHtml: string; stylesheetResources: readonly string[] }>> = [];
  for (const page of (value as ThemeRenderOutput).pages) {
    if (!exact(page, ["route", "language", "bodyHtml", "stylesheetResources"]) || typeof page.route !== "string" || !/^[A-Za-z0-9-]+$/u.test(page.language) || typeof page.bodyHtml !== "string" || !Array.isArray(page.stylesheetResources) || new Set(page.stylesheetResources).size !== page.stylesheetResources.length || !page.stylesheetResources.every((resource) => typeof resource === "string" && resource.endsWith(".css")) || !expected.delete(page.route)) return null;
    const path = routePath(page.route);
    if (path === null) return null;
    pages.push(Object.freeze({ route: page.route, path, language: page.language, bodyHtml: page.bodyHtml, stylesheetResources: Object.freeze([...page.stylesheetResources]) }));
  }
  return expected.size === 0 ? Object.freeze(pages) : null;
}
async function module(input: Readonly<{ bytes: Uint8Array; manifestHash: Digest; requiredExports: readonly string[] }>): Promise<Readonly<Record<string, unknown>> | null> {
  const loaded = await loadVerifiedRendererModule({ entryBytes: input.bytes, manifestHash: input.manifestHash, requiredExports: input.requiredExports });
  return loaded?.namespace ?? null;
}
function htmlAttribute(value: string): string { return value.replace(/[&<>"']/gu, (character) => character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : character === "\"" ? "&quot;" : "&#39;"); }
function relativeAssetHref(filePath: string, assetPath: string): string { return "../".repeat(filePath.split("/").length - 1) + assetPath; }
function jsonLdScript(value: unknown): string | null {
  const encoded = canonicalJsonBytes(value);
  if (!encoded.ok) return null;
  return new TextDecoder().decode(encoded.value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
function xml(value: string): string { return value.replace(/[&<>"']/gu, (character) => character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : character === "\"" ? "&quot;" : "&apos;"); }

class Renderer implements StaticRenderer {
  public async render(artifact: RendererInputArtifact): Promise<RendererResult<RendererOutput>> {
    try {
      return await this.renderVerified(artifact);
    } catch {
      return error("INVALID_RENDERER_INPUT");
    }
  }

  private async renderVerified(artifact: RendererInputArtifact): Promise<RendererResult<RendererOutput>> {
    let input: RendererInputV1;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes)) as RendererInputV1; } catch { return error("INVALID_RENDERER_INPUT"); }
    if (input.contract !== "renderer-input/v1" || input.inputDigest !== artifact.inputDigest) return error("INVALID_RENDERER_INPUT");
    const { inputDigest, ...payload } = input;
    const payloadBytes = canonicalJsonBytes(payload);
    const fullBytes = canonicalJsonBytes(input);
    if (!payloadBytes.ok || !fullBytes.ok || sha256Digest(payloadBytes.value) !== inputDigest || fullBytes.value.byteLength !== artifact.bytes.byteLength || fullBytes.value.some((byte, index) => byte !== artifact.bytes[index])) return error("RENDERER_INPUT_DIGEST_MISMATCH");
    if (!Array.isArray(input.entries) || !Array.isArray(input.routes) || !Array.isArray(input.media) || !Array.isArray(input.plugins)) return error("INVALID_RENDERER_INPUT");

    const themeBytes = verifiedBytes(input.theme?.entrySourceBase64, input.theme?.entryDigest);
    if (input.theme === null || typeof input.theme !== "object" || themeBytes === null || !isDigest(input.theme.identity?.manifestHash) || !Array.isArray(input.theme.resources)) return error("INVALID_RENDERER_INPUT");
    if (input.theme.identity.rendererContract !== ThemeRendererContract) return error("UNSUPPORTED_EXTENSION_CONTRACT");
    for (const resource of input.theme.resources) if (verifiedBytes(resource.bytesBase64, resource.digest) === null) return error("INVALID_RENDERER_INPUT");
    const themeModule = await module({ bytes: themeBytes, manifestHash: input.theme.identity.manifestHash, requiredExports: ["render"] });
    if (themeModule === null) return error("RENDERER_MODULE_INVALID");

    const blockCallbacks: PluginCallback[] = [];
    const assetCallbacks: PluginCallback[] = [];
    for (const plugin of input.plugins) {
      const bytes = verifiedBytes(plugin.entrySourceBase64, plugin.entryDigest);
      const declarations = publicDeclarations(plugin.callbacks);
      if (bytes === null || !isDigest(plugin.identity?.manifestHash) || !Array.isArray(plugin.resources) || declarations === null) return error("INVALID_RENDERER_INPUT");
      if (plugin.identity.hookContract !== PluginHookContract) return error("UNSUPPORTED_EXTENSION_CONTRACT");
      for (const resource of plugin.resources) if (verifiedBytes(resource.bytesBase64, resource.digest) === null) return error("INVALID_RENDERER_INPUT");
      const namespace = await module({ bytes, manifestHash: plugin.identity.manifestHash, requiredExports: declarations.map((callback) => callback.exportName) });
      if (namespace === null) return error("RENDERER_MODULE_INVALID");
      for (const declaration of declarations) {
        const callback = namespace[declaration.exportName];
        if (typeof callback !== "function") return error("RENDERER_MODULE_INVALID");
        const item = Object.freeze({ id: plugin.identity.id, priority: declaration.priority, callback: callback as (input: unknown, facade: unknown) => unknown, resources: plugin.resources });
        if (declaration.hook === "public/block/render") blockCallbacks.push(item);
        else assetCallbacks.push(item);
      }
    }
    blockCallbacks.sort((left, right) => left.priority - right.priority || compare(left.id, right.id));
    assetCallbacks.sort((left, right) => left.priority - right.priority || compare(left.id, right.id));
    const publicInput = frozen(input);


    const entries = new Map<string, RendererInputV1["entries"][number]>();
    for (const entry of input.entries) {
      if (typeof entry.entryId !== "string" || typeof entry.revisionId !== "string" || !isDigest(entry.contentDigest) || !structuredContent(entry.content) || entries.has(`${entry.entryId}\0${entry.revisionId}`)) return error("INVALID_RENDERER_INPUT");
      entries.set(`${entry.entryId}\0${entry.revisionId}`, entry);
    }
    const blocks = new Map<string, string[]>();
    const routes = [...input.routes].sort((left, right) => compare(left.route, right.route));
    for (const route of routes) {
      if (typeof route.route !== "string" || routePath(route.route) === null) return error("RENDER_OUTPUT_CONFLICT");
      const entry = entries.get(`${route.entryId}\0${route.revisionId}`);
      if (entry === undefined) return error("INVALID_RENDERER_INPUT");
      const key = `${entry.entryId}\0${entry.revisionId}`;
      const target = blocks.get(key) ?? [];
      for (const item of blockCallbacks) {
        let result: unknown;
        try {
          result = item.callback(publicInput, frozen({ capability: "public-block-renderer" as const, route: route.route, resources: item.resources }));
        } catch {
          return error("RENDERER_CALLBACK_FAILED");
        }
        const html = blockOutput(result);
        if (html === null) return error("RENDERER_CALLBACK_RESULT_INVALID");
        target.push(html);
      }
      blocks.set(key, target);
    }
    const pluginFiles: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
    for (const item of assetCallbacks) {
      let result: unknown;
      try {
        result = item.callback(publicInput, frozen({ capability: "public-assets-emitter" as const, resources: item.resources }));
      } catch {
        return error("RENDERER_CALLBACK_FAILED");
      }
      const emitted = assetOutput(result);
      if (emitted === null) return error("RENDERER_CALLBACK_RESULT_INVALID");
      pluginFiles.push(...emitted);
    }
    let themed: unknown;
    try {
      themed = (themeModule.render as (input: unknown, facade: unknown) => unknown)(
        frozen({ contract: "theme-render-input/v1" as const, selection: input.selection, entries: input.entries.map((entry) => ({ ...entry, blocks: blocks.get(`${entry.entryId}\0${entry.revisionId}`) ?? [] })), routes, media: input.media, resources: input.theme.resources }),
        frozen({ capability: "theme-renderer" as const }),
      );
    } catch {
      return error("RENDERER_CALLBACK_FAILED");
    }
    const themePages = themeOutput(themed, routes.map((route) => route.route));
    if (themePages === null) return error("RENDERER_CALLBACK_RESULT_INVALID");
    if (input.seo === null || typeof input.seo !== "object" || !Array.isArray(input.seo.pageContributions) || !Array.isArray(input.seo.siteContributions)) return error("INVALID_RENDERER_INPUT");
    const seoByRoute = new Map<string, RendererInputV1["seo"]["pageContributions"][number]>();
    for (const record of input.seo.pageContributions) {
      const existing = seoByRoute.get(record.contribution.route);
      if (existing !== undefined || !routes.some((route) => route.route === record.contribution.route && route.entryId === record.contribution.entryId && route.revisionId === record.contribution.revisionId)) return error("SEO_CONTRIBUTION_CONFLICT");
      seoByRoute.set(record.contribution.route, record);
    }
    if (input.seo.siteContributions.length > 1) return error("SEO_CONTRIBUTION_CONFLICT");
    const routeFiles = themePages.map((file) => Object.freeze({ route: file.route, filePath: file.path })).sort((left, right) => compare(left.route, right.route));
    if (new Set(routeFiles.map((file) => file.route)).size !== routeFiles.length || new Set(routeFiles.map((file) => file.filePath)).size !== routeFiles.length) return error("RENDER_OUTPUT_CONFLICT");
    const cssByFile = new Map(input.theme.resources.filter((resource) => resource.file.endsWith(".css")).map((resource) => [resource.file, resource]));
    const themeFiles: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
    const copiedStyles = new Set<string>();
    for (const page of themePages) {
      const entryRoute = routes.find((route) => route.route === page.route);
      const entry = entryRoute === undefined ? undefined : entries.get(`${entryRoute.entryId}\0${entryRoute.revisionId}`);
      if (entry === undefined) return error("INVALID_RENDERER_INPUT");
      const stylesheetLinks: string[] = [];
      for (const name of page.stylesheetResources) {
        const resource = cssByFile.get(name);
        if (resource === undefined) return error("RENDERER_CALLBACK_RESULT_INVALID");
        const assetPath = `assets/theme/${resource.digest.slice("sha256:".length)}.css`;
        stylesheetLinks.push(`<link rel="stylesheet" href="${htmlAttribute(relativeAssetHref(page.path, assetPath))}">`);
        if (!copiedStyles.has(assetPath)) { copiedStyles.add(assetPath); const bytes = verifiedBytes(resource.bytesBase64, resource.digest); if (bytes === null) return error("INVALID_RENDERER_INPUT"); themeFiles.push(Object.freeze({ path: assetPath, bytes })); }
      }
      const seo = seoByRoute.get(page.route)?.contribution;
      const title = htmlAttribute(seo?.title ?? entry.content.title);
      const description = seo?.description === undefined ? "" : `<meta name="description" content="${htmlAttribute(seo.description)}">`;
      const seoHead = seo === undefined ? "" : `<link rel="canonical" href="${htmlAttribute(seo.canonicalUrl)}"><meta property="og:title" content="${htmlAttribute(seo.openGraph.title)}">${seo.openGraph.description === undefined ? "" : `<meta property="og:description" content="${htmlAttribute(seo.openGraph.description)}">`}<meta property="og:url" content="${htmlAttribute(seo.openGraph.url)}"><meta property="og:type" content="${seo.openGraph.type}"><script type="application/ld+json">${jsonLdScript({ "@context": "https://schema.org", "@type": seo.jsonLd.type, name: seo.jsonLd.name, ...(seo.jsonLd.description === undefined ? {} : { description: seo.jsonLd.description }), url: seo.jsonLd.url }) ?? ""}</script>`;
      themeFiles.push(Object.freeze({ path: page.path, bytes: new TextEncoder().encode(`<!doctype html><html lang="${htmlAttribute(page.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${stylesheetLinks.join("")}<title>${title}</title>${description}${seoHead}</head><body>${page.bodyHtml}</body></html>`) }));
    }
    const seoFiles: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
    const siteSeo = input.seo.siteContributions[0]?.contribution;
    if (siteSeo !== undefined) {
      if (!Array.isArray(siteSeo.sitemapUrls) || siteSeo.sitemapUrls.length === 0 || new Set(siteSeo.sitemapUrls).size !== siteSeo.sitemapUrls.length || siteSeo.sitemapUrls.some((url: unknown) => typeof url !== "string" || /[\r\n\0]/u.test(url)) || (siteSeo.robots.indexing !== "allow" && siteSeo.robots.indexing !== "disallow") || typeof siteSeo.robots.sitemapUrl !== "string" || /[\r\n\0]/u.test(siteSeo.robots.sitemapUrl)) return error("SEO_CONTRIBUTION_CONFLICT");
      const locations = [...siteSeo.sitemapUrls].sort(compare);
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((location) => `<url><loc>${xml(location)}</loc></url>`).join("")}</urlset>\n`;
      const directive = siteSeo.robots.indexing === "allow" ? "Allow: /" : "Disallow: /";
      const robots = `User-agent: *\n${directive}\nSitemap: ${siteSeo.robots.sitemapUrl}\n`;
      seoFiles.push(Object.freeze({ path: "sitemap.xml", bytes: new TextEncoder().encode(sitemap) }), Object.freeze({ path: "robots.txt", bytes: new TextEncoder().encode(robots) }));
    }
    const files: RenderedFile[] = [];
    const paths = new Set<string>();
    if (!outputFiles(pluginFiles, files, paths) || !outputFiles(themeFiles, files, paths) || !outputFiles(seoFiles, files, paths)) return error("RENDER_OUTPUT_CONFLICT");
    files.sort((left, right) => compare(left.path, right.path));
    const provenance = Object.freeze({
      publishedRevisionIds: Object.freeze(input.selection.publishedRevisionIds.map((item) => Object.freeze({ ...item }))),
      routeGraphDigest: input.selection.routeGraphDigest,
      mediaSelectionDigest: input.selection.mediaSelectionDigest,
      theme: Object.freeze({ id: input.theme.identity.id, version: input.theme.identity.version, manifestHash: input.theme.identity.manifestHash }),
      plugins: Object.freeze(input.plugins.map((plugin) => Object.freeze({ id: plugin.identity.id, version: plugin.identity.version, manifestHash: plugin.identity.manifestHash }))),
    });
    const seoEvidence = canonicalJsonBytes(input.seo.evidence);
    if (!seoEvidence.ok || !Number.isSafeInteger(input.seo.omissionCount) || input.seo.omissionCount < 0) return error("INVALID_RENDERER_INPUT");
    const seo = Object.freeze({ evidenceDigest: sha256Digest(seoEvidence.value), omissionCount: input.seo.omissionCount });
    const evidence = canonicalJsonBytes({ provenance, seo, routes: routeFiles, files: files.map((file) => ({ path: file.path, digest: file.digest })) });
    if (!evidence.ok) return error("RENDER_OUTPUT_CONFLICT");
    return Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-output/v1", rendererInputDigest: artifact.inputDigest, provenance, routes: Object.freeze(routeFiles), seo, files: Object.freeze(files), outputDigest: sha256Digest(evidence.value) }) });
  }
}
export function createStaticRenderer(): StaticRenderer { return new Renderer(); }
