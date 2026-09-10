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
const identity = { id: "demo", version: "1.0.0", hook: "cms/editor-block/resolve", manifestHash: digest };
const source = { html: "<button>run</button>", css: "button{}", javascript: "void 0" };
const pluginBlock = { kind: "interactive-demo", identity: { id: "demo", version: "1.0.0" }, hook: "cms/editor-block/resolve", manifestHash: digest, source, staticFallback: "替代內容" };

type Status = "active" | "inactive" | "missing" | "identity-changed";

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<string, unknown>;
}

function entry(saved: boolean) {
  return { contract: "authoring-entry/v1", entryId: "entry-plugin", current: { revisionId: saved ? "revision-b" : "revision-a", schemaIdentity: { schemaId: "site-content", version: 1 }, content: { contract: "site-content/v1", title: "外掛文章", blocks: [{ kind: "article", text: saved ? "已修改本文" : "原始本文" }, pluginBlock], seo: {} }, contentDigest: digest, route: "/plugin-entry", assets: [], taxonomyBindings: [] }, stateDigest: digest };
}

function resolutions(status: Status, saved: boolean) {
  const item = { blockIndex: 1, pluginIdentity: identity, source, sourceDigest: digest, activeStateDigest: digest, status };
  return { contract: "cms-editor-block-resolutions/v1", entryId: "entry-plugin", revisionId: saved ? "revision-b" : "revision-a", contentDigest: digest, stateDigest: digest, items: [status === "active" ? { ...item, output: { rendered: "Host output" }, outputDigest: digest } : { ...item, diagnostic: { code: status === "inactive" ? "PLUGIN_BLOCK_INACTIVE" : status === "missing" ? "PLUGIN_BLOCK_MISSING" : "PLUGIN_BLOCK_IDENTITY_CHANGED", owner: "PluginHost", subjectIds: ["demo"], remediation: { kind: "message", message: `${status} remediation` }, detail: { pluginId: "demo", hook: "cms/editor-block/resolve", capability: "cms-editor-block-resolution", entryId: "entry-plugin", cause: status } } }] };
}

function error(status: number) {
  return { contract: "authoring-error/v1", requestId: "request-a", code: "ENTRY_NOT_FOUND", owner: "DomainApplication", subjectIds: ["entry-plugin"], remediation: { kind: "message", message: "找不到指定文章。" }, status };
}

test("entry editor 以 authenticated browser/a11y gate 顯示 Host output，並保留所有 safe source", async () => {
  const assets = loadCmsAssets(distRoot);
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  const browser = await chromium.launch();
  try {
    for (const status of ["active", "inactive", "missing", "identity-changed"] as const) {
      let saved = false;
      let savedBody: Record<string, unknown> | undefined;
      const server = createServer(async (request, response) => {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname === "/cms/entries/entry-plugin") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(`<!doctype html><html><body><div id="root"><h1>CMS 工作台已鎖定</h1></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`); return; }
        if (pathname === "/_local/browser-session") { assert.deepEqual(await body(request), { contract: "browser-session-exchange/v1", ticket }); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "browser-session/v1", generation: 1, apiKey })); return; }
        const asset = assets.read(pathname);
        if (asset !== undefined) { response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" }); response.end(asset.bytes); return; }
        assert.equal(request.headers.authorization, `Bearer ${apiKey}`);
        if (pathname === "/v1/entries/entry-plugin/current") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(entry(saved))); return; }
        if (pathname === "/v1/entries/entry-plugin/current/editor-blocks") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(resolutions(status, saved))); return; }
        if (pathname === "/v1/entries/entry-plugin/seo-analysis") { const requestBody = await body(request); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "cms-seo-analysis-response/v1", documentDigest: requestBody.documentDigest, status: "unavailable", suggestions: [], diagnostics: [] })); return; }
        if (pathname === "/v1/preview") { const requestBody = await body(request); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "preview-document/v1", selection: requestBody.selection, subject: requestBody.subject, revisionId: saved ? "revision-b" : "revision-a", contentDigest: digest, document: "<!doctype html><title>preview</title>" })); return; }
        if (pathname === "/v1/entries/entry-plugin/revisions") { savedBody = await body(request); saved = true; response.writeHead(200, { "Content-Type": "application/json" }); response.end("{}"); return; }
        response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify(error(404)));
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("CMS_PLUGIN_EDITOR_LISTENER_FAILED");
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${address.port}/cms/entries/entry-plugin#${ticket}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
        const statusRegion = page.getByRole("status", { name: "互動區塊 2 狀態", exact: true });
        if (status === "active") {
          await assert.doesNotReject(() => statusRegion.getByText("外掛 demo@1.0.0 已啟用；已顯示 Host output。", { exact: true }).waitFor());
          assert.equal(await page.getByRole("region", { name: "互動區塊 2 Host output", exact: true }).textContent(), '{"rendered":"Host output"}');
          assert.equal(await page.getByRole("note", { name: "Plugin 診斷", exact: true }).count(), 0);
        } else {
          await assert.doesNotReject(() => statusRegion.getByText(status === "inactive" ? "外掛 demo@1.0.0 尚未啟用；已保留原始內容。" : status === "missing" ? "找不到外掛 demo@1.0.0；已保留原始內容。" : "外掛 demo@1.0.0 identity 已變更；已保留原始內容。", { exact: true }).waitFor());
          const expectedCode = status === "inactive" ? "PLUGIN_BLOCK_INACTIVE" : status === "missing" ? "PLUGIN_BLOCK_MISSING" : "PLUGIN_BLOCK_IDENTITY_CHANGED";
          await page.getByRole("note", { name: "Plugin 診斷", exact: true }).getByText(expectedCode, { exact: true }).waitFor();
          assert.equal(await page.getByRole("region", { name: "互動區塊 2 保留的來源", exact: true }).textContent(), '{"css":"button{}","html":"<button>run</button>","javascript":"void 0"}');
          assert.equal(await page.getByRole("region", { name: "互動區塊 2 Host output", exact: true }).count(), 0);
        }
        await page.getByRole("textbox", { name: "本文", exact: true }).focus();
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), status === "active" ? "互動區塊 2 Host output" : "互動區塊 2 保留的來源");
        await page.getByRole("textbox", { name: "本文", exact: true }).fill("已修改本文");
        await page.getByRole("button", { name: "儲存", exact: true }).click();
        await page.getByText("已儲存。", { exact: true }).waitFor();
        assert.deepEqual((savedBody?.content as { blocks?: unknown[] } | undefined)?.blocks?.[1], pluginBlock);
        assert.equal(JSON.stringify(savedBody).includes("Host output"), false);
        assert.equal(JSON.stringify(savedBody).includes("PLUGIN_BLOCK_"), false);
      } finally {
        await context.close();
        await new Promise<void>((done, fail) => server.close((closeError) => closeError === undefined ? done() : fail(closeError)));
      }
    }
  } finally {
    await browser.close();
  }
});

const otherDigest = `sha256:${"e".repeat(64)}`;
const secondBlock = { ...pluginBlock, identity: { id: "demo", version: "1.0.0" } };

function driftEntry() {
  return { contract: "authoring-entry/v1", entryId: "entry-plugin", current: { revisionId: "revision-a", schemaIdentity: { schemaId: "site-content", version: 1 }, content: { contract: "site-content/v1", title: "外掛文章", blocks: [{ kind: "article", text: "原始本文" }, pluginBlock, secondBlock], seo: {} }, contentDigest: digest, route: "/plugin-entry", assets: [], taxonomyBindings: [] }, stateDigest: digest };
}

function activeItem(blockIndex: number, activeStateDigest: string) {
  return { blockIndex, pluginIdentity: identity, source, sourceDigest: digest, activeStateDigest, status: "active", output: { rendered: "Host output" }, outputDigest: digest };
}

// blockIndex 序列不合與跨 activation state 的 item 都不是可信 snapshot：Application 逐 block 呼叫 Host，
// 中途的 activation 變更會讓同一份 response 混到兩個 state。CMS 以 block index 對齊 resolution，
// 採用這種 response 會把錯位或不同源的 Host output 貼到 canonical block 上。
test("entry editor 拒絕 blockIndex 錯位或跨 activation state 的 editor block response，並只播報一次 alert", async () => {
  const assets = loadCmsAssets(distRoot);
  assert.notEqual(assets, undefined, "cms:build 必須先產生 Vite manifest");
  if (assets === undefined) return;
  const browser = await chromium.launch();
  try {
    for (const drift of ["misaligned-index", "mixed-activation-state"] as const) {
      const items = drift === "misaligned-index" ? [activeItem(1, digest)] : [activeItem(1, digest), activeItem(2, otherDigest)];
      const server = createServer(async (request, response) => {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname === "/cms/entries/entry-plugin") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(`<!doctype html><html><body><div id="root"><h1>CMS 工作台已鎖定</h1></div><script type="module" src="/cms/${assets.bootstrapPath}"></script></body></html>`); return; }
        if (pathname === "/_local/browser-session") { assert.deepEqual(await body(request), { contract: "browser-session-exchange/v1", ticket }); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "browser-session/v1", generation: 1, apiKey })); return; }
        const asset = assets.read(pathname);
        if (asset !== undefined) { response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" }); response.end(asset.bytes); return; }
        assert.equal(request.headers.authorization, `Bearer ${apiKey}`);
        if (pathname === "/v1/entries/entry-plugin/current") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(driftEntry())); return; }
        if (pathname === "/v1/entries/entry-plugin/current/editor-blocks") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "cms-editor-block-resolutions/v1", entryId: "entry-plugin", revisionId: "revision-a", contentDigest: digest, stateDigest: digest, items })); return; }
        if (pathname === "/v1/entries/entry-plugin/seo-analysis") { const requestBody = await body(request); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "cms-seo-analysis-response/v1", documentDigest: requestBody.documentDigest, status: "unavailable", suggestions: [], diagnostics: [] })); return; }
        if (pathname === "/v1/preview") { const requestBody = await body(request); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ contract: "preview-document/v1", selection: requestBody.selection, subject: requestBody.subject, revisionId: "revision-a", contentDigest: digest, document: "<!doctype html><title>preview</title>" })); return; }
        response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify(error(404)));
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("CMS_PLUGIN_EDITOR_LISTENER_FAILED");
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${address.port}/cms/entries/entry-plugin#${ticket}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
        await page.getByRole("alert").getByText("互動區塊狀態已變更，請重新載入文章。", { exact: true }).waitFor();
        assert.equal(await page.getByText("互動區塊狀態已變更，請重新載入文章。", { exact: true }).count(), 3, "一則 alert 加上兩個 block 各自的 status text");
        assert.equal(await page.getByRole("alert").count(), 1);
        for (const ordinal of [2, 3]) {
          assert.equal(await page.getByRole("region", { name: `互動區塊 ${ordinal} Host output`, exact: true }).count(), 0);
          assert.equal(await page.getByRole("region", { name: `互動區塊 ${ordinal} 保留的來源`, exact: true }).count(), 0);
        }
      } finally {
        await context.close();
        await new Promise<void>((done, fail) => server.close((closeError) => closeError === undefined ? done() : fail(closeError)));
      }
    }
  } finally {
    await browser.close();
  }
});
