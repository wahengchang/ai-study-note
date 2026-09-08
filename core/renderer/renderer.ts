import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest } from "../foundation/index.js";
import { parseRendererInput, type RendererInput, type RendererInputArtifact } from "../projection/index.js";
import { isArtifactFilePath } from "./contracts.js";
import type { RenderedFile, RendererFailure, RendererOutput, RendererResult, StaticRenderer } from "./contracts.js";
import { loadVerifiedRendererModule } from "./module-loader.js";

type Callback = Readonly<{ id: string; hook: "public/block/render" | "public/assets/emit"; priority: number; callback: (input: unknown, facade: unknown) => unknown; resources: RendererInput["plugins"]["renderers"][number]["resources"] }>;

function failure(code: RendererFailure["code"]): RendererResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, owner: "Renderer", subjectIds: Object.freeze([]), remediation: Object.freeze({ kind: "message", message: "Renderer 無法從已封存的公開輸入建立 artifact。" }) }) });
}
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function routePath(route: string): string { return `pages/${sha256Digest(new TextEncoder().encode(route)).slice("sha256:".length)}/index.html`; }
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;

function thenable(value: unknown): boolean {
  try { return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function"; } catch { return true; }
}
function observeRejectedPromise(value: unknown): void {
  try {
    if (value instanceof NativePromise) void nativePromiseThen.call(value, undefined, () => undefined);
  } catch {}
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function outputRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || thenable(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}
function outputArray(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value) || thenable(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, "length");
    if (length === undefined || !("value" in length) || typeof length.value !== "number") return null;
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    if (Reflect.ownKeys(value).length !== length.value + 1) return null;
    return result;
  } catch { return null; }
}
function base64(value: unknown): Uint8Array | null {
  if (typeof value !== "string") return null;
  try {
    const bytes = new Uint8Array(Buffer.from(value, "base64"));
    return Buffer.from(bytes).toString("base64") === value ? bytes : null;
  } catch { return null; }
}
function outputFiles(items: readonly Readonly<{ path: string; bytes: Uint8Array }>[], files: RenderedFile[], paths: Set<string>): boolean {
  for (const item of items) {
    if (!isArtifactFilePath(item.path) || paths.has(item.path)) return false;
    paths.add(item.path);
    files.push(Object.freeze({ path: item.path, bytes: copyBytes(item.bytes), digest: sha256Digest(item.bytes) }));
  }
  return true;
}
function blockOutput(value: unknown): string | null {
  observeRejectedPromise(value);
  const output = outputRecord(value, ["contract", "html"]);
  return output?.contract === "public-block-render-output/v1" && typeof output.html === "string" ? output.html : null;
}
function assetOutput(value: unknown): readonly Readonly<{ path: string; bytes: Uint8Array }>[] | null {
  observeRejectedPromise(value);
  const output = outputRecord(value, ["contract", "files"]);
  const items = output?.contract === "public-assets-emit-output/v1" ? outputArray(output.files) : null;
  if (items === null) return null;
  const files = [];
  for (const item of items) {
    const file = outputRecord(item, ["path", "bytesBase64"]);
    const bytes = file === null ? null : base64(file.bytesBase64);
    if (file === null || typeof file.path !== "string" || bytes === null) return null;
    files.push(Object.freeze({ path: file.path, bytes }));
  }
  return Object.freeze(files);
}
function themeOutput(value: unknown, routes: readonly string[]): readonly Readonly<{ route: string; path: string; bytes: Uint8Array }>[] | null {
  observeRejectedPromise(value);
  const output = outputRecord(value, ["contract", "pages"]);
  const items = output?.contract === "theme-render-output/v1" ? outputArray(output.pages) : null;
  if (items === null) return null;
  const expected = new Set(routes);
  const pages = [];
  for (const item of items) {
    const page = outputRecord(item, ["route", "html"]);
    if (page === null || typeof page.route !== "string" || typeof page.html !== "string" || !expected.delete(page.route)) return null;
    pages.push(Object.freeze({ route: page.route, path: routePath(page.route), bytes: new TextEncoder().encode(page.html) }));
  }
  return expected.size === 0 ? Object.freeze(pages) : null;
}
async function load(bytes: Uint8Array, manifestHash: Digest, exports: readonly string[]): Promise<Readonly<Record<string, unknown>> | null> {
  const result = await loadVerifiedRendererModule({ entryBytes: bytes, manifestHash, requiredExports: exports });
  return result?.namespace ?? null;
}

class Renderer implements StaticRenderer {
  async render(artifact: RendererInputArtifact): Promise<RendererResult<RendererOutput>> {
    const parsed = parseRendererInput(artifact.bytes);
    if (!parsed.ok || parsed.value.bytesDigest !== artifact.bytesDigest || parsed.value.input.inputDigest !== artifact.inputDigest) return failure("INVALID_RENDERER_INPUT");
    const input = parsed.value.input;
    if (input.media.references.length > 0 || input.media.assets.length > 0 || input.media.objects.length > 0) return failure("PUBLIC_MEDIA_UNSUPPORTED");
    for (const entry of input.entries) {
      const bytes = canonicalJsonBytes(entry.content);
      if (!bytes.ok || sha256Digest(bytes.value) !== entry.contentDigest) return failure("RENDERER_INPUT_DIGEST_MISMATCH");
    }
    const runtime = input.theme.files.find((file) => file.role === "runtime");
    if (runtime === undefined) return failure("INVALID_RENDERER_INPUT");
    const theme = await load(Buffer.from(runtime.bytesBase64url, "base64url"), input.theme.identity.manifestHash, ["render"]);
    if (theme === null || typeof theme.render !== "function") return failure("RENDERER_MODULE_INVALID");
    const blocks: Callback[] = [];
    const assets: Callback[] = [];
    for (const renderer of input.plugins.renderers) {
      const module = await load(Buffer.from(renderer.entryBytesBase64url, "base64url"), renderer.identity.manifestHash, renderer.callbacks.map((callback) => callback.exportName));
      if (module === null) return failure("RENDERER_MODULE_INVALID");
      for (const declaration of renderer.callbacks) {
        const callback = module[declaration.exportName];
        if (typeof callback !== "function") return failure("RENDERER_MODULE_INVALID");
        const item: Callback = Object.freeze({ id: renderer.identity.id, hook: declaration.hook, priority: declaration.priority, callback: callback as Callback["callback"], resources: renderer.resources });
        (declaration.hook === "public/block/render" ? blocks : assets).push(item);
      }
    }
    const order = (left: Callback, right: Callback) => left.priority - right.priority || compare(left.id, right.id) || compare(left.hook, right.hook);
    blocks.sort(order);
    assets.sort(order);
    const publicInput = frozen(input);
    const rendered = new Map<string, string[]>();
    const routes = input.routes.claims;
    for (const route of routes) {
      const target = rendered.get(`${route.owner}\0${route.sourceRevisionId}`) ?? [];
      for (const item of blocks) {
        let output: unknown;
        try { output = item.callback(publicInput, frozen({ capability: "public-block-renderer" as const, route: route.normalizedRoute, entryId: route.owner, revisionId: route.sourceRevisionId, resources: item.resources })); } catch { return failure("RENDERER_CALLBACK_FAILED"); }
        const html = blockOutput(output);
        if (html === null) return failure("RENDERER_CALLBACK_RESULT_INVALID");
        target.push(html);
      }
      rendered.set(`${route.owner}\0${route.sourceRevisionId}`, target);
    }
    const pluginFiles: Readonly<{ path: string; bytes: Uint8Array }>[] = [];
    for (const item of assets) {
      let output: unknown;
      try { output = item.callback(publicInput, frozen({ capability: "public-assets-emitter" as const, resources: item.resources })); } catch { return failure("RENDERER_CALLBACK_FAILED"); }
      const files = assetOutput(output);
      if (files === null) return failure("RENDERER_CALLBACK_RESULT_INVALID");
      pluginFiles.push(...files);
    }
    let themed: unknown;
    try {
      themed = (theme.render as (input: unknown, facade: unknown) => unknown)(frozen({ contract: "theme-render-input/v1" as const, selection: input.selection, entries: input.entries.map((entry) => Object.freeze({ ...entry, blocks: Object.freeze(rendered.get(`${entry.entryId}\0${entry.revisionId}`) ?? []) })), routes, media: input.media, resources: input.theme.files }), frozen({ capability: "theme-renderer" as const }));
    } catch { return failure("RENDERER_CALLBACK_FAILED"); }
    const pages = themeOutput(themed, routes.map((route) => route.normalizedRoute));
    if (pages === null) return failure("RENDERER_CALLBACK_RESULT_INVALID");
    const files: RenderedFile[] = [];
    const paths = new Set<string>();
    if (!outputFiles(pluginFiles, files, paths) || !outputFiles(pages, files, paths)) return failure("RENDER_OUTPUT_CONFLICT");
    files.sort((left, right) => compare(left.path, right.path));
    const routeFiles = pages.map((page) => Object.freeze({ route: page.route, filePath: page.path })).sort((left, right) => compare(left.route, right.route));
    const provenance = Object.freeze({ publishedRevisionIds: Object.freeze(input.selection.publishedRevisionIds.map((item) => Object.freeze({ ...item }))), routeGraphDigest: input.selection.routeGraphDigest, mediaSelectionDigest: input.selection.mediaSelectionDigest, theme: Object.freeze({ ...input.theme.identity }), plugins: Object.freeze(input.plugins.identities.map((item) => Object.freeze({ id: item.id, version: item.version, manifestHash: item.manifestHash }))) });
    const evidence = canonicalJsonBytes({ provenance, routes: routeFiles, files: files.map((file) => ({ path: file.path, digest: file.digest })) });
    return !evidence.ok ? failure("RENDER_OUTPUT_CONFLICT") : Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-output/v1", rendererInputDigest: artifact.inputDigest, provenance, routes: Object.freeze(routeFiles), files: Object.freeze(files), outputDigest: sha256Digest(evidence.value) }) });
  }
}
export function createStaticRenderer(): StaticRenderer { return new Renderer(); }
