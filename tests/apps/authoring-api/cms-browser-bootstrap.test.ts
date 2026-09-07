import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { chromium } from "playwright";

import { loadCmsAssets } from "../../../apps/authoring-api/index.js";

const ticket = `asn_bt_v1_${"a".repeat(43)}`;
const apiKey = `asn_v1_${"b".repeat(43)}`;

test("bundled CMS clears the raw ticket before session exchange and keeps the key out of browser storage", async () => {
  const assets = loadCmsAssets("dist/cms");
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  const seenPaths: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    seenPaths.push(request.url ?? "");
    if (pathname === "/cms") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(`<!doctype html><html><head><title>CMS Workspace</title></head><body><div id="root"><main><h1>CMS 工作台已鎖定</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`);
      return;
    }
    if (pathname === "/_local/browser-session") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), { contract: "browser-session-exchange/v1", ticket });
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ contract: "browser-session/v1", generation: 1, apiKey }));
      });
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

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await page.goto(`http://127.0.0.1:${address.port}/cms#${ticket}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "CMS 工作台" }).waitFor();
    const browserState = await page.evaluate(() => ({ href: location.href, hash: location.hash, title: document.title, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    assert.equal(browserState.hash, "");
    assert.equal(browserState.href.includes(ticket), false);
    assert.equal(browserState.title.includes(ticket) || browserState.title.includes(apiKey), false);
    assert.deepEqual(browserState.local, []);
    assert.deepEqual(browserState.session, []);
    assert.equal(seenPaths.some((path) => path.includes(ticket) || path.includes(apiKey)), false);
    assert.equal(consoleMessages.some((message) => message.includes(ticket) || message.includes(apiKey)), false);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});
