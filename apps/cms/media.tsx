import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AUTHORING_RESOURCE_ID_PATTERN, CmsApiError, message, type CmsApiClient, type MediaAssetDetailV2Dto, type MediaAssetV2Dto, type MediaCatalogV2Dto, type MediaImportMetadata, type MediaUsageV2Dto } from "./cms-api.js";
import { Layout, PageHeading } from "./cms-shell.js";
type MediaMetadataFields = Readonly<{ title: string; slug: string; altText: string; caption: string; description: string }>;
function mediaFields(asset: MediaAssetV2Dto): MediaMetadataFields {
  return { title: asset.title, slug: asset.slug, altText: asset.altText ?? "", caption: asset.caption, description: asset.description };
}

/**
 * `media-import-metadata/v2` 要求 title 非空，表單留白時以檔名墊上；slug 留白則由 server 依 title 推導。
 * Replace 必須明確帶回目前 slug，否則同一 asset 會被要求重新配置一次 slug。
 */
function mediaImportMetadata(fields: MediaMetadataFields, filename: string, slug: string | undefined = undefined): MediaImportMetadata {
  const title = fields.title.trim() === "" ? filename : fields.title.trim();
  return { contract: "media-import-metadata/v2", title, ...(slug === undefined ? {} : { slug }), altText: fields.altText === "" ? null : fields.altText, caption: fields.caption, description: fields.description };
}
function MediaUsageList({ usage }: Readonly<{ usage: readonly MediaUsageV2Dto[] }>): React.JSX.Element {
  return <ul aria-label="媒體引用">{usage.map((item) => <li key={item.entryId}>{`${item.entryId}（${item.status === "published" ? "已發布" : "草稿"}）`}</li>)}</ul>;
}

function MediaAssetEvidence({ asset }: Readonly<{ asset: MediaAssetV2Dto }>): React.JSX.Element {
  return <dl>
    <dt>Asset ID</dt><dd className="breakable">{asset.assetId}</dd>
    <dt>Slug</dt><dd>{asset.slug}</dd>
    <dt>Alt 文字</dt><dd>{asset.altText ?? "未設定"}</dd>
    <dt>Caption</dt><dd>{asset.caption === "" ? "未設定" : asset.caption}</dd>
    <dt>Description</dt><dd>{asset.description === "" ? "未設定" : asset.description}</dd>
    <dt>原始檔名</dt><dd>{asset.originalFilename}</dd>
    <dt>MIME type</dt><dd>{asset.mimeType}</dd>
    <dt>檔案大小</dt><dd>{asset.byteLength}</dd>
    <dt>Checksum</dt><dd className="breakable">{asset.checksum}</dd>
    <dt>影像尺寸</dt><dd>{asset.image === null ? "非影像" : `${asset.image.width} × ${asset.image.height}`}</dd>
    <dt>上傳時間</dt><dd>{asset.uploadedAt}</dd>
    <dt>縮圖</dt><dd className="breakable">{asset.thumbnail === null ? "僅提供 metadata" : <><img src={`/cms/media/${asset.assetId}/thumbnail`} alt="" width={asset.thumbnail.width} height={asset.thumbnail.height} />{`${asset.thumbnail.width} × ${asset.thumbnail.height}／${asset.thumbnail.byteLength} bytes／${asset.thumbnail.digest}`}</>}</dd>
  </dl>;
}

function MediaAssetList({ assets }: Readonly<{ assets: readonly MediaAssetV2Dto[] }>): React.JSX.Element {
  return <ul className="media-grid" aria-label="媒體 asset">{assets.map((asset) => <li key={asset.assetId}><article className="media-card" aria-labelledby={`media-asset-${asset.assetId}`}>{asset.thumbnail === null ? <div className="media-placeholder">沒有縮圖</div> : <img src={`/cms/media/${asset.assetId}/thumbnail`} alt="" width={asset.thumbnail.width} height={asset.thumbnail.height} />}<h3 id={`media-asset-${asset.assetId}`}><Link to={`/cms/media/${asset.assetId}`}>{asset.title}</Link></h3><p>{asset.originalFilename}<br />{asset.mimeType} · {(asset.byteLength / 1024).toFixed(1)} KB</p></article></li>)}</ul>;
}

export function MediaList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { state } = useLocation();
  const [catalog, setCatalog] = useState<MediaCatalogV2Dto>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => { setCatalog(undefined); setError(undefined); void api.listMedia().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  const deletedSlug = typeof state === "object" && state !== null && "deletedSlug" in state && typeof state.deletedSlug === "string" ? state.deletedSlug : undefined;
  if (catalog === undefined) return <Layout><PageHeading>媒體庫</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入媒體庫。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><div className="page-topline"><div><PageHeading>媒體庫</PageHeading><p className="page-subtitle">瀏覽媒體預覽與檔案資訊。</p></div><Link className="action-link" to="/cms/media/import">匯入媒體</Link></div>{deletedSlug !== undefined && <p role="status" aria-live="polite" aria-atomic="true">{`已刪除 asset 並釋放 slug：${deletedSlug}。`}</p>}{catalog.items.length === 0 ? <p className="empty-state">尚無媒體。<Link to="/cms/media/import">匯入第一個媒體檔案</Link></p> : <><p role="status" aria-live="polite" aria-atomic="true">{`共 ${catalog.items.length} 個 asset。`}</p><MediaAssetList assets={catalog.items} /></>}</Layout>;
}

type MediaImportStatus = "waiting" | "uploading" | "done" | "cancelled" | "failed";
type MediaImportItem = Readonly<{ id: string; file: File; status: MediaImportStatus; sent: number; progressTotal: number; failure: string | undefined; assetId: string | undefined }>;

/** 契約允許任意多檔案，但同時 in-flight 的上傳固定為兩個；其餘留在 waiting 由 render 迴圈補位。 */
const MEDIA_IMPORT_CONCURRENCY = 2;

function mediaImportStatusText(item: MediaImportItem): string {
  switch (item.status) {
    case "waiting": return "等待中";
    case "uploading": return `上傳中 ${item.progressTotal === 0 ? 100 : Math.min(100, Math.floor((item.sent / item.progressTotal) * 100))}%`;
    case "done": return "已完成";
    case "cancelled": return "已取消";
    case "failed": return "失敗";
  }
}

export function MediaImport({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [fields, setFields] = useState<MediaMetadataFields>({ title: "", slug: "", altText: "", caption: "", description: "" });
  const [items, setItems] = useState<readonly MediaImportItem[]>([]);
  const [catalog, setCatalog] = useState<MediaCatalogV2Dto>();
  const aborts = useRef(new Map<string, AbortController>());
  const patch = useCallback((id: string, next: Partial<MediaImportItem>): void => { setItems((current) => current.map((item) => item.id === id ? { ...item, ...next } : item)); }, []);
  const refreshCatalog = useCallback((): void => { void api.listMedia().then(setCatalog).catch(() => setCatalog(undefined)); }, [api]);
  const upload = useCallback(async (item: MediaImportItem): Promise<void> => {
    const controller = new AbortController();
    aborts.current.set(item.id, controller);
    try {
      const asset = await api.uploadMedia(null, null, item.file, mediaImportMetadata(fields, item.file.name), { onProgress: (sent, progressTotal) => patch(item.id, { sent, progressTotal }), signal: controller.signal });
      patch(item.id, { status: "done", assetId: asset.assetId });
      refreshCatalog();
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CMS_REQUEST_ABORTED") patch(item.id, { status: "cancelled" });
      else patch(item.id, { status: "failed", failure: message(reason) });
    } finally { aborts.current.delete(item.id); }
  }, [api, fields, patch, refreshCatalog]);
  // 佇列推進：每次 render 只補一個 waiting 項目，讓同時 in-flight 數穩定收斂在上限內。
  useEffect(() => {
    if (items.filter((item) => item.status === "uploading").length >= MEDIA_IMPORT_CONCURRENCY) return;
    const next = items.find((item) => item.status === "waiting");
    if (next === undefined) return;
    patch(next.id, { status: "uploading", sent: 0, progressTotal: next.file.size, failure: undefined });
    void upload(next);
  }, [items, patch, upload]);
  const select = (files: FileList | null): void => {
    if (files === null || files.length === 0) return;
    // FileList 是 live view：先取出 File snapshot，之後清空 input value 才不會讓佇列變成空的。
    const selected = Array.from(files);
    setItems((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, status: "waiting" as MediaImportStatus, sent: 0, progressTotal: file.size, failure: undefined, assetId: undefined }))]);
  };
  const cancel = (item: MediaImportItem): void => {
    if (item.status === "waiting") patch(item.id, { status: "cancelled" });
    else aborts.current.get(item.id)?.abort();
  };
  // 重試一律回到 waiting：新的 AbortController、新的 XHR、byte 0 起算，沒有 Range 或 resume。
  const retry = (item: MediaImportItem): void => { patch(item.id, { status: "waiting", sent: 0, progressTotal: item.file.size, failure: undefined }); };
  const importedIds = new Set(items.flatMap((item) => item.assetId === undefined ? [] : [item.assetId]));
  const imported = (catalog?.items ?? []).filter((asset) => importedIds.has(asset.assetId));
  return <Layout>
    <PageHeading>匯入媒體</PageHeading>
    <form aria-label="媒體上傳設定" onSubmit={(event) => event.preventDefault()}>
      <fieldset><legend>上傳 metadata</legend><p>留白時以檔名作為標題，server 會依標題推導 slug；alt 留白代表未設定。</p>
        <label htmlFor="media-import-title">標題<input id="media-import-title" value={fields.title} onChange={(event) => setFields((current) => ({ ...current, title: event.target.value }))} /></label>
        <label htmlFor="media-import-alt">Alt 文字<input id="media-import-alt" value={fields.altText} onChange={(event) => setFields((current) => ({ ...current, altText: event.target.value }))} /></label>
        <label htmlFor="media-import-caption">Caption<input id="media-import-caption" value={fields.caption} onChange={(event) => setFields((current) => ({ ...current, caption: event.target.value }))} /></label>
        <label htmlFor="media-import-description">Description<textarea id="media-import-description" value={fields.description} onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))} /></label>
      </fieldset>
      <label htmlFor="media-import-files">媒體檔案<input id="media-import-files" type="file" multiple onChange={(event) => { select(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
    </form>
    <section aria-labelledby="media-import-queue-heading">
      <h2 id="media-import-queue-heading">上傳佇列</h2>
      <p>{`同時最多 ${MEDIA_IMPORT_CONCURRENCY} 個上傳；其餘項目等待中。`}</p>
      {items.length === 0 ? <p className="empty-state">尚未選擇檔案。</p> : <ul className="media-import-list" aria-label="上傳項目">{items.map((item) => <li key={item.id}><article aria-labelledby={`media-import-${item.id}-name`}><h3 id={`media-import-${item.id}-name`}>{item.file.name}</h3><p role="status" aria-live="polite" aria-atomic="true">{mediaImportStatusText(item)}</p><progress value={item.status === "done" ? item.file.size : item.sent} max={Math.max(1, item.file.size)} aria-label={`${item.file.name} 上傳進度`} /><div><button type="button" onClick={() => cancel(item)} disabled={item.status === "done" || item.status === "cancelled" || item.status === "failed"}>取消</button><button type="button" onClick={() => retry(item)} disabled={item.status !== "cancelled" && item.status !== "failed"}>重試</button></div>{item.failure !== undefined && <p role="alert">{item.failure}</p>}</article></li>)}</ul>}
    </section>
    {imported.length > 0 && <section aria-labelledby="media-import-library-heading"><h2 id="media-import-library-heading">已匯入的 asset（重新載入的媒體庫）</h2><MediaAssetList assets={imported} /></section>}
  </Layout>;
}

export function MediaDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MediaAssetDetailV2Dto>();
  const [fields, setFields] = useState<MediaMetadataFields>();
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<"title" | "slug", string | undefined>>>({ title: undefined, slug: undefined });
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<Readonly<{ message: string; usage: readonly MediaUsageV2Dto[] }>>();
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<"save" | "replace" | "delete">();
  const [replaceFile, setReplaceFile] = useState<File>();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const confirmDelete = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const load = useCallback((): void => {
    if (assetId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(assetId)) { setError("找不到媒體 asset。"); return; }
    setDetail(undefined); setFields(undefined); setError(undefined); setConflict(false); setNotice(""); setFailure(undefined);
    void api.getMedia(assetId).then((value) => { setDetail(value); setFields(mediaFields(value.asset)); }).catch((reason: unknown) => setError(reason instanceof CmsApiError && reason.status === 404 ? "找不到媒體 asset。" : message(reason)));
  }, [api, assetId]);
  useEffect(load, [load]);
  const applyFailure = (reason: unknown): void => {
    const usage = reason instanceof CmsApiError ? reason.usage : [];
    // 409 的 usage evidence 比初次讀取更完整：引用是後來的操作建立的，畫面必須立刻改為鎖定破壞性操作。
    if (usage.length > 0) setDetail((current) => current === undefined ? current : { ...current, usage: [...usage] });
    setFailure({ message: message(reason), usage });
  };
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (detail === undefined || fields === undefined) return;
    const next = { title: fields.title.trim() === "" ? "請輸入標題。" : undefined, slug: fields.slug.trim() === "" ? "請輸入 slug。" : undefined };
    setFieldErrors(next);
    if (next.title !== undefined || next.slug !== undefined) return;
    setBusy("save"); setFailure(undefined); setNotice("");
    try {
      const asset = await api.saveMediaMetadata({ assetId: detail.asset.assetId, expectedStateDigest: detail.asset.stateDigest, title: fields.title.trim(), slug: fields.slug.trim(), altText: fields.altText === "" ? null : fields.altText, caption: fields.caption, description: fields.description });
      setDetail({ contract: "media-asset-detail/v2", asset, usage: detail.usage });
      setFields(mediaFields(asset));
      setNotice("已儲存。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else applyFailure(reason);
    } finally { setBusy(undefined); }
  };
  const replace = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (detail === undefined || fields === undefined) return;
    if (replaceFile === undefined) { setFailure({ message: "請選擇替換檔案。", usage: [] }); return; }
    setBusy("replace"); setFailure(undefined); setNotice("");
    try {
      const asset = await api.uploadMedia(detail.asset.assetId, detail.asset.stateDigest, replaceFile, mediaImportMetadata(fields, replaceFile.name, detail.asset.slug));
      setDetail({ contract: "media-asset-detail/v2", asset, usage: detail.usage });
      setFields(mediaFields(asset));
      setReplaceFile(undefined);
      setNotice("已替換媒體 bytes。");
    } catch (reason) { applyFailure(reason); } finally { setBusy(undefined); }
  };
  const remove = async (): Promise<void> => {
    if (detail === undefined) return;
    setBusy("delete"); setFailure(undefined); setNotice("");
    try {
      const receipt = await api.deleteMedia({ assetId: detail.asset.assetId, expectedStateDigest: detail.asset.stateDigest });
      dialog.current?.close();
      void navigate("/cms/media", { state: { deletedSlug: receipt.releasedSlug } });
    } catch (reason) { dialog.current?.close(); applyFailure(reason); } finally { setBusy(undefined); }
  };
  const openDelete = (): void => { setFailure(undefined); dialog.current?.showModal(); cancelDelete.current?.focus(); };
  const closeDelete = (): void => { dialog.current?.close(); deleteTrigger.current?.focus(); };
  const trapDeleteFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelDelete.current) { event.preventDefault(); confirmDelete.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirmDelete.current) { event.preventDefault(); cancelDelete.current?.focus(); }
  };
  if (detail === undefined || fields === undefined) return <Layout><PageHeading>媒體詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入媒體。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const referenced = detail.usage.length > 0;
  const locked = busy !== undefined || conflict;
  return <Layout>
    <p><Link to="/cms/media">← 返回媒體庫</Link></p>
    <PageHeading>{detail.asset.title}</PageHeading>
    <p className="page-subtitle">{detail.asset.originalFilename} · {detail.asset.mimeType} · {(detail.asset.byteLength / 1024).toFixed(1)} KB</p>
    {notice !== "" && <p role="status" aria-live="polite" aria-atomic="true">{notice}</p>}
    {conflict && <><p role="alert">媒體 metadata 已由另一個頁面更新。</p><button type="button" onClick={load}>重新載入</button></>}
    {failure !== undefined && <div role="alert"><p>{failure.message}</p>{failure.usage.length > 0 && <><p>目前引用：</p><MediaUsageList usage={failure.usage} /></>}</div>}
    <div className="media-detail-grid"><aside className="media-detail-preview">
      {detail.asset.thumbnail === null ? <div className="media-placeholder">沒有縮圖</div> : <img src={`/cms/media/${detail.asset.assetId}/thumbnail`} alt={detail.asset.altText ?? detail.asset.title} width={detail.asset.thumbnail.width} height={detail.asset.thumbnail.height} />}
      <section aria-labelledby="media-usage-heading"><h2 id="media-usage-heading">引用狀態</h2>{referenced ? <><p>此 asset 仍被下列 entry 引用，替換與刪除已停用。</p><MediaUsageList usage={detail.usage} /></> : <p>目前沒有 entry 引用此 asset，可替換或刪除。</p>}</section>
    </aside><div>
    <section aria-labelledby="media-metadata-heading">
      <h2 id="media-metadata-heading">Metadata</h2>
      <form aria-label="媒體 metadata" noValidate aria-busy={busy === "save"} onSubmit={(event) => void save(event)}>
        <label htmlFor="media-metadata-title">標題<input id="media-metadata-title" required aria-invalid={fieldErrors.title !== undefined} aria-describedby={fieldErrors.title === undefined ? undefined : "media-metadata-title-error"} value={fields.title} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, title: event.target.value })} disabled={locked || conflict} /></label>
        {fieldErrors.title !== undefined && <p id="media-metadata-title-error" role="alert">{fieldErrors.title}</p>}
        <label htmlFor="media-metadata-slug">Slug<input id="media-metadata-slug" required aria-invalid={fieldErrors.slug !== undefined} aria-describedby={fieldErrors.slug === undefined ? undefined : "media-metadata-slug-error"} value={fields.slug} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, slug: event.target.value })} disabled={locked || conflict} /></label>
        {fieldErrors.slug !== undefined && <p id="media-metadata-slug-error" role="alert">{fieldErrors.slug}</p>}
        <label htmlFor="media-metadata-alt">Alt 文字<input id="media-metadata-alt" value={fields.altText} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, altText: event.target.value })} disabled={locked || conflict} /></label>
        <label htmlFor="media-metadata-caption">Caption<input id="media-metadata-caption" value={fields.caption} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, caption: event.target.value })} disabled={locked || conflict} /></label>
        <label htmlFor="media-metadata-description">Description<textarea id="media-metadata-description" value={fields.description} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, description: event.target.value })} disabled={locked || conflict} /></label>
        <button type="submit" disabled={locked || conflict}>{busy === "save" ? "正在儲存…" : "儲存"}</button>
      </form>
    </section>
    <details><summary>完整檔案資訊</summary><MediaAssetEvidence asset={detail.asset} /></details>
    <section aria-labelledby="media-replace-heading">
      <h2 id="media-replace-heading">替換 bytes</h2>
      <p>替換會保留 stable asset ID 與 slug，只更新 bytes、尺寸與 checksum。</p>
      <form aria-label="媒體替換" onSubmit={(event) => void replace(event)}>
        <label htmlFor="media-replace-file">替換檔案<input id="media-replace-file" type="file" onChange={(event) => setReplaceFile(event.currentTarget.files?.[0])} disabled={locked || referenced} /></label>
        <button type="submit" disabled={locked || referenced}>{busy === "replace" ? "正在替換…" : "替換 bytes"}</button>
      </form>
    </section>
    <section aria-labelledby="media-delete-heading">
      <h2 id="media-delete-heading">刪除 asset</h2>
      <p>刪除會釋出 bytes、縮圖與 slug，且無法復原。</p>
      <button ref={deleteTrigger} type="button" onClick={openDelete} disabled={locked || referenced}>刪除 asset</button>
    </section>
    </div></div>
    <dialog ref={dialog} aria-labelledby="media-delete-dialog-title" aria-describedby="media-delete-dialog-description" onKeyDown={trapDeleteFocus}><h2 id="media-delete-dialog-title">刪除媒體 asset</h2><p id="media-delete-dialog-description">{`將刪除「${detail.asset.title}」並釋放 slug ${detail.asset.slug}。`}</p><button ref={cancelDelete} type="button" onClick={closeDelete} disabled={locked}>取消</button><button ref={confirmDelete} type="button" onClick={() => void remove()} disabled={locked}>{busy === "delete" ? "正在刪除…" : "確認刪除"}</button></dialog>
  </Layout>;
}
