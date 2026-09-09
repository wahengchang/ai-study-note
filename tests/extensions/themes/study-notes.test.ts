import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createStaticRenderer } from "../../../core/renderer/index.js";

function canonical(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical");
  return result.value;
}
function digest(value: unknown) { return sha256Digest(canonical(value)); }

const themeEntry = path.resolve(import.meta.dirname, "../../../extensions/themes/study-notes/runtime.mjs");

function demoBlock(name: string) {
  return { kind: "interactive-demo" as const, identity: { id: "demo", version: 1 }, hook: "cms/editor-block/resolve" as const, manifestHash: digest("demo"), source: { html: `<button>${name}</button>`, css: "button{color:red}", javascript: "document.body.dataset.ready='yes'" }, staticFallback: `${name} 的替代內容` };
}

function artifact(blocks?: readonly unknown[]) {
  const source = readFileSync(themeEntry, "utf8");
  const stylesheet = readFileSync(path.resolve(import.meta.dirname, "../../../extensions/themes/study-notes/assets/study-notes.css"), "utf8");
  const content = { contract: "site-content/v1" as const, title: "公開筆記示範", blocks: blocks ?? [{ kind: "article" as const, text: "第一段。\n\n第二段。" }, demoBlock("替代內容")], seo: {} };
  const media = { contract: "renderer-media/v1" as const, references: [], assets: [], objects: [] };
  const manifest = {
    contract: "theme-manifest/v1" as const,
    id: "study-notes",
    version: "1.0.0",
    runtime: { file: "runtime.mjs", digest: sha256Digest(new Uint8Array(readFileSync(themeEntry))) },
    resources: [{ file: "assets/study-notes.css", digest: sha256Digest(new TextEncoder().encode(stylesheet)) }],
  };
  const payload = {
    contract: "renderer-input/v1" as const,
    selection: { publishedRevisionIds: [{ entryId: "guide", revisionId: "r1" }], routeGraphDigest: digest({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: [{ normalizedRoute: "/guide", owner: "guide", sourceRevisionId: "r1" }] }), mediaSelectionDigest: digest({ contract: "renderer-media-selection/v1", references: [], assets: [], objects: [] }) },
    entries: [{ entryId: "guide", revisionId: "r1", schemaIdentity: { schemaId: "site-content", version: 1 }, content, contentDigest: sha256Digest(canonical(content)) }],
    routes: { contract: "route-graph-snapshot/v1" as const, normalization: "route-normalization/v1" as const, graph: "published" as const, claims: [{ normalizedRoute: "/guide", owner: "guide", sourceRevisionId: "r1" }] },
    media,
    theme: {
      identity: { id: manifest.id, version: manifest.version, manifestHash: sha256Digest(canonical(manifest)) },
      manifest,
      files: [
        { role: "runtime" as const, file: "runtime.mjs", digest: manifest.runtime.digest, bytesBase64url: Buffer.from(source).toString("base64url") },
        { role: "resource" as const, file: "assets/study-notes.css", digest: manifest.resources[0]!.digest, bytesBase64url: Buffer.from(stylesheet).toString("base64url") },
      ],
      activationStateDigest: digest({ contract: "theme-activation-state/v1", active: { id: manifest.id, version: manifest.version, manifestHash: sha256Digest(canonical(manifest)) } }),
    },
    plugins: { activationStateDigest: digest({ contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] }), identities: [], renderers: [], seo: { status: "available" as const, pages: [], omissionDigest: digest([]) } },
  };
  const full = { ...payload, inputDigest: sha256Digest(canonical(payload)) };
  const bytes = canonical(full);
  return { bytes, inputDigest: full.inputDigest, bytesDigest: sha256Digest(bytes) };
}

test("預設 Theme 產生子路徑安全且可存取的完整公開頁面", async () => {
  const rendered = await createStaticRenderer().render(artifact());
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  const page = rendered.value.files.find((file) => file.path === rendered.value.routes[0]?.filePath);
  const html = new TextDecoder().decode(page?.bytes);
  const stylesheet = rendered.value.files.find((file) => file.path.startsWith("assets/theme/"));
  const css = new TextDecoder().decode(stylesheet?.bytes);
  assert.match(html, /<main id="main-content" tabindex="-1">/u);
  assert.match(html, /<a class="skip-link" href="#main-content">/u);
  assert.match(html, /sandbox="allow-scripts"/u);
  assert.match(html, /href="\.\.\/">AI Study Note/u);
  assert.match(html, /<strong>靜態替代內容：<\/strong>替代內容 的替代內容/u);
  assert.match(css, /:focus-visible/u);
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

