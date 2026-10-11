import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CmsApiError, message, type CmsApiClient, type ContentField, type ContentTypeDto, type CptEntryCatalogDto, type CptEntryDto, type CptEntrySearchResultDto, type MediaAssetV2Dto, type StructuredBlock, type TaxonomySnapshotDto, type TaxonomyTermIdentity } from "./cms-api.js";
import { isMediaKind, isTextKind } from "./content-type-model.js";
import { Layout, PageHeading, PublicNotice } from "./cms-shell.js";
/** entry editor 的 wire 值轉換：未編輯的欄位原樣保留，datetime 只在實際編輯時轉成 RFC 3339 UTC。 */
function datetimeLocalToIso(value: string): string | undefined {
  if (value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isoToDatetimeLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function customDefaultsOf(definition: ContentTypeDto): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const group of definition.fieldGroups) for (const field of group.fields) if (field.defaultValue !== undefined) values[field.fieldId] = field.defaultValue;
  return values;
}

function customValuesOf(entry: CptEntryDto): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const item of entry.content.customValues) values[item.fieldId] = item.value;
  return values;
}

function customValuesRequest(values: Readonly<Record<string, unknown>>): readonly Readonly<{ fieldId: string; value: unknown }>[] {
  return Object.keys(values).sort().map((fieldId) => ({ fieldId, value: values[fieldId] }));
}

/** 欄位層級的說明文字一律由 definition metadata 組成，client 不重算任何驗證規則。 */
function customFieldDescription(field: ContentField): string {
  const parts: string[] = [];
  if (field.required) parts.push("發布前必填");
  if (isTextKind(field.kind)) {
    const { minLength, maxLength } = field.constraints;
    if (typeof minLength === "number" || typeof maxLength === "number") parts.push(`長度 ${typeof minLength === "number" ? minLength : 0}–${typeof maxLength === "number" ? maxLength : "不限"}`);
  }
  if (field.kind === "number") {
    const { minimum, maximum } = field.constraints;
    if (typeof minimum === "number" || typeof maximum === "number") parts.push(`範圍 ${typeof minimum === "number" ? minimum : "不限"}–${typeof maximum === "number" ? maximum : "不限"}`);
  }
  if (isMediaKind(field.kind)) {
    const mimeTypes = Array.isArray(field.constraints.mimeTypes) ? (field.constraints.mimeTypes as readonly string[]) : [];
    if (mimeTypes.length > 0) parts.push(`允許 ${mimeTypes.join("、")}`);
    if (typeof field.constraints.maxItems === "number") parts.push(`最多 ${field.constraints.maxItems} 個`);
  }
  if (field.help !== "") parts.push(field.help);
  return parts.join("；");
}

type EntryForm = Readonly<{ title: string; slug: string; excerpt: string; text: string; blocks: readonly StructuredBlock[]; seoTitle: string; seoDescription: string; canonicalPath: string; featuredMedia: string; taxonomyTerms: readonly TaxonomyTermIdentity[]; status: "draft" | "published"; custom: Readonly<Record<string, unknown>> }>;

const emptyEntryForm: EntryForm = { title: "", slug: "", excerpt: "", text: "", blocks: [], seoTitle: "", seoDescription: "", canonicalPath: "", featuredMedia: "", taxonomyTerms: [], status: "draft", custom: {} };

function entryArticleText(entry: CptEntryDto): string {
  const article = entry.content.blocks.find((block) => block.kind === "article");
  return article === undefined ? "" : article.text;
}

function entryFormOf(entry: CptEntryDto): EntryForm {
  return { title: entry.content.title, slug: entry.slug, excerpt: entry.content.excerpt, text: entryArticleText(entry), blocks: entry.content.blocks, seoTitle: entry.content.seo.title ?? "", seoDescription: entry.content.seo.description ?? "", canonicalPath: entry.content.seo.canonicalPath ?? "", featuredMedia: entry.content.featuredMedia ?? "", taxonomyTerms: entry.taxonomyTerms, status: entry.status, custom: customValuesOf(entry) };
}

/** 只有實際渲染出來的 field 才能成為 focus 目標；其他 subjectIds 退回 form 層訊息。 */
function renderedCustomFieldIds(definition: ContentTypeDto | undefined, subjectIds: readonly string[]): readonly string[] {
  if (definition === undefined) return [];
  const rendered = new Set(definition.fieldGroups.flatMap((group) => group.fields.map((field) => field.fieldId)));
  return subjectIds.filter((fieldId) => rendered.has(fieldId));
}

/**
 * 本文只編輯第一個 article block；其餘 body block（含其他 article block）原樣留在原位置，
 * 避免 Save 靜默刪除或改寫它們。無法辨識單一本文的 entry 在 refreshEntry 就被拒絕編輯。
 */
function cptBlocksOf(form: EntryForm): readonly StructuredBlock[] {
  let replaced = false;
  const blocks = form.blocks.map((block) => {
    if (block.kind !== "article" || replaced) return block;
    replaced = true;
    return { kind: "article" as const, text: form.text };
  });
  // 新內容沒有任何既有 block，本文由 server 驗證的單一 article block 表示。
  return replaced ? blocks : [{ kind: "article" as const, text: form.text }, ...blocks];
}

function articleBlockCount(blocks: readonly StructuredBlock[]): number {
  return blocks.filter((block) => block.kind === "article").length;
}

function cptContentOf(typeId: string, form: EntryForm): unknown {
  return { contract: "cpt-content/v1", typeId, title: form.title, blocks: cptBlocksOf(form), excerpt: form.excerpt, seo: { ...(form.seoTitle.trim() === "" ? {} : { title: form.seoTitle }), ...(form.seoDescription.trim() === "" ? {} : { description: form.seoDescription }), ...(form.canonicalPath.trim() === "" ? {} : { canonicalPath: form.canonicalPath }) }, ...(form.featuredMedia === "" ? {} : { featuredMedia: form.featuredMedia }), customValues: customValuesRequest(form.custom) };
}

function cptEntryStatusText(status: CptEntryDto["status"]): string {
  return status === "draft" ? "草稿" : "已發布";
}

function displayDateTime(value: string | undefined): string {
  if (value === undefined) return "尚未發布";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function mediaChoiceLabel(asset: MediaAssetV2Dto): string {
  return `${asset.title} · ${asset.originalFilename} (${asset.mimeType})`;
}

/**
 * entry editor 的自訂欄位控制項：只依 definition metadata 渲染，不套任何 HTML constraint，
 * 也不重算 server 的驗證規則（required 只以 aria-required 與文字呈現）。
 */
function CustomFieldControl({ field, index, value, invalid, disabled, assets, onChange }: Readonly<{ field: ContentField; index: number; value: unknown; invalid: boolean; disabled: boolean; assets: readonly MediaAssetV2Dto[]; onChange: (value: unknown) => void }>): React.JSX.Element {
  const description = customFieldDescription(field);
  const descriptionId = `custom-field-description-${index}`;
  const errorId = `custom-field-error-${index}`;
  const describedBy = [description === "" ? undefined : descriptionId, invalid ? errorId : undefined].filter((id) => id !== undefined).join(" ");
  const accessibility = { "aria-describedby": describedBy === "" ? undefined : describedBy, "aria-required": field.required ? true : undefined };
  const textValue = typeof value === "string" ? value : "";
  const hint = description === "" ? undefined : <span id={descriptionId}>（{description}）</span>;
  const issue = invalid ? <p id={errorId} className="field-issue">此欄位未通過發布驗證。</p> : undefined;
  if (field.kind === "boolean" || field.kind === "multi-select" || field.kind === "multi-media") {
    const legend = `${field.label}${field.required ? "（必填）" : ""}`;
    // presence-sensitive kinds 一律能表示「未設定」：boolean 用三態、multi 值清空即移除 key。
    const body = field.kind === "boolean"
      ? <select aria-label={field.label} value={value === undefined ? "unset" : value === true ? "true" : "false"} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value === "unset" ? undefined : event.target.value === "true")} disabled={disabled}><option value="unset">未設定</option><option value="true">是</option><option value="false">否</option></select>
      : field.kind === "multi-select"
        ? (field.options ?? []).map((option) => <label key={option.optionId}><input type="checkbox" aria-label={option.label} checked={Array.isArray(value) && value.includes(option.optionId)} aria-invalid={invalid || undefined} onChange={(event) => { const current = Array.isArray(value) ? (value as readonly string[]) : []; const next = event.target.checked ? [...current, option.optionId] : current.filter((item) => item !== option.optionId); onChange(next.length === 0 ? undefined : next); }} disabled={disabled} />{option.label}</label>)
        : assets.filter((asset) => !Array.isArray(field.constraints.mimeTypes) || field.constraints.mimeTypes.includes(asset.mimeType)).map((asset) => <label key={asset.assetId}><input type="checkbox" checked={Array.isArray(value) && value.includes(asset.assetId)} onChange={(event) => { const current = Array.isArray(value) ? value as readonly string[] : []; const next = event.target.checked ? [...current, asset.assetId] : current.filter((id) => id !== asset.assetId); onChange(next.length === 0 ? undefined : next); }} disabled={disabled} />{mediaChoiceLabel(asset)}</label>);
    return <fieldset className="custom-field" data-custom-field={field.fieldId} tabIndex={-1} {...accessibility}>{<legend>{legend}</legend>}{hint}{body}{issue}</fieldset>;
  }
  if (field.kind === "single-select") return <label className="custom-field">{field.label}{field.required && "（必填）"}<select value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled}><option value="">未選擇</option>{(field.options ?? []).map((option) => <option key={option.optionId} value={option.optionId}>{option.label}</option>)}</select>{hint}{issue}</label>;
  if (field.kind === "single-media") return <label className="custom-field">{field.label}{field.required && "（必填）"}<select value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled}><option value="">未選擇</option>{assets.filter((asset) => !Array.isArray(field.constraints.mimeTypes) || field.constraints.mimeTypes.includes(asset.mimeType)).map((asset) => <option key={asset.assetId} value={asset.assetId}>{mediaChoiceLabel(asset)}</option>)}</select>{hint}{issue}</label>;
  if (field.kind === "textarea") return <label className="custom-field">{field.label}{field.required && "（必填）"}<textarea value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "number") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="number" value={typeof value === "number" ? String(value) : ""} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value.trim() === "" ? undefined : Number(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "datetime") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="datetime-local" value={isoToDatetimeLocal(value)} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(datetimeLocalToIso(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "date") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="date" value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  // text 的空字串是合法的明示空值；url／single-media 的空輸入代表移除該值。
  const clearsOnEmpty = field.kind !== "text";
  const placeholder = field.kind === "url" ? "https://example.com" : undefined;
  return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="text" value={textValue} placeholder={placeholder} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(clearsOnEmpty && event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
}

function CustomFieldsSection({ definition, values, invalidFieldIds, disabled, assets, onChange }: Readonly<{ definition: ContentTypeDto; values: Readonly<Record<string, unknown>>; invalidFieldIds: readonly string[]; disabled: boolean; assets: readonly MediaAssetV2Dto[]; onChange: (fieldId: string, value: unknown) => void }>): React.JSX.Element | null {
  if (definition.fieldGroups.length === 0) return null;
  const positions = new Map<string, number>();
  let position = -1;
  for (const group of definition.fieldGroups) for (const field of group.fields) positions.set(field.fieldId, ++position);
  return <section aria-labelledby="custom-fields-heading">
    <h2 id="custom-fields-heading">自訂欄位</h2>
    {definition.fieldGroups.map((group) => <fieldset key={group.groupId}><legend>{group.label}</legend>{group.help !== "" && <p>{group.help}</p>}{group.fields.map((field) => <CustomFieldControl key={field.fieldId} field={field} index={positions.get(field.fieldId) ?? 0} value={values[field.fieldId]} invalid={invalidFieldIds.includes(field.fieldId)} disabled={disabled} assets={assets} onChange={(value) => onChange(field.fieldId, value)} />)}</fieldset>)}
  </section>;
}

export function PostWorkspace({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { typeId } = useParams();
  return typeId === undefined
    ? <Layout><PageHeading>內容</PageHeading><p role="alert">找不到內容類型。</p></Layout>
    : <PostCatalog key={typeId} api={api} typeId={typeId} />;
}

function PostCatalog({ api, typeId }: Readonly<{ api: CmsApiClient; typeId: string }>): React.JSX.Element {
  const reload = useRef<HTMLButtonElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const confirmDelete = useRef<HTMLButtonElement>(null);
  const editingEntryId = useRef<string | undefined>(undefined);
  const [definition, setDefinition] = useState<ContentTypeDto>();
  const [catalog, setCatalog] = useState<CptEntryCatalogDto>();
  const [assets, setAssets] = useState<readonly MediaAssetV2Dto[]>([]);
  const [taxonomies, setTaxonomies] = useState<readonly TaxonomySnapshotDto[]>([]);
  const [newTermLabels, setNewTermLabels] = useState<Readonly<Record<string, string>>>({});
  const [searchResult, setSearchResult] = useState<CptEntrySearchResultDto>();
  const searchGeneration = useRef(0);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [filterTaxonomy, setFilterTaxonomy] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"create" | "edit">();
  // 每次開啟或切換編輯對象都遞增，讓 focus 由 render 後的 effect 執行（不用 mouse-only 的選取路徑）。
  const [editorToken, setEditorToken] = useState(0);
  const [form, setForm] = useState<EntryForm>();
  const [savedForm, setSavedForm] = useState<string>();
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [baseline, setBaseline] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "delete">();
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  // 只有實際渲染出來的 field 才會進到這裡；其他 subjectIds 留在 form 層訊息。
  const [customErrors, setCustomErrors] = useState<readonly string[]>([]);
  const createInlineTerm = async (taxonomy: TaxonomySnapshotDto, cardinality: "one" | "many"): Promise<void> => {
    const label = newTermLabels[taxonomy.taxonomy.taxonomyId]?.trim() ?? "";
    if (label === "") return;
    try {
      const updated = await api.taxonomyCommand(taxonomy.taxonomy.taxonomyId, { kind: "create-term", expectedStateDigest: taxonomy.stateDigest, label, order: taxonomy.terms.length });
      const created = updated.terms.find((term) => !taxonomy.terms.some((existing) => existing.termId === term.termId));
      setTaxonomies((items) => items.map((item) => item.taxonomy.taxonomyId === updated.taxonomy.taxonomyId ? updated : item));
      if (created !== undefined && form !== undefined) setForm({ ...form, taxonomyTerms: [...(cardinality === "one" ? form.taxonomyTerms.filter((item) => item.taxonomyId !== updated.taxonomy.taxonomyId) : form.taxonomyTerms), { taxonomyId: updated.taxonomy.taxonomyId, termId: created.termId }] });
      setNewTermLabels((values) => ({ ...values, [taxonomy.taxonomy.taxonomyId]: "" }));
    } catch (reason) { setError(message(reason)); }
  };
  const refreshSearch = useCallback(async (): Promise<void> => {
    const generation = ++searchGeneration.current;
    setSearchResult(undefined);
    try {
      const result = await api.searchEntries(typeId, { search: searchText, statuses: statusFilter === "all" ? [] : [statusFilter], taxonomyFilters: filterTaxonomy === "" || filterTerm === "" ? [] : [{ taxonomyId: filterTaxonomy, termIds: [filterTerm] }], page });
      if (generation === searchGeneration.current) setSearchResult(result);
    } catch (reason) {
      if (generation === searchGeneration.current) throw reason;
    }
  }, [api, typeId, searchText, statusFilter, filterTaxonomy, filterTerm, page]);
  useEffect(() => { void refreshSearch().catch((reason: unknown) => setError(message(reason))); return () => { searchGeneration.current += 1; }; }, [refreshSearch]);

  const refreshEntry = useCallback(async (entryId: string, focusEditor: boolean): Promise<void> => {
    const entry = await api.entry(typeId, entryId);
    // 「本文」只有在恰好一個 article block 時才有唯一意義；否則 fail closed，不由 UI 猜測要改哪一段。
    if (articleBlockCount(entry.content.blocks) !== 1) {
      editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setBaseline(undefined);
      throw new CmsApiError("CMS_ENTRY_NOT_EDITABLE", 0, "這筆內容的 article block 不是恰好一個，無法在 CMS 編輯本文；請以 API 調整 block 後再試。");
    }
    editingEntryId.current = entryId;
    setMode("edit"); setForm(entryFormOf(entry)); setSavedForm(JSON.stringify(entryFormOf(entry))); setBaseline(entry.stateDigest); setCustomErrors([]); setValidationAttempted(false);
    if (focusEditor) setEditorToken((value) => value + 1);
  }, [api, typeId]);
  /** 重新載入一律以 server 的最新 state 重建畫面：catalog 與（若編輯器開著）目前 entry 的 baseline。 */
  const load = useCallback((): void => {
    setLoading(true); setError(undefined); setConflict(false);
    void (async () => {
      try {
        const [nextDefinition, nextCatalog, media] = await Promise.all([api.contentType(typeId), api.entryCatalog(typeId), api.listMedia()]);
        setDefinition(nextDefinition); setCatalog(nextCatalog);
        setAssets(media.items);
        setTaxonomies(await Promise.all(nextDefinition.taxonomyAttachments.map((attachment) => api.taxonomy(attachment.taxonomyId))));
        const entryId = editingEntryId.current;
        if (entryId !== undefined) await refreshEntry(entryId, true);
      } catch (reason) {
        if (reason instanceof CmsApiError && reason.status === 404 && editingEntryId.current !== undefined) {
          editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setBaseline(undefined); setNotice("這筆內容已不存在。");
        } else setError(message(reason));
      } finally { setLoading(false); }
    })();
  }, [api, refreshEntry, typeId]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict) reload.current?.focus(); }, [conflict]);
  useEffect(() => { if (notice !== "") status.current?.focus(); }, [notice]);
  useEffect(() => { if (editorToken > 0) editorHeading.current?.focus(); }, [editorToken]);
  useEffect(() => {
    const first = customErrors[0];
    if (first === undefined) return;
    document.querySelector<HTMLElement>(`[data-custom-field="${first}"]`)?.focus();
  }, [customErrors]);

  const startCreate = (): void => {
    editingEntryId.current = undefined;
    const nextForm = definition === undefined ? emptyEntryForm : { ...emptyEntryForm, custom: customDefaultsOf(definition) };
    setMode("create"); setForm(nextForm); setSavedForm(JSON.stringify(nextForm)); setBaseline(undefined); setEditorToken((value) => value + 1); setValidationAttempted(false);
    setConflict(false); setError(undefined); setNotice(""); setCustomErrors([]);
  };
  const dirty = form !== undefined && savedForm !== undefined && JSON.stringify(form) !== savedForm;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const returnToList = (): void => {
    if (dirty && !window.confirm("內容有未儲存的修改。確定返回清單並捨棄修改？")) return;
    editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setSavedForm(undefined); setBaseline(undefined);
    setConflict(false); setError(undefined); setCustomErrors([]); setValidationAttempted(false);
    requestAnimationFrame(() => document.getElementById("entry-catalog-heading")?.focus());
  };
  const valid = form !== undefined && form.title.trim() !== "" && form.text.trim() !== "";
  const locked = busy !== undefined || conflict;
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (form === undefined || mode === undefined || catalog === undefined || locked) return;
    if (!valid) {
      setValidationAttempted(true);
      setError("請填寫標題與本文，再儲存內容。");
      (form.title.trim() === "" ? titleInput.current : bodyInput.current)?.focus();
      return;
    }
    setBusy("save"); setError(undefined); setNotice(""); setCustomErrors([]);
    try {
      const content = cptContentOf(typeId, form);
      const saved = mode === "create"
        ? await api.createEntry(typeId, { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, ...(form.slug.trim() === "" ? {} : { slug: form.slug.trim() }), content, taxonomyTerms: form.taxonomyTerms, status: form.status })
        : await api.saveEntry(typeId, editingEntryId.current ?? "", { contract: "cpt-entry-save-request/v1", expectedStateDigest: baseline ?? "", slug: form.slug.trim(), content, taxonomyTerms: form.taxonomyTerms, status: form.status });
      editingEntryId.current = saved.entryId;
      setMode("edit"); setForm(entryFormOf(saved)); setSavedForm(JSON.stringify(entryFormOf(saved))); setBaseline(saved.stateDigest); setValidationAttempted(false);
      setCatalog(await api.entryCatalog(typeId));
      await refreshSearch();
      setNotice("已儲存。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else if (reason instanceof CmsApiError && reason.code === "INVALID_ENTRY_CUSTOM_VALUES") { setCustomErrors(renderedCustomFieldIds(definition, reason.subjectIds)); setError(reason.remediation); }
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const remove = async (): Promise<void> => {
    if (mode !== "edit" || editingEntryId.current === undefined || baseline === undefined || locked) return;
    setBusy("delete"); setError(undefined); setNotice("");
    try {
      await api.deleteEntry(typeId, editingEntryId.current, { contract: "cpt-entry-delete-request/v1", expectedStateDigest: baseline });
      dialog.current?.close();
      editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setSavedForm(undefined); setBaseline(undefined);
      setCatalog(await api.entryCatalog(typeId));
      await refreshSearch();
      setNotice("已刪除。");
    } catch (reason) {
      dialog.current?.close();
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const trapDeleteFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelDelete.current) { event.preventDefault(); confirmDelete.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirmDelete.current) { event.preventDefault(); cancelDelete.current?.focus(); }
  };
  useEffect(() => {
    const element = dialog.current;
    const close = (): void => deleteTrigger.current?.focus();
    element?.addEventListener("cancel", close);
    return () => element?.removeEventListener("cancel", close);
  }, []);

  const operationStatus = busy === "save" ? "正在儲存內容…" : busy === "delete" ? "正在刪除內容…" : notice;

  if (loading && definition === undefined) return <Layout><PageHeading key={typeId}>內容</PageHeading><p role="status" aria-live="polite" aria-busy="true">正在載入內容。</p></Layout>;
  if (definition === undefined || catalog === undefined) return <Layout><PageHeading key={typeId}>內容</PageHeading><p role="alert">{error ?? "內容類型無法載入。"}</p><button ref={reload} onClick={load}>重試</button></Layout>;
  return <Layout confirmNavigate={() => !dirty || window.confirm("內容有未儲存的修改。確定離開並捨棄修改？")}>
    {mode === undefined ? <div className="page-topline"><div><PageHeading key={typeId}>{definition.label}</PageHeading><p className="page-subtitle">管理此類型的內容、搜尋與篩選結果。</p></div><button className="primary-action" type="button" onClick={startCreate} disabled={locked}>建立內容</button></div> : <div className="editor-header"><div><button type="button" onClick={returnToList}>← 返回內容清單</button><h1 id="page-title" ref={editorHeading} tabIndex={-1}>{mode === "create" ? `建立${definition.label}內容` : "編輯內容"}</h1><p>{mode === "edit" ? form?.title : "建立新內容"}</p></div><div className="editor-actions"><span role="status">{dirty ? "有未儲存的修改" : "目前沒有未儲存的修改"}</span>{mode === "edit" && <button className="danger-action" ref={deleteTrigger} type="button" onClick={() => { dialog.current?.showModal(); cancelDelete.current?.focus(); }} disabled={locked}>刪除內容</button>}<button className="primary-action" type="submit" form="entry-editor-form" disabled={locked}>{busy === "save" ? "正在儲存…" : "儲存"}</button></div></div>}
    <PublicNotice />
    {error !== undefined && <p role="alert">{error}</p>}
    {conflict && <><p role="alert">這筆內容已由另一個頁面更新，表單的 baseline 已過期。</p><button ref={reload} onClick={load}>重新載入內容</button></>}
    <p ref={status} role="status" tabIndex={-1} aria-live="polite" aria-atomic="true">{operationStatus}</p>
    {mode === undefined && <section aria-labelledby="entry-catalog-heading">
      <h2 id="entry-catalog-heading" tabIndex={-1}>內容清單</h2>
      <div className="toolbar">
      <label>搜尋標題或 Slug<input value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1); }} /></label>
      <label>狀態<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "all" | "draft" | "published"); setPage(1); }}><option value="all">全部</option><option value="draft">草稿</option><option value="published">已發布</option></select></label>
      <label>分類<select value={filterTaxonomy} onChange={(event) => { setFilterTaxonomy(event.target.value); setFilterTerm(""); setPage(1); }}><option value="">全部</option>{taxonomies.map((taxonomy) => <option key={taxonomy.taxonomy.taxonomyId} value={taxonomy.taxonomy.taxonomyId}>{taxonomy.taxonomy.label}</option>)}</select></label>
      {filterTaxonomy !== "" && <label>Term<select value={filterTerm} onChange={(event) => { setFilterTerm(event.target.value); setPage(1); }}><option value="">全部</option>{taxonomies.find((item) => item.taxonomy.taxonomyId === filterTaxonomy)?.terms.map((term) => <option key={term.termId} value={term.termId}>{term.label}</option>)}</select></label>}
      </div>
      {searchResult === undefined ? <p role="status">正在搜尋內容。</p> : <><p className="result-count">{searchResult.totalItems} 筆結果；第 {searchResult.page}／{Math.max(1, searchResult.totalPages)} 頁</p>{searchResult.items.length === 0 ? <p className="empty-state">沒有符合條件的內容。請調整搜尋或篩選條件。</p> : <table className="responsive-table"><caption>{definition.label}的搜尋結果</caption><thead><tr><th scope="col">標題</th><th scope="col">Slug</th><th scope="col">狀態</th><th scope="col">最後發布</th></tr></thead><tbody>{searchResult.items.map((item) => <tr key={item.entryId}><td data-label="標題"><button className="entry-open" type="button" aria-current={item.entryId === editingEntryId.current ? "true" : undefined} onClick={() => void refreshEntry(item.entryId, true).catch((reason: unknown) => setError(message(reason)))}>{item.title}</button></td><td data-label="Slug">{item.slug}</td><td data-label="狀態">{cptEntryStatusText(item.status)}</td><td data-label="最後發布">{displayDateTime(item.publishedAt)}</td></tr>)}</tbody></table>}<div className="pagination"><p className="result-count">第 {searchResult.page}／{Math.max(1, searchResult.totalPages)} 頁</p><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button><button type="button" disabled={page >= searchResult.totalPages} onClick={() => setPage(page + 1)}>下一頁</button></div></div></>}
    </section>}
    {mode !== undefined && form !== undefined && <section aria-labelledby="page-title">
      <p>{form.blocks.length <= 1 ? "本文以外的區塊會原樣保留。" : `這個內容另有 ${String(form.blocks.length - 1)} 個非本文區塊；儲存時會原樣保留在原本位置。`}</p>
      <form id="entry-editor-form" aria-label="內容編輯" noValidate onSubmit={(event) => void save(event)}>
        <div className="editor-grid"><div className="editor-main">
        <label>標題<input ref={titleInput} required aria-invalid={validationAttempted && form.title.trim() === ""} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={locked} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} disabled={locked} /></label>
        <label>摘要<textarea value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} disabled={locked} /></label>
        <label>本文<textarea className="body-input" ref={bodyInput} required aria-invalid={validationAttempted && form.text.trim() === ""} value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} disabled={locked} /></label>
        {definition !== undefined && <CustomFieldsSection definition={definition} values={form.custom} invalidFieldIds={customErrors} disabled={locked} assets={assets} onChange={(fieldId, value) => setForm({ ...form, custom: value === undefined ? Object.fromEntries(Object.entries(form.custom).filter(([key]) => key !== fieldId)) : { ...form.custom, [fieldId]: value } })} />}
        </div><div className="editor-rail">
        <label>特色媒體<select value={form.featuredMedia} onChange={(event) => setForm({ ...form, featuredMedia: event.target.value })} disabled={locked}><option value="">未選擇</option>{assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{mediaChoiceLabel(asset)}</option>)}</select></label>
        {assets.find((asset) => asset.assetId === form.featuredMedia)?.thumbnail !== null && assets.some((asset) => asset.assetId === form.featuredMedia) && <img className="featured-preview" src={`/cms/media/${form.featuredMedia}/thumbnail`} alt="" />}
        <section aria-labelledby="entry-taxonomy-heading"><h3 id="entry-taxonomy-heading">分類與標籤</h3>{definition.taxonomyAttachments.map((attachment) => { const taxonomy = taxonomies.find((item) => item.taxonomy.taxonomyId === attachment.taxonomyId); if (taxonomy === undefined) return null; const selected = form.taxonomyTerms.filter((item) => item.taxonomyId === attachment.taxonomyId).map((item) => item.termId); return <fieldset key={attachment.taxonomyId} disabled={locked}><legend>{taxonomy.taxonomy.label}{attachment.required ? "（發布時必填）" : ""}</legend>{attachment.cardinality === "one" ? <select aria-label={taxonomy.taxonomy.label} value={selected[0] ?? ""} onChange={(event) => setForm({ ...form, taxonomyTerms: [...form.taxonomyTerms.filter((item) => item.taxonomyId !== attachment.taxonomyId), ...(event.target.value === "" ? [] : [{ taxonomyId: attachment.taxonomyId, termId: event.target.value }])] })}><option value="">未選擇</option>{taxonomy.terms.filter((term) => term.state === "live" || selected.includes(term.termId)).map((term) => <option key={term.termId} value={term.termId}>{term.label}{term.state === "retired" ? "（已停用）" : ""}</option>)}</select> : taxonomy.terms.filter((term) => term.state === "live" || selected.includes(term.termId)).map((term) => <label key={term.termId}><input type="checkbox" checked={selected.includes(term.termId)} onChange={(event) => setForm({ ...form, taxonomyTerms: event.target.checked ? [...form.taxonomyTerms, { taxonomyId: attachment.taxonomyId, termId: term.termId }] : form.taxonomyTerms.filter((item) => item.taxonomyId !== attachment.taxonomyId || item.termId !== term.termId) })} />{term.label}</label>)}{attachment.allowTermCreation && <details className="inline-term-create"><summary>新增 term</summary><div><label>Term 名稱<input value={newTermLabels[attachment.taxonomyId] ?? ""} onChange={(event) => setNewTermLabels((values) => ({ ...values, [attachment.taxonomyId]: event.target.value }))} /></label><button type="button" onClick={() => void createInlineTerm(taxonomy, attachment.cardinality)} disabled={(newTermLabels[attachment.taxonomyId] ?? "").trim() === ""}>建立並選取</button></div></details>}</fieldset>; })}</section>
        <fieldset disabled={locked}><legend>SEO</legend><label>SEO 標題<input value={form.seoTitle} onChange={(event) => setForm({ ...form, seoTitle: event.target.value })} /></label><label>Meta description<textarea value={form.seoDescription} onChange={(event) => setForm({ ...form, seoDescription: event.target.value })} /></label><label>Canonical path<input value={form.canonicalPath} onChange={(event) => setForm({ ...form, canonicalPath: event.target.value })} /></label></fieldset>
        <fieldset disabled={locked}><legend>狀態</legend><label><input type="radio" name="entry-status" checked={form.status === "draft"} onChange={() => setForm({ ...form, status: "draft" })} />草稿</label><label><input type="radio" name="entry-status" checked={form.status === "published"} onChange={() => setForm({ ...form, status: "published" })} />已發布</label></fieldset>
        </div></div>
      </form>
      <dialog ref={dialog} aria-labelledby="delete-dialog-title" onKeyDown={trapDeleteFocus}><h2 id="delete-dialog-title">刪除內容</h2><p>刪除後這筆內容與其 slug 會立即消失，無法復原。</p><button ref={cancelDelete} type="button" onClick={() => { dialog.current?.close(); deleteTrigger.current?.focus(); }} disabled={busy !== undefined}>取消</button><button ref={confirmDelete} type="button" onClick={() => void remove()} disabled={busy !== undefined}>{busy === "delete" ? "正在刪除…" : "確認刪除"}</button></dialog>
    </section>}
  </Layout>;
}
