import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { loadCmsAssets } from "../../../apps/authoring-api/index.js";

// dist/ 是 generated root，只能由 cms:build 產生；以 repository root 定位，
// 讓這個 test 不依賴呼叫端的 cwd。
const distRoot = resolve(import.meta.dirname, "../../../dist/cms");


test("bundled CMS directly loads the local workspace without browser ticket or credential storage", async () => {
  const assets = loadCmsAssets(distRoot);
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  const seenPaths: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    seenPaths.push(request.url ?? "");
    if (pathname === "/cms") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(`<!doctype html><html><head><title>CMS Workspace</title></head><body><div id="root"><main aria-busy="true"><h1>CMS 工作台載入中</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`);
      return;
    }
    const asset = assets.read(pathname);
    if (asset === undefined) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" });
    response.end(asset.bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("CMS_BROWSER_TEST_LISTENER_FAILED");

  const closeServer = async (): Promise<void> => new Promise<void>((done, fail) => server.close((error) => error === undefined ? done() : fail(error)));
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try { browser = await chromium.launch(); } catch (error) { await closeServer(); throw error; }
  try {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await page.goto(`http://127.0.0.1:${address.port}/cms`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    const browserState = await page.evaluate(() => ({ href: location.href, hash: location.hash, title: document.title, dom: document.documentElement.outerHTML, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    assert.equal(browserState.hash, "");
    assert.equal(browserState.title.includes("asn_v1_") || browserState.title.includes("asn_bt_v1_"), false);
    assert.equal(browserState.dom.includes("asn_v1_") || browserState.dom.includes("asn_bt_v1_"), false);
    assert.deepEqual(browserState.local, []);
    assert.deepEqual(browserState.session, []);
    assert.equal(seenPaths.some((path) => path.startsWith("/_local/browser-")), false);
    assert.equal(consoleMessages.some((message) => message.includes("asn_v1_") || message.includes("asn_bt_v1_")), false);
  } finally {
    await browser.close();
    await closeServer();
  }
});
