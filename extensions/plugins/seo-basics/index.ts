type SeoSettings = Readonly<{
  contract: "seo-plugin-settings/v1";
  publicSiteUrl: string;
  indexing: "allow" | "disallow";
}>;

type Content = Readonly<{
  title: string;
  seo: Readonly<{ title?: string; description?: string; canonicalPath?: string }>;
}>;

function preview(content: Content, route: string): Readonly<{ title: string; description?: string; canonicalPath: string }> {
  const title = content.seo.title ?? content.title;
  return Object.freeze({
    title,
    ...(content.seo.description === undefined ? {} : { description: content.seo.description }),
    canonicalPath: content.seo.canonicalPath ?? route,
  });
}

export function analyzeCmsSeo(input: Readonly<{
  contract: "cms-seo-analysis-input/v1";
  inputDigest: string;
  content: Content;
  route: string;
  settings: SeoSettings;
}>): Readonly<{
  contract: "cms-seo-analysis-output/v1";
  preview: Readonly<{ title: string; description?: string; canonicalPath: string }>;
  suggestions: readonly Readonly<{ code: "SEO_TITLE_MISSING" | "SEO_DESCRIPTION_MISSING"; field: "title" | "description" }>[];
}> {
  const resolved = preview(input.content, input.route);
  return Object.freeze({
    contract: "cms-seo-analysis-output/v1",
    preview: resolved,
    suggestions: Object.freeze([
      ...(input.content.seo.title === undefined ? [Object.freeze({ code: "SEO_TITLE_MISSING" as const, field: "title" as const })] : []),
      ...(input.content.seo.description === undefined ? [Object.freeze({ code: "SEO_DESCRIPTION_MISSING" as const, field: "description" as const })] : []),
    ]),
  });
}

export function contributePublicSeoPage(input: Readonly<{
  contract: "public-seo-page-input/v1";
  entryId: string;
  revisionId: string;
  route: string;
  content: Content;
  settings: SeoSettings;
}>): Readonly<{
  contract: "public-seo-page-contribution/v1";
  entryId: string;
  revisionId: string;
  route: string;
  title: string;
  description?: string;
  canonicalPath: string;
  openGraph: Readonly<{ title: string; description?: string; urlPath: string; type: "article" }>;
  jsonLd: Readonly<{ type: "WebPage"; name: string; description?: string; urlPath: string }>;
}> {
  const resolved = preview(input.content, input.route);
  return Object.freeze({
    contract: "public-seo-page-contribution/v1",
    entryId: input.entryId,
    revisionId: input.revisionId,
    route: input.route,
    title: resolved.title,
    ...(resolved.description === undefined ? {} : { description: resolved.description }),
    canonicalPath: resolved.canonicalPath,
    openGraph: Object.freeze({ title: resolved.title, ...(resolved.description === undefined ? {} : { description: resolved.description }), urlPath: resolved.canonicalPath, type: "article" }),
    jsonLd: Object.freeze({ type: "WebPage", name: resolved.title, ...(resolved.description === undefined ? {} : { description: resolved.description }), urlPath: resolved.canonicalPath }),
  });
}

export function contributePublicSeoSite(input: Readonly<{ contract: "public-seo-site-input/v1"; settings: SeoSettings }>): Readonly<{
  contract: "public-seo-site-contribution/v1";
  sitemap: Readonly<{ include: "all-published" }>;
  robots: Readonly<{ indexing: "allow" | "disallow" }>;
}> {
  return Object.freeze({ contract: "public-seo-site-contribution/v1", sitemap: Object.freeze({ include: "all-published" }), robots: Object.freeze({ indexing: input.settings.indexing }) });
}
