import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { z, type ZodType } from "zod";

import "./tokens.css";
import { openAuthoringSession, type AuthoringSession } from "./session.js";

const AUTHORING_RESOURCE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const jsonContent = z.unknown().refine((value) => value !== undefined);
const schemaIdentitySchema = z.object({ schemaId: z.string(), version: z.number().int().safe().positive() }).strict();
const authoringErrorSchema = z.object({ contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string(), owner: z.string(), subjectIds: z.array(z.string()), remediation: z.object({ kind: z.literal("message"), message: z.string() }).strict() }).strict();
const entryCatalogSchema = z.object({ contract: z.literal("entry-catalog/v1"), items: z.array(z.object({ entryId: z.string(), title: z.string(), status: z.enum(["draft", "published", "published-with-draft"]), current: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict(), published: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict().optional() }).strict()), routeGraphs: z.unknown(), stateDigest: digestSchema }).strict();
const contentTypeSchema = z.object({ contract: z.literal("content-type/v1"), schemaIdentity: schemaIdentitySchema, schema: jsonContent, schemaDigest: digestSchema }).strict();
const contentTypeCatalogSchema = z.object({ contract: z.literal("content-type-catalog/v1"), items: z.array(contentTypeSchema), stateDigest: digestSchema }).strict();
const taxonomyBindingSchema = z.object({ taxonomyId: z.string(), termId: z.string(), evidence: z.object({ taxonomyId: z.string(), termId: z.string(), label: z.string(), slug: z.string(), order: z.number().int().safe() }).strict(), evidenceDigest: digestSchema }).strict();
const authoringEntrySchema = z.object({ contract: z.literal("authoring-entry/v1"), entryId: z.string(), current: z.object({ revisionId: z.string(), schemaIdentity: schemaIdentitySchema, content: jsonContent, contentDigest: digestSchema, route: z.string(), assets: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()), taxonomyBindings: z.array(taxonomyBindingSchema) }).strict(), stateDigest: digestSchema }).strict();
const taxonomyTermSchema = z.object({ taxonomyId: z.string(), termId: z.string(), label: z.string(), slug: z.string(), order: z.number().int().safe(), state: z.enum(["live", "retired"]) }).strict();
const taxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v1"), taxonomy: z.object({ taxonomyId: z.string(), label: z.string() }).strict(), terms: z.array(taxonomyTermSchema), stateDigest: digestSchema }).strict();
const taxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v1"), taxonomies: z.array(z.object({ taxonomy: z.object({ taxonomyId: z.string(), label: z.string() }).strict(), stateDigest: digestSchema }).strict()) }).strict();
const seoSettingsSchema = z.object({ contract: z.literal("seo-plugin-settings/v1"), publicSiteUrl: z.string().url(), indexing: z.enum(["allow", "disallow"]) }).strict();
const pluginIdentitySchema = z.object({ id: z.string(), version: z.string(), hookContract: z.literal("plugin-hooks/v1"), manifestHash: digestSchema, capabilities: z.array(z.string()) }).strict();
const pluginManagementSnapshotSchema = z.object({ contract: z.literal("plugin-management-snapshot/v1"), activationStateDigest: digestSchema, settingsStateDigest: digestSchema, plugins: z.array(z.object({ identity: pluginIdentitySchema, status: z.enum(["inactive", "active", "reactivation-required"]), settings: z.object({ settingsContract: z.literal("seo-plugin-settings/v1"), settings: seoSettingsSchema, settingsDigest: digestSchema }).strict().optional() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const cmsSeoAnalysisResponseSchema = z.object({ contract: z.literal("cms-seo-analysis-response/v1"), documentDigest: digestSchema, status: z.enum(["available", "unavailable"]), preview: z.object({ title: z.string(), description: z.string().optional(), canonicalUrl: z.string().url().optional() }).strict().optional(), suggestions: z.array(z.object({ code: z.string() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const previewDocumentSchema = z.object({ contract: z.literal("preview-document/v1"), selection: z.enum(["current", "published"]), subject: z.object({ entryId: z.string() }).strict(), revisionId: z.string(), contentDigest: digestSchema, document: z.string() }).strict();
const interactiveDemoBlockSchema = z.object({
  kind: z.literal("interactive-demo"),
  identity: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  hook: z.literal("cms/editor-block/resolve"),
  manifestHash: digestSchema,
  source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(),
  staticFallback: z.string().min(1),
}).strict();
const articleBlockSchema = z.object({ kind: z.literal("article"), text: z.string().min(1) }).strict();
const structuredContentSchema = z.object({ contract: z.literal("site-content/v1"), title: z.string().min(1), blocks: z.array(z.discriminatedUnion("kind", [articleBlockSchema, interactiveDemoBlockSchema])).min(1), seo: z.object({ title: z.string().min(1).optional(), description: z.string().min(1).optional(), canonicalPath: z.string().min(1).optional() }).strict() }).strict();
const cmsEditorBlockDiagnosticSchema = z.object({ code: z.enum(["PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING", "PLUGIN_BLOCK_IDENTITY_CHANGED"]), owner: z.literal("PluginHost"), subjectIds: z.array(z.string()), remediation: z.object({ kind: z.literal("message"), message: z.string() }).strict(), detail: z.object({ pluginId: z.string(), hook: z.literal("cms/editor-block/resolve"), capability: z.literal("cms-editor-block-resolution"), entryId: z.string(), cause: z.enum(["inactive", "missing", "identity-changed"]) }).strict() }).strict();
const cmsEditorBlockResolutionSchema = z.object({ blockIndex: z.number().int().nonnegative(), pluginIdentity: z.object({ id: z.string(), version: z.string(), hook: z.literal("cms/editor-block/resolve"), manifestHash: digestSchema }).strict(), source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(), sourceDigest: digestSchema, activeStateDigest: digestSchema, status: z.enum(["active", "inactive", "missing", "identity-changed"]), output: jsonContent.optional(), outputDigest: digestSchema.optional(), diagnostic: cmsEditorBlockDiagnosticSchema.optional() }).strict().superRefine((value, context) => {
  if (value.status === "active" && (value.output === undefined || value.outputDigest === undefined || value.diagnostic !== undefined)) context.addIssue({ code: "custom", message: "CMS_EDITOR_BLOCK_RESOLUTION_INVALID" });
  if (value.status !== "active" && (value.output !== undefined || value.outputDigest !== undefined || value.diagnostic === undefined || value.diagnostic.code !== `PLUGIN_BLOCK_${value.status === "identity-changed" ? "IDENTITY_CHANGED" : value.status.toUpperCase()}` || value.diagnostic.detail.cause !== value.status)) context.addIssue({ code: "custom", message: "CMS_EDITOR_BLOCK_RESOLUTION_INVALID" });
});
const cmsEditorBlockResolutionsSchema = z.object({ contract: z.literal("cms-editor-block-resolutions/v1"), entryId: z.string(), revisionId: z.string(), contentDigest: digestSchema, stateDigest: digestSchema, items: z.array(cmsEditorBlockResolutionSchema) }).strict();
const saveRevisionSuccessSchema = z.unknown();
const publishRevisionSuccessSchema = z.unknown();
type AuthoringEntryDto = Readonly<z.infer<typeof authoringEntrySchema>>;
type CmsEditorBlockResolutionsDto = Readonly<z.infer<typeof cmsEditorBlockResolutionsSchema>>;
type CmsSeoAnalysisResponseDto = Readonly<z.infer<typeof cmsSeoAnalysisResponseSchema>>;
type EntryCatalogDto = Readonly<z.infer<typeof entryCatalogSchema>>;
type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
type PluginManagementSnapshotDto = Readonly<z.infer<typeof pluginManagementSnapshotSchema>>;
type PreviewDocumentDto = Readonly<z.infer<typeof previewDocumentSchema>>;
type TaxonomySnapshotDto = Readonly<z.infer<typeof taxonomySnapshotSchema>>;
type TaxonomyCatalogDto = Readonly<z.infer<typeof taxonomyCatalogSchema>>;
type StructuredContent = Readonly<z.infer<typeof structuredContentSchema>>;
type StructuredBlock = StructuredContent["blocks"][number];
type InteractiveDemoBlock = Extract<StructuredBlock, Readonly<{ kind: "interactive-demo" }>>;

const seoKeys = ["title", "description", "canonicalPath"] as const;
type Seo = Readonly<{ title?: string | undefined; description?: string | undefined; canonicalPath?: string | undefined }>;
type NormalizedDocument = Readonly<{ content: StructuredContent; route: string }>;
type TaxonomyTermIdentity = Readonly<{ taxonomyId: string; termId: string }>;
export { openAuthoringSession } from "./session.js";

export class CmsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly remediation: string) {
    super(remediation);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("CMS_CANONICAL_JSON_INVALID");
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function message(reason: unknown): string {
  return reason instanceof CmsApiError ? reason.remediation : "無法完成 CMS request。";
}

function normalizeSeo(value: Seo): Seo {
  const result: Record<string, string> = {};
  for (const key of seoKeys) {
    const trimmed = value[key]?.trim();
    if (trimmed !== undefined && trimmed !== "") result[key] = trimmed;
  }
  return result as Seo;
}

function normalizeDocument(title: string, route: string, text: string, seo: Seo, blocks: readonly StructuredBlock[] = [{ kind: "article", text }]): NormalizedDocument {
  const normalizedRoute = route.trim().startsWith("/") ? route.trim() : `/${route.trim()}`;
  return { content: { contract: "site-content/v1", title, blocks: blocks.map((block) => block.kind === "article" ? { kind: "article", text } : block), seo: normalizeSeo(seo) }, route: normalizedRoute };
}

function articleDocument(value: unknown, route: string): NormalizedDocument | undefined {
  const parsed = structuredContentSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const articles = parsed.data.blocks.filter((block) => block.kind === "article");
  if (articles.length !== 1) return undefined;
  return normalizeDocument(parsed.data.title, route, articles[0]!.text, parsed.data.seo, parsed.data.blocks);
}

function isValidDocument(document: NormalizedDocument): boolean {
  const article = document.content.blocks.find((block) => block.kind === "article");
  return article !== undefined && document.content.title.trim() !== "" && document.route !== "/" && document.route.startsWith("/") && article.text.trim() !== "";
}

function slugify(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "");
}


class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  listEntries(): Promise<EntryCatalogDto> { return this.json("/v1/entries", entryCatalogSchema); }
  contentTypes(): Promise<ContentTypeCatalogDto> { return this.json("/v1/content-types", contentTypeCatalogSchema); }
  createContentType(schemaId: string, schema: unknown): Promise<ContentTypeDto> { return this.json("/v1/content-types", contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "create-content-type-request/v1", schemaId: this.resourceId(schemaId), schema }) }); }
  taxonomies(): Promise<TaxonomyCatalogDto> { return this.json("/v1/taxonomies", taxonomyCatalogSchema); }
  createTaxonomy(taxonomyId: string, label: string): Promise<TaxonomySnapshotDto> { return this.json("/v1/taxonomies", taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-create-request/v1", taxonomyId: this.resourceId(taxonomyId), label }) }); }
  taxonomy(taxonomyId: string): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}`, taxonomySnapshotSchema); }
  current(entryId: string): Promise<AuthoringEntryDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/current`, authoringEntrySchema); }
  editorBlocks(entryId: string): Promise<CmsEditorBlockResolutionsDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/current/editor-blocks`, cmsEditorBlockResolutionsSchema); }
  plugins(): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins", pluginManagementSnapshotSchema); }
  replaceSettings(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/settings", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  activate(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/activate", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  analyze(entryId: string, body: Record<string, unknown>): Promise<CmsSeoAnalysisResponseDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/seo-analysis`, cmsSeoAnalysisResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  save(entryId: string, baseline: string | null, document: NormalizedDocument, taxonomyTerms: readonly TaxonomyTermIdentity[]): Promise<unknown> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/revisions`, saveRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "save-revision-request/v1", revisionId: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: document.content, route: document.route, assetVersions: [], taxonomyTerms: taxonomyTerms.map(({ taxonomyId, termId }) => ({ taxonomyId, termId })) }) });
  }
  publish(entryId: string, baseline: string): Promise<unknown> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/publish`, publishRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId: baseline, operationId: crypto.randomUUID() }) });
  }
  preview(entryId: string, selection: "current" | "published"): Promise<PreviewDocumentDto> {
    return this.json("/v1/preview", previewDocumentSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "preview-request/v1", selection, subject: { entryId: this.resourceId(entryId) } }) });
  }

  private resourceId(value: string): string {
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(value)) throw new CmsApiError("CMS_RESPONSE_INVALID", 0, "CMS request 無法驗證。");
    return value;
  }

  private async json<T>(path: `/v1/${string}`, schema: ZodType<T> | undefined, init?: RequestInit): Promise<T> {
    const response = await this.session.authorizedFetch(path, init);
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = authoringErrorSchema.safeParse(value);
      if (error.success) throw new CmsApiError(error.data.code, response.status, error.data.remediation.message);
      throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    }
    if (schema === undefined) return value as T;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    return parsed.data;
  }
}

function currentContentTypes(items: ContentTypeCatalogDto["items"]): readonly ContentTypeDto[] {
  const current = new Map<string, ContentTypeDto>();
  for (const item of items) {
    const previous = current.get(item.schemaIdentity.schemaId);
    if (previous === undefined || previous.schemaIdentity.version < item.schemaIdentity.version) current.set(item.schemaIdentity.schemaId, item);
  }
  return [...current.values()].toSorted((left, right) => left.schemaIdentity.schemaId < right.schemaIdentity.schemaId ? -1 : left.schemaIdentity.schemaId > right.schemaIdentity.schemaId ? 1 : 0);
}

function entryStatusText(status: EntryCatalogDto["items"][number]["status"]): string {
  return status === "draft" ? "草稿" : status === "published" ? "已發布" : "已發布，有未發布變更";
}

function PageHeading({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { heading.current?.focus(); }, [pathname]);
  return <h1 ref={heading} id="page-title" tabIndex={-1}>{children}</h1>;
}

function Layout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <><a className="skip" href="#page-title">跳到主標題</a><header><p>Browser session 已建立。</p><nav aria-label="CMS 導覽"><NavLink to="/cms" end>首頁</NavLink><NavLink to="/cms/entries">文章</NavLink><NavLink to="/cms/entries/new">新增文章</NavLink><NavLink to="/cms/content-types">內容類型</NavLink><NavLink to="/cms/taxonomies">分類</NavLink><NavLink to="/cms/plugins">外掛</NavLink></nav></header><main id="workspace" aria-labelledby="page-title">{children}</main></>;
}

function EntryList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [entries, setEntries] = useState<EntryCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setEntries(undefined); setError(undefined);
    void api.listEntries().then((value) => setEntries(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  if (entries === undefined) return <Layout><PageHeading>文章全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>文章全覽</PageHeading>{entries.length === 0 ? <p>尚無文章。<Link to="/cms/entries/new">建立第一篇文章</Link></p> : <table><caption>所有文章</caption><thead><tr><th scope="col">標題</th><th scope="col">狀態</th><th scope="col">網址</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.entryId}><td><Link to={`/cms/entries/${entry.entryId}`}>{entry.title}</Link></td><td>{entryStatusText(entry.status)}</td><td>{entry.current.normalizedRoute}</td></tr>)}</tbody></table>}</Layout>;
}

function ContentTypeList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [items, setItems] = useState<ContentTypeCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setItems(undefined); setError(undefined);
    void api.contentTypes().then((catalog) => setItems(catalog.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  if (items === undefined) return <Layout><PageHeading>內容類型全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const current = currentContentTypes(items);
  return <Layout><PageHeading>內容類型全覽</PageHeading><p><Link className="action-link" to="/cms/content-types/new">建立內容類型</Link></p>{current.length === 0 ? <p>尚無內容類型。<Link to="/cms/content-types/new">建立第一個內容類型</Link></p> : <table><caption>所有內容類型</caption><thead><tr><th scope="col">Schema ID</th><th scope="col">目前版本</th></tr></thead><tbody>{current.map((item) => <tr key={item.schemaIdentity.schemaId}><td><Link to={`/cms/content-types/${item.schemaIdentity.schemaId}`}>{item.schemaIdentity.schemaId}</Link></td><td>{item.schemaIdentity.version}</td></tr>)}</tbody></table>}</Layout>;
}

function ContentTypeNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const [schemaId, setSchemaId] = useState("");
  const [schemaText, setSchemaText] = useState("{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"type\": \"object\"\n}");
  const [schemaIdError, setSchemaIdError] = useState<string>();
  const [schemaError, setSchemaError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); setSchemaIdError(undefined); setSchemaError(undefined); setFormError(undefined);
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(schemaId)) { setSchemaIdError("Schema ID 只能使用英數字、句點、底線、連字號或波浪號。"); return; }
    let schema: unknown;
    try { schema = JSON.parse(schemaText); } catch { setSchemaError("請輸入有效 JSON Schema。"); return; }
    setBusy(true);
    try {
      const created = await api.createContentType(schemaId, schema);
      navigate(`/cms/content-types/${created.schemaIdentity.schemaId}`);
    } catch (reason) {
      setFormError(message(reason));
    } finally {
      setBusy(false);
    }
  };
  return <Layout><PageHeading>建立內容類型</PageHeading><p>建立 immutable initial schema version；後續版本不會覆寫此定義。</p><form aria-label="Content Type 定義" onSubmit={(event) => void submit(event)}><label htmlFor="content-type-schema-id">Schema ID<input id="content-type-schema-id" required value={schemaId} onChange={(event) => { setSchemaId(event.target.value); setSchemaIdError(undefined); }} aria-invalid={schemaIdError !== undefined} aria-describedby={schemaIdError === undefined ? undefined : "content-type-schema-id-error"} disabled={busy} /></label>{schemaIdError !== undefined && <p id="content-type-schema-id-error" role="alert">{schemaIdError}</p>}<label htmlFor="content-type-schema">JSON Schema<textarea id="content-type-schema" required value={schemaText} onChange={(event) => { setSchemaText(event.target.value); setSchemaError(undefined); }} aria-invalid={schemaError !== undefined} aria-describedby={schemaError === undefined ? undefined : "content-type-schema-error"} disabled={busy} /></label>{schemaError !== undefined && <p id="content-type-schema-error" role="alert">{schemaError}</p>}{formError !== undefined && <p role="alert">{formError}</p>}<p role="status" aria-live="polite">{busy ? "正在建立內容類型。" : ""}</p><button type="submit" disabled={busy}>{busy ? "正在建立…" : "建立內容類型"}</button></form></Layout>;
}

function ContentTypeDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { schemaId } = useParams();
  const [items, setItems] = useState<ContentTypeCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    if (schemaId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(schemaId)) { setItems([]); setError("找不到內容類型。"); return; }
    setItems(undefined); setError(undefined);
    void api.contentTypes().then((catalog) => {
      const history = catalog.items.filter((item) => item.schemaIdentity.schemaId === schemaId).toSorted((left, right) => right.schemaIdentity.version - left.schemaIdentity.version);
      setItems(history);
      if (history.length === 0) setError("找不到內容類型。");
    }).catch((reason: unknown) => setError(message(reason)));
  }, [api, schemaId]);
  useEffect(load, [load]);
  if (items === undefined) return <Layout><PageHeading>內容類型詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const document = currentContentTypes(items)[0];
  if (document === undefined) return <Layout><PageHeading>內容類型詳情</PageHeading><p role="alert">{error ?? "找不到內容類型。"}</p><button onClick={load}>重試</button></Layout>;
  return <Layout><PageHeading>內容類型：{document.schemaIdentity.schemaId}</PageHeading><p>目前版本：{document.schemaIdentity.version}</p><dl><dt>Schema digest</dt><dd className="breakable">{document.schemaDigest}</dd></dl><section aria-labelledby="content-type-history"><h2 id="content-type-history">版本歷程</h2><ol>{items.map((item) => <li key={item.schemaIdentity.version} aria-current={item.schemaIdentity.version === document.schemaIdentity.version ? "true" : undefined}>版本 {item.schemaIdentity.version}{item.schemaIdentity.version === document.schemaIdentity.version ? "（目前）" : ""}</li>)}</ol></section><section aria-labelledby="content-type-schema"><h2 id="content-type-schema">目前 JSON Schema</h2><pre className="schema"><code>{JSON.stringify(document.schema, null, 2)}</code></pre></section></Layout>;
}

function TaxonomyList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [catalog, setCatalog] = useState<TaxonomyCatalogDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => { setCatalog(undefined); setError(undefined); void api.taxonomies().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  if (catalog === undefined) return <Layout><PageHeading>分類全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>分類全覽</PageHeading><p><Link className="action-link" to="/cms/taxonomies/new">建立分類</Link></p>{catalog.taxonomies.length === 0 ? <p>尚無分類。<Link to="/cms/taxonomies/new">建立第一個分類</Link></p> : <table><caption>所有分類</caption><thead><tr><th scope="col">名稱</th><th scope="col">Taxonomy ID</th></tr></thead><tbody>{catalog.taxonomies.map(({ taxonomy }) => <tr key={taxonomy.taxonomyId}><td><Link to={`/cms/taxonomies/${taxonomy.taxonomyId}`}>{taxonomy.label}</Link></td><td>{taxonomy.taxonomyId}</td></tr>)}</tbody></table>}</Layout>;
}

function TaxonomyNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const [taxonomyId, setTaxonomyId] = useState("");
  const [label, setLabel] = useState("");
  const [idError, setIdError] = useState<string>();
  const [labelError, setLabelError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIdError(undefined);
    setLabelError(undefined);
    setFormError(undefined);
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(taxonomyId)) {
      setIdError("Taxonomy ID 只能使用英數字、句點、底線、連字號或波浪號。");
      return;
    }
    if (label.trim() === "") {
      setLabelError("請輸入分類名稱。");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createTaxonomy(taxonomyId, label.trim());
      navigate(`/cms/taxonomies/${created.taxonomy.taxonomyId}`, { state: { createdTaxonomyId: created.taxonomy.taxonomyId } });
    } catch (reason) {
      const error = message(reason);
      if (reason instanceof CmsApiError && reason.code === "TAXONOMY_CONFLICT") setIdError(error);
      else setFormError(error);
    } finally {
      setBusy(false);
    }
  };
  return <Layout><PageHeading>建立分類</PageHeading><form aria-label="分類定義" aria-busy={busy} onSubmit={(event) => void submit(event)}><label htmlFor="taxonomy-id">Taxonomy ID<input id="taxonomy-id" required value={taxonomyId} onChange={(event) => { setTaxonomyId(event.target.value); setIdError(undefined); }} aria-invalid={idError !== undefined} aria-describedby={idError === undefined ? undefined : "taxonomy-id-error"} disabled={busy} /></label>{idError !== undefined && <p id="taxonomy-id-error" role="alert">{idError}</p>}<label htmlFor="taxonomy-label">分類名稱<input id="taxonomy-label" required value={label} onChange={(event) => { setLabel(event.target.value); setLabelError(undefined); }} aria-invalid={labelError !== undefined} aria-describedby={labelError === undefined ? undefined : "taxonomy-label-error"} disabled={busy} /></label>{labelError !== undefined && <p id="taxonomy-label-error" role="alert">{labelError}</p>}{formError !== undefined && <p role="alert">{formError}</p>}<p role="status" aria-live="polite" aria-atomic="true">{busy ? "正在建立分類。" : ""}</p><button type="submit" disabled={busy}>{busy ? "正在建立…" : "建立分類"}</button></form></Layout>;
}

function TaxonomyDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { taxonomyId } = useParams();
  const { state } = useLocation();
  const [snapshot, setSnapshot] = useState<TaxonomySnapshotDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    if (taxonomyId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(taxonomyId)) {
      setSnapshot(undefined);
      setError("找不到分類。");
      return;
    }
    setSnapshot(undefined);
    setError(undefined);
    void api.taxonomy(taxonomyId).then(setSnapshot).catch((reason: unknown) => setError(reason instanceof CmsApiError && reason.status === 404 ? "找不到分類。" : message(reason)));
  }, [api, taxonomyId]);
  useEffect(load, [load]);
  if (snapshot === undefined) return <Layout><PageHeading>分類詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const createdTaxonomyId = typeof state === "object" && state !== null && "createdTaxonomyId" in state && typeof state.createdTaxonomyId === "string" ? state.createdTaxonomyId : undefined;
  return <Layout><PageHeading>分類：{snapshot.taxonomy.label}</PageHeading>{createdTaxonomyId === snapshot.taxonomy.taxonomyId && <p role="status" aria-live="polite" aria-atomic="true">已建立分類。</p>}<dl><dt>Taxonomy ID</dt><dd>{snapshot.taxonomy.taxonomyId}</dd></dl><section aria-labelledby="taxonomy-terms"><h2 id="taxonomy-terms">Terms</h2>{snapshot.terms.length === 0 ? <p>尚無 term。</p> : <table><caption>所有 terms</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">順序</th><th scope="col">狀態</th></tr></thead><tbody>{snapshot.terms.map((term) => <tr key={term.termId}><td>{term.label}</td><td>{term.slug}</td><td>{term.order}</td><td>{term.state === "live" ? "使用中" : "已停用"}</td></tr>)}</tbody></table>}</section></Layout>;
}

function Home({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [entries, setEntries] = useState<EntryCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setEntries(undefined); setError(undefined);
    void api.listEntries().then((value) => setEntries(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  const actionableEntries = entries === undefined ? [] : entries.filter((entry) => entry.status !== "published").slice(0, 5);
  return <Layout><PageHeading>CMS 文章工作台</PageHeading><p>建立、編輯並發布文章；發布只會更新已發布版本。</p><p><Link className="action-link" to="/cms/entries/new">建立文章</Link> <Link to="/cms/entries">查看所有文章</Link></p><section aria-labelledby="actionable-entries"><h2 id="actionable-entries">待處理文章</h2>{entries === undefined ? error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></> : actionableEntries.length === 0 ? <p>目前沒有待處理文章。<Link to="/cms/entries">查看所有文章</Link></p> : <ul>{actionableEntries.map((entry) => <li key={entry.entryId}><Link to={`/cms/entries/${entry.entryId}`}>{entry.title}</Link>（{entryStatusText(entry.status)}）</li>)}</ul>}</section></Layout>;
}

function Plugins({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PluginManagementSnapshotDto>();
  const [url, setUrl] = useState("");
  const [indexing, setIndexing] = useState<"allow" | "disallow">("disallow");
  const [saved, setSaved] = useState<Readonly<{ url: string; indexing: "allow" | "disallow" }>>();
  const [busy, setBusy] = useState<"settings" | "activation">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<"settings" | "activation">();
  const reload = useRef<HTMLButtonElement>(null);
  const load = useCallback((): void => {
    setError(undefined); setNotice("");
    void api.plugins().then((next) => {
      setSnapshot(next); setConflict(undefined);
      const plugin = next.plugins.find((item) => item.identity.id === "seo-basics");
      const settings = plugin?.settings?.settings;
      setUrl(settings?.publicSiteUrl ?? "");
      setIndexing(settings?.indexing ?? "disallow");
      setSaved(settings === undefined ? undefined : { url: settings.publicSiteUrl, indexing: settings.indexing });
    }).catch((reason: unknown) => { setSnapshot(undefined); setError(message(reason)); });
  }, [api]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict !== undefined) reload.current?.focus(); }, [conflict]);
  if (snapshot === undefined) return <Layout><PageHeading>外掛</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入外掛。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const plugin = snapshot.plugins.find((item) => item.identity.id === "seo-basics");
  if (plugin === undefined) return <Layout><PageHeading>外掛</PageHeading><p role="alert">找不到 seo-basics 外掛。</p><button onClick={load}>重新載入外掛狀態</button></Layout>;
  const formDirty = saved === undefined || saved.url !== url || saved.indexing !== indexing;
  const validUrl = (() => { try { return url !== "" && new URL(url).protocol === "https:"; } catch { return false; } })();
  const mutationsLocked = busy !== undefined || conflict !== undefined;
  const settings = plugin.settings;
  const canActivate = settings !== undefined && !formDirty && plugin.status === "inactive" && !mutationsLocked;
  const saveSettings = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!validUrl || mutationsLocked) return;
    setBusy("settings"); setError(undefined); setNotice("");
    try {
      const next = await api.replaceSettings({ contract: "plugin-settings-replace-request/v1", identity: plugin.identity, expectedSettingsStateDigest: snapshot.settingsStateDigest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: url, indexing } });
      setSnapshot(next); setSaved({ url, indexing }); setNotice("SEO 設定已儲存。現在可以啟用外掛。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict("settings");
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const activate = async (): Promise<void> => {
    if (!canActivate) return;
    setBusy("activation"); setError(undefined); setNotice("");
    try {
      const next = await api.activate({ contract: "plugin-activation-request/v1", identity: plugin.identity, expectedActivationStateDigest: snapshot.activationStateDigest });
      setSnapshot(next); setNotice(`已啟用：${plugin.identity.id}@${plugin.identity.version}`);
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict("activation");
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  return <Layout><PageHeading>外掛</PageHeading>{error !== undefined && <p role="alert">{error}</p>}{conflict !== undefined && <p role="alert">{conflict === "settings" ? "外掛設定已由另一個頁面更新。請重新載入。" : "外掛啟用狀態已由另一個頁面更新。請重新載入。"}</p>}<p role="status" aria-live="polite">{busy === "settings" ? "正在儲存…" : busy === "activation" ? "正在啟用…" : notice}</p><section aria-labelledby="seo-basics-heading"><h2 id="seo-basics-heading">seo-basics</h2><form onSubmit={(event) => void saveSettings(event)}><label>公開網站 URL<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={mutationsLocked} aria-invalid={url !== "" && !validUrl} /></label><fieldset disabled={mutationsLocked}><legend>索引設定</legend><label><input type="radio" name="indexing" checked={indexing === "allow"} onChange={() => setIndexing("allow")} />允許搜尋引擎索引</label><label><input type="radio" name="indexing" checked={indexing === "disallow"} onChange={() => setIndexing("disallow")} />禁止搜尋引擎索引</label></fieldset><button type="submit" disabled={!validUrl || !formDirty || mutationsLocked}>儲存 SEO 設定</button></form><p>狀態：{plugin.status}</p><button ref={reload} type="button" onClick={load}>重新載入外掛狀態</button><button type="button" onClick={() => void activate()} disabled={!canActivate}>{plugin.status === "active" ? "SEO Plugin 已啟用" : "啟用 SEO Plugin"}</button></section></Layout>;
}

function SeoPreview({ analysis, busy, invalid, failure }: Readonly<{ analysis: CmsSeoAnalysisResponseDto | undefined; busy: boolean; invalid: boolean; failure: string | undefined }>): React.JSX.Element {
  const suggestions = analysis?.suggestions ?? [];
  const status = invalid ? "填寫標題、網址代稱與本文後即可查看 SEO 預覽。" : busy || analysis === undefined ? "內容已變更，正在更新 SEO 預覽…" : failure !== undefined ? failure : analysis.status === "unavailable" ? "SEO 預覽目前無法使用；不影響儲存或發布。SEO 建議目前無法取得。請檢查外掛設定後再試。" : suggestions.length === 0 ? "目前沒有 SEO 建議。" : suggestions.map((suggestion) => suggestion.code === "SEO_TITLE_MISSING" ? "建議填寫 SEO 標題；目前預覽使用文章標題。" : suggestion.code === "SEO_DESCRIPTION_MISSING" ? "建議填寫 Meta description。" : suggestion.code).join(" ");
  return <aside aria-labelledby="seo-preview-heading"><section aria-busy={busy}><h2 id="seo-preview-heading">SEO 預覽</h2><p role="status" aria-live="polite" aria-atomic="true">{status}</p>{!invalid && !busy && failure === undefined && analysis?.status === "available" && <>{analysis.preview?.title !== undefined && <h3>{analysis.preview.title}</h3>}{analysis.preview?.description !== undefined && <p>{analysis.preview.description}</p>}{analysis.preview?.canonicalUrl !== undefined && <p className="breakable">{analysis.preview.canonicalUrl}</p>}<ul>{suggestions.map((suggestion) => <li key={suggestion.code}>{suggestion.code}</li>)}</ul></>}</section></aside>;
}

/**
 * `failure` 只驅動這個 block 的 status text；對應的 `role="alert"` 由 Editor 統一渲染一次。
 * 一份 document 可含多個 interactive block，逐 block 重複 alert 會讓同一則訊息被 AT 播報多次。
 */
function EditorPluginBlock({ block, blockIndex, resolution, failure }: Readonly<{ block: InteractiveDemoBlock; blockIndex: number; resolution: CmsEditorBlockResolutionsDto["items"][number] | undefined; failure: string | undefined }>): React.JSX.Element {
  const ordinal = blockIndex + 1;
  const headingId = `editor-plugin-block-${blockIndex}-heading`;
  const statusId = `editor-plugin-block-${blockIndex}-status`;
  const identity = `${block.identity.id}@${block.identity.version}`;
  const status = resolution === undefined
    ? failure === undefined ? `正在解析外掛 ${identity}。` : failure
    : resolution.status === "active" ? `外掛 ${identity} 已啟用；已顯示 Host output。`
      : resolution.status === "inactive" ? `外掛 ${identity} 尚未啟用；已保留原始內容。`
        : resolution.status === "missing" ? `找不到外掛 ${identity}；已保留原始內容。`
          : `外掛 ${identity} identity 已變更；已保留原始內容。`;
  return <section aria-labelledby={headingId} aria-busy={resolution === undefined && failure === undefined}>
    <h2 id={headingId}>互動區塊 {ordinal}</h2>
    <dl><dt>Plugin</dt><dd>{identity}</dd><dt>Manifest hash</dt><dd className="breakable">{block.manifestHash}</dd></dl>
    <p id={statusId} role="status" aria-live="polite" aria-atomic="true" aria-label={`互動區塊 ${ordinal} 狀態`}>{status}</p>
    {resolution?.status === "active" && <pre role="region" tabIndex={0} aria-label={`互動區塊 ${ordinal} Host output`} aria-describedby={statusId}>{canonicalJson(resolution.output)}</pre>}
    {resolution !== undefined && resolution.status !== "active" && <>{resolution.diagnostic !== undefined && <div role="note" aria-labelledby={`editor-plugin-block-${blockIndex}-diagnostic`}><h3 id={`editor-plugin-block-${blockIndex}-diagnostic`}>Plugin 診斷</h3><p>{resolution.diagnostic.code}</p><p>{resolution.diagnostic.remediation.message}</p></div>}<pre role="region" tabIndex={0} aria-label={`互動區塊 ${ordinal} 保留的來源`} aria-describedby={statusId}>{canonicalJson(resolution.source)}</pre></>}
  </section>;
}

function Editor({ api, create }: Readonly<{ api: CmsApiClient; create: boolean }>): React.JSX.Element {
  const { entryId: routeEntryId } = useParams();
  const navigate = useNavigate();
  const generatedId = useRef("");
  if (generatedId.current === "") generatedId.current = crypto.randomUUID();
  const entryId = routeEntryId ?? generatedId.current;
  const timer = useRef<number | undefined>(undefined);
  const analysisGeneration = useRef(0);
  const editorBlockGeneration = useRef(0);
  const reload = useRef<HTMLButtonElement>(null);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const cancelPublish = useRef<HTMLButtonElement>(null);
  const confirmPublish = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const currentPreviewTab = useRef<HTMLButtonElement>(null);
  const publishedPreviewTab = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState("");
  const [route, setRoute] = useState("");
  const [text, setText] = useState("");
  const [seo, setSeo] = useState<Seo>({});
  const [blocks, setBlocks] = useState<readonly StructuredBlock[]>([{ kind: "article", text: "" }]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [taxonomyTerms, setTaxonomyTerms] = useState<readonly TaxonomyTermIdentity[]>([]);
  const [savedDocument, setSavedDocument] = useState<string>();
  const [loading, setLoading] = useState(!create);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [publishError, setPublishError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysis, setAnalysis] = useState<CmsSeoAnalysisResponseDto>();
  const [analysisFailure, setAnalysisFailure] = useState<string>();
  const [editorBlockResolutions, setEditorBlockResolutions] = useState<CmsEditorBlockResolutionsDto>();
  const [editorBlockFailure, setEditorBlockFailure] = useState<string>();
  const [currentPreview, setCurrentPreview] = useState<string>();
  const [publishedPreview, setPublishedPreview] = useState<string | null>();
  const [previewError, setPreviewError] = useState<string>();
  const [previewSelection, setPreviewSelection] = useState<"current" | "published">("current");
  const normalized = useMemo(() => normalizeDocument(title, route, text, seo, blocks), [blocks, route, seo, text, title]);
  const normalizedBytes = useMemo(() => canonicalJson(normalized), [normalized]);
  const valid = isValidDocument(normalized);
  const isNew = baseline === null && savedDocument === undefined;
  const dirty = isNew || normalizedBytes !== savedDocument;
  const focusConflict = (): void => { setConflict(true); setNotice(""); setError(undefined); };
  const selectPreview = (selection: "current" | "published", focus = false): void => {
    setPreviewSelection(selection);
    if (focus) (selection === "current" ? currentPreviewTab : publishedPreviewTab).current?.focus();
  };
  const previewKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      selectPreview(event.key === "Home" ? "current" : event.key === "End" ? "published" : event.key === "ArrowLeft" ? previewSelection === "current" ? "published" : "current" : previewSelection === "published" ? "current" : "published", true);
    }
  };
  const trapPublishFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelPublish.current) {
      event.preventDefault();
      confirmPublish.current?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmPublish.current) {
      event.preventDefault();
      cancelPublish.current?.focus();
    }
  };
  const adopt = (entry: AuthoringEntryDto): boolean => {
    const document = articleDocument(entry.current.content, entry.current.route);
    const article = document?.content.blocks.find((block) => block.kind === "article");
    // 每次 adopt 都換掉 editing instance；比它更早發出的 editor-block response 一律作廢。
    editorBlockGeneration.current += 1;
    if (document === undefined || article === undefined) { setError("目前 revision 無法作為 Article 編輯。"); return false; }
    setTitle(document.content.title); setRoute(document.route.slice(1)); setText(article.text); setSeo(document.content.seo); setBlocks(document.content.blocks); setBaseline(entry.current.revisionId); setSavedDocument(canonicalJson(document)); setEditorBlockResolutions(undefined); setEditorBlockFailure(undefined);
    setTaxonomyTerms(entry.current.taxonomyBindings.map(({ taxonomyId, termId }) => ({ taxonomyId, termId }))); setConflict(false);
    return true;
  };
  const refreshPreviews = async (): Promise<void> => {
    const [current, published] = await Promise.allSettled([api.preview(entryId, "current"), api.preview(entryId, "published")]);
    if (current.status === "fulfilled") setCurrentPreview(current.value.document);
    else setPreviewError(message(current.reason));
    if (published.status === "fulfilled") setPublishedPreview(published.value.document);
    else if (published.reason instanceof CmsApiError && published.reason.status === 404) setPublishedPreview(null);
    else setPreviewError(message(published.reason));
  };
  /**
   * Editor 以 block index 對齊 resolution，因此只採用「與目前 editing instance 完全相符」的 response：
   * generation 擋掉切換文章後才回來的 stale response（否則另一篇文章的 Host output 會落在這裡的 block 上）；
   * revision/digest 擋掉 canonical drift；index 序列與單一 activeStateDigest 擋掉 partial 或跨 activation
   * state 拼出來的 snapshot——Application 是逐 block 呼叫 Host，中途的 activation 變更會讓各 item 不同源。
   */
  const refreshEditorBlocks = async (entry: AuthoringEntryDto): Promise<void> => {
    const generation = editorBlockGeneration.current;
    const document = articleDocument(entry.current.content, entry.current.route);
    if (document === undefined) return;
    const expected = document.content.blocks.flatMap((block, blockIndex) => block.kind === "interactive-demo" ? [blockIndex] : []);
    if (expected.length === 0) return;
    try {
      const next = await api.editorBlocks(entryId);
      if (editorBlockGeneration.current !== generation) return;
      const aligned = next.items.length === expected.length && expected.every((blockIndex, position) => next.items[position]?.blockIndex === blockIndex);
      const singleState = next.items.every((item) => item.activeStateDigest === next.items[0]?.activeStateDigest);
      if (next.entryId !== entryId || next.revisionId !== entry.current.revisionId || next.contentDigest !== entry.current.contentDigest || !aligned || !singleState) { setEditorBlockFailure("互動區塊狀態已變更，請重新載入文章。"); return; }
      setEditorBlockResolutions(next);
    } catch (reason) {
      if (editorBlockGeneration.current !== generation) return;
      setEditorBlockFailure(message(reason));
    }
  };
  const load = useCallback((): void => {
    if (create) return;
    setLoading(true); setNotFound(false); setError(undefined);
    void api.current(entryId).then(async (entry) => {
      if (adopt(entry)) await Promise.all([refreshPreviews(), refreshEditorBlocks(entry)]);
    }).catch((reason: unknown) => {
      if (reason instanceof CmsApiError && reason.status === 404) setNotFound(true);
      else setError(message(reason));
    }).finally(() => setLoading(false));
  // refreshPreviews、refreshEditorBlocks 和 adopt 都刻意使用目前 editing instance。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, create, entryId]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict) reload.current?.focus(); }, [conflict]);
  useEffect(() => { if (notice === "已發布。") status.current?.focus(); }, [notice]);
  useEffect(() => {
    const generation = ++analysisGeneration.current;
    if (timer.current !== undefined) clearTimeout(timer.current);
    if (!valid || conflict) { setAnalysisBusy(false); return; }
    setAnalysisBusy(true); setAnalysisFailure(undefined);
    timer.current = window.setTimeout(() => {
      void (async () => {
        const documentDigest = await sha256(canonicalJson({ entryId, expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: normalized.content, route: normalized.route }));
        try {
          const next = await api.analyze(entryId, { contract: "cms-seo-analysis-request/v1", entryId, expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: normalized.content, route: normalized.route, documentDigest });
          if (analysisGeneration.current === generation && next.documentDigest === documentDigest) { setAnalysis(next); setAnalysisBusy(false); }
        } catch (reason) {
          if (analysisGeneration.current !== generation) return;
          if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
          else { setAnalysisBusy(false); setAnalysisFailure("SEO 預覽目前無法使用；不影響儲存或發布。"); }
        }
      })();
    }, 400);
    return () => { if (timer.current !== undefined) clearTimeout(timer.current); };
  }, [api, baseline, conflict, entryId, normalized, valid]);
  useEffect(() => {
    const element = dialog.current;
    const close = (): void => publishTrigger.current?.focus();
    element?.addEventListener("cancel", close);
    return () => element?.removeEventListener("cancel", close);
  }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!valid || !dirty || entryBusy || conflict) return;
    if (timer.current !== undefined) clearTimeout(timer.current);
    analysisGeneration.current += 1;
    setEntryBusy(true); setError(undefined); setNotice("");
    try {
      await api.save(entryId, baseline, normalized, taxonomyTerms);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await Promise.all([refreshPreviews(), refreshEditorBlocks(refreshed)]);
      setNotice("已儲存。");
      if (create) navigate(`/cms/entries/${entryId}`, { replace: true });
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setError(message(reason));
    } finally { setEntryBusy(false); }
  };
  const openPublish = (): void => { setPublishError(undefined); dialog.current?.showModal(); cancelPublish.current?.focus(); };
  const publish = async (): Promise<void> => {
    if (baseline === null || dirty || entryBusy || conflict) return;
    setEntryBusy(true); setPublishError(undefined); setNotice("");
    try {
      await api.publish(entryId, baseline);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await Promise.all([refreshPreviews(), refreshEditorBlocks(refreshed)]);
      setNotice("已發布。");
      dialog.current?.close();
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setPublishError(message(reason));
    } finally { setEntryBusy(false); }
  };
  if (loading) return <Layout><PageHeading>編輯文章</PageHeading><p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p></Layout>;
  if (notFound) return <Layout><PageHeading>編輯文章</PageHeading><p role="alert">找不到這篇文章。</p><button onClick={load}>重試</button></Layout>;
  const mutationLocked = entryBusy || conflict;
  const resolutionsByBlockIndex = new Map(editorBlockResolutions?.items.map((item) => [item.blockIndex, item]));
  const currentRevisionText = baseline === null ? "尚未儲存" : baseline;
  const operationStatus = entryBusy ? baseline === null ? "正在儲存新文章…" : "正在處理文章變更…" : notice || (dirty ? "有未儲存的變更；頁面預覽尚未更新，發布已停用。" : "頁面預覽顯示已儲存內容；SEO 預覽分析目前表單內容。");
  return <Layout>
    <PageHeading>{isNew ? "新增文章" : "編輯文章"}</PageHeading>
    {error !== undefined && <p role="alert">{error}</p>}
    {conflict && <><p role="alert">內容已由另一個頁面更新。</p><button ref={reload} onClick={load}>重新載入文章</button></>}
    {editorBlockFailure !== undefined && <p role="alert">{editorBlockFailure}</p>}
    <section className="editor">
      <form id="entry-editor" aria-label="文章內容" onSubmit={(event) => void save(event)}>
        <label>標題<input required aria-invalid={!valid && title.trim() === ""} value={title} onChange={(event) => { setTitle(event.target.value); if (route === "") setRoute(slugify(event.target.value)); }} disabled={mutationLocked} /></label>
        <label>網址代稱<input required value={route} onChange={(event) => setRoute(event.target.value)} disabled={mutationLocked} /></label>
        <label>本文<textarea required value={text} onChange={(event) => setText(event.target.value)} disabled={mutationLocked} /></label>
        {normalized.content.blocks.map((block, blockIndex) => block.kind === "interactive-demo" && <EditorPluginBlock key={`${block.identity.id}\0${blockIndex}`} block={block} blockIndex={blockIndex} resolution={resolutionsByBlockIndex.get(blockIndex)} failure={editorBlockFailure} />)}
        <fieldset><legend>SEO</legend><p>留白時使用文章標題</p><label>SEO 標題<input value={seo.title ?? ""} onChange={(event) => setSeo((current) => ({ ...current, title: event.target.value }))} disabled={mutationLocked} /></label><p>留白時會顯示 SEO 建議</p><label>Meta description<textarea value={seo.description ?? ""} onChange={(event) => setSeo((current) => ({ ...current, description: event.target.value }))} disabled={mutationLocked} /></label><p>留白時使用文章網址；站內路徑須以 / 開頭</p><label>Canonical path<input value={seo.canonicalPath ?? ""} onChange={(event) => setSeo((current) => ({ ...current, canonicalPath: event.target.value }))} disabled={mutationLocked} /></label></fieldset>
      </form>
      <div className="preview-column">
        <aside aria-labelledby="entry-actions-heading"><h2 id="entry-actions-heading">文章動作</h2><p>目前 revision：<span className="breakable">{currentRevisionText}</span></p><p ref={status} role="status" tabIndex={-1} aria-live="polite" aria-atomic="true">{operationStatus}</p><button form="entry-editor" type="submit" disabled={!valid || !dirty || mutationLocked}>{entryBusy ? "正在儲存…" : "儲存"}</button><button ref={publishTrigger} type="button" onClick={openPublish} disabled={baseline === null || dirty || mutationLocked}>發布</button></aside>
        <SeoPreview analysis={analysis} busy={analysisBusy} invalid={!valid} failure={analysisFailure} />
        <aside aria-labelledby="page-preview-heading"><h2 id="page-preview-heading">頁面預覽</h2>{previewError !== undefined && <p role="alert">{previewError}</p>}<div role="tablist" aria-label="頁面預覽版本"><button ref={currentPreviewTab} id="current-preview-tab" type="button" role="tab" tabIndex={previewSelection === "current" ? 0 : -1} aria-selected={previewSelection === "current"} aria-controls="current-preview-panel" onClick={() => selectPreview("current")} onKeyDown={previewKeyDown}>目前版本</button><button ref={publishedPreviewTab} id="published-preview-tab" type="button" role="tab" tabIndex={previewSelection === "published" ? 0 : -1} aria-selected={previewSelection === "published"} aria-controls="published-preview-panel" onClick={() => selectPreview("published")} onKeyDown={previewKeyDown}>已發布版本</button></div>{previewSelection === "current" ? <section id="current-preview-panel" role="tabpanel" aria-labelledby="current-preview-tab">{currentPreview === undefined ? <p>尚未儲存</p> : <iframe title="目前版本頁面預覽" sandbox="" srcDoc={currentPreview} />}</section> : <section id="published-preview-panel" role="tabpanel" aria-labelledby="published-preview-tab">{publishedPreview === null || publishedPreview === undefined ? <p>尚未發布</p> : <iframe title="已發布版本頁面預覽" sandbox="" srcDoc={publishedPreview} />}</section>}</aside>
      </div>
    </section>
    <dialog ref={dialog} aria-labelledby="publish-dialog-title" aria-describedby="publish-dialog-description" onKeyDown={trapPublishFocus}><h2 id="publish-dialog-title">發布文章</h2><p id="publish-dialog-description">將發布目前 revision：<span className="breakable">{currentRevisionText}</span>。發布只會更新已發布版本。</p>{publishError !== undefined && <p role="alert">{publishError}</p>}<button ref={cancelPublish} type="button" onClick={() => { dialog.current?.close(); publishTrigger.current?.focus(); }} disabled={entryBusy}>取消</button><button ref={confirmPublish} type="button" onClick={() => void publish()} disabled={entryBusy}>{entryBusy ? "正在發布…" : "確認發布"}</button></dialog>
  </Layout>;
}

function CmsApp({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const api = useMemo(() => new CmsApiClient(session), [session]);
  return <BrowserRouter><Routes><Route path="/cms" element={<Home api={api} />} /><Route path="/cms/" element={<Home api={api} />} /><Route path="/cms/entries" element={<EntryList api={api} />} /><Route path="/cms/entries/new" element={<Editor api={api} create />} /><Route path="/cms/entries/:entryId" element={<Editor api={api} create={false} />} /><Route path="/cms/content-types" element={<ContentTypeList api={api} />} /><Route path="/cms/content-types/new" element={<ContentTypeNew api={api} />} /><Route path="/cms/content-types/:schemaId" element={<ContentTypeDetail api={api} />} /><Route path="/cms/taxonomies" element={<TaxonomyList api={api} />} /><Route path="/cms/taxonomies/new" element={<TaxonomyNew api={api} />} /><Route path="/cms/taxonomies/:taxonomyId" element={<TaxonomyDetail api={api} />} /><Route path="/cms/plugins" element={<Plugins api={api} />} /></Routes></BrowserRouter>;
}

function SessionGate({ ticket }: Readonly<{ ticket: string | undefined }>): React.JSX.Element {
  const [session, setSession] = useState<AuthoringSession>();
  const [locked, setLocked] = useState(ticket === undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (locked) heading.current?.focus(); }, [locked]);
  useEffect(() => {
    if (ticket === undefined) return;
    let active = true;
    let opened: AuthoringSession | undefined;
    void openAuthoringSession(ticket, () => { if (active) setLocked(true); }).then((next) => { opened = next; if (active) setSession(next); else next.lock(); }).catch(() => { if (active) setLocked(true); });
    return () => { active = false; opened?.lock(); };
  }, [ticket]);
  if (locked) return <main><h1 ref={heading} tabIndex={-1}>CMS 工作台已鎖定</h1><p>請由 cms:open 建立新的瀏覽器 session。</p></main>;
  return session === undefined ? <main aria-busy="true"><h1>正在建立 CMS session</h1></main> : <CmsApp session={session} />;
}

export function startCms(ticket: string | undefined): void {
  const root = document.getElementById("root");
  if (root !== null) createRoot(root).render(<SessionGate ticket={ticket} />);
}
