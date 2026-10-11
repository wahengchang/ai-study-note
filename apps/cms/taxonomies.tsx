import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AUTHORING_RESOURCE_ID_PATTERN, CmsApiError, message, type CmsApiClient, type TaxonomyCatalogDto, type TaxonomySnapshotDto } from "./cms-api.js";
import { Layout, PageHeading } from "./cms-shell.js";
export function TaxonomyList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { state } = useLocation();
  const [catalog, setCatalog] = useState<TaxonomyCatalogDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => { setCatalog(undefined); setError(undefined); void api.taxonomies().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  if (catalog === undefined) return <Layout><PageHeading>分類全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const deleted = typeof state === "object" && state !== null && "deletedTaxonomyId" in state;
  return <Layout><div className="page-topline"><div><PageHeading>分類與標籤</PageHeading><p className="page-subtitle">管理 taxonomy 與各項 term。</p></div><Link className="action-link" to="/cms/taxonomies/new">建立 taxonomy</Link></div>{deleted && <p role="status" aria-live="polite">已刪除 taxonomy。</p>}{catalog.taxonomies.length === 0 ? <p className="empty-state">尚無 taxonomy。<Link to="/cms/taxonomies/new">建立第一個 taxonomy</Link></p> : <table className="responsive-table"><caption>所有分類與標籤</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">模式</th></tr></thead><tbody>{catalog.taxonomies.map(({ taxonomy }) => <tr key={taxonomy.taxonomyId}><td data-label="名稱"><Link to={`/cms/taxonomies/${taxonomy.taxonomyId}`}>{taxonomy.label}</Link></td><td data-label="Slug">{taxonomy.slug}</td><td data-label="模式">{taxonomy.hierarchical ? "階層" : "平面"}</td></tr>)}</tbody></table>}</Layout>;
}

export function TaxonomyNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [hierarchical, setHierarchical] = useState(false);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLabelError(undefined);
    setFormError(undefined);
    if (label.trim() === "") {
      setLabelError("請輸入分類名稱。");
      return;
    }
    setBusy(true);
    try {
      const catalog = await api.taxonomies();
      const created = await api.createTaxonomy({ expectedStateDigest: catalog.stateDigest, label: label.trim(), ...(slug.trim() === "" ? {} : { slug: slug.trim() }), hierarchical });
      navigate(`/cms/taxonomies/${created.taxonomy.taxonomyId}`, { state: { createdTaxonomyId: created.taxonomy.taxonomyId } });
    } catch (reason) {
      const error = message(reason);
      setFormError(error);
    } finally {
      setBusy(false);
    }
  };
  return <Layout><p><Link to="/cms/taxonomies">← 返回分類與標籤</Link></p><PageHeading>建立 taxonomy</PageHeading><p className="page-subtitle">建立後即可在詳情頁管理 term。</p><form aria-label="分類定義" aria-busy={busy} onSubmit={(event) => void submit(event)}><label htmlFor="taxonomy-label">分類名稱<input id="taxonomy-label" required value={label} onChange={(event) => { setLabel(event.target.value); setLabelError(undefined); }} aria-invalid={labelError !== undefined} disabled={busy} /></label><label>Slug（可留空）<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label><label><input type="checkbox" checked={hierarchical} onChange={(event) => setHierarchical(event.target.checked)} disabled={busy} />支援階層</label>{labelError !== undefined && <p role="alert">{labelError}</p>}{formError !== undefined && <p role="alert">{formError}</p>}<p role="status" aria-live="polite" aria-atomic="true">{busy ? "正在建立分類。" : ""}</p><button type="submit" disabled={busy}>{busy ? "正在建立…" : "建立 taxonomy"}</button></form></Layout>;
}

function TaxonomyDefinitionEditor({ snapshot, busy, onSave }: Readonly<{ snapshot: TaxonomySnapshotDto; busy: boolean; onSave: (body: Readonly<Record<string, unknown>>) => Promise<void> }>): React.JSX.Element {
  const [label, setLabel] = useState(snapshot.taxonomy.label);
  const [slug, setSlug] = useState(snapshot.taxonomy.slug);
  const [hierarchical, setHierarchical] = useState(snapshot.taxonomy.hierarchical);
  return <form className="taxonomy-settings-grid" aria-label="編輯分類" onSubmit={(event) => { event.preventDefault(); void onSave({ kind: "replace-taxonomy", label: label.trim(), slug: slug.trim(), hierarchical }); }}><label>分類名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label><label>分類 slug<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label><label><input type="checkbox" checked={hierarchical} onChange={(event) => setHierarchical(event.target.checked)} disabled={busy} />支援階層</label><button disabled={busy || label.trim() === ""}>儲存分類</button></form>;
}

function TaxonomyTermEditor({ term, terms, hierarchical, busy, onSave }: Readonly<{ term: TaxonomySnapshotDto["terms"][number]; terms: TaxonomySnapshotDto["terms"]; hierarchical: boolean; busy: boolean; onSave: (body: Readonly<Record<string, unknown>>) => Promise<void> }>): React.JSX.Element {
  const [label, setLabel] = useState(term.label);
  const [slug, setSlug] = useState(term.slug);
  const [parentTermId, setParentTermId] = useState(term.parentTermId ?? "");
  return <form aria-label={`編輯 term：${term.label}`} onSubmit={(event) => { event.preventDefault(); void onSave({ kind: "replace-term", termId: term.termId, label: label.trim(), slug: slug.trim(), order: term.order, ...(parentTermId === "" ? {} : { parentTermId }), state: term.state }); }}><label>Term 名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label><label>Term slug<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label>{hierarchical && <label>上層 term<select value={parentTermId} onChange={(event) => setParentTermId(event.target.value)} disabled={busy}><option value="">最上層</option>{terms.filter((item) => item.termId !== term.termId && item.state === "live").map((item) => <option key={item.termId} value={item.termId}>{item.label}</option>)}</select></label>}<button disabled={busy || label.trim() === ""}>儲存 term</button></form>;
}

export function TaxonomyDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { taxonomyId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [snapshot, setSnapshot] = useState<TaxonomySnapshotDto>();
  const [error, setError] = useState<string>();
  const [termLabel, setTermLabel] = useState("");
  const [parentTermId, setParentTermId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((): void => {
    if (taxonomyId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(taxonomyId)) {
      setSnapshot(undefined);
      setError("找不到分類。");
      return;
    }
    setSnapshot(undefined);
    setError(undefined); setNotice("");
    void api.taxonomy(taxonomyId).then(setSnapshot).catch((reason: unknown) => setError(reason instanceof CmsApiError && reason.status === 404 ? "找不到分類。" : message(reason)));
  }, [api, taxonomyId]);
  useEffect(load, [load]);
  const command = async (body: Readonly<Record<string, unknown>>): Promise<void> => {
    if (taxonomyId === undefined || snapshot === undefined) return;
    setBusy(true); setError(undefined); setNotice("");
    try { setSnapshot(await api.taxonomyCommand(taxonomyId, { expectedStateDigest: snapshot.stateDigest, ...body })); setTermLabel(""); setNotice("變更已儲存。"); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  };
  if (snapshot === undefined) return <Layout><PageHeading>分類詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const createdTaxonomyId = typeof state === "object" && state !== null && "createdTaxonomyId" in state && typeof state.createdTaxonomyId === "string" ? state.createdTaxonomyId : undefined;
  const selectedTerm = snapshot.terms.find((term) => term.termId === selectedTermId);
  const cancelTermEdit = (): void => { const id = selectedTermId; setSelectedTermId(undefined); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-term-edit="${id}"]`)?.focus()); };
  const deleteTaxonomy = async (): Promise<void> => {
    if (!window.confirm(`確定刪除 taxonomy「${snapshot.taxonomy.label}」？這項操作無法復原。`)) return;
    setBusy(true); setError(undefined); setNotice("");
    try {
      await api.deleteTaxonomy(snapshot.taxonomy.taxonomyId, snapshot.stateDigest);
      navigate("/cms/taxonomies", { state: { deletedTaxonomyId: snapshot.taxonomy.taxonomyId } });
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "TAXONOMY_IN_USE") setError("這個 taxonomy 仍有 term 或被內容類型附掛。請先移除引用，再刪除 taxonomy。");
      else if (reason instanceof CmsApiError && reason.code === "TAXONOMY_STATE_CONFLICT") setError("Taxonomy 已變更，請重新載入後再試。");
      else setError(message(reason));
    } finally { setBusy(false); }
  };
  return <Layout>
    <p><Link to="/cms/taxonomies">← 返回分類與標籤</Link></p>
    <PageHeading>{snapshot.taxonomy.label}</PageHeading>
    <p className="page-subtitle">設定分類並管理下方的 term。</p>
    {createdTaxonomyId === snapshot.taxonomy.taxonomyId && <p role="status" aria-live="polite">已建立分類。</p>}
    {notice !== "" && <p role="status" aria-live="polite">{notice}</p>}
    {error !== undefined && <><p role="alert">{error}</p><button onClick={load}>重新載入</button></>}
    <section aria-labelledby="taxonomy-settings-heading"><h2 id="taxonomy-settings-heading">分類設定</h2><TaxonomyDefinitionEditor key={snapshot.stateDigest} snapshot={snapshot} busy={busy} onSave={command} /><details><summary>識別資訊</summary><dl><dt>Stable ID</dt><dd>{snapshot.taxonomy.taxonomyId}</dd><dt>Slug</dt><dd>{snapshot.taxonomy.slug}</dd><dt>模式</dt><dd>{snapshot.taxonomy.hierarchical ? "階層" : "平面"}</dd></dl></details></section>
    <div className="term-layout">
        <section aria-labelledby="taxonomy-terms"><h2 id="taxonomy-terms">分類項目</h2>{snapshot.terms.length === 0 ? <p className="empty-state">尚無 term。可在右側建立第一個項目。</p> : <table className="responsive-table term-table"><caption>所有 terms</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">上層</th><th scope="col">狀態</th><th scope="col">操作</th></tr></thead><tbody>{snapshot.terms.map((term) => <tr key={term.termId}><td data-label="名稱">{term.label}</td><td data-label="Slug">{term.slug}</td><td data-label="上層">{term.parentTermId === undefined ? "最上層" : snapshot.terms.find((item) => item.termId === term.parentTermId)?.label ?? term.parentTermId}</td><td data-label="狀態">{term.state === "live" ? "使用中" : "已停用"}</td><td data-label="操作"><button type="button" data-term-edit={term.termId} disabled={busy} onClick={() => { setSelectedTermId(term.termId); requestAnimationFrame(() => document.getElementById("edit-term-heading")?.focus()); }}>編輯</button><button type="button" disabled={busy} onClick={() => void command({ kind: "replace-term", termId: term.termId, label: term.label, slug: term.slug, order: term.order, ...(term.parentTermId === undefined ? {} : { parentTermId: term.parentTermId }), state: term.state === "live" ? "retired" : "live" })}>{term.state === "live" ? "停用" : "重新啟用"}</button><button className="danger-action" type="button" disabled={busy} onClick={() => { if (window.confirm(`確定刪除「${term.label}」？這項操作無法復原。`)) { if (selectedTermId === term.termId) setSelectedTermId(undefined); void command({ kind: "delete-term", termId: term.termId }); } }}>刪除</button></td></tr>)}</tbody></table>}</section>
      <aside className="term-editor-panel">
        {selectedTerm !== undefined && <section aria-labelledby="edit-term-heading"><h2 id="edit-term-heading" tabIndex={-1}>編輯 term：{selectedTerm.label}</h2><TaxonomyTermEditor key={selectedTerm.termId} term={selectedTerm} terms={snapshot.terms} hierarchical={snapshot.taxonomy.hierarchical} busy={busy} onSave={command} /><button type="button" onClick={cancelTermEdit}>取消編輯</button></section>}
        <section aria-labelledby="new-term-heading"><h2 id="new-term-heading">建立新 term</h2><form onSubmit={(event) => { event.preventDefault(); void command({ kind: "create-term", label: termLabel.trim(), order: snapshot.terms.length, ...(parentTermId === "" ? {} : { parentTermId }) }); }}><label>名稱<input value={termLabel} onChange={(event) => setTermLabel(event.target.value)} disabled={busy} /></label>{snapshot.taxonomy.hierarchical && <label>上層 term<select value={parentTermId} onChange={(event) => setParentTermId(event.target.value)} disabled={busy}><option value="">最上層</option>{snapshot.terms.filter((term) => term.state === "live").map((term) => <option key={term.termId} value={term.termId}>{term.label}</option>)}</select></label>}<button disabled={busy || termLabel.trim() === ""}>建立 term</button></form></section>
      </aside>
    </div>
    <section aria-label="刪除 taxonomy"><h2>刪除 taxonomy</h2>{snapshot.taxonomy.taxonomyId === "00000000-0000-4000-8000-000000000002" || snapshot.taxonomy.taxonomyId === "00000000-0000-4000-8000-000000000003" ? <p>分類與標籤是系統 taxonomy，無法刪除。</p> : <><p>只有沒有 term 且未被內容類型附掛的 taxonomy 可以刪除。刪除後無法復原。</p><button className="danger-action" type="button" disabled={busy} onClick={() => void deleteTaxonomy()}>刪除 taxonomy</button></>}</section>
  </Layout>;
}
