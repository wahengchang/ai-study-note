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
function routePath(route: string): string | null { if (route === "/") return "index.html"; if (!/^\/[a-z0-9][a-z0-9/-]*$/u.test(route) || route.includes("//") || route.endsWith("/")) return null; return `${route.slice(1)}/index.html`; }
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
  return exact(value, ["contract", "title", "blocks"]) && value.contract === "site-content/v1" && typeof value.title === "string" && value.title.length > 0
    && Array.isArray(value.blocks) && value.blocks.every((block) => structuredBlock(block));
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
function themeOutput(value: unknown): readonly Readonly<{ path: string; bytes: Uint8Array }>[] | null {
  if (thenable(value) || !exact(value, ["contract", "files"]) || value.contract !== "theme-render-output/v1" || !Array.isArray(value.files)) return null;
  const files: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
  for (const file of (value as ThemeRenderOutput).files) {
    if (!exact(file, ["path", "html"]) || !outputPath(file.path) || typeof file.html !== "string") return null;
    files.push(Object.freeze({ path: file.path, bytes: new TextEncoder().encode(file.html) }));
  }
  return Object.freeze(files);
}
async function module(input: Readonly<{ bytes: Uint8Array; manifestHash: Digest; requiredExports: readonly string[] }>): Promise<Readonly<Record<string, unknown>> | null> {
  const loaded = await loadVerifiedRendererModule({ entryBytes: input.bytes, manifestHash: input.manifestHash, requiredExports: input.requiredExports });
  return loaded?.namespace ?? null;
}

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
    const themeFiles = themeOutput(themed);
    if (themeFiles === null) return error("RENDERER_CALLBACK_RESULT_INVALID");
    const files: RenderedFile[] = [];
    const paths = new Set<string>();
    if (!outputFiles(pluginFiles, files, paths) || !outputFiles(themeFiles, files, paths)) return error("RENDER_OUTPUT_CONFLICT");
    files.sort((left, right) => compare(left.path, right.path));
    const provenance = Object.freeze({
      publishedRevisionIds: Object.freeze(input.selection.publishedRevisionIds.map((item) => Object.freeze({ ...item }))),
      routeGraphDigest: input.selection.routeGraphDigest,
      mediaSelectionDigest: input.selection.mediaSelectionDigest,
      theme: Object.freeze({ id: input.theme.identity.id, version: input.theme.identity.version, manifestHash: input.theme.identity.manifestHash }),
      plugins: Object.freeze(input.plugins.map((plugin) => Object.freeze({ id: plugin.identity.id, version: plugin.identity.version, manifestHash: plugin.identity.manifestHash }))),
    });
    const evidence = canonicalJsonBytes({ provenance, files: files.map((file) => ({ path: file.path, digest: file.digest })) });
    if (!evidence.ok) return error("RENDER_OUTPUT_CONFLICT");
    return Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-output/v1", rendererInputDigest: artifact.inputDigest, provenance, files: Object.freeze(files), outputDigest: sha256Digest(evidence.value) }) });
  }
}
export function createStaticRenderer(): StaticRenderer { return new Renderer(); }
