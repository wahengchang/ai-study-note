import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { message, type CmsApiClient, type ContentTypeCatalogDto } from "./cms-api.js";
import { Layout, PageHeading, PublicNotice, postPath } from "./cms-shell.js";
export function Home({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [types, setTypes] = useState<ContentTypeCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setTypes(undefined); setError(undefined);
    void api.contentTypes().then((value) => setTypes(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  return <Layout><PageHeading>工作台</PageHeading><p className="page-subtitle">建立並管理本機 CMS 內容。</p><PublicNotice /><section aria-labelledby="quick-actions-heading"><h2 id="quick-actions-heading">常用操作</h2><p><Link className="action-link" to="/cms/content-types/new">建立內容類型</Link><Link to="/cms/media/import">匯入媒體</Link><Link to="/cms/taxonomies">管理分類與標籤</Link></p></section><section aria-labelledby="home-content-heading"><h2 id="home-content-heading">內容</h2>{types === undefined ? error === undefined ? <p role="status">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></> : types.length === 0 ? <p className="empty-state">尚無內容類型。</p> : <ul>{types.map((type) => <li key={type.typeId}><Link to={postPath(type.typeId)}>{type.label}</Link></li>)}</ul>}</section></Layout>;
}
