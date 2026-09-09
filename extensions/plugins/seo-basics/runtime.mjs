function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function seoFor(content) {
  const seo = object(content.seo) ? content.seo : {};
  return {
    title: text(seo.title) || text(content.title),
    description: text(seo.description),
    canonicalPath: text(seo.canonicalPath),
  };
}

export function analyzeCmsSeo(input) {
  const content = object(input) && object(input.content) ? input.content : {};
  const seo = seoFor(content);
  const suggestions = [];
  if (!seo.description) suggestions.push({ code: "SEO_DESCRIPTION_MISSING" });
  if (!text(object(content.seo) ? content.seo.title : undefined)) suggestions.push({ code: "SEO_TITLE_MISSING" });
  return {
    contract: "cms-seo-analysis-output/v1",
    preview: {
      title: seo.title,
      ...(seo.description ? { description: seo.description } : {}),
      ...(seo.canonicalPath || text(input.route) ? { canonicalPath: seo.canonicalPath || text(input.route) } : {}),
    },
    suggestions,
  };
}

export function contributePageSeo(input) {
  const published = object(input) && object(input.published) ? input.published : {};
  const entries = Array.isArray(published.entries) ? published.entries : [];
  const pages = [];
  for (const entry of entries) {
    if (!object(entry) || !object(entry.content)) continue;
    const route = text(entry.route);
    const seo = seoFor(entry.content);
    if (!route || !seo.title) continue;
    pages.push({
      route,
      title: seo.title,
      ...(seo.description ? { description: seo.description } : {}),
      ...(seo.canonicalPath ? { canonicalPath: seo.canonicalPath } : {}),
    });
  }
  return { contract: "public-seo-page-contribution/v1", contribution: { pages } };
}

export function contributeSiteSeo(input) {
  const settings = object(input) && object(input.settings) ? input.settings : {};
  const publicSiteUrl = text(settings.publicSiteUrl);
  return { contract: "public-seo-site-contribution/v1", contribution: { publicSiteUrl, indexing: settings.indexing } };
}
