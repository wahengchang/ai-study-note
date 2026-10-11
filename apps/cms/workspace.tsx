import { createRoot } from "react-dom/client";
import { useMemo } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles/index.css";
import { openAuthoringSession, type AuthoringSession } from "./session.js";
import { CmsApiClient } from "./cms-api.js";
import { ContentTypeCatalogProvider } from "./cms-shell.js";
import { Home } from "./home.js";
import { PostWorkspace } from "./content-workspace.js";
import { ContentTypeDetail, ContentTypeList, ContentTypeNew } from "./content-types.js";
import { TaxonomyDetail, TaxonomyList, TaxonomyNew } from "./taxonomies.js";
import { MediaDetail, MediaImport, MediaList } from "./media.js";
export { openAuthoringSession } from "./session.js";
function CmsApp({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const api = useMemo(() => new CmsApiClient(session), [session]);
  return <BrowserRouter><ContentTypeCatalogProvider api={api}><Routes><Route path="/cms" element={<Home api={api} />} /><Route path="/cms/" element={<Home api={api} />} /><Route path="/cms/content/:typeId" element={<PostWorkspace api={api} />} /><Route path="/cms/media" element={<MediaList api={api} />} /><Route path="/cms/media/import" element={<MediaImport api={api} />} /><Route path="/cms/media/:assetId" element={<MediaDetail api={api} />} /><Route path="/cms/content-types" element={<ContentTypeList api={api} />} /><Route path="/cms/content-types/new" element={<ContentTypeNew api={api} />} /><Route path="/cms/content-types/:typeId" element={<ContentTypeDetail api={api} />} /><Route path="/cms/taxonomies" element={<TaxonomyList api={api} />} /><Route path="/cms/taxonomies/new" element={<TaxonomyNew api={api} />} /><Route path="/cms/taxonomies/:taxonomyId" element={<TaxonomyDetail api={api} />} /></Routes></ContentTypeCatalogProvider></BrowserRouter>;
}

export function startCms(): void {
  const root = document.getElementById("root");
  if (root !== null) createRoot(root).render(<CmsApp session={openAuthoringSession()} />);
}
