import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FiFileText, FiHome, FiImage, FiMenu, FiSliders, FiTag, FiX } from "react-icons/fi";
import { contentTypeDisplayOrder } from "./content-type-model.js";
import type { CmsApiClient, ContentTypeCatalogDto } from "./cms-api.js";
type ContentTypeCatalogContextValue = Readonly<{ catalog: ContentTypeCatalogDto | undefined; refresh: () => Promise<void> }>;
export const ContentTypeCatalogContext = createContext<ContentTypeCatalogContextValue | undefined>(undefined);

export function ContentTypeCatalogProvider({ api, children }: Readonly<{ api: CmsApiClient; children: React.ReactNode }>): React.JSX.Element {
  const [catalog, setCatalog] = useState<ContentTypeCatalogDto>();
  const refresh = useCallback(async (): Promise<void> => { setCatalog(await api.contentTypes()); }, [api]);
  useEffect(() => { void refresh().catch(() => setCatalog(undefined)); }, [refresh]);
  const value = useMemo(() => ({ catalog, refresh }), [catalog, refresh]);
  return <ContentTypeCatalogContext.Provider value={value}>{children}</ContentTypeCatalogContext.Provider>;
}


export function PageHeading({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { heading.current?.focus(); }, [pathname]);
  return <h1 ref={heading} id="page-title" tabIndex={-1}>{children}</h1>;
}

export function Layout({ children, confirmNavigate }: Readonly<{ children: React.ReactNode; confirmNavigate?: () => boolean }>): React.JSX.Element {
  const catalog = useContext(ContentTypeCatalogContext);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuItems = contentTypeDisplayOrder(catalog?.catalog?.items ?? []).filter((item) => item.showInMenu);
  // 動態內容選單以路徑中的 typeId 判定 active，避免每個項目同時亮起。
  const activeTypeId = location.pathname.startsWith("/cms/content/") ? location.pathname.slice("/cms/content/".length) : undefined;
  const guardNavigation = (event: React.MouseEvent<HTMLAnchorElement>): void => { if (confirmNavigate !== undefined && !confirmNavigate()) event.preventDefault(); };
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 801px)");
    const closeOnDesktop = (): void => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    sidebar.current?.querySelector<HTMLElement>("nav a")?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { setMenuOpen(false); menuTrigger.current?.focus(); }
      if (event.key === "Tab") {
        const links = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("nav a") ?? []);
        if (links.length === 0) return;
        if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  const nav = <nav aria-label="CMS 導覽">
    <p className="nav-group">工作區</p>
    <NavLink to="/cms" end onClick={guardNavigation}><FiHome size={20} aria-hidden="true" />工作台</NavLink>
    <p className="nav-group">內容</p>
    {menuItems.map((item) => <Link key={item.typeId} to={postPath(item.typeId)} onClick={guardNavigation} aria-current={item.typeId === activeTypeId ? "page" : undefined}><FiFileText size={20} aria-hidden="true" />{item.label}</Link>)}
    <NavLink to="/cms/media" onClick={guardNavigation}><FiImage size={20} aria-hidden="true" />媒體庫</NavLink>
    <p className="nav-group">管理</p>
    <NavLink to="/cms/content-types" onClick={guardNavigation}><FiSliders size={20} aria-hidden="true" />內容類型</NavLink>
    <NavLink to="/cms/taxonomies" onClick={guardNavigation}><FiTag size={20} aria-hidden="true" />分類與標籤</NavLink>
  </nav>;
  return <div className="cms-shell">
    <a className="skip" href="#page-title">跳到主標題</a>
    <header className="mobile-bar"><button ref={menuTrigger} className="menu-toggle" type="button" aria-label={menuOpen ? "關閉導覽選單" : "開啟導覽選單"} aria-controls="cms-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX size={22} aria-hidden="true" /> : <FiMenu size={22} aria-hidden="true" />}</button><strong>本機 CMS</strong></header>
    {menuOpen && <button className="nav-scrim" type="button" tabIndex={-1} aria-label="關閉導覽選單" onClick={() => { setMenuOpen(false); menuTrigger.current?.focus(); }} />}
    <aside ref={sidebar} id="cms-sidebar" className={`cms-sidebar${menuOpen ? " is-open" : ""}`}>
      <div className="sidebar-brand"><strong>本機 CMS</strong><span>專注創作・掌握內容</span></div>
      {nav}
      <p className="sidebar-status"><span className="status-dot" aria-hidden="true" />本機 CMS 已連線</p>
    </aside>
    <main id="workspace" aria-labelledby="page-title" inert={menuOpen}>{children}</main>
  </div>;
}

export function PublicNotice(): React.JSX.Element {
  return <p className="public-notice" role="note">公開網站發布目前暫停；「已發布」僅代表 CMS 內容狀態，不會公開於網站。</p>;
}

export function postPath(typeId: string): string {
  return `/cms/content/${typeId}`;
}
