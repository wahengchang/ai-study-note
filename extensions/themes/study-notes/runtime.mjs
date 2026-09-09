function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function renderArticle(text) {
  return text.split(/\n{2,}/u).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, "<br>")}</p>`).join("");
}

function demoSource(source) {
  const css = source.css.replace(/<\/style/giu, "<\\/style");
  const javascript = source.javascript.replace(/<\/script/giu, "<\\/script");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${source.html}<script>${javascript}</script></body></html>`;
}

function renderBlocks(blocks, pluginBlocks) {
  const rendered = [];
  let demo = 0;
  for (const block of blocks) {
    if (!record(block) || typeof block.kind !== "string") throw new Error("invalid site content block");
    if (block.kind === "article" && typeof block.text === "string") {
      rendered.push(renderArticle(block.text));
      continue;
    }
    if (block.kind === "interactive-demo" && typeof block.staticFallback === "string" && record(block.source) && typeof block.source.html === "string" && typeof block.source.css === "string" && typeof block.source.javascript === "string") {
      demo += 1;
      const label = `互動示範 ${demo}`;
      const titleId = `interactive-demo-${demo}-title`;
      const fallbackId = `interactive-demo-${demo}-fallback`;
      rendered.push(`<section class="embedded-content" aria-labelledby="${titleId}"><h2 id="${titleId}">${escapeHtml(label)}</h2><iframe title="${escapeHtml(label)}" sandbox="allow-scripts" aria-describedby="${fallbackId}" srcdoc="${escapeHtml(demoSource(block.source))}"></iframe><p class="embedded-fallback" id="${fallbackId}"><strong>靜態替代內容：</strong>${escapeHtml(block.staticFallback)}</p></section>`);
      continue;
    }
    if (block.kind === "raw-full-page" && typeof block.html === "string" && typeof block.staticFallback === "string" && blocks.length === 1) {
      rendered.push(`<section class="embedded-content" aria-labelledby="raw-page-title"><h1 id="raw-page-title">原始完整頁面</h1><iframe title="原始完整頁面" aria-describedby="raw-page-fallback" srcdoc="${escapeHtml(block.html)}"></iframe><p class="embedded-fallback" id="raw-page-fallback"><strong>靜態替代內容：</strong>${escapeHtml(block.staticFallback)}</p></section>`);
      continue;
    }
    throw new Error("unsupported site content block");
  }
  for (const html of pluginBlocks) rendered.push(html);
  return rendered.length === 0 ? "<p>此筆記目前沒有可閱讀的公開內容。</p>" : rendered.join("");
}

function href(from, target) {
  const source = from === "/" ? [] : from.slice(1).split("/");
  const destination = target === "/" ? [] : target.slice(1).split("/");
  let common = 0;
  while (common < source.length && common < destination.length && source[common] === destination[common]) common += 1;
  const relative = "../".repeat(source.length - common) + destination.slice(common).join("/");
  return relative === "" ? "./" : relative.endsWith("/") ? relative : `${relative}/`;
}

function renderPage(route, entry, routes, entries) {
  const navigation = routes.map((claim) => {
    const target = entries.get(`${claim.owner}\u0000${claim.sourceRevisionId}`);
    if (target === undefined) throw new Error("missing route entry");
    return `<li><a href="${escapeHtml(href(route, claim.normalizedRoute))}"${claim.normalizedRoute === route ? " aria-current=\"page\"" : ""}>${escapeHtml(target.content.title)}</a></li>`;
  }).join("");
  return `<a class="skip-link" href="#main-content">跳至主要內容</a><header class="site-header"><p><a href="${escapeHtml(href(route, "/"))}">AI Study Note</a></p><nav class="site-nav" aria-label="文章導覽"><ul>${navigation}</ul></nav></header><main id="main-content" tabindex="-1"><article aria-labelledby="entry-title"><h1 id="entry-title">${escapeHtml(entry.content.title)}</h1>${renderBlocks(entry.content.blocks, entry.blocks)}</article></main><footer class="site-footer">由 AI Study Note 產生的靜態頁面。</footer>`;
}

export function render(input) {
  const entries = new Map(input.entries.map((entry) => [`${entry.entryId}\u0000${entry.revisionId}`, entry]));
  return {
    contract: "theme-render-output/v1",
    pages: input.routes.map((route) => {
      const entry = entries.get(`${route.owner}\u0000${route.sourceRevisionId}`);
      if (entry === undefined) throw new Error("missing route entry");
      return { route: route.normalizedRoute, language: "zh-Hant", bodyHtml: renderPage(route.normalizedRoute, entry, input.routes, entries), stylesheetResources: ["assets/study-notes.css"] };
    }),
  };
}
