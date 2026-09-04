import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function digest(value: string): string { return sha256Digest(new TextEncoder().encode(value)); }
function artifact(sources: Readonly<{ themeSource?: string; pluginSource?: string }> = {}) {
  const themeSource = sources.themeSource ?? "export function render(input) { return { contract: 'theme-render-output/v1', files: input.routes.map((route) => { const entry = input.entries.find((item) => item.entryId === route.entryId && item.revisionId === route.revisionId); return { path: route.route.slice(1) + '/index.html', html: '<h1>' + entry.content.title + '</h1>' + entry.blocks.join('') }; }) }; }";
  const pluginSource = sources.pluginSource ?? "export function block(input) { return { contract: 'public-block-render-output/v1', html: '<aside>' + input.entries[0].content.title + '</aside>' }; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [{ path: 'assets/plugin.txt', bytesBase64: 'cGx1Z2lu' }] }; }";
  const payload = {
    contract: "renderer-input/v1" as const,
    selection: { publishedRevisionIds: [{ entryId: "entry", revisionId: "r1" }], routeGraphDigest: digest("route"), mediaSelectionDigest: digest("media") },
    entries: [{ entryId: "entry", revisionId: "r1", content: { title: "公開" }, contentDigest: digest("content") }],
    routes: [{ route: "/guide", entryId: "entry", revisionId: "r1" }],
    media: [],
    theme: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1" as const, manifestHash: digest("theme") }, entrySourceBase64: Buffer.from(themeSource).toString("base64"), entryDigest: digest(themeSource), resources: [] },
    plugins: [{ identity: { id: "plugin", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest("plugin") }, entrySourceBase64: Buffer.from(pluginSource).toString("base64"), entryDigest: digest(pluginSource), resources: [], callbacks: [{ hook: "public/block/render" as const, exportName: "block", priority: 10 }, { hook: "public/assets/emit" as const, exportName: "assets", priority: 10 }] }],
  };
  const payloadBytes = canonicalJsonBytes(payload);
  assert.equal(payloadBytes.ok, true);
  if (!payloadBytes.ok) throw new Error();
  const full = { ...payload, inputDigest: sha256Digest(payloadBytes.value) };
  const bytes = canonicalJsonBytes(full);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error();
  return { contract: "renderer-input-artifact/v1" as const, bytes: bytes.value, inputDigest: full.inputDigest };
}

function seal(input: Record<string, unknown>) {
  const { inputDigest: _ignored, ...payload } = input;
  const payloadBytes = canonicalJsonBytes(payload);
  assert.equal(payloadBytes.ok, true);
  if (!payloadBytes.ok) throw new Error();
  const full = { ...payload, inputDigest: sha256Digest(payloadBytes.value) };
  const bytes = canonicalJsonBytes(full);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error();
  return { contract: "renderer-input-artifact/v1" as const, bytes: bytes.value, inputDigest: full.inputDigest };
}

test("Renderer 執行已封存 Theme 與 Plugin bytes，輸出可重現 artifact", async () => {
  const renderer = createStaticRenderer();
  const first = await renderer.render(artifact());
  const second = await renderer.render(artifact());
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.deepEqual(first.value.files.map((file) => [file.path, new TextDecoder().decode(file.bytes)]), [
    ["assets/plugin.txt", "plugin"],
    ["guide/index.html", "<h1>公開</h1><aside>公開</aside>"],
  ]);
  const altered = artifact();
  altered.bytes[0] = 0;
  const rejected = await renderer.render(altered);
  assert.equal(rejected.ok, false);
});

test("Renderer 拒絕需要額外依賴或非同步 Theme callback 的封存 source", async () => {
  const renderer = createStaticRenderer();
  const dependency = await renderer.render(artifact({ themeSource: "import 'node:fs'; export function render() { return { contract: 'theme-render-output/v1', files: [] }; }" }));
  assert.deepEqual(dependency, {
    ok: false,
    error: {
      code: "RENDERER_MODULE_INVALID",
      owner: "Renderer",
      subjectIds: [],
      remediation: { kind: "message", message: "Renderer 無法從已封存的公開輸入建立 artifact。" },
    },
  });
  const asynchronous = await renderer.render(artifact({ themeSource: "export function render() { return Promise.resolve({ contract: 'theme-render-output/v1', files: [] }); }" }));
  assert.equal(asynchronous.ok, false);
  if (!asynchronous.ok) assert.equal(asynchronous.error.code, "RENDERER_CALLBACK_RESULT_INVALID");
});

test("Plugin callback fault 不會產生 Renderer artifact", async () => {
  const renderer = createStaticRenderer();
  const fault = await renderer.render(artifact({ pluginSource: "export function block() { throw new Error('fault'); } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }" }));
  assert.equal(fault.ok, false);
  if (!fault.ok) assert.equal(fault.error.code, "RENDERER_CALLBACK_FAILED");
});

test("同 priority 的 Plugin callback 依 Plugin ID 穩定排序", async () => {
  const base = JSON.parse(new TextDecoder().decode(artifact().bytes)) as Record<string, unknown>;
  const source = "export function block() { return { contract: 'public-block-render-output/v1', html: '<aside>alpha</aside>' }; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [] }; }";
  base.plugins = [
    ...(base.plugins as unknown[]),
    {
      identity: { id: "alpha", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: digest("alpha-plugin") },
      entrySourceBase64: Buffer.from(source).toString("base64"),
      entryDigest: digest(source),
      resources: [],
      callbacks: [{ hook: "public/block/render", exportName: "block", priority: 10 }, { hook: "public/assets/emit", exportName: "assets", priority: 10 }],
    },
  ];
  const rendered = await createStaticRenderer().render(seal(base));
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.equal(new TextDecoder().decode(rendered.value.files.find((file) => file.path === "guide/index.html")?.bytes), "<h1>公開</h1><aside>alpha</aside><aside>公開</aside>");
});

test("Renderer 拒絕宣告不受支援 extension contract 的封存輸入", async () => {
  const renderer = createStaticRenderer();
  const themeContract = JSON.parse(new TextDecoder().decode(artifact().bytes)) as Record<string, unknown>;
  ((themeContract.theme as Record<string, unknown>).identity as Record<string, unknown>).rendererContract = "theme-renderer/v2";
  const rejectedTheme = await renderer.render(seal(themeContract));
  assert.equal(rejectedTheme.ok, false);
  if (!rejectedTheme.ok) assert.equal(rejectedTheme.error.code, "UNSUPPORTED_EXTENSION_CONTRACT");
  const pluginContract = JSON.parse(new TextDecoder().decode(artifact().bytes)) as Record<string, unknown>;
  (((pluginContract.plugins as Record<string, unknown>[])[0] as Record<string, unknown>).identity as Record<string, unknown>).hookContract = "plugin-hooks/v2";
  const rejectedPlugin = await renderer.render(seal(pluginContract));
  assert.equal(rejectedPlugin.ok, false);
  if (!rejectedPlugin.ok) assert.equal(rejectedPlugin.error.code, "UNSUPPORTED_EXTENSION_CONTRACT");
});

test("Renderer 的 staged output path profile 拒絕 dot segment 與隱藏檔", async () => {
  const renderer = createStaticRenderer();
  for (const emitted of ["guide/./index.html", "assets/.hidden.css", "assets/trailing.", "../escape.html", "Assets/upper.css"]) {
    const source = `export function block() { return { contract: 'public-block-render-output/v1', html: '' }; } export function assets() { return { contract: 'public-assets-emit-output/v1', files: [{ path: ${JSON.stringify(emitted)}, bytesBase64: 'cGx1Z2lu' }] }; }`;
    const rejected = await renderer.render(artifact({ pluginSource: source }));
    assert.equal(rejected.ok, false, emitted);
    if (!rejected.ok) assert.equal(rejected.error.code, "RENDERER_CALLBACK_RESULT_INVALID", emitted);
  }
});
