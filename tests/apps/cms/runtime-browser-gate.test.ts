import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { chromium, type Browser } from "playwright";

import { createLocalAuthoringClient, createLocalAuthoringCredentialAuthority, startCmsRuntime } from "../../../apps/authoring-api/index.js";
import { runDbMigrate } from "../../../apps/cli/db-migrate.js";
import { runPluginPackage, runThemePackage } from "../../../apps/cli/package.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { openPersistence } from "../../../core/persistence/index.js";
import { createTaxonomy } from "../../../core/taxonomy/index.js";
import { runThemeActivate } from "../../../apps/cli/theme-activate.js";

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout: (text) => { output.push(text); }, stderr: (text) => { output.push(text); } } };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** Thumbnail pipeline 只接受真的能解碼的 raster，因此縮圖 evidence 需要一個最小可解碼 PNG。 */
function pngFixture(width: number, height: number): Buffer {
  const crc = (bytes: Buffer): Buffer => {
    let value = 0xffffffff;
    for (const byte of bytes) value = (CRC32_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
    const output = Buffer.alloc(4);
    output.writeUInt32BE((value ^ 0xffffffff) >>> 0);
    return output;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    return Buffer.concat([length, body, crc(body)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = (x * 32) % 256;
      row[offset + 1] = (y * 32) % 256;
      row[offset + 2] = 128;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

test("真實 CMS runtime 完成四條 canonical route 的 authenticated browser/a11y journey", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-runtime-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runPluginPackage(["--id", "seo-basics", "--installed-plugins-root", pluginsRoot], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const context_ = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } });
    const page = await context_.newPage();
    await page.goto(`${runtime.value.origin}/cms`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms");
    assert.equal(await page.getByRole("main").getAttribute("aria-labelledby"), "page-title");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.getByRole("link", { name: "跳到主標題", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    const routeGraphStarted = Promise.withResolvers<void>();
    const releaseRouteGraphs = Promise.withResolvers<void>();
    await page.route("**/v1/site/routes?selection=*", async (route) => { routeGraphStarted.resolve(); await releaseRouteGraphs.promise; await route.continue(); });
    await page.evaluate(() => { history.pushState(null, "", "/cms/site/routes"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.getByRole("heading", { name: "Site route 管理", exact: true }).waitFor();
    await routeGraphStarted.promise;
    assert.equal(await page.getByRole("status").getByText("正在載入路由圖。", { exact: true }).getAttribute("aria-busy"), "true");
    releaseRouteGraphs.resolve();
    await page.getByText("此路由圖尚無 route claim。", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("此路由圖尚無 route claim。", { exact: true }).count(), 2);
    await page.unroute("**/v1/site/routes?selection=*");
    await page.evaluate(() => { history.pushState(null, "", "/cms"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    await page.getByRole("link", { name: "舊版文章", exact: true }).click();
    await page.getByRole("heading", { name: "文章全覽", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/entries");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.getByRole("link", { name: "建立第一篇文章", exact: true }).click();
    await page.getByRole("heading", { name: "新增文章", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/entries/new");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("Runtime Article v1");
    await page.getByRole("textbox", { name: "網址代稱", exact: true }).fill("runtime-article");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("第一版真實 runtime 內容");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
    await page.waitForFunction(() => /^\/cms\/entries\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(location.pathname));
    assert.match(new URL(page.url()).pathname, /^\/cms\/entries\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    const entryId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    const currentFrame = page.getByTitle("目前版本頁面預覽", { exact: true });
    await currentFrame.waitFor();
    assert.equal(await currentFrame.getAttribute("sandbox"), "");
    const currentPreview = currentFrame.contentFrame();
    assert.ok(currentPreview);
    await currentPreview.getByText("Runtime Article v1", { exact: true }).waitFor();
    const currentTab = page.getByRole("tab", { name: "目前版本", exact: true });
    const publishedTab = page.getByRole("tab", { name: "已發布版本", exact: true });
    await currentTab.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await publishedTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await currentTab.getAttribute("aria-selected"), "true");
    const publish = page.getByRole("button", { name: "發布", exact: true });
    await publish.click();
    const dialog = page.getByRole("dialog", { name: "發布文章", exact: true });
    await dialog.waitFor();
    assert.match(await dialog.textContent() ?? "", /將發布目前 revision：/u);
    const cancel = dialog.getByRole("button", { name: "取消", exact: true });
    const confirm = dialog.getByRole("button", { name: "確認發布", exact: true });
    await confirm.focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "取消");
    await cancel.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "確認發布");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog")?.open);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "發布");
    await publishedTab.click();
    await page.getByText("尚未發布", { exact: true }).waitFor();
    await publish.click();
    await confirm.click();
    await page.getByText("已發布。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "已發布。");
    await publishedTab.click();
    const publishedFrame = page.getByTitle("已發布版本頁面預覽", { exact: true });
    await publishedFrame.waitFor();
    assert.equal(await publishedFrame.getAttribute("sandbox"), "");
    const publishedPreview = publishedFrame.contentFrame();
    assert.ok(publishedPreview);
    await publishedPreview.getByText("Runtime Article v1", { exact: true }).waitFor();
    await page.evaluate(() => { history.pushState(null, "", "/cms/site/routes"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.getByRole("heading", { name: "Site route 管理", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/site/routes");
    assert.equal(await page.getByRole("link", { name: "Site route 管理", exact: true }).count(), 0);
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByRole("link", { name: "跳到主標題", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.getByRole("cell", { name: "/runtime-article", exact: true }).first().waitFor();
    await page.getByRole("combobox", { name: "現有 claim", exact: true }).selectOption({ index: 1 });
    await page.getByRole("textbox", { name: "新 route", exact: true }).fill("/runtime-article-moved");
    await page.getByRole("button", { name: "變更路由", exact: true }).click();
    await page.getByRole("status").getByText("路由已更新。", { exact: true }).waitFor();
    await page.getByRole("cell", { name: "/runtime-article-moved", exact: true }).first().waitFor();
    await page.route("**/v1/site/routes/change", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ contract: "authoring-error/v1", requestId: "test", code: "STALE_ROUTE_PROPOSAL", owner: "Application", subjectIds: [], remediation: { kind: "message", message: "stale" } }) });
      else await route.continue();
    });
    await page.getByRole("textbox", { name: "新 route", exact: true }).fill("/runtime-article-stale");
    await page.getByRole("button", { name: "變更路由", exact: true }).click();
    await page.getByRole("alert").getByText("路由已由其他操作更新；請重新載入後再試。", { exact: true }).waitFor();
    await page.unroute("**/v1/site/routes/change");
    await page.getByRole("textbox", { name: "新 route", exact: true }).fill("/runtime-article");
    await page.getByRole("button", { name: "變更路由", exact: true }).click();
    await page.getByRole("status").getByText("路由已更新。", { exact: true }).waitFor();
    await page.evaluate((id) => { history.pushState(null, "", `/cms/entries/${id}`); dispatchEvent(new PopStateEvent("popstate")); }, entryId);
    await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
    await page.setViewportSize({ width: 375, height: 844 });
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("Runtime Article v2");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "儲存", exact: true }).scrollIntoViewIfNeeded();
    await currentTab.click();
    const refreshedCurrentPreview = page.getByTitle("目前版本頁面預覽", { exact: true }).contentFrame();
    assert.ok(refreshedCurrentPreview);
    await refreshedCurrentPreview.getByText("Runtime Article v2", { exact: true }).waitFor();
    await publishedTab.click();
    const refreshedPublishedPreview = page.getByTitle("已發布版本頁面預覽", { exact: true }).contentFrame();
    assert.ok(refreshedPublishedPreview);
    await refreshedPublishedPreview.getByText("Runtime Article v1", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("link", { name: "舊版文章", exact: true }).click();
    await page.getByText("已發布，有未發布變更", { exact: true }).waitFor();
    const mediaLibrary = page.getByRole("link", { name: "媒體庫", exact: true });
    await mediaLibrary.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "媒體庫", exact: true }).waitFor();
    await page.getByText("尚無媒體。").waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/media");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByRole("link", { name: "匯入第一個媒體檔案", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "匯入媒體", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    // 每個 asset 的 evidence 只能來自 server：以 same-origin session 讀回權威 media-asset/v2。
    const readAsset = async (assetId: string): Promise<Readonly<{ assetId: string; slug: string; title: string; checksum: string; byteLength: number }>> => await page.evaluate(async (id) => {
      const response = await fetch(`/v1/media/${id}`, { credentials: "omit", cache: "no-store" });
      if (response.status !== 200) throw new Error(`readAsset ${response.status}`);
      const body = await response.json() as { asset: { assetId: string; slug: string; title: string; checksum: string; byteLength: number } };
      return body.asset;
    }, assetId);
    const queue = page.getByRole("list", { name: "上傳項目", exact: true });
    const importInput = page.getByLabel("媒體檔案", { exact: true });
    const queueItem = (filename: string) => queue.locator("li").filter({ hasText: filename });
    // 佇列上限：前兩個 request 被扣住時，第三個必須停在「等待中」，而且尚未送出 request。
    const importRangeHeaders: (string | undefined)[] = [];
    const twoImportsStarted = Promise.withResolvers<void>();
    const releaseImports = Promise.withResolvers<void>();
    await page.route("**/v1/media/import", async (route) => {
      importRangeHeaders.push(route.request().headers()["range"]);
      if (importRangeHeaders.length === 2) twoImportsStarted.resolve();
      if (importRangeHeaders.length <= 2) await releaseImports.promise;
      await route.continue();
    });
    await page.getByRole("textbox", { name: "Caption", exact: true }).fill("runtime caption");
    await importInput.setInputFiles([
      { name: "runtime-note.txt", mimeType: "text/plain", buffer: Buffer.from("runtime note bytes") },
      { name: "runtime-guide.txt", mimeType: "text/plain", buffer: Buffer.from("runtime guide bytes") },
      { name: "runtime-pixel.png", mimeType: "image/png", buffer: pngFixture(8, 4) },
    ]);
    await twoImportsStarted.promise;
    const pixelQueueItem = queueItem("runtime-pixel.png");
    await pixelQueueItem.getByText("等待中", { exact: true }).waitFor();
    assert.equal(await pixelQueueItem.getByText("上傳中", { exact: false }).count(), 0);
    assert.equal(importRangeHeaders.length, 2);
    releaseImports.resolve();
    for (const filename of ["runtime-note.txt", "runtime-guide.txt", "runtime-pixel.png"]) await queueItem(filename).getByText("已完成", { exact: true }).waitFor();
    assert.equal(importRangeHeaders.length, 3);
    await page.unroute("**/v1/media/import");
    // 取消只中止該項目：另一個項目照常完成。
    const cancelGate = Promise.withResolvers<void>();
    const twoCancelsStarted = Promise.withResolvers<void>();
    let cancelAttempts = 0;
    await page.route("**/v1/media/import", async (route) => {
      cancelAttempts += 1;
      const index = cancelAttempts;
      if (index === 2) twoCancelsStarted.resolve();
      await cancelGate.promise;
      // 取消的是第一個項目：被中止的 request 不得再送給 server，否則取消就只是 UI 假象。
      if (index === 1) { await route.abort().catch(() => undefined); return; }
      await route.continue().catch(() => undefined);
    });
    await importInput.setInputFiles([
      { name: "runtime-cancelled.txt", mimeType: "text/plain", buffer: Buffer.from("runtime cancelled bytes") },
      { name: "runtime-kept.txt", mimeType: "text/plain", buffer: Buffer.from("runtime kept bytes") },
    ]);
    await twoCancelsStarted.promise;
    await queueItem("runtime-cancelled.txt").getByRole("button", { name: "取消", exact: true }).click();
    await queueItem("runtime-cancelled.txt").getByText("已取消", { exact: true }).waitFor();
    cancelGate.resolve();
    await queueItem("runtime-kept.txt").getByText("已完成", { exact: true }).waitFor();
    assert.equal(await queueItem("runtime-cancelled.txt").getByText("已完成", { exact: true }).count(), 0);
    await page.unroute("**/v1/media/import");
    // 失敗後重試：必須是全新的 request（沒有 Range header），並最終成功。
    const retryRangeHeaders: (string | undefined)[] = [];
    let retryAttempts = 0;
    await page.route("**/v1/media/import", async (route) => {
      retryAttempts += 1;
      retryRangeHeaders.push(route.request().headers()["range"]);
      if (retryAttempts === 1) {
        await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ contract: "authoring-error/v1", requestId: "runtime-media-retry", code: "MEDIA_UNSUPPORTED_TYPE", owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: "此檔案類型不在媒體庫允許的清單內。" } }) });
        return;
      }
      await route.continue();
    });
    await importInput.setInputFiles([{ name: "runtime-retry.txt", mimeType: "text/plain", buffer: Buffer.from("runtime retry bytes") }]);
    const retryItem = queueItem("runtime-retry.txt");
    await retryItem.getByText("失敗", { exact: true }).waitFor();
    await retryItem.getByRole("alert").getByText("此檔案類型不在媒體庫允許的清單內。", { exact: true }).waitFor();
    assert.equal(await retryItem.getByText("已完成", { exact: true }).count(), 0);
    await retryItem.getByRole("button", { name: "重試", exact: true }).click();
    await retryItem.getByText("已完成", { exact: true }).waitFor();
    assert.equal(retryAttempts, 2);
    assert.deepEqual(retryRangeHeaders, [undefined, undefined]);
    await page.unroute("**/v1/media/import");
    // 匯入成功後 catalog 重新載入，已匯入的 asset 直接顯示 server evidence 與縮圖。
    const importLibrary = page.getByRole("region", { name: "已匯入的 asset（重新載入的媒體庫）", exact: true });
    const importedPixel = importLibrary.locator("li").filter({ hasText: "runtime-pixel.png" });
    const importedThumbnail = importedPixel.locator("img");
    await importedThumbnail.waitFor();
    const pixelAssetId = (await importedPixel.getByRole("link").getAttribute("href") ?? "").split("/").at(-1) ?? "";
    assert.equal(await importedThumbnail.getAttribute("src"), `/cms/media/${pixelAssetId}/thumbnail`);
    assert.equal(await importedThumbnail.getAttribute("alt"), "");
    await importLibrary.locator("li").filter({ hasText: "runtime-note.txt" }).getByText("runtime caption", { exact: true }).waitFor();
    await page.getByRole("link", { name: "媒體庫", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "媒體庫", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByText("共 5 個 asset。", { exact: true }).waitFor();
    const catalog = page.getByRole("list", { name: "媒體 asset", exact: true });
    const catalogPixel = catalog.locator("li").filter({ hasText: "runtime-pixel.png" });
    const catalogThumbnail = catalogPixel.locator("img");
    await catalogThumbnail.waitFor();
    assert.equal(await catalogThumbnail.getAttribute("src"), `/cms/media/${pixelAssetId}/thumbnail`);
    // 縮圖是可直接放進 <img> 的 same-origin 資源：瀏覽器必須真的解出 PNG。
    await page.waitForFunction((selector) => { const image = document.querySelector(selector); return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0; }, `img[src="/cms/media/${pixelAssetId}/thumbnail"]`);
    assert.deepEqual(await catalogThumbnail.evaluate((element) => element instanceof HTMLImageElement ? [element.naturalWidth, element.naturalHeight] : []), [8, 4]);
    assert.equal(await catalogPixel.getByText("image/png", { exact: true }).count(), 1);
    assert.equal(await catalogPixel.getByText("8 × 4", { exact: true }).count(), 1);
    const catalogNote = catalog.locator("li").filter({ hasText: "runtime-note.txt" });
    await catalogNote.getByText("僅提供 metadata", { exact: true }).waitFor();
    await catalogNote.getByText("runtime caption", { exact: true }).waitFor();
    await catalogNote.getByText("未設定", { exact: true }).first().waitFor();
    assert.equal(await catalog.locator("li").filter({ hasText: "runtime-cancelled.txt" }).count(), 0);
    const retryAssetId = (await catalog.locator("li").filter({ hasText: "runtime-retry.txt" }).getByRole("link").getAttribute("href") ?? "").split("/").at(-1) ?? "";
    const noteLink = catalogNote.getByRole("link");
    const noteAssetId = (await noteLink.getAttribute("href") ?? "").split("/").at(-1) ?? "";
    await noteLink.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "媒體：runtime-note.txt", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const evidence = page.getByRole("region", { name: "Evidence", exact: true });
    await evidence.getByText("僅提供 metadata", { exact: true }).waitFor();
    await page.getByRole("region", { name: "引用狀態", exact: true }).getByText("目前沒有 entry 引用此 asset。", { exact: true }).waitFor();
    // 第二個分頁先載入同一份 detail，之後才由第一個分頁儲存：第二個分頁的 digest 必然過期。
    const staleContext = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } });
    const stalePage = await staleContext.newPage();
    await stalePage.goto(`${runtime.value.origin}/cms/media/${noteAssetId}`, { waitUntil: "networkidle" });
    await stalePage.getByRole("heading", { name: "媒體：runtime-note.txt", exact: true }).waitFor();
    const staleSlug = await stalePage.getByLabel("Slug", { exact: true }).inputValue();
    await page.getByLabel("標題", { exact: true }).fill("Runtime 媒體標題");
    await page.getByLabel("Slug", { exact: true }).fill("runtime-media-title");
    await page.getByLabel("Alt 文字", { exact: true }).fill("替代文字");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByRole("status").getByText("已儲存。", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("標題", { exact: true }).inputValue(), "Runtime 媒體標題");
    await page.getByRole("heading", { name: "媒體：Runtime 媒體標題", exact: true }).waitFor();
    await stalePage.getByLabel("標題", { exact: true }).fill("過期分頁標題");
    await stalePage.getByRole("button", { name: "儲存", exact: true }).click();
    await stalePage.getByRole("alert").getByText("媒體 metadata 已由另一個頁面更新。", { exact: true }).waitFor();
    assert.equal(await stalePage.getByLabel("標題", { exact: true }).inputValue(), "過期分頁標題");
    assert.equal(await stalePage.getByLabel("Slug", { exact: true }).inputValue(), staleSlug);
    await stalePage.getByRole("button", { name: "重新載入", exact: true }).click();
    await stalePage.getByRole("heading", { name: "媒體：Runtime 媒體標題", exact: true }).waitFor();
    assert.equal(await stalePage.getByLabel("標題", { exact: true }).inputValue(), "Runtime 媒體標題");
    // 空標題必須是欄位層級的 a11y 錯誤（aria-invalid + aria-describedby + role=alert），且不得送出請求。
    await stalePage.getByLabel("標題", { exact: true }).fill("");
    await stalePage.getByRole("button", { name: "儲存", exact: true }).click();
    const titleInput = stalePage.getByLabel("標題", { exact: true });
    assert.equal(await titleInput.getAttribute("aria-invalid"), "true");
    assert.equal(await titleInput.getAttribute("aria-describedby"), "media-metadata-title-error");
    await stalePage.getByRole("alert").getByText("請輸入標題。", { exact: true }).waitFor();
    await stalePage.getByLabel("標題", { exact: true }).fill("Runtime 媒體標題");
    await staleContext.close();
    // Replace 保留 stable asset ID 與 slug，只更新 bytes、checksum 與 byteLength。
    const beforeReplace = await readAsset(noteAssetId);
    await page.locator("#media-replace-file").setInputFiles({ name: "runtime-replacement.txt", mimeType: "text/plain", buffer: Buffer.from("runtime replacement bytes") });
    await page.getByRole("button", { name: "替換 bytes", exact: true }).click();
    await page.getByRole("status").getByText("已替換媒體 bytes。", { exact: true }).waitFor();
    const afterReplace = await readAsset(noteAssetId);
    assert.equal(afterReplace.assetId, noteAssetId);
    assert.equal(afterReplace.slug, "runtime-media-title");
    assert.notEqual(afterReplace.checksum, beforeReplace.checksum);
    assert.notEqual(afterReplace.byteLength, beforeReplace.byteLength);
    await evidence.getByText(afterReplace.checksum, { exact: true }).waitFor();
    // 未被引用的 asset 可以刪除：detail 消失，catalog 也不再列出。
    await page.evaluate((id) => { history.pushState(null, "", `/cms/media/${id}`); dispatchEvent(new PopStateEvent("popstate")); }, retryAssetId);
    await page.getByRole("heading", { name: "媒體：runtime-retry.txt", exact: true }).waitFor();
    await page.getByRole("button", { name: "刪除 asset", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "確認刪除", exact: true }).click();
    await page.getByRole("heading", { name: "媒體庫", exact: true }).waitFor();
    await page.getByText(/^已刪除 asset 並釋放 slug：.+。$/u).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByText("共 4 個 asset。", { exact: true }).waitFor();
    assert.equal(await catalog.locator("li").filter({ hasText: "runtime-retry.txt" }).count(), 0);
    const missingPage = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false })).newPage();
    await missingPage.goto(`${runtime.value.origin}/cms/media/${retryAssetId}`, { waitUntil: "networkidle" });
    await missingPage.getByRole("heading", { name: "媒體詳情", exact: true }).waitFor();
    await missingPage.getByText("找不到媒體 asset。", { exact: true }).waitFor();
    await missingPage.waitForFunction(() => document.activeElement?.id === "page-title");
    // 破壞性操作的權威是 ledger：有 usage 之後 Delete 必須被 409 阻擋，且 UI 立刻顯示 usage 並停用破壞性操作。
    await page.evaluate((id) => { history.pushState(null, "", `/cms/media/${id}`); dispatchEvent(new PopStateEvent("popstate")); }, noteAssetId);
    await page.getByRole("heading", { name: "媒體：Runtime 媒體標題", exact: true }).waitFor();
    const usageStore = openPersistence({ databasePath });
    assert.equal(usageStore.ok, true, usageStore.ok ? "" : usageStore.error.code);
    if (!usageStore.ok) return;
    try {
      const referenced = usageStore.value.replaceEntryMediaReferences({ entryId, status: "published", assetIds: [noteAssetId] });
      assert.equal(referenced.ok, true, referenced.ok ? "" : referenced.error.code);
    } finally { usageStore.value.close(); }
    await page.getByRole("button", { name: "刪除 asset", exact: true }).focus();
    await page.keyboard.press("Enter");
    const deleteDialog = page.getByRole("dialog", { name: "刪除媒體 asset", exact: true });
    await deleteDialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "取消");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "確認刪除");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "取消");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog")?.open);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "刪除 asset");
    await page.getByRole("button", { name: "刪除 asset", exact: true }).click();
    await page.getByRole("button", { name: "確認刪除", exact: true }).click();
    const referenceAlert = page.getByRole("alert").filter({ hasText: "仍有 entry 引用此 media asset，無法取代或刪除。" });
    await referenceAlert.waitFor();
    await referenceAlert.getByText(`${entryId}（已發布）`, { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "替換 bytes", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "刪除 asset", exact: true }).isDisabled(), true);
    await page.getByRole("region", { name: "引用狀態", exact: true }).getByText("此 asset 仍被下列 entry 引用，Replace 與 Delete 已停用。", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "媒體：Runtime 媒體標題", exact: true }).waitFor();
    await page.getByRole("region", { name: "引用狀態", exact: true }).getByText(`${entryId}（已發布）`, { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "刪除 asset", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "替換 bytes", exact: true }).isDisabled(), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 完成 taxonomy list、create 與 detail browser/a11y journey", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-taxonomy-workspace-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    const taxonomiesPath = `${runtime.value.origin}/v1/taxonomies`;
    let releaseCatalog: (() => void) | undefined;
    const catalogHeld = new Promise<void>((resolve) => { releaseCatalog = resolve; });
    await page.route(taxonomiesPath, async (route) => {
      if (route.request().method() === "GET") await catalogHeld;
      await route.continue();
    });
    await page.goto(`${runtime.value.origin}/cms`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    const skip = page.getByRole("link", { name: "跳到主標題", exact: true });
    await skip.focus();
    assert.equal(await skip.evaluate((element) => document.activeElement === element), true);
    assert.equal(await skip.evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const taxonomies = page.getByRole("link", { name: "分類", exact: true });
    await taxonomies.focus();
    assert.equal(await taxonomies.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "分類全覽", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/taxonomies");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const loading = page.locator('p[role="status"][aria-busy="true"]');
    await loading.waitFor();
    assert.equal(await loading.textContent(), "正在載入分類。");
    releaseCatalog?.();
    await page.getByRole("table", { name: "所有分類", exact: true }).waitFor();
    await page.unroute(taxonomiesPath);
    const createFirst = page.getByRole("link", { name: "建立分類", exact: true }).first();
    await createFirst.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "建立分類", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/taxonomies/new");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const taxonomyId = page.getByRole("textbox", { name: "Taxonomy ID", exact: true });
    const taxonomyLabel = page.getByRole("textbox", { name: "分類名稱", exact: true });
    const submit = page.getByRole("button", { name: "建立分類", exact: true });
    await taxonomyId.fill("topics/invalid");
    await taxonomyLabel.fill("主題");
    await submit.focus();
    await page.keyboard.press("Enter");
    await page.locator("#taxonomy-id-error").waitFor();
    assert.equal(await taxonomyId.getAttribute("aria-invalid"), "true");
    assert.equal(await taxonomyId.getAttribute("aria-describedby"), "taxonomy-id-error");
    assert.equal(await page.locator("#taxonomy-id-error").getAttribute("role"), "alert");
    await taxonomyId.fill("topics");
    let releaseCreate: (() => void) | undefined;
    const createHeld = new Promise<void>((resolve) => { releaseCreate = resolve; });
    await page.route(taxonomiesPath, async (route) => {
      if (route.request().method() === "POST") await createHeld;
      await route.continue();
    });
    await submit.focus();
    await page.keyboard.press("Enter");
    const creating = page.locator('p[role="status"]').filter({ hasText: "正在建立分類。" });
    await creating.waitFor();
    assert.equal(await page.getByRole("form", { name: "分類定義", exact: true }).getAttribute("aria-busy"), "true");
    releaseCreate?.();
    await page.getByRole("heading", { name: "分類：主題", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/taxonomies/topics");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const created = page.locator('p[role="status"]').filter({ hasText: "已建立分類。" });
    await created.waitFor();
    assert.equal(await created.getAttribute("aria-live"), "polite");
    await page.getByText("Taxonomy ID", { exact: true }).waitFor();
    await page.getByText("topics", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Terms", exact: true }).waitFor();
    await page.getByText("尚無 term。", { exact: true }).waitFor();
    await page.unroute(taxonomiesPath);
    await taxonomies.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "分類全覽", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const create = page.getByRole("link", { name: "建立分類", exact: true });
    await create.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "建立分類", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await taxonomyId.fill("topics");
    await taxonomyLabel.fill("重複分類");
    await submit.focus();
    await page.keyboard.press("Enter");
    await page.locator("#taxonomy-id-error").waitFor();
    assert.equal(await taxonomyId.getAttribute("aria-invalid"), "true");
    assert.equal(await taxonomyId.getAttribute("aria-describedby"), "taxonomy-id-error");
    assert.equal(await page.locator("#taxonomy-id-error").textContent(), "Taxonomy 或 term 已存在，或其生命週期狀態不允許此操作。");
    await page.goto(`${runtime.value.origin}/cms/taxonomies/missing`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "分類詳情", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const missing = page.locator('p[role="alert"]').filter({ hasText: "找不到分類。" });
    await missing.waitFor();
    assert.equal(await missing.textContent(), "找不到分類。");
    await page.setViewportSize({ width: 375, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 以既有 taxonomy 呈現 catalog 與 term 表格", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-taxonomy-tables-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true, opened.ok ? "" : opened.error.code);
  if (!opened.ok) return;
  try {
    const taxonomy = createTaxonomy({ persistence: opened.value });
    // catalog 依 taxonomyId code unit 排序，因此先建立排序在後的 topics 才能證明順序來自 Taxonomy 而非建立順序。
    const topics = taxonomy.createTaxonomy({ contract: "taxonomy-create-request/v1", taxonomyId: "topics", label: "主題" });
    assert.equal(topics.ok, true, topics.ok ? "" : topics.error.code);
    if (!topics.ok) return;
    const authors = taxonomy.createTaxonomy({ contract: "taxonomy-create-request/v1", taxonomyId: "authors", label: "作者" });
    assert.equal(authors.ok, true, authors.ok ? "" : authors.error.code);
    if (!authors.ok) return;
    // term 依 order 排序；先建立 order 較大的 beta，再建立 alpha。
    const beta = taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", expectedStateDigest: topics.value.stateDigest, termId: "beta", label: "Beta", slug: "beta", order: 20 });
    assert.equal(beta.ok, true, beta.ok ? "" : beta.error.code);
    if (!beta.ok) return;
    const alpha = taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", expectedStateDigest: beta.value.snapshot.stateDigest, termId: "alpha", label: "Alpha", slug: "alpha", order: 10 });
    assert.equal(alpha.ok, true, alpha.ok ? "" : alpha.error.code);
    if (!alpha.ok) return;
    const retired = taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "retire-term", expectedStateDigest: alpha.value.snapshot.stateDigest, termId: "beta" });
    assert.equal(retired.ok, true, retired.ok ? "" : retired.error.code);
    if (!retired.ok) return;
  } finally {
    opened.value.close();
  }
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${runtime.value.origin}/cms/taxonomies`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "分類全覽", exact: true }).waitFor();
    const catalog = page.getByRole("table", { name: "所有分類", exact: true });
    await catalog.waitFor();
    assert.deepEqual(await catalog.getByRole("row").allInnerTexts(), ["名稱\tTaxonomy ID", "分類\t00000000-0000-4000-8000-000000000002", "標籤\t00000000-0000-4000-8000-000000000003", "作者\tauthors", "主題\ttopics"]);
    await page.getByRole("link", { name: "主題", exact: true }).click();
    await page.getByRole("heading", { name: "分類：主題", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/taxonomies/topics");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const terms = page.getByRole("table", { name: "所有 terms", exact: true });
    await terms.waitFor();
    assert.deepEqual(await terms.getByRole("row").allInnerTexts(), ["名稱\tSlug\t順序\t狀態", "Alpha\talpha\t10\t使用中", "Beta\tbeta\t20\t已停用"]);
    await page.setViewportSize({ width: 375, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 在 CAS reload 後保留 taxonomy binding 並發布", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-taxonomy-binding-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true, opened.ok ? "" : opened.error.code);
  if (!opened.ok) return;
  try {
    const taxonomy = createTaxonomy({ persistence: opened.value });
    const created = taxonomy.createTaxonomy({ contract: "taxonomy-create-request/v1", taxonomyId: "topics", label: "Topics" });
    assert.equal(created.ok, true, created.ok ? "" : created.error.code);
    if (!created.ok) return;
    const alpha = taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", expectedStateDigest: created.value.stateDigest, termId: "alpha", label: "Alpha", slug: "alpha", order: 10 });
    assert.equal(alpha.ok, true, alpha.ok ? "" : alpha.error.code);
    if (!alpha.ok) return;
    const beta = taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", expectedStateDigest: alpha.value.snapshot.stateDigest, termId: "beta", label: "Beta", slug: "beta", order: 20 });
    assert.equal(beta.ok, true, beta.ok ? "" : beta.error.code);
    if (!beta.ok) return;
  } finally {
    opened.value.close();
  }
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  const client = createLocalAuthoringClient({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  const entryId = "taxonomy-bound-entry";
  const content = (title: string, text: string) => ({ contract: "site-content/v1" as const, title, blocks: [{ kind: "article" as const, text }], seo: {} });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const seeded = await client.saveRevision({ entryId, request: { contract: "save-revision-request/v1", revisionId: "bound-alpha", operationId: "bound-alpha-save", expectedCurrentRevisionId: null, schemaIdentity: { schemaId: "site-content", version: 1 }, content: content("Taxonomy Alpha", "以 Alpha 建立。"), route: "/taxonomy-bound-entry", assetVersions: [], taxonomyTerms: [{ taxonomyId: "topics", termId: "alpha" }] } });
    assert.equal(seeded.ok, true, seeded.ok ? "" : seeded.error.code);
    if (!seeded.ok) return;
    const initiallyPublished = await client.publishRevision({ entryId, request: { contract: "publish-revision-request/v1", expectedCurrentRevisionId: "bound-alpha", operationId: "bound-alpha-publish" } });
    assert.equal(initiallyPublished.ok, true, initiallyPublished.ok ? "" : initiallyPublished.error.code);
    if (!initiallyPublished.ok) return;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${runtime.value.origin}/cms/entries/${entryId}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "編輯文章", exact: true }).waitFor();
    const competing = await client.saveRevision({ entryId, request: { contract: "save-revision-request/v1", revisionId: "bound-beta-external", operationId: "bound-beta-external-save", expectedCurrentRevisionId: "bound-alpha", schemaIdentity: { schemaId: "site-content", version: 1 }, content: content("Taxonomy Beta 外部更新", "以 Beta 更新。"), route: "/taxonomy-bound-entry", assetVersions: [], taxonomyTerms: [{ taxonomyId: "topics", termId: "beta" }] } });
    assert.equal(competing.ok, true, competing.ok ? "" : competing.error.code);
    if (!competing.ok) return;
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("過期 CMS 修改");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("內容已由另一個頁面更新。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "重新載入文章", exact: true }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("input")).some((input) => input.value === "Taxonomy Beta 外部更新"));
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("CMS 保留 Beta binding");
    assert.equal(await page.getByRole("button", { name: "儲存", exact: true }).isDisabled(), false);
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "發布", exact: true }).click();
    await page.getByRole("button", { name: "確認發布", exact: true }).click();
    await page.getByText("已發布。", { exact: true }).waitFor();
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
  const verified = openPersistence({ databasePath });
  assert.equal(verified.ok, true, verified.ok ? "" : verified.error.code);
  if (!verified.ok) return;
  try {
    const pointers = verified.value.getEntryPointers(entryId);
    assert.equal(pointers.ok, true, pointers.ok ? "" : pointers.error.code);
    if (!pointers.ok || pointers.value.publishedRevisionId === undefined) return;
    const current = verified.value.getRevisionTaxonomyBindings({ entryId, revisionId: pointers.value.currentRevisionId });
    const published = verified.value.getRevisionTaxonomyBindings({ entryId, revisionId: pointers.value.publishedRevisionId });
    assert.equal(current.ok && published.ok, true);
    if (!current.ok || !published.ok) return;
    const evidence = { taxonomyId: "topics", termId: "beta", label: "Beta", slug: "beta", order: 20 };
    const evidenceBytes = canonicalJsonBytes(evidence);
    assert.equal(evidenceBytes.ok, true);
    if (!evidenceBytes.ok) return;
    const expected = [{ taxonomyId: "topics", termId: "beta", evidence, evidenceDigest: sha256Digest(evidenceBytes.value) }];
    assert.deepEqual(current.value, expected);
    assert.deepEqual(published.value, expected);
  } finally {
    verified.value.close();
  }
});


test("真實 CMS runtime 建立 current Content Type 並呈現 server slug", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-current-content-type-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  let browser: Browser | undefined;
  if (!runtime.ok) return;
  try {
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${runtime.value.origin}/cms/content-types`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "內容類型全覽", exact: true }).waitFor();
    const navigationEntries = page.locator('nav[aria-label="CMS 導覽"] a[href^="/cms/post"]');
    await navigationEntries.first().waitFor();
    assert.deepEqual(await navigationEntries.allInnerTexts(), ["文章"]);
    assert.equal(await page.locator('nav[aria-label="CMS 導覽"] a[href^="/cms/post"][aria-current="page"]').count(), 0);
    await page.getByRole("link", { name: "建立內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "建立內容類型", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "名稱", exact: true }).fill("Categories");
    await page.getByRole("button", { name: "建立內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：Categories", exact: true }).waitFor();
    await page.getByText("categories-2", { exact: true }).waitFor();
    const direct = new URL(page.url()).pathname;
    const stalePage = await page.context().newPage();
    await stalePage.goto(`${runtime.value.origin}${direct}`, { waitUntil: "networkidle" });
    await stalePage.getByRole("heading", { name: "內容類型：Categories", exact: true }).waitFor();
    await page.goto(`${runtime.value.origin}${direct}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "內容類型：Categories", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "名稱", exact: true }).fill("Categories 更新");
    await page.getByRole("button", { name: "儲存內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：Categories 更新", exact: true }).waitFor();
    await stalePage.getByRole("textbox", { name: "名稱", exact: true }).fill("過期更新");
    await stalePage.getByRole("button", { name: "儲存內容類型", exact: true }).click();
    await stalePage.getByRole("alert").getByText("內容類型已由其他操作更新；請重新載入後再試。", { exact: true }).waitFor();
    await stalePage.getByRole("button", { name: "重新載入", exact: true }).click();
    await stalePage.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByRole("checkbox", { name: "顯示於選單", exact: true }).uncheck();
    await page.getByRole("button", { name: "儲存內容類型", exact: true }).focus();
    await page.keyboard.press("Enter");
    await navigationEntries.getByText("Categories 更新", { exact: true }).waitFor({ state: "detached" });
    await page.goto(`${runtime.value.origin}${direct}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "內容類型：Categories 更新", exact: true }).waitFor();
    await page.goto(`${runtime.value.origin}/cms/content-types/new`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "名稱", exact: true }).fill("Zebra");
    await page.getByRole("spinbutton", { name: "排序", exact: true }).fill("-1");
    await page.getByRole("button", { name: "建立內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：Zebra", exact: true }).waitFor();
    await page.goto(`${runtime.value.origin}/cms/content-types`, { waitUntil: "networkidle" });
    const catalogTable = page.getByRole("table", { name: "所有內容類型", exact: true });
    await catalogTable.waitFor();
    assert.deepEqual(await catalogTable.locator("tbody tr td:nth-child(1)").allInnerTexts(), ["Zebra", "文章", "Categories 更新"]);
    assert.deepEqual(await catalogTable.locator("tbody tr td:nth-child(4)").allInnerTexts(), ["-1", "0", "0"]);
    assert.deepEqual(await navigationEntries.allInnerTexts(), ["Zebra", "文章"]);
    await page.setViewportSize({ width: 375, height: 844 });
    await navigationEntries.getByText("文章", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 完成 current entry 建立、發布、衝突復原與 real Delete journey", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-current-entry-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    const cptNavigation = page.locator('nav[aria-label="CMS 導覽"] a[href^="/cms/post"]');
    await page.goto(`${runtime.value.origin}/cms/post`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "文章內容", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/post");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.locator('nav[aria-label="CMS 導覽"] a[href^="/cms/post"][aria-current="page"]').getAttribute("href"), "/cms/post");
    await page.getByText("尚無內容。", { exact: true }).waitFor();

    // 建立 draft，並在 readback 看到 server 配置的 slug 與狀態。
    await page.getByRole("button", { name: "建立內容", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "entry-editor-heading");
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("第一篇內容");
    await page.getByRole("textbox", { name: "Slug", exact: true }).fill("first-current-post");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("第一版內容");
    await page.getByRole("textbox", { name: "Meta description", exact: true }).fill("第一版摘要");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "已儲存。");
    const entryRow = page.getByRole("row", { name: /first-current-post/u });
    assert.deepEqual(await entryRow.getByRole("cell").allInnerTexts(), ["第一篇內容", "first-current-post", "草稿", "尚未發布"]);

    // 一次 Save 同時寫入 content 與 published status。
    await page.getByRole("radio", { name: "已發布", exact: true }).check();
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    const publishedCells = await entryRow.getByRole("cell").allInnerTexts();
    assert.equal(publishedCells[2], "已發布");
    assert.match(publishedCells[3] ?? "", /^\d{4}-\d{2}-\d{2}T/u);

    // 鍵盤選取 catalog 的內容並進入 editor。
    await page.getByRole("button", { name: "第一篇內容", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "entry-editor-heading");
    assert.equal(await page.getByRole("textbox", { name: "本文", exact: true }).inputValue(), "第一版內容");

    // 另一個頁面以相同 baseline Save 後，這個頁面的 stale Save 必須回 conflict 並可重新載入。
    const stalePage = await page.context().newPage();
    await stalePage.goto(`${runtime.value.origin}/cms/post`, { waitUntil: "networkidle" });
    await stalePage.getByRole("button", { name: "第一篇內容", exact: true }).click();
    await stalePage.getByRole("textbox", { name: "本文", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("第二版內容");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await stalePage.getByRole("textbox", { name: "本文", exact: true }).fill("過期內容");
    await stalePage.getByRole("button", { name: "儲存", exact: true }).click();
    await stalePage.getByRole("alert").getByText("這筆內容已由另一個頁面更新，表單的 baseline 已過期。", { exact: true }).waitFor();
    assert.equal(await stalePage.evaluate(() => document.activeElement?.textContent), "重新載入內容");
    await stalePage.getByRole("button", { name: "重新載入內容", exact: true }).click();
    await stalePage.waitForFunction(() => document.activeElement?.id === "entry-editor-heading");
    assert.equal(await stalePage.getByRole("textbox", { name: "本文", exact: true }).inputValue(), "第二版內容");
    assert.equal(await stalePage.evaluate(() => document.querySelector("p[role=alert]") === null), true);
    await stalePage.getByRole("button", { name: "刪除內容", exact: true }).click();
    const staleDialog = stalePage.getByRole("dialog");
    await staleDialog.waitFor();
    await staleDialog.getByRole("button", { name: "取消", exact: true }).click();
    await stalePage.close();

    // real Delete：內容與其 slug 立即消失，且舊 slug 可重用。
    await page.getByRole("button", { name: "刪除內容", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const confirm = dialog.getByRole("button", { name: "確認刪除", exact: true });
    const cancel = dialog.getByRole("button", { name: "取消", exact: true });
    await confirm.focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "取消");
    await cancel.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "確認刪除");
    await confirm.click();
    await page.getByText("已刪除。", { exact: true }).waitFor();
    await page.getByText("尚無內容。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "建立內容", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "entry-editor-heading");
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("重用 slug");
    await page.getByRole("textbox", { name: "Slug", exact: true }).fill("first-current-post");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("重用內容");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.getByRole("row", { name: /first-current-post/u }).waitFor();

    // 既有 entry 的非 article body block 必須原樣保留：Save 不得靜默刪掉 interactive-demo。
    const seeded = await page.evaluate(async (typeId) => {
      const list = await fetch(`/v1/content-types/${typeId}/entries`).then((response) => response.json() as Promise<{ stateDigest: string }>);
      const created = await fetch(`/v1/content-types/${typeId}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "cpt-entry-create-request/v1", expectedStateDigest: list.stateDigest, slug: "block-preserving", content: { contract: "cpt-content/v1", typeId, title: "多區塊內容", blocks: [{ kind: "interactive-demo", identity: { id: "demo", version: "1.0.0" }, hook: "cms/editor-block/resolve", manifestHash: `sha256:${"a".repeat(64)}`, source: { html: "<p>demo</p>", css: "", javascript: "" }, staticFallback: "demo" }, { kind: "article", text: "原始本文" }], excerpt: "", seo: {}, customValues: [] }, status: "draft" }) });
      return await created.json() as Promise<{ entryId: string }>;
    }, "00000000-0000-4000-8000-000000000001");
    await page.goto(`${runtime.value.origin}/cms/post`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "多區塊內容", exact: true }).click();
    await page.getByText("這個內容另有 1 個非本文區塊；儲存時會原樣保留在原本位置。", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("改過的本文");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    const readBack = await page.evaluate(async (input) => await fetch(`/v1/content-types/${input.typeId}/entries/${input.entryId}`).then((response) => response.json() as Promise<{ content: { blocks: readonly { kind: string; text?: string }[] } }>), { typeId: "00000000-0000-4000-8000-000000000001", entryId: seeded.entryId });
    assert.deepEqual(readBack.content.blocks.map((block) => block.kind), ["interactive-demo", "article"]);
    assert.equal(readBack.content.blocks[1]?.text, "改過的本文");

    // 兩個 article block 的內容無法辨識唯一本文：CMS 必須 fail closed，不得自行挑一段來改。
    await page.evaluate(async (typeId) => {
      const list = await fetch(`/v1/content-types/${typeId}/entries`).then((response) => response.json() as Promise<{ stateDigest: string }>);
      await fetch(`/v1/content-types/${typeId}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "cpt-entry-create-request/v1", expectedStateDigest: list.stateDigest, slug: "two-articles", content: { contract: "cpt-content/v1", typeId, title: "兩段本文", blocks: [{ kind: "article", text: "第一段" }, { kind: "article", text: "第二段" }], excerpt: "", seo: {}, customValues: [] }, status: "draft" }) });
    }, "00000000-0000-4000-8000-000000000001");
    await page.goto(`${runtime.value.origin}/cms/post`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "兩段本文", exact: true }).click();
    await page.getByRole("alert").getByText("這筆內容的 article block 不是恰好一個，無法在 CMS 編輯本文；請以 API 調整 block 後再試。", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "本文", exact: true }).count(), 0);

    // 其他 CPT 使用 canonical `?cpt=` document；Article 不帶 query。
    await page.goto(`${runtime.value.origin}/cms/content-types/new`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "名稱", exact: true }).fill("電子報");
    await page.getByRole("button", { name: "建立內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：電子報", exact: true }).waitFor();
    await page.goto(`${runtime.value.origin}/cms/content-types`, { waitUntil: "networkidle" });
    const cptLink = cptNavigation.getByText("電子報", { exact: true });
    await cptLink.waitFor();
    await cptLink.click();
    await page.getByRole("heading", { name: "電子報內容", exact: true }).waitFor();
    assert.deepEqual(new URL(page.url()).searchParams.get("cpt"), await page.evaluate(() => location.search.replace("?cpt=", "")));
    assert.equal(await page.locator('nav[aria-label="CMS 導覽"] a[href^="/cms/post"][aria-current="page"]').count(), 1);
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.getByRole("button", { name: "建立內容", exact: true }).click();
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("電子報第一期");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("電子報內容");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.getByRole("row", { name: /電子報第一期/u }).waitFor();
    const cptUrl = page.url();

    // showInMenu=false 只隱藏選單；direct URL 仍可管理這個 CPT 的內容。
    await page.goto(`${runtime.value.origin}/cms/content-types`, { waitUntil: "networkidle" });
    await page.getByRole("table", { name: "所有內容類型", exact: true }).getByRole("link", { name: "電子報", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：電子報", exact: true }).waitFor();
    await page.getByRole("checkbox", { name: "顯示於選單", exact: true }).uncheck();
    await page.getByRole("button", { name: "儲存內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：電子報", exact: true }).waitFor();
    await cptNavigation.getByText("電子報", { exact: true }).waitFor({ state: "detached" });
    await page.goto(cptUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "電子報內容", exact: true }).waitFor();
    await page.getByRole("row", { name: /電子報第一期/u }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");

    // CPT 之間切換時頁面標題必須重新取得焦點。
    await page.evaluate(() => { history.pushState(null, "", "/cms/post"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.getByRole("heading", { name: "文章內容", exact: true }).waitFor();
    await page.evaluate((url) => { history.pushState(null, "", url); dispatchEvent(new PopStateEvent("popstate")); }, cptUrl);
    await page.getByRole("heading", { name: "電子報內容", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    await page.setViewportSize({ width: 375, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 的 release diagnostics 保留 loading、安全錯誤、成功與鍵盤操作", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-release-diagnostics-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const client = createLocalAuthoringClient({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
    const saved = await client.saveRevision({ entryId: "release-entry", request: { contract: "save-revision-request/v1", revisionId: "release-draft", operationId: "release-save", expectedCurrentRevisionId: null, schemaIdentity: { schemaId: "site-content", version: 1 }, content: { contract: "site-content/v1", title: "Release article", blocks: [{ kind: "article", text: "發布測試內容" }], seo: {} }, route: "/release-article", assetVersions: [], taxonomyTerms: [] } });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error.code);
    if (!saved.ok) return;
    const published = await client.publishRevision({ entryId: "release-entry", request: { contract: "publish-revision-request/v1", expectedCurrentRevisionId: "release-draft", operationId: "release-publish" } });
    assert.equal(published.ok, true, published.ok ? "" : published.error.code);
    if (!published.ok) return;
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();
    const diagnosePath = `${runtime.value.origin}/v1/release/diagnose`;
    let releaseDiagnosis: (() => void) | undefined;
    const diagnosisHeld = new Promise<void>((resolve) => { releaseDiagnosis = resolve; });
    await page.route(diagnosePath, async (route) => { await diagnosisHeld; await route.continue(); });
    await page.goto(`${runtime.value.origin}/cms/release`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "發布診斷", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/cms/release");
    assert.equal(await page.getByRole("main").getAttribute("aria-labelledby"), "page-title");
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    const loading = page.locator('p[role="status"][aria-busy="true"]');
    await loading.waitFor();
    assert.equal(await loading.textContent(), "正在檢查 release 狀態。");
    releaseDiagnosis?.();
    await page.getByText("診斷完成；可以建立 release artifact。", { exact: true }).waitFor();
    await page.unroute(diagnosePath);
    await page.route(diagnosePath, async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ contract: "authoring-error/v1", requestId: "release-safe-error", code: "INTERNAL_SERVER_ERROR", owner: "AuthoringApi", subjectIds: [], remediation: { kind: "message", message: "Release 診斷暫時無法完成。" } }) }));
    const retry = page.getByRole("button", { name: "重新診斷", exact: true });
    await retry.focus();
    await page.keyboard.press("Enter");
    const safeError = page.getByRole("alert");
    await safeError.waitFor();
    assert.equal(await safeError.textContent(), "Release 診斷暫時無法完成。");
    assert.equal(await retry.evaluate((element) => document.activeElement === element), true);
    await page.unroute(diagnosePath);
    await retry.focus();
    await page.keyboard.press("Enter");
    await page.getByText("診斷完成；可以建立 release artifact。", { exact: true }).waitFor();
    const build = page.getByRole("button", { name: "建立 artifact", exact: true });
    await build.focus();
    await page.keyboard.press("Enter");
    await page.getByText("已建立 release artifact；尚未發布。", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "發布 artifact", exact: true }).isDisabled(), false);
    await page.getByRole("button", { name: "發布 artifact", exact: true }).click();
    await page.getByText("已發布 artifact。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "重新發布 artifact", exact: true }).click();
    await page.getByText("已重新發布 artifact。", { exact: true }).waitFor();
    await page.getByRole("link", { name: "首頁", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "CMS 文章工作台", exact: true }).waitFor();
    const release = page.getByRole("link", { name: "發布診斷", exact: true });
    await release.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "發布診斷", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "page-title");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});

test("真實 CMS runtime 完成 ACF-like 自訂欄位閉環 journey", async (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-custom-fields-browser-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const repositoryRoot = path.resolve(import.meta.dirname, "../../../");
  const databasePath = path.join(root, "cms.sqlite");
  const mediaRoot = path.join(root, "media");
  const pluginsRoot = path.join(root, "plugins");
  const themesRoot = path.join(root, "themes");
  const credentialRoot = path.join(root, "credential");
  mkdirSync(mediaRoot, { mode: 0o700 });
  mkdirSync(pluginsRoot, { mode: 0o700 });
  mkdirSync(themesRoot, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", databasePath], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themesRoot], capture().io), 0);
  assert.equal(await runThemeActivate(["--database", databasePath, "--installed-themes-root", themesRoot, "--id", "study-notes"], capture().io), 0);
  const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") });
  assert.equal((await credential.transition("provision")).ok, true);
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot: pluginsRoot, installedThemesRoot: themesRoot, cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"), credential: { homeDirectory: credentialRoot, xdgConfigHome: path.join(credentialRoot, "config") }, logger: () => undefined });
  assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
  if (!runtime.ok) return;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await (await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, viewport: { width: 1440, height: 900 } })).newPage();

    // Builder：建立 CPT 並在 create 表單定義群組與 5 種 kind 的欄位。
    await page.goto(`${runtime.value.origin}/cms/content-types/new`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "名稱", exact: true }).fill("自訂欄位示範");
    await page.getByRole("button", { name: "新增欄位群組", exact: true }).click();
    await page.getByRole("textbox", { name: "群組名稱", exact: true }).fill("主要欄位");
    const group = page.getByRole("group", { name: "主要欄位", exact: true });

    await group.getByRole("button", { name: "新增欄位", exact: true }).click();
    await group.getByRole("group", { name: "未命名", exact: true }).getByRole("textbox", { name: "欄位名稱", exact: true }).fill("標語");
    const slogan = group.getByRole("group", { name: "標語", exact: true });
    await slogan.getByRole("checkbox", { name: "必填", exact: true }).check();
    await slogan.getByRole("spinbutton", { name: "最小長度", exact: true }).fill("3");
    await slogan.getByRole("spinbutton", { name: "最大長度", exact: true }).fill("20");
    await slogan.getByRole("checkbox", { name: "顯示於一般模板（僅意圖）", exact: true }).check();

    await group.getByRole("button", { name: "新增欄位", exact: true }).click();
    await group.getByRole("group", { name: "未命名", exact: true }).getByRole("textbox", { name: "欄位名稱", exact: true }).fill("分數");
    const score = group.getByRole("group", { name: "分數", exact: true });
    await score.getByRole("combobox", { name: "欄位類型", exact: true }).selectOption("number");
    await score.getByRole("spinbutton", { name: "最小值", exact: true }).fill("1");
    await score.getByRole("spinbutton", { name: "最大值", exact: true }).fill("10");
    await score.getByRole("spinbutton", { name: /預設值/u }).fill("5");

    await group.getByRole("button", { name: "新增欄位", exact: true }).click();
    await group.getByRole("group", { name: "未命名", exact: true }).getByRole("textbox", { name: "欄位名稱", exact: true }).fill("精選");
    const featured = group.getByRole("group", { name: "精選", exact: true });
    await featured.getByRole("combobox", { name: "欄位類型", exact: true }).selectOption("boolean");
    await featured.getByRole("combobox", { name: "預設值", exact: true }).selectOption("true");

    await group.getByRole("button", { name: "新增欄位", exact: true }).click();
    await group.getByRole("group", { name: "未命名", exact: true }).getByRole("textbox", { name: "欄位名稱", exact: true }).fill("時間");
    const moment = group.getByRole("group", { name: "時間", exact: true });
    await moment.getByRole("combobox", { name: "欄位類型", exact: true }).selectOption("datetime");

    await group.getByRole("button", { name: "新增欄位", exact: true }).click();
    await group.getByRole("group", { name: "未命名", exact: true }).getByRole("textbox", { name: "欄位名稱", exact: true }).fill("狀態");
    const state = group.getByRole("group", { name: "狀態", exact: true });
    await state.getByRole("combobox", { name: "欄位類型", exact: true }).selectOption("single-select");
    await state.getByRole("button", { name: "新增選項", exact: true }).click();
    await state.getByRole("textbox", { name: "選項名稱", exact: true }).fill("進行中");
    await state.getByRole("button", { name: "新增選項", exact: true }).click();
    await state.getByRole("textbox", { name: "選項名稱", exact: true }).nth(1).fill("已完成");
    await state.getByRole("combobox", { name: "預設值", exact: true }).selectOption({ label: "進行中" });
    await page.getByRole("button", { name: "建立內容類型", exact: true }).click();
    await page.getByRole("heading", { name: "內容類型：自訂欄位示範", exact: true }).waitFor();
    const typeId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

    // 排序：把最後一個欄位上移，焦點留在同一控制項並由 live region 播報新位置。
    const moveState = page.getByRole("button", { name: "將欄位「狀態」上移", exact: true });
    await moveState.focus();
    await page.keyboard.press("Enter");
    await page.getByText("欄位「狀態」已移至第 4 位。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "將欄位「狀態」上移");
    await page.getByRole("button", { name: "儲存內容類型", exact: true }).click();
    await page.getByText("已儲存內容類型。", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "內容類型：自訂欄位示範", exact: true }).waitFor();
    assert.deepEqual(await page.getByRole("group", { name: "主要欄位", exact: true }).locator("fieldset.field-definition > legend").allInnerTexts(), ["標語", "分數", "精選", "狀態", "時間"]);

    // Entry：建立 draft（可缺 required）→ 填值 → published Save → reload 精確讀回。
    await page.goto(`${runtime.value.origin}/cms/post?cpt=${typeId}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "自訂欄位示範內容", exact: true }).waitFor();
    await page.getByRole("button", { name: "建立內容", exact: true }).click();
    await page.getByRole("textbox", { name: "標題", exact: true }).fill("第一筆自訂內容");
    await page.getByRole("textbox", { name: "本文", exact: true }).fill("自訂欄位內文");
    // create 以 definition defaults 初始化：number 5、boolean true；datetime 未設定。
    assert.equal(await page.getByLabel(/分數/u).inputValue(), "5");
    assert.equal(await page.getByLabel(/精選/u).inputValue(), "true");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();

    // draft 之後才需要滿足 required；published Save 失敗時聚焦可修正欄位且只有一個 alert。
    await page.getByLabel(/標語/u).fill("ab");
    await page.getByLabel(/時間/u).fill("2026-09-16T12:30");
    await page.getByLabel(/精選/u).selectOption("false");
    await page.getByRole("radio", { name: "已發布", exact: true }).check();
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByRole("alert").getByText("發布前請修正未通過驗證的自訂欄位。", { exact: true }).waitFor();
    assert.equal(await page.locator("p[role=alert]").count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-invalid")), "true");
    assert.match(await page.evaluate(() => document.activeElement?.getAttribute("data-custom-field") ?? ""), /^[0-9a-f-]{36}$/u);

    await page.getByLabel(/標語/u).fill("有效標語");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    const row = page.getByRole("row", { name: /第一筆自訂內容/u });
    assert.equal((await row.getByRole("cell").allInnerTexts())[2], "已發布");

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "第一筆自訂內容", exact: true }).click();
    await page.getByLabel(/標語/u).waitFor();
    assert.equal(await page.getByLabel(/標語/u).inputValue(), "有效標語");
    assert.equal(await page.getByLabel(/分數/u).inputValue(), "5");
    assert.equal(await page.getByLabel(/精選/u).inputValue(), "false");
    assert.equal(await page.getByLabel(/時間/u).inputValue(), "2026-09-16T12:30");
    assert.equal(await page.getByLabel(/狀態/u).locator("option:checked").innerText(), "進行中");
    assert.equal(await page.getByRole("radio", { name: "已發布", exact: true }).isChecked(), true);

    // 每個 presence-sensitive 控制項都能回到「未設定」：清空後 Save 不得讓值復活。
    await page.getByLabel(/精選/u).selectOption("unset");
    await page.getByLabel(/狀態/u).selectOption("");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.getByText("已儲存。", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "第一筆自訂內容", exact: true }).click();
    await page.getByLabel(/標語/u).waitFor();
    assert.equal(await page.getByLabel(/精選/u).inputValue(), "unset");
    assert.equal(await page.getByLabel(/狀態/u).inputValue(), "");
    assert.equal(await page.getByLabel(/標語/u).inputValue(), "有效標語");
  } finally {
    await browser?.close();
    await runtime.value.close();
  }
});
