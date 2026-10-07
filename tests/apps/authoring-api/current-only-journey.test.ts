import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";

import { createLocalAuthoringCredentialAuthority, startCmsRuntime } from "../../../apps/authoring-api/index.js";
import { markCurrentMediaRoot } from "../../../core/media/current-object-store.js";
import { migrateDatabase } from "../../../core/persistence/index.js";

const origin = "http://127.0.0.1:43127";
const articleTypeId = "00000000-0000-4000-8000-000000000001";
const dist = path.resolve(import.meta.dirname, "../../../dist/cms");

type Reply = { status: number; body: Record<string, any> };

/** Real local runtime: fresh SQLite, media root, credential, API and compiled CMS. */
test("fresh CMS API and browser complete current-only authoring without old routes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "cms-current-journey-"));
  const repositoryRoot = path.join(root, "repository");
  const cmsAssetsRoot = path.join(repositoryRoot, "dist", "cms");
  const mediaRoot = path.join(root, "objects");
  const databasePath = path.join(root, "cms.sqlite");
  const configHome = path.join(root, "config");
  const installedPluginsRoot = path.join(root, "plugins");
  const installedThemesRoot = path.join(root, "themes");
  let runtime: Awaited<ReturnType<typeof startCmsRuntime>> | undefined;
  try {
    cpSync(dist, cmsAssetsRoot, { recursive: true });
    mkdirSync(mediaRoot, { mode: 0o700 });
    mkdirSync(installedPluginsRoot, { mode: 0o700 });
    mkdirSync(installedThemesRoot, { mode: 0o700 });
    assert.equal(markCurrentMediaRoot(mediaRoot), true);
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const credentials = createLocalAuthoringCredentialAuthority({ homeDirectory: root, xdgConfigHome: configHome });
    assert.equal((await credentials.transition("provision")).ok, true);
    const apiKey = JSON.parse(readFileSync(path.join(configHome, "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string;
    runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot, installedPluginsRoot, installedThemesRoot, cmsAssetsRoot, credential: { homeDirectory: root, xdgConfigHome: configHome }, logger: () => undefined });
    assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
    if (!runtime.ok) return;

    const request = async (method: string, pathname: string, body?: Record<string, unknown> | FormData): Promise<Reply> => {
      const response = await fetch(`${origin}${pathname}`, { method, headers: { Authorization: `Bearer ${apiKey}`, Origin: origin, ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as Record<string, any> };
    };
    const get = (pathname: string) => request("GET", pathname);
    const post = (pathname: string, body: Record<string, unknown> | FormData) => request("POST", pathname, body);

    const taxCatalog = await get("/v1/taxonomies");
    assert.equal(taxCatalog.status, 200);
    const createdTaxonomy = await post("/v1/taxonomies", { contract: "taxonomy-create-request/v2", expectedStateDigest: taxCatalog.body.stateDigest, label: "主題", slug: "topics", hierarchical: true });
    assert.equal(createdTaxonomy.status, 201, JSON.stringify(createdTaxonomy.body));
    const taxonomyId = createdTaxonomy.body.taxonomy.taxonomyId as string;
    const term = await post(`/v1/taxonomies/${taxonomyId}/commands`, { contract: "taxonomy-command/v2", kind: "create-term", expectedStateDigest: createdTaxonomy.body.stateDigest, label: "工具", slug: "tools", order: 0 });
    assert.equal(term.status, 200, JSON.stringify(term.body));
    const termId = term.body.terms[0].termId as string;

    const upload = new FormData();
    upload.set("metadata", JSON.stringify({ contract: "media-import-metadata/v2", title: "附件", slug: "attachment" }));
    upload.set("file", new Blob(["CMS current media"], { type: "text/plain" }), "attachment.txt");
    const media = await post("/v1/media/import", upload);
    assert.equal(media.status, 201, JSON.stringify(media.body));
    const assetId = media.body.assetId as string;
    const malformedMultipart = await fetch(`${origin}/v1/media/import`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Origin: origin, "Content-Type": "multipart/form-data; boundary=broken" }, body: "not a multipart body" });
    assert.equal(malformedMultipart.status, 400);

    const typeCatalog = await get("/v1/content-types");
    assert.equal(typeCatalog.status, 200);
    const newType = await post("/v1/content-types", {
      contract: "content-type-create-request/v1", expectedStateDigest: typeCatalog.body.stateDigest,
      label: "研究", slug: "research", help: "", order: 1, showInMenu: true,
      taxonomyAttachments: [{ taxonomyId, cardinality: "one", required: false, allowTermCreation: true }],
      fieldGroups: [{ label: "附件", help: "", order: 0, fields: [{ kind: "single-media", label: "參考檔", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: { mimeTypes: ["text/plain"] } }] }],
    });
    assert.equal(newType.status, 201, JSON.stringify(newType.body));
    const typeId = newType.body.typeId as string;
    const fieldId = newType.body.fieldGroups[0].fields[0].fieldId as string;
    const catalog = await get(`/v1/content-types/${typeId}/entries`);
    assert.equal(catalog.status, 200);
    const content = { contract: "cpt-content/v1", typeId, title: "第一篇研究", blocks: [{ kind: "article", text: "測試內容" }], excerpt: "", seo: {}, featuredMedia: assetId, customValues: [{ fieldId, value: assetId }] };
    const create = await post(`/v1/content-types/${typeId}/entries`, { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.body.stateDigest, slug: "first-research", content, taxonomyTerms: [{ taxonomyId, termId }], status: "draft" });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const entryId = create.body.entryId as string;
    const entryPath = `/v1/content-types/${typeId}/entries/${entryId}`;
    assert.equal((await get(`/v1/media/${assetId}`)).body.usage.length, 1);
    const missingBindings = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: create.body.stateDigest, slug: "first-research", content, status: "published" });
    assert.equal(missingBindings.status, 400);
    assert.equal((await get(entryPath)).body.stateDigest, create.body.stateDigest);

    const stale = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: catalog.body.stateDigest, slug: "first-research", content, taxonomyTerms: [{ taxonomyId, termId }], status: "published" });
    assert.equal(stale.status, 409);
    assert.equal((await get(entryPath)).body.status, "draft");
    const invalidMedia = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: create.body.stateDigest, slug: "first-research", content: { ...content, featuredMedia: "missing-asset" }, taxonomyTerms: [{ taxonomyId, termId }], status: "published" });
    assert.equal(invalidMedia.status, 422);
    const invalidTaxonomy = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: create.body.stateDigest, slug: "first-research", content, taxonomyTerms: [{ taxonomyId, termId: "00000000-0000-4000-8000-000000000099" }], status: "published" });
    assert.equal(invalidTaxonomy.status, 422);
    assert.equal((await get(entryPath)).body.stateDigest, create.body.stateDigest);
    assert.equal((await get(`/v1/media/${assetId}`)).body.usage.length, 1);

    const blockedDelete = await post(`/v1/media/${assetId}/delete`, { contract: "media-delete-request/v2", assetId, expectedStateDigest: media.body.stateDigest });
    assert.equal(blockedDelete.status, 409);
    assert.equal(blockedDelete.body.code, "MEDIA_ASSET_REFERENCED");
    const published = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: create.body.stateDigest, slug: "first-research", content, taxonomyTerms: [{ taxonomyId, termId }], status: "published" });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.status, "published");
    const secondTerm = await post(`/v1/taxonomies/${taxonomyId}/commands`, { contract: "taxonomy-command/v2", kind: "create-term", expectedStateDigest: term.body.stateDigest, label: "架構", slug: "architecture", order: 1 });
    assert.equal(secondTerm.status, 200, JSON.stringify(secondTerm.body));
    const secondTermId = secondTerm.body.terms.find((item: { slug: string }) => item.slug === "architecture").termId as string;
    const republished = await post(entryPath, { contract: "cpt-entry-save-request/v1", expectedStateDigest: published.body.stateDigest, slug: "first-research", content, taxonomyTerms: [{ taxonomyId, termId: secondTermId }], status: "published" });
    assert.equal(republished.status, 200, JSON.stringify(republished.body));
    assert.notEqual(republished.body.lastPublishedDigest, published.body.lastPublishedDigest);
    assert.equal((await get(entryPath)).body.taxonomyTerms[0].termId, secondTermId);
    const search = await post(`/v1/content-types/${typeId}/entries/search`, { contract: "entry-search-request/v1", typeId, search: "第一篇", statuses: ["published"], taxonomyFilters: [{ taxonomyId, termIds: [secondTermId] }], page: 1 });
    assert.equal(search.status, 200, JSON.stringify(search.body));
    assert.equal(search.body.pageSize, 20);
    assert.equal(search.body.totalItems, 1);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${origin}/cms`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "CMS 工作台", exact: true }).waitFor();
      await page.goto(`${origin}/cms/content-types/new`, { waitUntil: "networkidle" });
      await page.getByLabel("名稱", { exact: true }).fill("瀏覽器型別");
      await page.getByLabel("Slug（選填）").fill("browser-type");
      await page.getByLabel("附加 主題").check();
      await page.getByLabel("主題選取數量").selectOption("one");
      await page.getByLabel("允許在編輯器建立 term").check();
      await page.getByRole("button", { name: "建立內容類型" }).click();
      await page.getByRole("heading", { name: "內容類型：瀏覽器型別" }).waitFor();
      const browserTypeCatalog = await get("/v1/content-types");
      const browserTypeId = browserTypeCatalog.body.items.find((item: { slug: string }) => item.slug === "browser-type").typeId as string;
      assert.deepEqual((await get(`/v1/content-types/${browserTypeId}`)).body.taxonomyAttachments.find((item: { taxonomyId: string }) => item.taxonomyId === taxonomyId), { taxonomyId, cardinality: "one", required: false, allowTermCreation: true });
      await page.getByLabel("主題選取數量").selectOption("many");
      await page.getByRole("button", { name: "儲存內容類型" }).click();
      await page.getByText("已儲存內容類型。").waitFor();
      assert.deepEqual((await get(`/v1/content-types/${browserTypeId}`)).body.taxonomyAttachments.find((item: { taxonomyId: string }) => item.taxonomyId === taxonomyId), { taxonomyId, cardinality: "many", required: false, allowTermCreation: true });
      await page.goto(`${origin}/cms/content/${typeId}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "第一篇研究" }).click();
      await page.getByRole("heading", { name: "編輯內容" }).waitFor();
      let releaseOldSearch: (() => void) | undefined;
      let oldSearchSeen: (() => void) | undefined;
      const oldSearchBlocked = new Promise<void>((resolve) => { releaseOldSearch = resolve; });
      const oldSearchRequested = new Promise<void>((resolve) => { oldSearchSeen = resolve; });
      await page.route(`**/v1/content-types/${typeId}/entries/search`, async (route) => {
        const query = route.request().postDataJSON() as { search?: string };
        if (query.search === "第一") { oldSearchSeen?.(); await oldSearchBlocked; }
        await route.continue();
      });
      await page.getByLabel("搜尋標題或 Slug").fill("第一");
      await oldSearchRequested;
      await page.getByLabel("搜尋標題或 Slug").fill("no-match");
      await page.getByText("沒有符合條件的內容。").waitFor();
      releaseOldSearch?.();
      await page.waitForTimeout(100);
      assert.equal(await page.getByText("沒有符合條件的內容。").count(), 1);
      await page.unrouteAll({ behavior: "wait" });
      await page.getByLabel("搜尋標題或 Slug").fill("第一篇");
      await page.getByText("1 筆結果").waitFor();
      await page.getByRole("button", { name: "刪除內容" }).click();
      await page.getByRole("button", { name: "確認刪除" }).click();
      await page.getByText("已刪除。").waitFor();
      assert.equal((await get(entryPath)).status, 404);

      await page.getByRole("button", { name: "建立內容" }).click();
      await page.getByLabel("標題", { exact: true }).fill("瀏覽器建立的研究");
      await page.getByLabel("Slug", { exact: true }).fill("browser-research");
      await page.getByLabel("本文", { exact: true }).fill("瀏覽器實際儲存");
      await page.getByLabel("特色媒體").selectOption(assetId);
      await page.getByLabel("主題", { exact: true }).selectOption(secondTermId);
      await page.getByLabel("參考檔").selectOption(assetId);
      await page.getByRole("button", { name: "儲存", exact: true }).click();
      await page.getByText("已儲存。", { exact: true }).waitFor();
      await page.getByRole("radio", { name: "已發布" }).check();
      await page.getByRole("button", { name: "儲存", exact: true }).click();
      await page.getByText("已儲存。", { exact: true }).waitFor();
      const browserSearch = await post(`/v1/content-types/${typeId}/entries/search`, { contract: "entry-search-request/v1", typeId, search: "browser-research", statuses: ["published"], taxonomyFilters: [{ taxonomyId, termIds: [secondTermId] }], page: 1 });
      assert.equal(browserSearch.body.totalItems, 1);
      await page.getByLabel("特色媒體").selectOption("");
      await page.getByLabel("主題", { exact: true }).selectOption("");
      await page.getByLabel("參考檔").selectOption("");
      await page.getByRole("button", { name: "儲存", exact: true }).click();
      await page.getByText("已儲存。", { exact: true }).waitFor();
      await page.getByRole("button", { name: "刪除內容" }).click();
      await page.getByRole("button", { name: "確認刪除" }).click();
      await page.getByText("已刪除。").waitFor();
      await page.close();
    } finally { await browser.close(); }

    assert.equal((await get(`/v1/media/${assetId}`)).body.usage.length, 0);
    const afterMedia = await get(`/v1/media/${assetId}`);
    assert.equal((await post(`/v1/media/${assetId}/delete`, { contract: "media-delete-request/v2", assetId, expectedStateDigest: afterMedia.body.asset.stateDigest })).status, 200);
    for (let index = 0; index < 21; index += 1) {
      const currentCatalog = await get(`/v1/content-types/${articleTypeId}/entries`);
      const bulk = await post(`/v1/content-types/${articleTypeId}/entries`, { contract: "cpt-entry-create-request/v1", expectedStateDigest: currentCatalog.body.stateDigest, slug: `page-item-${index}`, content: { contract: "cpt-content/v1", typeId: articleTypeId, title: `分頁測試 ${index}`, blocks: [{ kind: "article", text: "本文" }], excerpt: "", seo: {}, customValues: [] }, taxonomyTerms: [], status: "draft" });
      assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
    }
    const pageOne = await post(`/v1/content-types/${articleTypeId}/entries/search`, { contract: "entry-search-request/v1", typeId: articleTypeId, search: "分頁測試", statuses: ["draft"], taxonomyFilters: [], page: 1 });
    const pageTwo = await post(`/v1/content-types/${articleTypeId}/entries/search`, { contract: "entry-search-request/v1", typeId: articleTypeId, search: "分頁測試", statuses: ["draft"], taxonomyFilters: [], page: 2 });
    assert.equal(pageOne.body.items.length, 20);
    assert.equal(pageTwo.body.items.length, 1);
    assert.equal(pageTwo.body.totalPages, 2);
    const method = await get(`/v1/content-types/${typeId}/entries/search`);
    assert.equal(method.status, 405);
    assert.equal((await request("OPTIONS", `/v1/content-types/${typeId}/entries/search`)).status, 405);
    const oldWrite = await post("/v1/entries", { contract: "save-revision-request/v1" });
    assert.equal(oldWrite.status, 404);
    const invalidBearer = await fetch(`${origin}/v1/content-types`, { headers: { Authorization: "Bearer invalid", Origin: origin } });
    assert.equal(invalidBearer.status, 401);
    const cookieApi = await fetch(`${origin}/v1/content-types`, { headers: { Cookie: "session=stale", Origin: origin } });
    assert.equal(cookieApi.status, 401);
    const wrongOrigin = await fetch(`${origin}/v1/content-types`, { headers: { Authorization: `Bearer ${apiKey}`, Origin: "http://attacker.invalid" } });
    assert.equal(wrongOrigin.status, 403);
    const wrongHost = await new Promise<number>((resolve, reject) => { const req = httpRequest(`${origin}/v1/content-types`, { headers: { Authorization: `Bearer ${apiKey}`, Host: "attacker.invalid", Origin: origin } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }); req.on("error", reject); req.end(); });
    assert.equal(wrongHost, 421);
    const cookieCms = await fetch(`${origin}/cms`, { headers: { Cookie: "session=stale" } });
    assert.equal(cookieCms.status, 403);
    const bearerCms = await fetch(`${origin}/cms`, { headers: { Authorization: `Bearer ${apiKey}` } });
    assert.equal(bearerCms.status, 403);
    assert.equal((await fetch(`${origin}/cms/entries%2Fnested`)).status, 404);
    assert.equal((await fetch(`${origin}/cms/entries/`)).status, 404);
    const malformed = await fetch(`${origin}/v1/content-types/${typeId}/entries/search`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Origin: origin, "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);
    for (const legacyPath of ["/v1/entries", "/v1/preview", "/v1/release/diagnose", "/v1/content-types/site-content/migrations", "/cms/entries", "/cms/plugins"]) assert.equal((await get(legacyPath)).status, 404, legacyPath);
    assert.equal((await get(`/v1/content-types/${articleTypeId}`)).status, 200);
    assert.equal((await credentials.transition("rotate")).ok, true);
    assert.equal((await fetch(`${origin}/v1/content-types`, { headers: { Authorization: `Bearer ${apiKey}`, Origin: origin } })).status, 401);
    const rotatedKey = JSON.parse(readFileSync(path.join(configHome, "ai-study-note", "local-authoring-v1.json"), "utf8")).apiKey as string;
    assert.equal((await fetch(`${origin}/v1/content-types`, { headers: { Authorization: `Bearer ${rotatedKey}`, Origin: origin } })).status, 200);
    assert.equal((await credentials.transition("revoke")).ok, true);
    assert.equal((await fetch(`${origin}/v1/content-types`, { headers: { Authorization: `Bearer ${rotatedKey}`, Origin: origin } })).status, 401);
  } finally {
    if (runtime?.ok) await runtime.value.close();
    rmSync(root, { recursive: true, force: true });
  }
});
