import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { startPublicUi } from "../../../apps/public-ui/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";

function canonical(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); assert.equal(result.ok, true); if (!result.ok) throw new Error("canonical"); return result.value; }
function digest(value: unknown) { return sha256Digest(canonical(value)); }

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "public-ui-"));
  const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
  assert.equal(delivery.ok, true);
  if (!delivery.ok) throw new Error();
  const html = new TextEncoder().encode("<!doctype html><main id=main-content>公開</main>");
  const css = new TextEncoder().encode("body{color:black}");
  const binary = new Uint8Array([0, 1, 2, 3]);
  const provenance = { publishedRevisionIds: [], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media"), theme: { id: "theme", version: "1", manifestHash: digest("theme") }, plugins: [], seo: { count: 0, digest: digest("seo") } };
  const routes = [{ route: "/guide", filePath: "pages/guide/index.html" }];
  const files = [{ path: "assets/cover.png", bytes: binary, digest: sha256Digest(binary) }, { path: "assets/data.bin", bytes: binary, digest: sha256Digest(binary) }, { path: "assets/dot..name.txt", bytes: binary, digest: sha256Digest(binary) }, { path: "assets/font.woff2", bytes: binary, digest: sha256Digest(binary) }, { path: "assets/site.css", bytes: css, digest: sha256Digest(css) }, { path: "pages/guide/index.html", bytes: html, digest: sha256Digest(html) }];
  const built = delivery.value.deliver({ contract: "renderer-output/v1", rendererInputDigest: digest("input"), provenance, routes, files, outputDigest: digest({ provenance, routes, files: files.map((file) => ({ path: file.path, digest: file.digest })) }) });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error();
  return { root, digest: built.value.artifactDigest };
}

test("Public UI 只在固定子路徑服務已驗證 artifact snapshot", async () => {
  const item = await fixture();
  try {
    const server = await startPublicUi({ artifactsRoot: path.join(item.root, "artifacts"), artifactDigest: item.digest, basePath: "/ai-study-note/", port: 0 });
    assert.equal(server.ok, true);
    if (!server.ok) return;
    try {
      const page = await fetch(`${server.value.origin}/ai-study-note/guide/`);
      assert.equal(page.status, 200);
      assert.equal(await page.text(), "<!doctype html><main id=main-content>公開</main>");
      const asset = await fetch(`${server.value.origin}/ai-study-note/assets/site.css`);
      assert.equal(asset.headers.get("content-type"), "text/css; charset=utf-8");
      const dotted = await fetch(`${server.value.origin}/ai-study-note/assets/dot..name.txt`);
      assert.equal(dotted.status, 200);
      assert.deepEqual(new Uint8Array(await dotted.arrayBuffer()), new Uint8Array([0, 1, 2, 3]));
      const hidden = await fetch(`${server.value.origin}/ai-study-note/pages/guide/index.html`);
      assert.equal(hidden.status, 404);
      const traversal = await fetch(`${server.value.origin}/ai-study-note/%2e%2e/guide/`);
      assert.equal(traversal.status, 404);
      const head = await fetch(`${server.value.origin}/ai-study-note/guide/`, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
    } finally { await server.value.close(); }
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("Public UI 在載入後不讀取遭置換的 artifact bytes", async () => {
  const item = await fixture();
  try {
    const server = await startPublicUi({ artifactsRoot: path.join(item.root, "artifacts"), artifactDigest: item.digest, basePath: "/ai-study-note/", port: 0 });
    assert.equal(server.ok, true);
    if (!server.ok) return;
    try {
      writeFileSync(path.join(item.root, "artifacts", item.digest, "pages/guide/index.html"), "tampered");
      const page = await fetch(`${server.value.origin}/ai-study-note/guide/`);
      assert.equal(await page.text(), "<!doctype html><main id=main-content>公開</main>");
    } finally { await server.value.close(); }
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("Public UI 對已知 route 的無斜線位址回正規化 redirect，並宣告可辨識的資產型別", async () => {
  const item = await fixture();
  try {
    const server = await startPublicUi({ artifactsRoot: path.join(item.root, "artifacts"), artifactDigest: item.digest, basePath: "/ai-study-note/", port: 0 });
    assert.equal(server.ok, true);
    if (!server.ok) return;
    try {
      // 部署目標會把 /base 與 /base/guide 導到帶斜線的正規位址；本機直接 404 會讓相對 URL 在錯誤基準下解析。
      const base = await fetch(`${server.value.origin}/ai-study-note`, { redirect: "manual" });
      assert.equal(base.status, 302);
      assert.equal(base.headers.get("location"), "/ai-study-note/");
      const route = await fetch(`${server.value.origin}/ai-study-note/guide`, { redirect: "manual" });
      assert.equal(route.status, 302);
      assert.equal(route.headers.get("location"), "/ai-study-note/guide/");
      const followed = await fetch(`${server.value.origin}/ai-study-note/guide`);
      assert.equal(followed.status, 200);
      // redirect 只補斜線，不得把未知位址或 artifact 內部 page 路徑變成可達位址。
      const unknown = await fetch(`${server.value.origin}/ai-study-note/absent`, { redirect: "manual" });
      assert.equal(unknown.status, 404);
      const internal = await fetch(`${server.value.origin}/ai-study-note/pages/guide/index.html`, { redirect: "manual" });
      assert.equal(internal.status, 404);
      const outside = await fetch(`${server.value.origin}/other`, { redirect: "manual" });
      assert.equal(outside.status, 404);
      const font = await fetch(`${server.value.origin}/ai-study-note/assets/font.woff2`);
      assert.equal(font.headers.get("content-type"), "font/woff2");
      const image = await fetch(`${server.value.origin}/ai-study-note/assets/cover.png`);
      assert.equal(image.headers.get("content-type"), "image/png");
      const unknownType = await fetch(`${server.value.origin}/ai-study-note/assets/data.bin`);
      assert.equal(unknownType.headers.get("content-type"), "application/octet-stream");
    } finally { await server.value.close(); }
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});
