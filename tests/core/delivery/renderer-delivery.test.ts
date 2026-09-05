import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function digest(value: string): string { return sha256Digest(new TextEncoder().encode(value)); }
function artifact(sources: Readonly<{ pluginSource?: string }> = {}) {
  const themeSource = "export function render(input) { return { contract: 'theme-render-output/v1', files: input.routes.map((route) => { const entry = input.entries.find((item) => item.entryId === route.entryId && item.revisionId === route.revisionId); return { path: route.route.slice(1) + '/index.html', html: '<h1>' + entry.content.title + '</h1>' }; }) }; }";
  const payload = {
    contract: "renderer-input/v1" as const,
    selection: { publishedRevisionIds: [{ entryId: "note", revisionId: "published" }], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media") },
    entries: [{ entryId: "note", revisionId: "published", content: { contract: "site-content/v1" as const, title: "公開內容", blocks: [] }, contentDigest: digest("content") }],
    routes: [{ route: "/guide", entryId: "note", revisionId: "published" }],
    media: [],
    theme: { identity: { id: "theme", version: "1.0.0", rendererContract: "theme-renderer/v1" as const, manifestHash: digest("theme") }, entrySourceBase64: Buffer.from(themeSource).toString("base64"), entryDigest: digest(themeSource), resources: [] },
    plugins: sources.pluginSource === undefined ? [] : [{
      identity: { id: "assets", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest("assets-plugin") },
      entrySourceBase64: Buffer.from(sources.pluginSource).toString("base64"),
      entryDigest: digest(sources.pluginSource),
      resources: [],
      callbacks: [{ hook: "public/assets/emit" as const, exportName: "emit", priority: 0 }],
    }],
  };
  const payloadBytes = canonicalJsonBytes(payload);
  assert.equal(payloadBytes.ok, true);
  if (!payloadBytes.ok) throw new Error();
  const input = { ...payload, inputDigest: sha256Digest(payloadBytes.value) };
  const bytes = canonicalJsonBytes(input);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error();
  return { contract: "renderer-input-artifact/v1" as const, bytes: bytes.value, inputDigest: input.inputDigest };
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
    assert.equal(readFileSync(path.join(result.value.directory, "guide/index.html"), "utf8"), "<h1>公開內容</h1>");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Plugin 發出的非 HTML asset 會通過 Renderer 與 Delivery 的同一 path profile", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "renderer-delivery-"));
  try {
    const pluginSource = "export function emit() { return { contract: 'public-assets-emit-output/v1', files: [{ path: 'assets/site.css', bytesBase64: Buffer.from('body{color:black}').toString('base64') }] }; }";
    const rendered = await createStaticRenderer().render(artifact({ pluginSource }));
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.deepEqual(rendered.value.files.map((file) => file.path), ["assets/site.css", "guide/index.html"]);
    const delivery = createPublicDelivery({ artifactsRoot: root });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const delivered = delivery.value.deliver(rendered.value);
    assert.equal(delivered.ok, true);
    if (!delivered.ok) return;
    assert.equal(readFileSync(path.join(delivered.value.directory, "assets/site.css"), "utf8"), "body{color:black}");
    const destination = path.join(root, "redelivered");
    const copied = delivery.value.redeliver({ artifactDigest: delivered.value.artifactDigest, destination });
    assert.equal(copied.ok, true);
    assert.equal(readFileSync(path.join(destination, "assets/site.css"), "utf8"), "body{color:black}");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
