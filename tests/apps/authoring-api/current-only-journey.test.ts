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
    const protectedArticle = await get(`/v1/content-types/${articleTypeId}`);
    const protectedTypeDelete = await post(`/v1/content-types/${articleTypeId}/delete`, { contract: "content-type-delete-request/v1", expectedStateDigest: protectedArticle.body.stateDigest });
    assert.equal(protectedTypeDelete.status, 409);
    assert.equal(protectedTypeDelete.body.code, "CONTENT_TYPE_PROTECTED");
    const inUseTypeDelete = await post(`/v1/content-types/${typeId}/delete`, { contract: "content-type-delete-request/v1", expectedStateDigest: newType.body.stateDigest });
    assert.equal(inUseTypeDelete.status, 409);
    assert.equal(inUseTypeDelete.body.code, "CONTENT_TYPE_IN_USE");
    const protectedCategories = await get("/v1/taxonomies/00000000-0000-4000-8000-000000000002");
    const protectedTaxonomyDelete = await post("/v1/taxonomies/00000000-0000-4000-8000-000000000002/delete", { contract: "taxonomy-delete-request/v1", expectedStateDigest: protectedCategories.body.stateDigest });
    assert.equal(protectedTaxonomyDelete.status, 409);
    assert.equal(protectedTaxonomyDelete.body.code, "TAXONOMY_PROTECTED");
    const inUseTaxonomyDelete = await post(`/v1/taxonomies/${taxonomyId}/delete`, { contract: "taxonomy-delete-request/v1", expectedStateDigest: secondTerm.body.stateDigest });
    assert.equal(inUseTaxonomyDelete.status, 409);
    assert.equal(inUseTaxonomyDelete.body.code, "TAXONOMY_IN_USE");

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${origin}/cms`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "工作台", exact: true }).waitFor();
      // 固定 Categories/Tags 共用同一詳情頁；每次瀏覽器變更都由 API 回讀驗證。
      await page.goto(`${origin}/cms/taxonomies`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "分類與標籤" }).waitFor();
      for (const [fixedTaxonomyId, initialLabel, editedLabel] of [
        ["00000000-0000-4000-8000-000000000002", "測試分類", "更新分類"],
        ["00000000-0000-4000-8000-000000000003", "測試標籤", "更新標籤"],
      ] as const) {
        const fixedTaxonomy = await get(`/v1/taxonomies/${fixedTaxonomyId}`);
        assert.equal(fixedTaxonomy.status, 200);
        await page.getByRole("link", { name: fixedTaxonomy.body.taxonomy.label, exact: true }).click();
        await page.getByRole("heading", { name: fixedTaxonomy.body.taxonomy.label, exact: true }).waitFor();
        await page.getByRole("heading", { name: "建立新 term" }).locator("..").getByLabel("名稱").fill(initialLabel);
        await page.getByRole("button", { name: "建立 term" }).click();
        await page.getByRole("cell", { name: initialLabel }).first().waitFor();
        const afterCreate = await get(`/v1/taxonomies/${fixedTaxonomyId}`);
        const createdTerm = afterCreate.body.terms.find((item: { label: string }) => item.label === initialLabel);
        assert.ok(createdTerm?.termId);
        await page.getByRole("row").filter({ has: page.getByRole("cell", { name: initialLabel }).first() }).getByRole("button", { name: "編輯" }).click();
        await page.getByRole("form", { name: `編輯 term：${initialLabel}` }).getByLabel("Term 名稱").fill(editedLabel);
        await page.getByRole("button", { name: "儲存 term" }).click();
        await page.getByRole("cell", { name: editedLabel }).waitFor();
        const afterEdit = await get(`/v1/taxonomies/${fixedTaxonomyId}`);
        assert.equal(afterEdit.body.terms.find((item: { termId: string }) => item.termId === createdTerm.termId)?.label, editedLabel);
        page.once("dialog", async (dialog) => { await dialog.dismiss(); });
        await page.getByRole("row").filter({ has: page.getByRole("cell", { name: editedLabel }) }).getByRole("button", { name: "刪除" }).click();
        assert.equal((await get(`/v1/taxonomies/${fixedTaxonomyId}`)).body.terms.some((item: { termId: string }) => item.termId === createdTerm.termId), true);
        page.once("dialog", async (dialog) => { assert.match(dialog.message(), /無法復原/); await dialog.accept(); });
        await page.getByRole("row").filter({ has: page.getByRole("cell", { name: editedLabel }) }).getByRole("button", { name: "刪除" }).click();
        await page.getByRole("cell", { name: editedLabel }).waitFor({ state: "detached" });
        assert.equal((await get(`/v1/taxonomies/${fixedTaxonomyId}`)).body.terms.some((item: { termId: string }) => item.termId === createdTerm.termId), false);
        await page.getByRole("link", { name: /返回分類與標籤/ }).click();
      }
      await page.getByRole("link", { name: "建立 taxonomy" }).click();
      await page.getByLabel("分類名稱").fill("瀏覽器分類");
      await page.getByRole("button", { name: "建立 taxonomy" }).click();
      await page.getByRole("heading", { name: "瀏覽器分類", exact: true }).waitFor();
      const browserTaxCatalog = await get("/v1/taxonomies");
      const browserTaxonomyId = browserTaxCatalog.body.taxonomies.find((item: { taxonomy: { label: string } }) => item.taxonomy.label === "瀏覽器分類")?.taxonomy.taxonomyId as string;
      assert.ok(browserTaxonomyId);
      await page.getByRole("form", { name: "編輯分類" }).getByLabel("分類名稱").fill("瀏覽器分類已更新");
      await page.getByRole("button", { name: "儲存分類" }).click();
      await page.getByRole("heading", { name: "瀏覽器分類已更新", exact: true }).waitFor();
      assert.equal((await get(`/v1/taxonomies/${browserTaxonomyId}`)).body.taxonomy.label, "瀏覽器分類已更新");
      const staleTaxonomyDelete = await post(`/v1/taxonomies/${browserTaxonomyId}/delete`, { contract: "taxonomy-delete-request/v1", expectedStateDigest: browserTaxCatalog.body.taxonomies.find((item: { taxonomy: { taxonomyId: string } }) => item.taxonomy.taxonomyId === browserTaxonomyId).stateDigest });
      assert.equal(staleTaxonomyDelete.status, 409);
      assert.equal(staleTaxonomyDelete.body.code, "TAXONOMY_STATE_CONFLICT");
      await page.goto(`${origin}/cms/taxonomies/${taxonomyId}`, { waitUntil: "networkidle" });
      page.once("dialog", async (dialog) => { await dialog.accept(); });
      await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "架構", exact: true }) }).getByRole("button", { name: "刪除" }).click();
      await page.getByRole("alert").waitFor();
      assert.equal((await get(`/v1/taxonomies/${taxonomyId}`)).body.terms.some((item: { termId: string }) => item.termId === secondTermId), true);
      const staleTermCommand = await post(`/v1/taxonomies/${taxonomyId}/commands`, { contract: "taxonomy-command/v2", kind: "delete-term", expectedStateDigest: term.body.stateDigest, termId: secondTermId });
      assert.equal(staleTermCommand.status, 409);
      assert.equal(staleTermCommand.body.code, "TAXONOMY_STATE_CONFLICT");
      await page.goto(`${origin}/cms/content-types/new`, { waitUntil: "networkidle" });
      await page.getByLabel("名稱", { exact: true }).fill("瀏覽器型別");
      await page.getByLabel("Slug（選填）").fill("browser-type");
      await page.getByLabel("附加 主題").check();
      await page.getByLabel("附加 瀏覽器分類已更新").check();
      await page.getByLabel("主題選取數量").selectOption("one");
      await page.getByLabel("允許在編輯器建立 term").first().check();
      await page.getByRole("button", { name: "建立內容類型" }).click();
      await page.getByRole("heading", { name: "編輯內容類型：瀏覽器型別" }).waitFor();
      const browserTypeCatalog = await get("/v1/content-types");
      const browserTypeId = browserTypeCatalog.body.items.find((item: { slug: string }) => item.slug === "browser-type").typeId as string;
      assert.deepEqual((await get(`/v1/content-types/${browserTypeId}`)).body.taxonomyAttachments.find((item: { taxonomyId: string }) => item.taxonomyId === taxonomyId), { taxonomyId, cardinality: "one", required: false, allowTermCreation: true });
      await page.getByLabel("主題選取數量").selectOption("many");
      await page.getByRole("button", { name: "儲存內容類型" }).click();
      await page.getByText("已儲存內容類型。").waitFor();
      assert.deepEqual((await get(`/v1/content-types/${browserTypeId}`)).body.taxonomyAttachments.find((item: { taxonomyId: string }) => item.taxonomyId === taxonomyId), { taxonomyId, cardinality: "many", required: false, allowTermCreation: true });
      await page.getByRole("form", { name: "Content Type 定義" }).getByLabel("名稱", { exact: true }).fill("瀏覽器型別已更新");
      await page.getByRole("button", { name: "儲存內容類型" }).click();
      await page.getByRole("heading", { name: "編輯內容類型：瀏覽器型別已更新" }).waitFor();
      assert.equal((await get(`/v1/content-types/${browserTypeId}`)).body.label, "瀏覽器型別已更新");
      const staleTypeDelete = await post(`/v1/content-types/${browserTypeId}/delete`, { contract: "content-type-delete-request/v1", expectedStateDigest: browserTypeCatalog.body.items.find((item: { typeId: string }) => item.typeId === browserTypeId).stateDigest });
      assert.equal(staleTypeDelete.status, 409);
      assert.equal(staleTypeDelete.body.code, "CONTENT_TYPE_STATE_CONFLICT");
      await page.goto(`${origin}/cms/taxonomies/${browserTaxonomyId}`, { waitUntil: "networkidle" });
      page.once("dialog", async (dialog) => { await dialog.accept(); });
      await page.getByRole("button", { name: "刪除 taxonomy" }).click();
      await page.getByRole("alert").getByText(/仍有 term 或被內容類型附掛/).waitFor();
      assert.equal((await get(`/v1/taxonomies/${browserTaxonomyId}`)).status, 200);
      await page.goto(`${origin}/cms/content-types/${browserTypeId}`, { waitUntil: "networkidle" });
      page.once("dialog", async (dialog) => { await dialog.dismiss(); });
      await page.getByRole("button", { name: "刪除內容類型" }).click();
      assert.equal((await get(`/v1/content-types/${browserTypeId}`)).status, 200);
      page.once("dialog", async (dialog) => { assert.match(dialog.message(), /無法復原/); await dialog.accept(); });
      await page.getByRole("button", { name: "刪除內容類型" }).click();
      await page.getByText("已刪除內容類型。").waitFor();
      assert.equal((await get(`/v1/content-types/${browserTypeId}`)).status, 404);
      assert.equal((await get("/v1/content-types")).body.items.some((item: { typeId: string }) => item.typeId === browserTypeId), false);
      await page.goto(`${origin}/cms/taxonomies/${browserTaxonomyId}`, { waitUntil: "networkidle" });
      page.once("dialog", async (dialog) => { await dialog.dismiss(); });
      await page.getByRole("button", { name: "刪除 taxonomy" }).click();
      assert.equal((await get(`/v1/taxonomies/${browserTaxonomyId}`)).status, 200);
      page.once("dialog", async (dialog) => { assert.match(dialog.message(), /無法復原/); await dialog.accept(); });
      await page.getByRole("button", { name: "刪除 taxonomy" }).click();
      await page.getByText("已刪除 taxonomy。").waitFor();
      assert.equal((await get(`/v1/taxonomies/${browserTaxonomyId}`)).status, 404);
      assert.equal((await get("/v1/taxonomies")).body.taxonomies.some((item: { taxonomy: { taxonomyId: string } }) => item.taxonomy.taxonomyId === browserTaxonomyId), false);
      const malformedTypeDelete = await post(`/v1/content-types/${typeId}/delete`, { contract: "content-type-delete-request/v1", expectedStateDigest: newType.body.stateDigest, extra: true });
      assert.equal(malformedTypeDelete.status, 400);
      const typeCatalogAfterDelete = await get("/v1/content-types");
      const reusedType = await post("/v1/content-types", { contract: "content-type-create-request/v1", expectedStateDigest: typeCatalogAfterDelete.body.stateDigest, label: "再用型別", slug: "browser-type", help: "", order: 2, showInMenu: false, fieldGroups: [], taxonomyAttachments: [] });
      assert.equal(reusedType.status, 201, JSON.stringify(reusedType.body));
      assert.equal(reusedType.body.slug, "browser-type");
      assert.notEqual(reusedType.body.typeId, browserTypeId);
      const originalBrowserTaxonomy = browserTaxCatalog.body.taxonomies.find((item: { taxonomy: { taxonomyId: string } }) => item.taxonomy.taxonomyId === browserTaxonomyId).taxonomy;
      const taxCatalogAfterDelete = await get("/v1/taxonomies");
      const reusedTaxonomy = await post("/v1/taxonomies", { contract: "taxonomy-create-request/v2", expectedStateDigest: taxCatalogAfterDelete.body.stateDigest, label: "再用分類", slug: originalBrowserTaxonomy.slug, hierarchical: false });
      assert.equal(reusedTaxonomy.status, 201, JSON.stringify(reusedTaxonomy.body));
      assert.equal(reusedTaxonomy.body.taxonomy.slug, originalBrowserTaxonomy.slug);
      assert.notEqual(reusedTaxonomy.body.taxonomy.taxonomyId, browserTaxonomyId);
      await page.goto(`${origin}/cms/content/${typeId}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "第一篇研究" }).click();
      await page.getByRole("heading", { name: "編輯內容" }).waitFor();
      // 工作台在同一路由切換清單與完整編輯畫面。
      await page.getByRole("button", { name: "← 返回內容清單" }).click();
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
      await page.getByRole("button", { name: "第一篇研究" }).click();
      await page.getByRole("button", { name: "← 返回內容清單" }).click();
      assert.equal(await page.getByLabel("搜尋標題或 Slug").inputValue(), "第一篇");
      await page.getByRole("button", { name: "第一篇研究" }).click();
      await page.getByLabel("標題", { exact: true }).fill("尚未儲存的標題");
      page.once("dialog", async (dialog) => { assert.match(dialog.message(), /未儲存/); await dialog.dismiss(); });
      await page.getByRole("button", { name: "← 返回內容清單" }).click();
      await page.getByRole("heading", { name: "編輯內容" }).waitFor();
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
      await page.getByLabel("標題", { exact: true }).fill("瀏覽器更新的研究");
      await page.getByRole("button", { name: "儲存", exact: true }).click();
      await page.getByText("已儲存。", { exact: true }).waitFor();
      const editedEntrySearch = await post(`/v1/content-types/${typeId}/entries/search`, { contract: "entry-search-request/v1", typeId, search: "瀏覽器更新的研究", statuses: ["draft"], taxonomyFilters: [], page: 1 });
      assert.equal(editedEntrySearch.body.totalItems, 1);
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
      const deletedEntrySearch = await post(`/v1/content-types/${typeId}/entries/search`, { contract: "entry-search-request/v1", typeId, search: "browser-research", statuses: ["draft", "published"], taxonomyFilters: [], page: 1 });
      assert.equal(deletedEntrySearch.body.totalItems, 0);
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
