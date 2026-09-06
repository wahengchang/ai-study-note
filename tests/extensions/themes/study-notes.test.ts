import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function digest(value: string) { return sha256Digest(new TextEncoder().encode(value)); }

function artifact() {
  const source = readFileSync(path.resolve(import.meta.dirname, "../../../extensions/themes/study-notes/index.ts"), "utf8");
  const payload = {
    contract: "renderer-input/v1" as const,
    selection: { publishedRevisionIds: [{ entryId: "guide", revisionId: "r1" }], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media") },
    entries: [{ entryId: "guide", revisionId: "r1", content: { contract: "site-content/v1" as const, title: "公開筆記示範", blocks: [{ kind: "article" as const, text: "第一段。\n\n第二段。" }, { kind: "interactive-demo" as const, pluginIdentity: { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest("demo") }, source: { html: "<button>執行</button>", css: "button{color:red}", javascript: "document.body.dataset.ready='yes'" }, staticFallback: "<strong>替代內容</strong>" }] }, contentDigest: digest("content") }],
    routes: [{ route: "/guide", entryId: "guide", revisionId: "r1" }], media: [],
    theme: { identity: { id: "study-notes", version: "1.0.0", rendererContract: "theme-renderer/v1" as const, manifestHash: digest("manifest") }, entrySourceBase64: Buffer.from(source).toString("base64"), entryDigest: digest(source), resources: [] }, plugins: [],
  };
  const payloadBytes = canonicalJsonBytes(payload); assert.equal(payloadBytes.ok, true); if (!payloadBytes.ok) throw new Error();
  const full = { ...payload, inputDigest: sha256Digest(payloadBytes.value) };
  const bytes = canonicalJsonBytes(full); assert.equal(bytes.ok, true); if (!bytes.ok) throw new Error();
  return { contract: "renderer-input-artifact/v1" as const, bytes: bytes.value, inputDigest: full.inputDigest };
}

test("預設 Theme 產生子路徑安全且可存取的完整公開頁面", async () => {
  const rendered = await createStaticRenderer().render(artifact());
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  const page = rendered.value.files.find((file) => file.path === rendered.value.routes[0]?.filePath);
  const html = new TextDecoder().decode(page?.bytes);
  assert.match(html, /<main id="main-content" tabindex="-1">/u);
  assert.match(html, /<a class="skip-link" href="#main-content">/u);
  assert.match(html, /href="\.\/">AI Study Note/u);
  assert.match(html, /sandbox="allow-scripts"/u);
  assert.doesNotMatch(html, /allow-same-origin/u);
  assert.match(html, /&lt;strong&gt;替代內容&lt;\/strong&gt;/u);
  assert.match(html, /:focus-visible/u);
});
