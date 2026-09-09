import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";

import type { EntryDetailDto, EntryListDto, PreviewDocumentDto } from "../transport-contracts.js";
import { getEntry, listContentTypes, listEntries, previewEntry, publishEntry, saveEntry } from "./cms-api.js";
import type { AuthoringSession } from "./authoring-session.js";
import { SessionGate } from "./session-gate.js";
import "./tokens.css";

type CmsRoute = Readonly<{ page: "home" | "entries" | "new" }> | Readonly<{ page: "detail"; entryId: string }>;
type PreviewSelection = "current" | "published";
type ArticleDraft = Readonly<{ title: string; body: string }>;
type WorkspaceDialog = Readonly<{ kind: "publish" }> | Readonly<{ kind: "discard"; path: string }>;

const ARTICLE_SCHEMA = Object.freeze({ schemaId: "article", version: 1 });
const EMPTY_ARTICLE: ArticleDraft = Object.freeze({ title: "", body: "" });

function routeFor(pathname: string): CmsRoute {
  if (pathname === "/cms/entries") return { page: "entries" };
  if (pathname === "/cms/entries/new") return { page: "new" };
  const matched = /^\/cms\/entries\/([^/]+)$/u.exec(pathname);
  const rawEntryId = matched?.[1];
  if (rawEntryId !== undefined && !rawEntryId.includes("%") && rawEntryId.length > 0) return { page: "detail", entryId: rawEntryId };
  return { page: "home" };
}

function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}


function articleDraft(value: unknown): ArticleDraft | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("contract" in value) || !("title" in value) || !("blocks" in value)) return undefined;
  if (value.contract !== "site-content/v1" || typeof value.title !== "string" || !Array.isArray(value.blocks)) return undefined;
  for (const block of value.blocks) {
    if (typeof block === "object" && block !== null && !Array.isArray(block) && "kind" in block && "text" in block && block.kind === "article" && typeof block.text === "string") return { title: value.title, body: block.text };
  }
  return undefined;
}

function articleContent(draft: ArticleDraft): Readonly<{ contract: "site-content/v1"; title: string; blocks: readonly Readonly<{ kind: "article"; text: string }>[] }> {
  return { contract: "site-content/v1", title: draft.title, blocks: [{ kind: "article", text: draft.body }] };
}

function draftSignature(entryId: string, entryRoute: string, draft: ArticleDraft): string {
  return JSON.stringify({ entryId, entryRoute, title: draft.title, body: draft.body });
}

function isArticleSchema(value: { schemaId: string; version: number }): boolean {
  return value.schemaId === ARTICLE_SCHEMA.schemaId && value.version === ARTICLE_SCHEMA.version;
}

function CmsWorkspace({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const [route, setRoute] = useState<CmsRoute>(() => routeFor(location.pathname));
  const [entries, setEntries] = useState<EntryListDto["items"]>([]);
  const [detail, setDetail] = useState<EntryDetailDto>();
  const [detailError, setDetailError] = useState<string>();
  const [detailRequest, setDetailRequest] = useState(0);
  const [articleAvailable, setArticleAvailable] = useState(false);
  const [status, setStatus] = useState("正在載入內容。");
  const [error, setError] = useState<string>();
  const [entryId, setEntryId] = useState("");
  const [entryRoute, setEntryRoute] = useState("/");
  const [draft, setDraft] = useState<ArticleDraft>(EMPTY_ARTICLE);
  const [savedSignature, setSavedSignature] = useState(() => draftSignature("", "/", EMPTY_ARTICLE));
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection>("current");
  const [preview, setPreview] = useState<PreviewDocumentDto>();
  const [previewError, setPreviewError] = useState<string>();
  const [previewRequest, setPreviewRequest] = useState(0);
  const [dialog, setDialog] = useState<WorkspaceDialog>();
  const [pendingAction, setPendingAction] = useState<"save" | "publish">();
  const heading = useRef<HTMLHeadingElement>(null);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  const workspaceRoot = useRef<HTMLDivElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const currentTab = useRef<HTMLButtonElement>(null);
  const publishedTab = useRef<HTMLButtonElement>(null);
  const focusAfterDialog = useRef<"publish" | "status" | undefined>(undefined);

  const activeEntryId = route.page === "detail" ? route.entryId : route.page === "new" ? entryId.trim() : "";
  const dirty = (route.page === "detail" || route.page === "new") && draftSignature(activeEntryId, entryRoute, draft) !== savedSignature;

  const navigate = (path: string): void => {
    if (path === location.pathname) return;
    history.pushState(null, "", path);
    setRoute(routeFor(path));
  };

  const requestNavigation = (path: string): void => {
    if (path === location.pathname) return;
    if (dirty) {
      setDialog({ kind: "discard", path });
      return;
    }
    navigate(path);
  };

  useEffect(() => {
    const onPopState = (): void => setRoute(routeFor(location.pathname));
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    heading.current?.focus();
  }, [route]);
  useEffect(() => {
    const root = workspaceRoot.current;
    if (dialog === undefined || root === null) return;
    root.setAttribute("inert", "");
    return () => root.removeAttribute("inert");
  }, [dialog]);
  useEffect(() => {
    const destination = focusAfterDialog.current;
    if (dialog !== undefined || destination === undefined) return;
    focusAfterDialog.current = undefined;
    requestAnimationFrame(() => (destination === "publish" ? publishButton : statusMessage).current?.focus());
  }, [dialog]);

  useEffect(() => {
    if (error !== undefined) errorMessage.current?.focus();
  }, [error]);

  useEffect(() => {
    let active = true;
    void Promise.all([listEntries(session), listContentTypes(session)]).then(([entryResponse, typeResponse]) => {
      if (!active) return;
      setEntries(entryResponse.items);
      setArticleAvailable(typeResponse.items.some((item) => isArticleSchema(item.schemaIdentity)));
      setStatus(`${entryResponse.items.length} 個內容項目已載入。`);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "無法載入 CMS 資料。");
    });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (route.page === "new") {
      setDetail(undefined);
      setDetailError(undefined);
      setPreview(undefined);
      setPreviewError(undefined);
      setEntryId("");
      setEntryRoute("/");
      setDraft(EMPTY_ARTICLE);
      setSavedSignature(draftSignature("", "/", EMPTY_ARTICLE));
      setError(undefined);
      return;
    }
    if (route.page !== "detail") {
      setDetail(undefined);
      setDetailError(undefined);
      setPreview(undefined);
      setPreviewError(undefined);
      setError(undefined);
      return;
    }
    let active = true;
    setDetail(undefined);
    setDetailError(undefined);
    setPreview(undefined);
    setPreviewError(undefined);
    setError(undefined);
    void getEntry(session, route.entryId).then((response) => {
      if (!active) return;
      const nextDraft = articleDraft(response.current.content);
      if (!isArticleSchema(response.current.schemaIdentity) || nextDraft === undefined) {
        const message = "這不是可由 Article v1 工作台編輯的內容版本。";
        setDetailError(message);
        setError(message);
        return;
      }
      setDetail(response);
      setEntryId(response.entryId);
      setEntryRoute(response.current.route);
      setDraft(nextDraft);
      setSavedSignature(draftSignature(response.entryId, response.current.route, nextDraft));
      setStatus(`已開啟 ${response.entryId}。`);
    }).catch((reason: unknown) => {
      if (active) {
        const message = reason instanceof Error ? reason.message : "無法載入內容項目。";
        setDetailError(message);
        setError(message);
      }
    });
    return () => { active = false; };
  }, [detailRequest, route, session]);

  useEffect(() => {
    if (detail === undefined) return;
    if (previewSelection === "published" && detail.published === undefined) {
      setPreviewSelection("current");
      return;
    }
    let active = true;
    setPreview(undefined);
    setPreviewError(undefined);
    void previewEntry(session, { contract: "preview-request/v1", selection: previewSelection, subject: { entryId: detail.entryId } }).then((response) => {
      if (active) setPreview(response);
    }).catch((reason: unknown) => {
      if (active) {
        const message = reason instanceof Error ? reason.message : "無法建立預覽。";
        setPreviewError(message);
        setError(message);
      }
    });
    return () => { active = false; };
  }, [detail, previewRequest, previewSelection, session]);

  const follow = (event: MouseEvent<HTMLAnchorElement>, path: string): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    requestNavigation(path);
  };

  const refreshEntry = async (id: string): Promise<void> => {
    const [nextDetail, nextEntries] = await Promise.all([getEntry(session, id), listEntries(session)]);
    setDetail(nextDetail);
    setEntries(nextEntries.items);
    const nextDraft = articleDraft(nextDetail.current.content);
    if (!isArticleSchema(nextDetail.current.schemaIdentity) || nextDraft === undefined) throw new Error("伺服器回傳的目前版本不是 Article v1。");
    setEntryRoute(nextDetail.current.route);
    setDraft(nextDraft);
    setSavedSignature(draftSignature(id, nextDetail.current.route, nextDraft));
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const id = route.page === "new" ? entryId.trim() : detail?.entryId;
    if (id === undefined || !/^[A-Za-z0-9._~-]+$/u.test(id)) {
      setError("內容 ID 僅可使用英數字、.、_、-、~。");
      return;
    }
    if (!articleAvailable && route.page === "new") {
      setError("Article v1 內容類型尚未可用。");
      return;
    }
    setError(undefined);
    setPendingAction("save");
    setStatus("正在儲存版本。");
    try {
      await saveEntry(session, id, {
        contract: "save-revision-request/v1",
        revisionId: newId("revision"),
        operationId: newId("save"),
        schemaIdentity: ARTICLE_SCHEMA,
        content: articleContent(draft),
        route: entryRoute,
        assetVersions: [],
      });
      setStatus("版本已儲存，正在更新目前預覽。");
      if (route.page === "new") {
        setSavedSignature(draftSignature(id, entryRoute, draft));
        navigate(`/cms/entries/${encodeURIComponent(id)}`);
      } else {
        await refreshEntry(id);
      }
      setStatus("版本已儲存；目前版本預覽已更新。");
      statusMessage.current?.focus();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "無法儲存版本。");
    } finally {
      setPendingAction(undefined);
    }
  };

  const publish = async (): Promise<void> => {
    if (detail === undefined) return;
    setError(undefined);
    setPendingAction("publish");
    setStatus("正在發佈目前版本。");
    try {
      await publishEntry(session, detail.entryId, {
        contract: "publish-revision-request/v1",
        expectedCurrentRevisionId: detail.current.revisionId,
        operationId: newId("publish"),
      });
      await refreshEntry(detail.entryId);
      setPreviewSelection("published");
      setStatus("目前版本已發佈；僅更新本機 published pointer。");
      focusAfterDialog.current = "status";
      setDialog(undefined);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "無法發佈版本。");
    } finally {
      setPendingAction(undefined);
    }
  };

  const selectPreview = (selection: PreviewSelection, focus = false): void => {
    setPreviewSelection(selection);
    if (focus) requestAnimationFrame(() => (selection === "current" ? currentTab : publishedTab).current?.focus());
  };

  const onPreviewKeys = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (detail === undefined) return;
    const choices: readonly PreviewSelection[] = detail.published === undefined ? ["current"] : ["current", "published"];
    const index = choices.indexOf(previewSelection);
    const choose = (position: number): void => {
      const selection = choices.at(position);
      if (selection !== undefined) selectPreview(selection, true);
    };
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      choose((index + 1) % choices.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      choose((index + choices.length - 1) % choices.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      choose(0);
    } else if (event.key === "End") {
      event.preventDefault();
      choose(choices.length - 1);
    }
  };

  const onDialogKeys = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      focusAfterDialog.current = "publish";
      setDialog(undefined);
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    const first = controls[0];
    const last = controls.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirmDialog = (): void => {
    if (dialog?.kind === "publish") {
      void publish();
      return;
    }
    if (dialog?.kind === "discard") {
      setSavedSignature(draftSignature(activeEntryId, entryRoute, draft));
      setDialog(undefined);
      navigate(dialog.path);
    }
  };

  const currentPath = route.page === "detail" ? `/cms/entries/${encodeURIComponent(route.entryId)}` : route.page === "entries" ? "/cms/entries" : route.page === "new" ? "/cms/entries/new" : "/cms";
  const headingText = route.page === "home" ? "CMS 工作台" : route.page === "entries" ? "內容目錄" : route.page === "new" ? "建立 Article 草稿" : detailError === undefined ? detail?.entryId ?? "載入內容中" : "無法載入內容";

  return <>
    <div ref={workspaceRoot} className="cms-shell">
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <header className="cms-header">
      <a className="cms-brand" href="/cms" onClick={(event) => follow(event, "/cms")}>CMS 工作台</a>
      <nav aria-label="CMS 導覽">
        <a aria-current={currentPath === "/cms" ? "page" : undefined} href="/cms" onClick={(event) => follow(event, "/cms")}>首頁</a>
        <a aria-current={currentPath === "/cms/entries" ? "page" : undefined} href="/cms/entries" onClick={(event) => follow(event, "/cms/entries")}>內容</a>
        <a aria-current={currentPath === "/cms/entries/new" ? "page" : undefined} href="/cms/entries/new" onClick={(event) => follow(event, "/cms/entries/new")}>建立文章</a>
      </nav>
    </header>
    <p ref={statusMessage} className="visually-hidden" role="status" aria-live="polite" tabIndex={-1}>{status}</p>
    {error === undefined ? null : <p ref={errorMessage} className="cms-error" role="alert" tabIndex={-1}>{error}</p>}
    <main id="main-content" tabIndex={-1}>
      <h1 ref={heading} tabIndex={-1}>{headingText}</h1>
      {route.page === "home" ? <section aria-labelledby="home-actions">
        <p>管理 Article 草稿、目前預覽與已發佈版本。</p>
        <div className="cms-actions">
          <a className="button-link" href="/cms/entries/new" onClick={(event) => follow(event, "/cms/entries/new")}>建立文章</a>
          <a href="/cms/entries" onClick={(event) => follow(event, "/cms/entries")}>查看所有內容</a>
        </div>
        <h2 id="home-actions">最近內容</h2>
        <EntryList entries={entries} follow={follow} />
      </section> : null}
      {route.page === "entries" ? <section aria-labelledby="entry-catalog-actions">
        <p id="entry-catalog-actions"><a className="button-link" href="/cms/entries/new" onClick={(event) => follow(event, "/cms/entries/new")}>建立新的 Article 草稿</a></p>
        <EntryList entries={entries} follow={follow} />
      </section> : null}
      {route.page === "new" ? <section aria-label="Article 草稿編輯器">
        <p>Article v1 以標題與文章 block 建立結構化內容。</p>
        {articleAvailable ? <ArticleForm entryId={entryId} entryRoute={entryRoute} draft={draft} creating pending={pendingAction === "save"} onEntryId={setEntryId} onRoute={setEntryRoute} onTitle={(title) => setDraft((current) => ({ ...current, title }))} onBody={(body) => setDraft((current) => ({ ...current, body }))} onSubmit={save} /> : <p className="cms-error" role="alert">Article v1 內容類型尚未可用，無法建立草稿。</p>}
      </section> : null}
      {route.page === "detail" ? <section aria-label="Article 編輯器">
        {detail === undefined ? detailError === undefined ? <p aria-busy="true">正在載入版本。</p> : <section aria-label="內容讀取失敗"><p>無法載入此內容項目。</p><button type="button" onClick={() => setDetailRequest((current) => current + 1)}>重新載入內容</button></section> : <div className="workspace-layout">
          <section className="editor-pane" aria-label="Article 編輯">
            <ArticleForm entryId={detail.entryId} entryRoute={entryRoute} draft={draft} pending={pendingAction === "save"} onEntryId={setEntryId} onRoute={setEntryRoute} onTitle={(title) => setDraft((current) => ({ ...current, title }))} onBody={(body) => setDraft((current) => ({ ...current, body }))} onSubmit={save} />
          </section>
          <aside className="workspace-sidebar" aria-label="版本與發佈動作">
            <h2>版本狀態</h2>
            <p>目前版本：<code>{detail.current.revisionId}</code></p>
            <p>{detail.published === undefined ? "尚未發佈。" : <>已發佈版本：<code>{detail.published.revisionId}</code></>}</p>
            <section className="cms-preview" aria-labelledby="preview-heading">
              <h2 id="preview-heading">預覽</h2>
              <div role="tablist" aria-label="預覽版本">
                <button ref={currentTab} id="current-tab" type="button" role="tab" aria-selected={previewSelection === "current"} aria-controls="preview-panel" tabIndex={previewSelection === "current" ? 0 : -1} onKeyDown={onPreviewKeys} onClick={() => selectPreview("current")}>目前版本</button>
                <button ref={publishedTab} id="published-tab" type="button" role="tab" aria-selected={previewSelection === "published"} aria-controls="preview-panel" tabIndex={previewSelection === "published" ? 0 : -1} disabled={detail.published === undefined} onKeyDown={onPreviewKeys} onClick={() => selectPreview("published")}>已發佈版本</button>
              </div>
              <div id="preview-panel" role="tabpanel" aria-labelledby={`${previewSelection}-tab`}>
                {previewError !== undefined ? <><p>{previewError}</p><button type="button" onClick={() => setPreviewRequest((current) => current + 1)}>重新建立預覽</button></> : preview === undefined ? <p aria-busy="true">正在建立預覽。</p> : <iframe title={previewSelection === "current" ? "目前版本預覽" : "已發佈版本預覽"} sandbox="" srcDoc={preview.document} />}
              </div>
            </section>
            {dirty ? <p>請先儲存變更，才能發佈目前版本。</p> : null}
            <button ref={publishButton} type="button" disabled={pendingAction !== undefined || dirty} onClick={() => setDialog({ kind: "publish" })}>發佈目前版本</button>
          </aside>
        </div>}
      </section> : null}
    </main>
    <footer>CMS 僅限本機授權工作階段。</footer>
    </div>
    {dialog === undefined ? null : createPortal(<div className="cms-dialog-backdrop">
      <section className="cms-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" onKeyDown={onDialogKeys}>
        <h2 id="dialog-title">{dialog.kind === "publish" ? "確認發佈" : "捨棄未儲存變更？"}</h2>
        <p id="dialog-description">{dialog.kind === "publish" ? <>要發佈目前版本 <code>{detail?.current.revisionId}</code> 嗎？這只會移動本機 published pointer，不會 build、release 或 deploy。</> : "離開後會捨棄目前尚未儲存的變更。"}</p>
        <div className="cms-actions">
          <button autoFocus type="button" disabled={pendingAction !== undefined} onClick={confirmDialog}>{dialog.kind === "publish" ? "確認發佈" : "捨棄並離開"}</button>
          <button type="button" disabled={pendingAction !== undefined} onClick={() => { focusAfterDialog.current = "publish"; setDialog(undefined); }}>取消</button>
        </div>
      </section>
    </div>, document.body)}
  </>;
}

function EntryList({ entries, follow }: Readonly<{ entries: EntryListDto["items"]; follow: (event: MouseEvent<HTMLAnchorElement>, path: string) => void }>): React.JSX.Element {
  if (entries.length === 0) return <p>尚無內容項目。建立第一篇 Article 草稿後會顯示於此。</p>;
  return <ul className="entry-list">{entries.map((entry) => <li key={entry.entryId}>
    <a href={`/cms/entries/${encodeURIComponent(entry.entryId)}`} onClick={(event) => follow(event, `/cms/entries/${encodeURIComponent(entry.entryId)}`)}>{entry.entryId}</a>
    <span>目前：<code>{entry.currentRevisionId}</code></span>
    <span>{entry.publishedRevisionId === undefined ? "未發佈" : <>已發佈：<code>{entry.publishedRevisionId}</code></>}</span>
  </li>)}</ul>;
}

function ArticleForm({ entryId, entryRoute, draft, creating = false, pending, onEntryId, onRoute, onTitle, onBody, onSubmit }: Readonly<{ entryId: string; entryRoute: string; draft: ArticleDraft; creating?: boolean; pending: boolean; onEntryId: (value: string) => void; onRoute: (value: string) => void; onTitle: (value: string) => void; onBody: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>): React.JSX.Element {
  return <form className="entry-form" onSubmit={onSubmit} aria-busy={pending}>
    <label htmlFor="entry-id">內容 ID</label>
    <input id="entry-id" value={entryId} disabled={!creating || pending} required onChange={(event) => onEntryId(event.currentTarget.value)} />
    <label htmlFor="entry-title">標題</label>
    <input id="entry-title" value={draft.title} disabled={pending} required onChange={(event) => onTitle(event.currentTarget.value)} />
    <label htmlFor="entry-route">路由</label>
    <input id="entry-route" value={entryRoute} disabled={pending} required onChange={(event) => onRoute(event.currentTarget.value)} />
    <label htmlFor="article-body">文章 block</label>
    <textarea id="article-body" value={draft.body} disabled={pending} required rows={12} onChange={(event) => onBody(event.currentTarget.value)} />
    <button type="submit" disabled={pending}>{pending ? "正在儲存版本" : "儲存版本"}</button>
  </form>;
}

export function startCms(ticket: string | undefined): void {
  const root = document.getElementById("root");
  if (root === null) return;
  createRoot(root).render(<SessionGate ticket={ticket}>{(session) => <CmsWorkspace session={session} />}</SessionGate>);
}
