import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function digest(value: string) { return sha256Digest(new TextEncoder().encode(value)); }

const themeEntry = path.resolve(import.meta.dirname, "../../../extensions/themes/study-notes/index.ts");

function demoBlock(name: string) {
  return { kind: "interactive-demo" as const, pluginIdentity: { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest("demo") }, source: { html: `<button>${name}</button>`, css: "button{color:red}", javascript: "document.body.dataset.ready='yes'" }, staticFallback: `${name} 的替代內容` };
}

function artifact(blocks?: readonly unknown[]) {
  const source = readFileSync(themeEntry, "utf8");
  const payload = {
    contract: "renderer-input/v1" as const,
    selection: { publishedRevisionIds: [{ entryId: "guide", revisionId: "r1" }], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media") },
    entries: [{ entryId: "guide", revisionId: "r1", content: { contract: "site-content/v1" as const, title: "公開筆記示範", blocks: blocks ?? [{ kind: "article" as const, text: "第一段。\n\n第二段。" }, { kind: "interactive-demo" as const, pluginIdentity: { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: digest("demo") }, source: { html: "<button>執行</button>", css: "button{color:red}", javascript: "document.body.dataset.ready='yes'" }, staticFallback: "<strong>替代內容</strong>" }] }, contentDigest: digest("content") }],
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

test("同一頁的多個 Interactive Demo 各自擁有唯一的標題與 static fallback id", async () => {
  const rendered = await createStaticRenderer().render(artifact([demoBlock("第一個"), demoBlock("第二個"), demoBlock("第三個")]));
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  const page = rendered.value.files.find((file) => file.path === rendered.value.routes[0]?.filePath);
  const html = new TextDecoder().decode(page?.bytes);
  const ids = [...html.matchAll(/ id="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `重複的 id：${ids.join("、")}`);
  for (const index of [1, 2, 3]) {
    assert.match(html, new RegExp(`aria-labelledby="interactive-demo-${index}-title"`, "u"));
    assert.match(html, new RegExp(`aria-describedby="interactive-demo-${index}-fallback"`, "u"));
  }
  // 每個 iframe 的 aria-describedby 必須指向自己那一段 fallback，而不是全部指向第一段。
  assert.match(html, /id="interactive-demo-2-fallback"><strong>靜態替代內容：<\/strong>第二個 的替代內容/u);
  assert.doesNotMatch(html, /allow-same-origin/u);
});

test("Theme manifest 宣告的 entry digest 與實際 entry bytes 相符", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../../extensions/themes/study-notes/theme-manifest.json"), "utf8")) as { entry: { file: string; digest: string } };
  assert.equal(manifest.entry.file, "index.ts");
  // Theme Host 以這個 digest 驗證 entry bytes：漏更新會讓啟用在 runtime 才以 THEME_EVIDENCE_MISMATCH 失敗。
  assert.equal(manifest.entry.digest, sha256Digest(new Uint8Array(readFileSync(themeEntry))));
});
