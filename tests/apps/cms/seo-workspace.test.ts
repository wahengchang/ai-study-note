import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { loadCmsAssets } from "../../../apps/authoring-api/index.js";

const distRoot = resolve(import.meta.dirname, "../../../dist/cms");
const digest = `sha256:${"c".repeat(64)}`;
const identity = { id: "seo-basics", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: digest, capabilities: ["cms-seo-analysis", "public-seo-page-contribution", "public-seo-site-contribution"] };

function snapshot(settings: boolean, active: boolean) {
  return {
    contract: "plugin-management-snapshot/v1",
    activationStateDigest: digest,
    settingsStateDigest: digest,
    plugins: [{ identity, status: active ? "active" : "inactive", ...(settings ? { settings: { settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/study-notes/", indexing: "allow" }, settingsDigest: digest } } : {}) }],
    diagnostics: [],
  };
}

async function responseBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("外掛工作台先保存 SEO 設定，再以 fresh snapshot 啟用 seo-basics", async () => {
  const assets = loadCmsAssets(distRoot);
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  let saved = false;
  let active = false;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/cms/plugins") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(`<!doctype html><html><body><div id="root"><main aria-busy="true"><h1>CMS 工作台載入中</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`);
      return;
    }
    const asset = assets.read(pathname);
    if (asset !== undefined) {
      response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" });
      response.end(asset.bytes);
      return;
    }
    assert.equal(request.headers.authorization, undefined);
    if (pathname === "/v1/plugins") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(snapshot(saved, active))); return; }
    if (pathname === "/v1/plugins/settings") {
      const body = await responseBody(request);
      assert.deepEqual(body, { contract: "plugin-settings-replace-request/v1", identity, expectedSettingsStateDigest: digest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/study-notes/", indexing: "allow" } });
      saved = true;
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(snapshot(saved, active))); return;
    }
    if (pathname === "/v1/plugins/activate") {
      const body = await responseBody(request);
      assert.deepEqual(body, { contract: "plugin-activation-request/v1", identity, expectedActivationStateDigest: digest });
      active = true;
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(snapshot(saved, active))); return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("CMS_WORKSPACE_LISTENER_FAILED");
  const close = async (): Promise<void> => new Promise<void>((done, fail) => server.close((error) => error === undefined ? done() : fail(error)));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/cms/plugins`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "外掛", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "啟用 SEO Plugin", exact: true }).isDisabled(), true);
    await page.getByRole("textbox", { name: "公開網站 URL", exact: true }).fill("https://example.test/study-notes/");
    await page.getByRole("radio", { name: "允許搜尋引擎索引", exact: true }).check();
    await page.getByRole("button", { name: "儲存 SEO 設定", exact: true }).click();
    await page.getByText("SEO 設定已儲存。現在可以啟用外掛。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "啟用 SEO Plugin", exact: true }).click();
    await page.getByText("已啟用：seo-basics@1.0.0", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "SEO Plugin 已啟用", exact: true }).isDisabled(), true);
  } finally {
    await browser.close();
    await close();
  }
});
