import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { startPublicUi } from "../../../apps/public-ui/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
import { sha256Digest } from "../../../core/foundation/index.js";

function digest(value: string) { return sha256Digest(new TextEncoder().encode(value)); }

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "public-ui-"));
  const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
  assert.equal(delivery.ok, true);
  if (!delivery.ok) throw new Error();
  const html = new TextEncoder().encode("<!doctype html><main id=main-content>公開</main>");
  const css = new TextEncoder().encode("body{color:black}");
  const built = delivery.value.deliver({ contract: "renderer-output/v1", rendererInputDigest: digest("input"), provenance: { publishedRevisionIds: [], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media"), theme: { id: "theme", version: "1", manifestHash: digest("theme") }, plugins: [] }, routes: [{ route: "/guide", filePath: "pages/guide/index.html" }], files: [{ path: "assets/site.css", bytes: css, digest: sha256Digest(css) }, { path: "pages/guide/index.html", bytes: html, digest: sha256Digest(html) }], outputDigest: digest("output") });
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
