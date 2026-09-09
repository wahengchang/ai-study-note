import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { loadCmsAssets } from "../../../apps/authoring-api/index.js";

const distRoot = resolve(import.meta.dirname, "../../../dist/cms");
const ticket = `asn_bt_v1_${"a".repeat(43)}`;
const apiKey = `asn_v1_${"b".repeat(43)}`;
const digest = `sha256:${"c".repeat(64)}`;

type Revision = Readonly<{ revisionId: string; content: Readonly<{ contract: "site-content/v1"; title: string; blocks: readonly Readonly<{ kind: "article"; text: string }>[]; seo: Record<string, never> }>; route: string }>;

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function authoringEntry(entryId: string, revision: Revision) {
  return { contract: "authoring-entry/v1", entryId, current: { revisionId: revision.revisionId, schemaIdentity: { schemaId: "site-content", version: 1 }, content: revision.content, contentDigest: digest, route: revision.route, assets: [] }, stateDigest: digest };
}

function failure(code: string, message: string) {
  return { contract: "authoring-error/v1", requestId: "test-request", code, owner: "AuthoringApi", subjectIds: ["article-v1"], remediation: { kind: "message", message } };
}

test("authenticated CMS 完成 article-first history、save、preview 與 published-with-draft workflow", async () => {
  const assets = loadCmsAssets(distRoot);
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  let current: Revision | undefined;
  let published: Revision | undefined;
  let entryId = "";
  let revisionCount = 0;
  let publishRequests = 0;
  const seenApiPaths: string[] = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/cms" || pathname === "/cms/entries" || pathname === "/cms/entries/new" || /^\/cms\/entries\/[^/]+$/u.test(pathname)) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(`<!doctype html><html><head><title>CMS Workspace</title></head><body><div id="root"><main><h1>CMS 工作台已鎖定</h1></main></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`);
      return;
    }
    if (pathname === "/_local/browser-session") {
      assert.deepEqual(await body(request), { contract: "browser-session-exchange/v1", ticket });
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ contract: "browser-session/v1", generation: 1, apiKey }));
      return;
    }
    const asset = assets.read(pathname);
    if (asset !== undefined) {
      response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" });
      response.end(asset.bytes);
      return;
    }
    if (request.headers.authorization !== `Bearer ${apiKey}`) { response.writeHead(401).end(); return; }
    seenApiPaths.push(pathname);
    if (pathname === "/v1/entries" && request.method === "GET") {
      const items = current === undefined ? [] : [{ entryId, title: current.content.title, status: published === undefined ? "draft" : published.revisionId === current.revisionId ? "published" : "published-with-draft", current: { revisionId: current.revisionId, contentDigest: digest, normalizedRoute: current.route }, ...(published === undefined ? {} : { published: { revisionId: published.revisionId, contentDigest: digest, normalizedRoute: published.route } }) }];
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "entry-catalog/v1", items, routeGraphs: {}, stateDigest: digest })); return;
    }
    const currentMatch = /^\/v1\/entries\/([^/]+)\/current$/u.exec(pathname);
    if (currentMatch !== null && request.method === "GET") {
      if (current === undefined || currentMatch[1] !== entryId) { response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify(failure("ENTRY_NOT_FOUND", "找不到文章。"))); return; }
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(authoringEntry(entryId, current))); return;
    }
    if (/^\/v1\/entries\/[^/]+\/current\/editor-blocks$/u.test(pathname) && request.method === "GET" && current !== undefined) {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "cms-editor-block-resolutions/v1", entryId, revisionId: current.revisionId, contentDigest: digest, stateDigest: digest, items: [] })); return;
    }
    if (/^\/v1\/entries\/[^/]+\/revisions$/u.test(pathname) && request.method === "POST") {
      const requestBody = await body(request);
      entryId = pathname.split("/")[3] ?? "";
      revisionCount += 1;
      current = { revisionId: `revision-${revisionCount}`, content: requestBody.content as Revision["content"], route: requestBody.route as string };
      response.writeHead(201, { "Content-Type": "application/json" }); response.end("{}"); return;
    }
    if (/^\/v1\/entries\/[^/]+\/publish$/u.test(pathname) && request.method === "POST" && current !== undefined) {
      publishRequests += 1;
      published = current;
      response.writeHead(200, { "Content-Type": "application/json" }); response.end("{}"); return;
    }
    if (pathname === "/v1/preview" && request.method === "POST") {
      const requestBody = await body(request);
      const selection = requestBody.selection;
      const revision = selection === "current" ? current : published;
      if (revision === undefined) { response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify(failure("SUBJECT_NOT_PUBLISHED", "尚未發布。"))); return; }
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "preview-document/v1", selection, subject: { entryId }, revisionId: revision.revisionId, contentDigest: digest, document: `<h1>${revision.content.title}</h1><p>${revision.content.blocks[0]?.text ?? ""}</p>` })); return;
    }
    if (/^\/v1\/entries\/[^/]+\/seo-analysis$/u.test(pathname) && request.method === "POST") {
      const requestBody = await body(request);
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "cms-seo-analysis-response/v1", documentDigest: requestBody.documentDigest, status: "available", suggestions: [], diagnostics: [] })); return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("CMS_ARTICLE_WORKSPACE_LISTENER_FAILED");
  const close = async (): Promise<void> => new Promise<void>((done, fail) => server.close((error) => error === undefined ? done() : fail(error)));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/cms#${ticket}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms");
    assert.equal(await page.getByRole("main").count(), 1);
    assert.equal(await page.getByRole("main").getAttribute("aria-labelledby"), "page-title");
    assert.equal(await page.getByRole("navigation", { name: "CMS 導覽" }).count(), 1);
    await page.getByRole("link", { name: "跳到主標題", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.getByRole("link", { name: "文章", exact: true }).click();
    await page.getByRole("heading", { name: "文章全覽", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/entries");
    await page.getByRole("link", { name: "建立第一篇文章", exact: true }).click();
    await page.getByRole("heading", { name: "新增文章", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/entries/new");
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("Article v1");
    await page.getByRole("textbox", { name: "網址代稱", exact: true }).fill("article-v1");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("第一版內容");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
    assert.match(new URL(page.url()).pathname, /^\/cms\/entries\/[^/]+$/u);
    const currentFrame = page.getByTitle("目前版本頁面預覽", { exact: true });
    await currentFrame.waitFor();
    assert.equal(await currentFrame.getAttribute("sandbox"), "");
    const currentTab = page.getByRole("tab", { name: "目前版本", exact: true });
    const publishedTab = page.getByRole("tab", { name: "已發布版本", exact: true });
    await currentTab.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "published-preview-tab");
    await page.keyboard.press("Space");
    await page.getByText("尚未發布", { exact: true }).waitFor();
    assert.equal(await publishedTab.getAttribute("aria-selected"), "true");
    await currentTab.click();
    const publish = page.getByRole("button", { name: "發布", exact: true });
    await publish.click();
    await page.getByRole("dialog", { name: "發布文章", exact: true }).waitFor();
    await page.getByText("將發布目前 revision：revision-1。發布只會更新已發布版本。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLButtonElement | null)?.textContent), "取消");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog")?.open);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "發布");
    await publish.click();
    await page.getByRole("button", { name: "確認發布", exact: true }).click();
    await page.getByText("已發布。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "已發布。");
    await publishedTab.click();
    const publishedFrame = page.getByTitle("已發布版本頁面預覽", { exact: true });
    await publishedFrame.waitFor();
    assert.equal(await publishedFrame.getAttribute("sandbox"), "");
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("Article v2");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.setViewportSize({ width: 375, height: 844 });
    await page.getByRole("button", { name: "儲存", exact: true }).scrollIntoViewIfNeeded();
    assert.notEqual(await page.getByRole("button", { name: "儲存", exact: true }).boundingBox(), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("link", { name: "文章", exact: true }).click();
    await page.getByText("已發布，有未發布變更", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/entries");
    assert.equal(publishRequests, 1);
    assert.equal(seenApiPaths.every((path) => path.startsWith("/v1/")), true);
  } finally {
    await browser.close();
    await close();
  }
});
