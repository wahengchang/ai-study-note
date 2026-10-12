import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CmsApiError, message, type CmsApiClient, type ContentFieldKind, type ContentTypeCatalogDto, type ContentTypeDto, type TaxonomyAttachment, type TaxonomyCatalogDto } from "./cms-api.js";
import { contentTypeDisplayOrder, draftKey, fieldGroupsIssues, fieldGroupsRequest, fieldKindLabels, groupDraftsOf, isMediaKind, isSelectKind, isTextKind, moveWithin, type FieldDraft, type FieldGroupDraft } from "./content-type-model.js";
import { ContentTypeCatalogContext, Layout, PageHeading } from "./cms-shell.js";
function newFieldDraft(): FieldDraft {
  return { key: draftKey(), fieldId: undefined, kind: "text", label: "", help: "", required: false, showInGenericTemplate: false, minLength: "", maxLength: "", minimum: "", maximum: "", mimeTypes: "", maxItems: "", options: [], defaultText: "", defaultBoolean: "unset", defaultOptionKey: "", defaultOptionKeys: [] };
}

function newGroupDraft(): FieldGroupDraft {
  return { key: draftKey(), groupId: undefined, label: "", help: "", fields: [] };
}

/** 切換 kind 會清掉不適用的 draft 狀態，避免把上一個 kind 的 constraints 或 default 送出。 */
function fieldDraftWithKind(field: FieldDraft, kind: ContentFieldKind): FieldDraft {
  const keepsOptions = isSelectKind(kind) && isSelectKind(field.kind);
  return { ...field, kind, minLength: "", maxLength: "", minimum: "", maximum: "", mimeTypes: "", maxItems: "", options: keepsOptions ? field.options : [], defaultText: "", defaultBoolean: "unset", defaultOptionKey: "", defaultOptionKeys: [] };
}

/**
 * Content Type Builder 的欄位群組編輯器。state 由呼叫端的 `definition`／response 導出並以 stateDigest
 * 為 key 掛載，因此 CAS token 與 payload 永遠同源，server 配置的 stable ID 也會在儲存後立刻回到 draft。
 */
function ContentTypeFieldGroupsEditor({ groups, issues, disabled, onChange }: Readonly<{ groups: readonly FieldGroupDraft[]; issues: ReadonlyMap<string, string>; disabled: boolean; onChange: (next: readonly FieldGroupDraft[]) => void }>): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");
  const moveFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = moveFocus.current;
    if (key === undefined || !groups.some((group) => group.key === key.split("\u0000")[0])) return;
    document.querySelector<HTMLElement>(`[data-move-key="${key}"]`)?.focus();
  }, [groups]);
  const nameOf = (value: string): string => value.trim() === "" ? "未命名" : value.trim();
  const issueId = (key: string): string => `${key}-issue`;
  const issueFor = (key: string): React.JSX.Element | undefined => { const text = issues.get(key); return text === undefined ? undefined : <p id={issueId(key)} className="field-issue">{text}</p>; };
  const issueKeys = (key: string): string | undefined => issues.get(key) === undefined ? undefined : issueId(key);
  const groupAt = (index: number): FieldGroupDraft | undefined => groups[index];
  const replaceGroup = (index: number, next: FieldGroupDraft): void => onChange(groups.map((group, position) => position === index ? next : group));
  const replaceField = (groupIndex: number, fieldIndex: number, next: FieldDraft): void => {
    const group = groupAt(groupIndex);
    if (group === undefined) return;
    replaceGroup(groupIndex, { ...group, fields: group.fields.map((field, position) => position === fieldIndex ? next : field) });
  };
  const moveGroup = (index: number, delta: number): void => { const next = moveWithin(groups, index, delta); if (next === groups) return; moveFocus.current = `${groups[index]!.key}\u0000group`; onChange(next); setAnnouncement(`群組「${nameOf(groups[index]!.label)}」已移至第 ${index + delta + 1} 位。`); };
  const moveField = (groupIndex: number, fieldIndex: number, delta: number): void => { const group = groupAt(groupIndex); if (group === undefined) return; const next = moveWithin(group.fields, fieldIndex, delta); if (next === group.fields) return; moveFocus.current = `${group.key}\u0000${group.fields[fieldIndex]!.key}`; replaceGroup(groupIndex, { ...group, fields: next }); setAnnouncement(`欄位「${nameOf(group.fields[fieldIndex]!.label)}」已移至第 ${fieldIndex + delta + 1} 位。`); };
  const moveOption = (groupIndex: number, fieldIndex: number, optionIndex: number, delta: number): void => { const group = groupAt(groupIndex); const field = group?.fields[fieldIndex]; if (group === undefined || field === undefined) return; const next = moveWithin(field.options, optionIndex, delta); if (next === field.options) return; moveFocus.current = `${group.key}\u0000${field.key}\u0000${field.options[optionIndex]!.key}`; replaceField(groupIndex, fieldIndex, { ...field, options: next }); setAnnouncement(`選項「${nameOf(field.options[optionIndex]!.label)}」已移至第 ${optionIndex + delta + 1} 位。`); };
  return <section aria-labelledby="field-groups-heading">
    <h2 id="field-groups-heading">欄位群組</h2>
    <p>群組、欄位與選項的順序就是 CMS 編輯器的呈現順序；stable ID 由 server 配置，儲存後才會顯示。</p>
    <p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {groups.map((group, groupIndex) => <fieldset key={group.key} className="field-group">
      <legend>{nameOf(group.label)}</legend>
      <label>群組名稱<input value={group.label} aria-invalid={issues.has(group.key)} aria-describedby={issueKeys(group.key)} onChange={(event) => replaceGroup(groupIndex, { ...group, label: event.target.value })} disabled={disabled} /></label>
      <label>群組說明<textarea value={group.help} onChange={(event) => replaceGroup(groupIndex, { ...group, help: event.target.value })} disabled={disabled} /></label>
      {issueFor(group.key)}
      <p>
        <button type="button" data-move-key={`${group.key}\u0000group`} aria-label={`將群組「${nameOf(group.label)}」上移`} onClick={() => moveGroup(groupIndex, -1)} disabled={disabled || groupIndex === 0}>上移</button>
        <button type="button" aria-label={`將群組「${nameOf(group.label)}」下移`} onClick={() => moveGroup(groupIndex, 1)} disabled={disabled || groupIndex === groups.length - 1}>下移</button>
        <button type="button" aria-label={`刪除群組「${nameOf(group.label)}」`} onClick={() => onChange(groups.filter((_, position) => position !== groupIndex))} disabled={disabled}>刪除群組</button>
      </p>
      {group.fields.map((field, fieldIndex) => <fieldset key={field.key} className="field-definition">
        <legend>{nameOf(field.label)}</legend>
        <label>欄位名稱<input value={field.label} aria-invalid={issues.has(field.key)} aria-describedby={issueKeys(field.key)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, label: event.target.value })} disabled={disabled} /></label>
        <label>欄位類型<select value={field.kind} onChange={(event) => replaceField(groupIndex, fieldIndex, fieldDraftWithKind(field, event.target.value as ContentFieldKind))} disabled={disabled}>{(Object.keys(fieldKindLabels) as ContentFieldKind[]).map((kind) => <option key={kind} value={kind}>{fieldKindLabels[kind]}</option>)}</select></label>
        <label>欄位說明<textarea value={field.help} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, help: event.target.value })} disabled={disabled} /></label>
        <p><label><input type="checkbox" checked={field.required} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, required: event.target.checked })} disabled={disabled} />必填</label> <label><input type="checkbox" checked={field.showInGenericTemplate} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, showInGenericTemplate: event.target.checked })} disabled={disabled} />顯示於一般模板（僅意圖）</label></p>
        {isTextKind(field.kind) && <p><label>最小長度<input type="number" value={field.minLength} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, minLength: event.target.value })} disabled={disabled} /></label> <label>最大長度<input type="number" value={field.maxLength} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maxLength: event.target.value })} disabled={disabled} /></label></p>}
        {field.kind === "number" && <p><label>最小值<input type="number" value={field.minimum} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, minimum: event.target.value })} disabled={disabled} /></label> <label>最大值<input type="number" value={field.maximum} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maximum: event.target.value })} disabled={disabled} /></label></p>}
        {isMediaKind(field.kind) && <p><label>允許的 MIME types（每行一個）<textarea value={field.mimeTypes} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, mimeTypes: event.target.value })} disabled={disabled} /></label>{field.kind === "multi-media" && <label>數量上限<input type="number" value={field.maxItems} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maxItems: event.target.value })} disabled={disabled} /></label>}</p>}
        {isSelectKind(field.kind) && <fieldset>
          <legend>選項</legend>
          {field.options.map((option, optionIndex) => <p key={option.key}>
            <label>選項名稱<input value={option.label} aria-invalid={issues.has(`${field.key}:${option.key}`)} aria-describedby={issueKeys(`${field.key}:${option.key}`)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, options: field.options.map((candidate, position) => position === optionIndex ? { ...candidate, label: event.target.value } : candidate) })} disabled={disabled} /></label>
            <button type="button" data-move-key={`${group.key}\u0000${field.key}\u0000${option.key}`} aria-label={`將選項「${nameOf(option.label)}」上移`} onClick={() => moveOption(groupIndex, fieldIndex, optionIndex, -1)} disabled={disabled || optionIndex === 0}>上移</button>
            <button type="button" aria-label={`將選項「${nameOf(option.label)}」下移`} onClick={() => moveOption(groupIndex, fieldIndex, optionIndex, 1)} disabled={disabled || optionIndex === field.options.length - 1}>下移</button>
            <button type="button" aria-label={`刪除選項「${nameOf(option.label)}」`} onClick={() => replaceField(groupIndex, fieldIndex, { ...field, options: field.options.filter((_, position) => position !== optionIndex), defaultOptionKey: field.defaultOptionKey === option.key ? "" : field.defaultOptionKey, defaultOptionKeys: field.defaultOptionKeys.filter((key) => key !== option.key) })} disabled={disabled}>刪除選項</button>
          </p>)}
          <button type="button" onClick={() => replaceField(groupIndex, fieldIndex, { ...field, options: [...field.options, { key: draftKey(), optionId: undefined, label: "" }] })} disabled={disabled}>新增選項</button>
          {field.kind === "single-select"
            ? <label>預設值<select value={field.defaultOptionKey} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultOptionKey: event.target.value })} disabled={disabled}><option value="">未設定</option>{field.options.map((option) => <option key={option.key} value={option.key}>{nameOf(option.label)}</option>)}</select></label>
            : <fieldset><legend>預設值</legend>{field.options.length === 0 ? <p>尚無選項。</p> : field.options.map((option) => <label key={option.key}><input type="checkbox" checked={field.defaultOptionKeys.includes(option.key)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultOptionKeys: event.target.checked ? [...field.defaultOptionKeys, option.key] : field.defaultOptionKeys.filter((key) => key !== option.key) })} disabled={disabled} />{nameOf(option.label)}</label>)}</fieldset>}
        </fieldset>}
        {!isSelectKind(field.kind) && (field.kind === "boolean"
          ? <label>預設值<select value={field.defaultBoolean} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultBoolean: event.target.value as FieldDraft["defaultBoolean"] })} disabled={disabled}><option value="unset">未設定</option><option value="true">是</option><option value="false">否</option></select></label>
          : <label>{field.kind === "multi-media" ? "預設值（每行一個 asset ID）" : "預設值（留白代表未設定）"}{field.kind === "multi-media" ? <textarea value={field.defaultText} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultText: event.target.value })} disabled={disabled} /> : <input type={field.kind === "number" || field.kind === "date" ? (field.kind === "number" ? "number" : "date") : "text"} value={field.defaultText} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultText: event.target.value })} disabled={disabled} />}</label>)}
        {issueFor(field.key)}
        <p>
          <button type="button" data-move-key={`${group.key}\u0000${field.key}`} aria-label={`將欄位「${nameOf(field.label)}」上移`} onClick={() => moveField(groupIndex, fieldIndex, -1)} disabled={disabled || fieldIndex === 0}>上移</button>
          <button type="button" aria-label={`將欄位「${nameOf(field.label)}」下移`} onClick={() => moveField(groupIndex, fieldIndex, 1)} disabled={disabled || fieldIndex === group.fields.length - 1}>下移</button>
          <button type="button" aria-label={`刪除欄位「${nameOf(field.label)}」`} onClick={() => replaceGroup(groupIndex, { ...group, fields: group.fields.filter((_, position) => position !== fieldIndex) })} disabled={disabled}>刪除欄位</button>
        </p>
      </fieldset>)}
      <button type="button" onClick={() => replaceGroup(groupIndex, { ...group, fields: [...group.fields, newFieldDraft()] })} disabled={disabled}>新增欄位</button>
    </fieldset>)}
    <button type="button" onClick={() => onChange([...groups, newGroupDraft()])} disabled={disabled}>新增欄位群組</button>
  </section>;
}

export function ContentTypeList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { state } = useLocation();
  const [catalog, setCatalog] = useState<ContentTypeCatalogDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => { setCatalog(undefined); setError(undefined); void api.contentTypes().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  if (catalog === undefined) return <Layout><PageHeading>內容類型全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const deleted = typeof state === "object" && state !== null && "deletedTypeId" in state;
  return <Layout><div className="page-topline"><div><PageHeading>內容類型</PageHeading><p className="page-subtitle">設定內容結構與編輯欄位。</p></div><Link className="action-link" to="/cms/content-types/new">建立內容類型</Link></div>{deleted && <p role="status" aria-live="polite">已刪除內容類型。</p>}{catalog.items.length === 0 ? <p className="empty-state">尚無內容類型。</p> : <table className="responsive-table"><caption>所有內容類型</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">排序</th><th scope="col">選單</th></tr></thead><tbody>{contentTypeDisplayOrder(catalog.items).map((item) => <tr key={item.typeId}><td data-label="名稱"><Link to={`/cms/content-types/${item.typeId}`}>{item.label}</Link></td><td data-label="Slug">{item.slug}</td><td data-label="排序">{item.order}</td><td data-label="選單">{item.showInMenu ? "顯示" : "隱藏"}</td></tr>)}</tbody></table>}</Layout>;
}

function TaxonomyAttachmentsEditor({ catalog, attachments, disabled, onChange }: Readonly<{ catalog: TaxonomyCatalogDto | undefined; attachments: readonly TaxonomyAttachment[]; disabled: boolean; onChange: (next: readonly TaxonomyAttachment[]) => void }>): React.JSX.Element {
  const available = catalog?.taxonomies ?? [];
  const fixedIds = new Set(["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
  const update = (taxonomyId: string, change: Partial<TaxonomyAttachment>): void => onChange(attachments.map((item) => item.taxonomyId === taxonomyId ? { ...item, ...change } : item));
  return <fieldset disabled={disabled || catalog === undefined}><legend>分類附掛</legend>{catalog === undefined ? <p>正在載入分類。</p> : available.length === 0 ? <p>尚無分類。請先建立 taxonomy。</p> : available.map(({ taxonomy }) => {
    const selected = attachments.find((item) => item.taxonomyId === taxonomy.taxonomyId);
    const fixed = fixedIds.has(taxonomy.taxonomyId);
    return <div key={taxonomy.taxonomyId} className="custom-field"><label><input type="checkbox" checked={fixed || selected !== undefined} disabled={fixed} onChange={(event) => onChange(event.target.checked ? [...attachments, { taxonomyId: taxonomy.taxonomyId, cardinality: "many", required: false, allowTermCreation: false }] : attachments.filter((item) => item.taxonomyId !== taxonomy.taxonomyId))} />附加 {taxonomy.label}{fixed ? "（固定）" : ""}</label>{selected !== undefined && !fixed && <div><label>{taxonomy.label}選取數量<select aria-label={`${taxonomy.label}選取數量`} value={selected.cardinality} onChange={(event) => update(taxonomy.taxonomyId, { cardinality: event.target.value as "one" | "many" })}><option value="one">單選</option><option value="many">多選</option></select></label><label><input type="checkbox" checked={selected.required} onChange={(event) => update(taxonomy.taxonomyId, { required: event.target.checked })} />發布時必填</label><label><input type="checkbox" checked={selected.allowTermCreation} onChange={(event) => update(taxonomy.taxonomyId, { allowTermCreation: event.target.checked })} />允許在編輯器建立 term</label></div>}</div>;
  })}</fieldset>;
}

export function ContentTypeNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const catalogContext = useContext(ContentTypeCatalogContext);
  const catalog = catalogContext?.catalog;
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [help, setHelp] = useState("");
  const [order, setOrder] = useState("0");
  const [showInMenu, setShowInMenu] = useState(true);
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [drafts, setDrafts] = useState<readonly FieldGroupDraft[]>([]);
  const [taxonomies, setTaxonomies] = useState<TaxonomyCatalogDto>();
  const [attachments, setAttachments] = useState<readonly TaxonomyAttachment[]>([]);
  useEffect(() => { void api.taxonomies().then(setTaxonomies).catch((reason: unknown) => setError(message(reason))); }, [api]);
  const issues = useMemo(() => fieldGroupsIssues(drafts), [drafts]);
  const blocked = issues.size > 0;
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (catalog === undefined || label.trim() === "") { setError("請輸入內容類型名稱。"); return; }
    if (blocked) { setError(`欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。`); return; }
    try {
      const created = await api.createContentType({ contract: "content-type-create-request/v1", expectedStateDigest: catalog.stateDigest, label, ...(slug === "" ? {} : { slug }), help, order: Number(order), showInMenu, fieldGroups: fieldGroupsRequest(drafts), taxonomyAttachments: attachments });
      setError(undefined); setStale(false);
      await catalogContext?.refresh();
      navigate(`/cms/content-types/${created.typeId}`);
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型清單已由其他操作更新；請重新載入後再試。"); setStale(true); }
      else { setError(message(reason)); setStale(false); }
    }
  };
  const reload = (): void => { setError(undefined); setStale(false); void catalogContext?.refresh().catch((reason: unknown) => setError(message(reason))); };
  return <Layout><p><Link to="/cms/content-types">← 返回內容類型</Link></p><PageHeading>建立內容類型</PageHeading><p className="page-subtitle">先設定基本資訊，再新增欄位群組與欄位。</p>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}<form aria-label="Content Type 定義" onSubmit={(event) => void submit(event)}><section aria-labelledby="type-settings-heading"><h2 id="type-settings-heading">基本設定</h2><div className="builder-general"><label>名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Slug（選填）<input value={slug} onChange={(event) => setSlug(event.target.value)} /></label><label>說明<textarea value={help} onChange={(event) => setHelp(event.target.value)} /></label><label>排序<input type="number" value={order} onChange={(event) => setOrder(event.target.value)} /></label><label><input type="checkbox" checked={showInMenu} onChange={(event) => setShowInMenu(event.target.checked)} />顯示於選單</label></div></section><ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={catalog === undefined} onChange={setDrafts} /><TaxonomyAttachmentsEditor catalog={taxonomies} attachments={attachments} disabled={catalog === undefined} onChange={setAttachments} /><button disabled={catalog === undefined || taxonomies === undefined || blocked} type="submit">建立內容類型</button></form></Layout>;
}

type ContentTypeFormSubmission = Readonly<{ label: string; slug: string; help: string; order: number; showInMenu: boolean; fieldGroups: readonly unknown[]; taxonomyAttachments: readonly TaxonomyAttachment[] }>;

/**
 * Builder 的定義表單。以 `definition.stateDigest` 為 key 掛載，因此 draft 一定由目前 definition 導出，
 * 儲存成功後也一定由 response 重建；CAS token 與 payload 不會來自兩個不同來源。
 */
function ContentTypeDefinitionForm({ definition, taxonomyCatalog, busy, onSubmit }: Readonly<{ definition: ContentTypeDto; taxonomyCatalog: TaxonomyCatalogDto | undefined; busy: boolean; onSubmit: (submission: ContentTypeFormSubmission) => Promise<void> }>): React.JSX.Element {
  const [drafts, setDrafts] = useState<readonly FieldGroupDraft[]>(() => groupDraftsOf(definition.fieldGroups));
  const [attachments, setAttachments] = useState<readonly TaxonomyAttachment[]>(definition.taxonomyAttachments);
  const [localError, setLocalError] = useState<string>();
  const issues = useMemo(() => fieldGroupsIssues(drafts), [drafts]);
  const blocked = issues.size > 0;
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "");
    const slug = String(form.get("slug") ?? "");
    const metadataIssue = label.trim() === "" ? "請輸入內容類型名稱。" : slug.trim() === "" ? "請輸入內容類型 slug。" : undefined;
    setLocalError(metadataIssue);
    if (metadataIssue !== undefined || blocked) return;
    void onSubmit({ label, slug, help: String(form.get("help") ?? ""), order: Number(form.get("order")), showInMenu: form.has("showInMenu"), fieldGroups: fieldGroupsRequest(drafts), taxonomyAttachments: attachments });
  };
  const alert = localError ?? (blocked ? `欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。` : undefined);
  return <form aria-label="Content Type 定義" aria-busy={busy} noValidate onSubmit={submit}>
    <section aria-labelledby="type-settings-heading"><h2 id="type-settings-heading">基本設定</h2><div className="builder-general">
    <label>名稱<input name="label" required defaultValue={definition.label} disabled={busy} /></label>
    <label>Slug<input name="slug" required defaultValue={definition.slug} disabled={busy} /></label>
    <label>說明<textarea name="help" defaultValue={definition.help} disabled={busy} /></label>
    <label>排序<input name="order" type="number" defaultValue={definition.order} disabled={busy} /></label>
    <label><input name="showInMenu" type="checkbox" defaultChecked={definition.showInMenu} disabled={busy} />顯示於選單</label>
    </div></section>
    <ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={busy} onChange={setDrafts} />
    <TaxonomyAttachmentsEditor catalog={taxonomyCatalog} attachments={attachments} disabled={busy} onChange={setAttachments} />
    {alert !== undefined && <p role="alert">{alert}</p>}
    <p><button type="submit" disabled={busy || blocked}>{busy ? "正在儲存…" : "儲存內容類型"}</button></p>
  </form>;
}

export function ContentTypeDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { typeId } = useParams();
  const navigate = useNavigate();
  const catalogContext = useContext(ContentTypeCatalogContext);
  const [definition, setDefinition] = useState<ContentTypeDto>();
  const [taxonomies, setTaxonomies] = useState<TaxonomyCatalogDto>();
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const load = useCallback((): void => { if (typeId === undefined) { setError("找不到內容類型。"); return; } setDefinition(undefined); setError(undefined); setStale(false); setStatus(undefined); void Promise.all([api.contentType(typeId), api.taxonomies()]).then(([nextDefinition, nextTaxonomies]) => { setDefinition(nextDefinition); setTaxonomies(nextTaxonomies); }).catch((reason: unknown) => setError(message(reason))); }, [api, typeId]);
  useEffect(load, [load]);
  if (definition === undefined) return <Layout><PageHeading>內容類型詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const submit = async (submission: ContentTypeFormSubmission): Promise<void> => {
    setBusy(true); setStatus(undefined);
    try {
      const replaced = await api.replaceContentType(definition.typeId, { contract: "content-type-replace-request/v1", expectedStateDigest: definition.stateDigest, label: submission.label, slug: submission.slug, help: submission.help, order: submission.order, showInMenu: submission.showInMenu, fieldGroups: submission.fieldGroups, taxonomyAttachments: submission.taxonomyAttachments });
      await catalogContext?.refresh();
      setDefinition(replaced);
      setError(undefined);
      setStale(false);
      setStatus("已儲存內容類型。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型已由其他操作更新；請重新載入後再試。"); setStale(true); }
      else if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_BREAKING_CHANGE") setError("這個內容類型已有內容，只能新增 optional 欄位、增加選項或放寬限制。");
      else if (reason instanceof CmsApiError && reason.code === "INVALID_CONTENT_TYPE_DEFINITION") setError(`${reason.remediation}請檢查欄位名稱、說明、限制與選項設定。`);
      else setError(message(reason));
    } finally { setBusy(false); }
  };
  const reload = (): void => { load(); queueMicrotask(() => document.getElementById("page-title")?.focus()); };
  const deleteType = async (): Promise<void> => {
    if (!window.confirm(`確定刪除內容類型「${definition.label}」？這項操作無法復原。`)) return;
    setBusy(true); setError(undefined); setStatus(undefined);
    try {
      await api.deleteContentType(definition.typeId, definition.stateDigest);
      void catalogContext?.refresh().catch(() => undefined);
      navigate("/cms/content-types", { state: { deletedTypeId: definition.typeId } });
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_IN_USE") setError("這個內容類型仍有內容。請先刪除其內容，再刪除類型。");
      else if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型已變更，請重新載入後再試。"); setStale(true); }
      else setError(message(reason));
    } finally { setBusy(false); }
  };
  return <Layout><p><Link to="/cms/content-types">← 返回內容類型</Link></p><PageHeading>編輯內容類型：{definition.label}</PageHeading><p className="page-subtitle">管理此類型的欄位結構與設定。</p>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}{status !== undefined && <p role="status" aria-live="polite">{status}</p>}<ContentTypeDefinitionForm key={definition.stateDigest} definition={definition} taxonomyCatalog={taxonomies} busy={busy} onSubmit={submit} /><details><summary>識別資訊</summary><dl><dt>Stable ID</dt><dd>{definition.typeId}</dd><dt>Slug</dt><dd>{definition.slug}</dd><dt>System fields</dt><dd>{definition.systemFields.join(", ")}</dd></dl><p>欄位群組：{definition.fieldGroups.length}；分類附掛：{definition.taxonomyAttachments.length}</p></details><section aria-label="刪除內容類型"><h2>刪除內容類型</h2>{definition.typeId === "00000000-0000-4000-8000-000000000001" ? <p>文章是系統內容類型，無法刪除。</p> : <><p>只有沒有任何內容的類型可以刪除。刪除後無法復原。</p><button className="danger-action" type="button" disabled={busy || stale} onClick={() => void deleteType()}>刪除內容類型</button></>}</section></Layout>;
}
