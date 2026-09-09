import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { z, type ZodType } from "zod";

import "./tokens.css";
import { openAuthoringSession, type AuthoringSession } from "./session.js";

const AUTHORING_RESOURCE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const jsonContent = z.unknown().refine((value) => value !== undefined);
const schemaIdentitySchema = z.object({ schemaId: z.string(), version: z.number().int().safe().positive() }).strict();
const authoringErrorSchema = z.object({ contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string(), owner: z.string(), subjectIds: z.array(z.string()), remediation: z.object({ kind: z.literal("message"), message: z.string() }).strict() }).strict();
const entryCatalogSchema = z.object({ contract: z.literal("entry-catalog/v1"), items: z.array(z.object({ entryId: z.string(), title: z.string(), status: z.enum(["draft", "published", "published-with-draft"]), current: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict(), published: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict().optional() }).strict()), routeGraphs: z.unknown(), stateDigest: digestSchema }).strict();
const authoringEntrySchema = z.object({ contract: z.literal("authoring-entry/v1"), entryId: z.string(), current: z.object({ revisionId: z.string(), schemaIdentity: schemaIdentitySchema, content: jsonContent, contentDigest: digestSchema, route: z.string(), assets: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()) }).strict(), stateDigest: digestSchema }).strict();
const seoSettingsSchema = z.object({ contract: z.literal("seo-plugin-settings/v1"), publicSiteUrl: z.string().url(), indexing: z.enum(["allow", "disallow"]) }).strict();
const pluginIdentitySchema = z.object({ id: z.string(), version: z.string(), hookContract: z.literal("plugin-hooks/v1"), manifestHash: digestSchema, capabilities: z.array(z.string()) }).strict();
const pluginManagementSnapshotSchema = z.object({ contract: z.literal("plugin-management-snapshot/v1"), activationStateDigest: digestSchema, settingsStateDigest: digestSchema, plugins: z.array(z.object({ identity: pluginIdentitySchema, status: z.enum(["inactive", "active", "reactivation-required"]), settings: z.object({ settingsContract: z.literal("seo-plugin-settings/v1"), settings: seoSettingsSchema, settingsDigest: digestSchema }).strict().optional() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const cmsSeoAnalysisResponseSchema = z.object({ contract: z.literal("cms-seo-analysis-response/v1"), documentDigest: digestSchema, status: z.enum(["available", "unavailable"]), preview: z.object({ title: z.string(), description: z.string().optional(), canonicalUrl: z.string().url().optional() }).strict().optional(), suggestions: z.array(z.object({ code: z.string() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const previewDocumentSchema = z.object({ contract: z.literal("preview-document/v1"), selection: z.enum(["current", "published"]), subject: z.object({ entryId: z.string() }).strict(), revisionId: z.string(), contentDigest: digestSchema, document: z.string() }).strict();
const saveRevisionSuccessSchema = z.unknown();
const publishRevisionSuccessSchema = z.unknown();
type AuthoringEntryDto = Readonly<z.infer<typeof authoringEntrySchema>>;
type CmsSeoAnalysisResponseDto = Readonly<z.infer<typeof cmsSeoAnalysisResponseSchema>>;
type EntryCatalogDto = Readonly<z.infer<typeof entryCatalogSchema>>;
type PluginManagementSnapshotDto = Readonly<z.infer<typeof pluginManagementSnapshotSchema>>;
type PreviewDocumentDto = Readonly<z.infer<typeof previewDocumentSchema>>;



const seoKeys = ["title", "description", "canonicalPath"] as const;
type Seo = Readonly<{ title?: string; description?: string; canonicalPath?: string }>;
type StructuredContent = Readonly<{ contract: "site-content/v1"; title: string; blocks: readonly [Readonly<{ kind: "article"; text: string }>]; seo: Seo }>;
type NormalizedDocument = Readonly<{ content: StructuredContent; route: string }>;
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

function normalizeDocument(title: string, route: string, text: string, seo: Seo): NormalizedDocument {
  const normalizedRoute = route.trim().startsWith("/") ? route.trim() : `/${route.trim()}`;
  return { content: { contract: "site-content/v1", title, blocks: [{ kind: "article", text }], seo: normalizeSeo(seo) }, route: normalizedRoute };
}

function articleDocument(value: unknown, route: string): NormalizedDocument | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  if (record.contract !== "site-content/v1" || typeof record.title !== "string" || !Array.isArray(record.blocks) || record.blocks.length !== 1) return undefined;
  const block = record.blocks[0];
  if (typeof block !== "object" || block === null || Array.isArray(block) || (block as Record<string, unknown>).kind !== "article" || typeof (block as Record<string, unknown>).text !== "string") return undefined;
  if (typeof record.seo !== "object" || record.seo === null || Array.isArray(record.seo) || !Object.keys(record.seo).every((key) => (seoKeys as readonly string[]).includes(key))) return undefined;
  const seo = record.seo as Readonly<Record<string, unknown>>;
  if (seoKeys.some((key) => seo[key] !== undefined && (typeof seo[key] !== "string" || seo[key] === ""))) return undefined;
  return normalizeDocument(record.title, route, (block as Readonly<{ text: string }>).text, seo as Seo);
}

function isValidDocument(document: NormalizedDocument): boolean {
  return document.content.title.trim() !== "" && document.route !== "/" && document.route.startsWith("/") && document.content.blocks[0].text.trim() !== "";
}

function slugify(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "");
}


class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  listEntries(): Promise<EntryCatalogDto> { return this.json("/v1/entries", entryCatalogSchema); }
  current(entryId: string): Promise<AuthoringEntryDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/current`, authoringEntrySchema); }
  plugins(): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins", pluginManagementSnapshotSchema); }
  replaceSettings(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/settings", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  activate(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/activate", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  analyze(entryId: string, body: Record<string, unknown>): Promise<CmsSeoAnalysisResponseDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/seo-analysis`, cmsSeoAnalysisResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  save(entryId: string, baseline: string | null, document: NormalizedDocument): Promise<unknown> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/revisions`, saveRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "save-revision-request/v1", revisionId: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: document.content, route: document.route, assetVersions: [] }) });
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

function Layout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <><a className="skip" href="#workspace">跳到內容</a><header><p>Browser session 已建立。</p><nav aria-label="CMS 導覽"><Link to="/cms">文章</Link><Link to="/cms/entries/new">新增文章</Link><Link to="/cms/plugins">外掛</Link></nav></header><main id="workspace">{children}</main></>;
}

function EntryList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [entries, setEntries] = useState<EntryCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setEntries(undefined); setError(undefined);
    void api.listEntries().then((value) => setEntries(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  if (entries === undefined) return <Layout><h1>文章</h1>{error === undefined ? <p aria-busy="true">正在載入文章。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><h1>文章</h1>{entries.length === 0 ? <p>尚無文章。<Link to="/cms/entries/new">建立第一篇文章</Link></p> : <table><thead><tr><th>標題</th><th>狀態</th><th>網址</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.entryId}><td><Link to={`/cms/entries/${entry.entryId}`}>{entry.title}</Link></td><td>{entry.status}</td><td>{entry.current.normalizedRoute}</td></tr>)}</tbody></table>}</Layout>;
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
  if (snapshot === undefined) return <Layout><h1>外掛</h1>{error === undefined ? <p aria-busy="true">正在載入外掛。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const plugin = snapshot.plugins.find((item) => item.identity.id === "seo-basics");
  if (plugin === undefined) return <Layout><h1>外掛</h1><p role="alert">找不到 seo-basics 外掛。</p><button onClick={load}>重新載入外掛狀態</button></Layout>;
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
  return <Layout><h1>外掛</h1>{error !== undefined && <p role="alert">{error}</p>}{conflict !== undefined && <p role="alert">{conflict === "settings" ? "外掛設定已由另一個頁面更新。請重新載入。" : "外掛啟用狀態已由另一個頁面更新。請重新載入。"}</p>}<p aria-live="polite">{busy === "settings" ? "正在儲存…" : busy === "activation" ? "正在啟用…" : notice}</p><section aria-labelledby="seo-basics-heading"><h2 id="seo-basics-heading">seo-basics</h2><form onSubmit={(event) => void saveSettings(event)}><label>公開網站 URL<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={mutationsLocked} aria-invalid={url !== "" && !validUrl} /></label><fieldset disabled={mutationsLocked}><legend>索引設定</legend><label><input type="radio" name="indexing" checked={indexing === "allow"} onChange={() => setIndexing("allow")} />允許搜尋引擎索引</label><label><input type="radio" name="indexing" checked={indexing === "disallow"} onChange={() => setIndexing("disallow")} />禁止搜尋引擎索引</label></fieldset>{settings === undefined && <p>請先儲存設定，才能啟用。</p>}<button type="submit" disabled={!validUrl || mutationsLocked}>{busy === "settings" ? "正在儲存…" : "儲存 SEO 設定"}</button></form><button onClick={() => void activate()} disabled={!canActivate}>{plugin.status === "active" ? "SEO Plugin 已啟用" : busy === "activation" ? "正在啟用…" : "啟用 SEO Plugin"}</button><button ref={reload} onClick={load} disabled={busy !== undefined}>重新載入外掛狀態</button></section></Layout>;
}

function SeoPreview({ analysis, busy, invalid, failure }: Readonly<{ analysis: CmsSeoAnalysisResponseDto | undefined; busy: boolean; invalid: boolean; failure: string | undefined }>): React.JSX.Element {
  const suggestions = analysis?.suggestions ?? [];
  const status = invalid ? "填寫標題、網址代稱與本文後即可查看 SEO 預覽。" : busy || analysis === undefined ? "內容已變更，正在更新 SEO 預覽…" : failure !== undefined ? failure : analysis.status === "unavailable" ? "SEO 預覽目前無法使用；不影響儲存或發布。SEO 建議目前無法取得。請檢查外掛設定後再試。" : suggestions.length === 0 ? "目前沒有 SEO 建議。" : suggestions.map((suggestion) => suggestion.code === "SEO_TITLE_MISSING" ? "建議填寫 SEO 標題；目前預覽使用文章標題。" : suggestion.code === "SEO_DESCRIPTION_MISSING" ? "建議填寫 Meta description。" : suggestion.code).join(" ");
  return <aside><section aria-label="SEO 預覽" aria-busy={busy}><h2>SEO 預覽</h2><p aria-live="polite" aria-atomic="true">{status}</p>{!invalid && !busy && failure === undefined && analysis?.status === "available" && <>{analysis.preview?.title !== undefined && <h3>{analysis.preview.title}</h3>}{analysis.preview?.description !== undefined && <p>{analysis.preview.description}</p>}{analysis.preview?.canonicalUrl !== undefined && <p className="breakable">{analysis.preview.canonicalUrl}</p>}<ul>{suggestions.map((suggestion) => <li key={suggestion.code}>{suggestion.code}</li>)}</ul></>}</section></aside>;
}

function Editor({ api, create }: Readonly<{ api: CmsApiClient; create: boolean }>): React.JSX.Element {
  const { entryId: routeEntryId } = useParams();
  const navigate = useNavigate();
  const generatedId = useRef("");
  if (generatedId.current === "") generatedId.current = crypto.randomUUID();
  const entryId = routeEntryId ?? generatedId.current;
  const timer = useRef<number | undefined>(undefined);
  const analysisGeneration = useRef(0);
  const reload = useRef<HTMLButtonElement>(null);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const cancelPublish = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [route, setRoute] = useState("");
  const [text, setText] = useState("");
  const [seo, setSeo] = useState<Seo>({});
  const [baseline, setBaseline] = useState<string | null>(null);
  const [savedDocument, setSavedDocument] = useState<string>();
  const [loading, setLoading] = useState(!create);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysis, setAnalysis] = useState<CmsSeoAnalysisResponseDto>();
  const [analysisFailure, setAnalysisFailure] = useState<string>();
  const [currentPreview, setCurrentPreview] = useState<string>();
  const [publishedPreview, setPublishedPreview] = useState<string | null>();
  const [previewError, setPreviewError] = useState<string>();
  const normalized = useMemo(() => normalizeDocument(title, route, text, seo), [title, route, text, seo]);
  const normalizedBytes = useMemo(() => canonicalJson(normalized), [normalized]);
  const valid = isValidDocument(normalized);
  const isNew = baseline === null && savedDocument === undefined;
  const dirty = isNew || normalizedBytes !== savedDocument;
  const focusConflict = (): void => { setConflict(true); setNotice(""); setError(undefined); };
  const adopt = (entry: AuthoringEntryDto): boolean => {
    const document = articleDocument(entry.current.content, entry.current.route);
    if (document === undefined) { setError("目前 revision 無法作為 Article 編輯。"); return false; }
    setTitle(document.content.title); setRoute(document.route.slice(1)); setText(document.content.blocks[0].text); setSeo(document.content.seo); setBaseline(entry.current.revisionId); setSavedDocument(canonicalJson(document));
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
  const load = useCallback((): void => {
    if (create) return;
    setLoading(true); setNotFound(false); setError(undefined);
    void api.current(entryId).then(async (entry) => {
      if (adopt(entry)) await refreshPreviews();
    }).catch((reason: unknown) => {
      if (reason instanceof CmsApiError && reason.status === 404) setNotFound(true);
      else setError(message(reason));
    }).finally(() => setLoading(false));
  // refreshPreviews and adopt intentionally use the current editing instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, create, entryId]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict) reload.current?.focus(); }, [conflict]);
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
      await api.save(entryId, baseline, normalized);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await refreshPreviews();
      setNotice("已儲存。");
      if (create) navigate(`/cms/entries/${entryId}`, { replace: true });
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setError(message(reason));
    } finally { setEntryBusy(false); }
  };
  const openPublish = (): void => { dialog.current?.showModal(); cancelPublish.current?.focus(); };
  const publish = async (): Promise<void> => {
    if (baseline === null || dirty || entryBusy || conflict) return;
    setEntryBusy(true); setError(undefined); setNotice("");
    try {
      await api.publish(entryId, baseline);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await refreshPreviews();
      setNotice("已發布。");
      dialog.current?.close();
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setError(message(reason));
    } finally { setEntryBusy(false); publishTrigger.current?.focus(); }
  };
  if (loading) return <Layout><h1>編輯文章</h1><p aria-busy="true">正在載入文章。</p></Layout>;
  if (notFound) return <Layout><h1>編輯文章</h1><p role="alert">找不到這篇文章。</p><button onClick={load}>重試</button></Layout>;
  const mutationLocked = entryBusy || conflict;
  return <Layout><h1>{isNew ? "新增文章" : "編輯文章"}</h1>{error !== undefined && <p role="alert">{error}</p>}{conflict && <><p role="alert">內容已由另一個頁面更新。</p><button ref={reload} onClick={load}>重新載入文章</button></>}<p aria-live="polite" aria-atomic="true">{notice || (dirty ? "有未儲存的變更；頁面預覽尚未更新，發布已停用。" : "頁面預覽顯示已儲存內容；SEO 預覽分析目前表單內容。")}</p><section className="editor"><form onSubmit={(event) => void save(event)}><label>標題<input required aria-invalid={!valid && title.trim() === ""} value={title} onChange={(event) => { setTitle(event.target.value); if (route === "") setRoute(slugify(event.target.value)); }} disabled={mutationLocked} /></label><label>網址代稱<input required value={route} onChange={(event) => setRoute(event.target.value)} disabled={mutationLocked} /></label><label>本文<textarea required value={text} onChange={(event) => setText(event.target.value)} disabled={mutationLocked} /></label><fieldset><legend>SEO</legend><p>留白時使用文章標題</p><label>SEO 標題<input value={seo.title ?? ""} onChange={(event) => setSeo((current) => ({ ...current, title: event.target.value }))} disabled={mutationLocked} /></label><p>留白時會顯示 SEO 建議</p><label>Meta description<textarea value={seo.description ?? ""} onChange={(event) => setSeo((current) => ({ ...current, description: event.target.value }))} disabled={mutationLocked} /></label><p>留白時使用文章網址；站內路徑須以 / 開頭</p><label>Canonical path<input value={seo.canonicalPath ?? ""} onChange={(event) => setSeo((current) => ({ ...current, canonicalPath: event.target.value }))} disabled={mutationLocked} /></label></fieldset><button type="submit" disabled={!valid || !dirty || mutationLocked}>{entryBusy ? "正在儲存…" : "儲存"}</button><button ref={publishTrigger} type="button" onClick={openPublish} disabled={baseline === null || dirty || mutationLocked}>發布</button></form><div className="preview-column"><SeoPreview analysis={analysis} busy={analysisBusy} invalid={!valid} failure={analysisFailure} /><aside><h2>目前頁面預覽</h2>{previewError !== undefined && <p role="alert">{previewError}</p>}{currentPreview === undefined ? <p>尚未儲存</p> : <iframe title="目前頁面預覽" sandbox="" srcDoc={currentPreview} />}<h2>已發布頁面預覽</h2>{publishedPreview === null ? <p>尚未發布</p> : publishedPreview === undefined ? <p>尚未發布</p> : <iframe title="已發布頁面預覽" sandbox="" srcDoc={publishedPreview} />}</aside></div></section><dialog ref={dialog} aria-labelledby="publish-dialog-title"><h2 id="publish-dialog-title">發布文章</h2><p>發布只會更新已發布版本。</p><button ref={cancelPublish} type="button" onClick={() => { dialog.current?.close(); publishTrigger.current?.focus(); }} disabled={entryBusy}>取消</button><button type="button" onClick={() => void publish()} disabled={entryBusy}>{entryBusy ? "正在發布…" : "確認發布"}</button></dialog></Layout>;
}

function CmsApp({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const api = useMemo(() => new CmsApiClient(session), [session]);
  return <BrowserRouter><Routes><Route path="/cms" element={<EntryList api={api} />} /><Route path="/cms/" element={<EntryList api={api} />} /><Route path="/cms/entries/new" element={<Editor api={api} create />} /><Route path="/cms/entries/:entryId" element={<Editor api={api} create={false} />} /><Route path="/cms/plugins" element={<Plugins api={api} />} /></Routes></BrowserRouter>;
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
