// @ts-nocheck
const STYLE = `
:root { color-scheme: light; font-family: system-ui, sans-serif; line-height: 1.6; }
* { box-sizing: border-box; }
body { margin: 0; background: #f8fafc; color: #172033; }
a { color: #075985; }
:where(a, button, iframe, [tabindex]):focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
.skip-link { position: absolute; left: 1rem; top: -4rem; padding: .5rem .75rem; background: #172033; color: #fff; z-index: 1; }
.skip-link:focus { top: 1rem; }
.site-header, main, .site-footer { width: min(100% - 2rem, 72rem); margin-inline: auto; }
.site-header { padding-block: 1.5rem; }
.site-header p { margin: 0; color: #475569; }
.site-nav ul { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0 0; padding: 0; list-style: none; }
main { padding-block: 1.5rem 3rem; }
article { padding: clamp(1rem, 4vw, 3rem); background: #fff; border: 1px solid #cbd5e1; border-radius: .75rem; }
h1 { line-height: 1.2; }
.embedded-content { margin-block: 1.5rem; padding: 1rem; border: 1px solid #94a3b8; border-radius: .5rem; }
.embedded-content iframe { width: 100%; min-height: 18rem; border: 1px solid #64748b; }
.embedded-fallback { margin-top: 1rem; }
.site-footer { padding-block: 1.5rem; color: #475569; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
`;

function record(value) {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function sourceDocument(source) {
  const css = source.css.replace(/<\/style/giu, "<\\/style");
  const javascript = source.javascript.replace(/<\/script/giu, "<\\/script");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${source.html}<script>${javascript}</script></body></html>`;
}

function renderArticle(text) {
  return text.split(/\n{2,}/u).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, "<br>")}</p>`).join("");
}

function renderBlocks(blocks, pluginBlocks) {
  const output = [];
  // 同一頁可含多個 Interactive Demo：id 必須逐個唯一，否則 aria-labelledby／aria-describedby
  // 會全部指向第一個 section，輔助技術讀到的標題與 static fallback 與實際 iframe 不符。
  let demo = 0;
  for (const block of blocks) {
    if (!record(block) || typeof block.kind !== "string") throw new Error("invalid site content block");
    if (block.kind === "article" && typeof block.text === "string") {
      output.push(renderArticle(block.text));
      continue;
    }
    if (block.kind === "interactive-demo" && typeof block.staticFallback === "string" && record(block.source) && typeof block.source.html === "string" && typeof block.source.css === "string" && typeof block.source.javascript === "string") {
      demo += 1;
      const label = `互動示範 ${demo}`;
      const titleId = `interactive-demo-${demo}-title`;
      const fallbackId = `interactive-demo-${demo}-fallback`;
      output.push(`<section class="embedded-content" aria-labelledby="${titleId}"><h2 id="${titleId}">${escapeHtml(label)}</h2><iframe title="${escapeHtml(label)}" sandbox="allow-scripts" aria-describedby="${fallbackId}" srcdoc="${escapeHtml(sourceDocument(block.source))}"></iframe><p class="embedded-fallback" id="${fallbackId}"><strong>靜態替代內容：</strong>${escapeHtml(block.staticFallback)}</p></section>`);
      continue;
    }
    throw new Error("raw full-page content requires its own route document");
  }
  for (const html of pluginBlocks) output.push(html);
  return output.length === 0 ? "<p>此筆記目前沒有可閱讀的公開內容。</p>" : output.join("");
}

function rawFullPage(blocks) {
  const raw = blocks.filter((block) => record(block) && block.kind === "raw-full-page");
  if (raw.length === 0) return undefined;
  const candidate = raw[0];
  if (raw.length !== 1 || blocks.length !== 1 || !record(candidate) || typeof candidate.html !== "string" || typeof candidate.staticFallback !== "string") throw new Error("invalid raw full-page content");
  return candidate;
}

function segments(route) {
  return route === "/" ? [] : route.slice(1).split("/");
}

function relativeHref(from, target) {
  const source = segments(from);
  const destination = segments(target);
  let shared = 0;
  while (shared < source.length && shared < destination.length && source[shared] === destination[shared]) shared += 1;
  const parent = "../".repeat(source.length - shared);
  const child = destination.slice(shared).join("/");
  return child.length === 0 ? (parent.length === 0 ? "./" : parent) : `${parent}${child}/`;
}


function navigation(route, routes, entries) {
  return routes.map((item) => {
    const target = entries.get(`${item.entryId}\0${item.revisionId}`);
    if (target === undefined) throw new Error("missing route entry");
    const current = item.route === route ? ' aria-current="page"' : "";
    return `<li><a href="${escapeHtml(relativeHref(route, item.route))}"${current}>${escapeHtml(target.content.title)}</a></li>`;
  }).join("");
}

function shell(route, title, body, routes, entries) {
  const home = escapeHtml(routes.some((item) => item.route === "/") ? relativeHref(route, "/") : "./");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><a class="skip-link" href="#main-content">跳至主要內容</a><header class="site-header"><p><a href="${home}">AI Study Note</a></p><nav class="site-nav" aria-label="文章導覽"><ul>${navigation(route, routes, entries)}</ul></nav></header><main id="main-content" tabindex="-1">${body}</main><footer class="site-footer">由 AI Study Note 產生的靜態頁面。</footer></body></html>`;
}

function document(route, entry, routes, entries) {
  const raw = rawFullPage(entry.content.blocks);
  if (raw !== undefined) return shell(route, entry.content.title, `<section class="embedded-content" aria-labelledby="raw-page-title"><h1 id="raw-page-title">${escapeHtml(entry.content.title)}</h1><h2>原始完整頁面</h2><iframe title="原始完整頁面" aria-describedby="raw-page-fallback" srcdoc="${escapeHtml(raw.html)}"></iframe><p class="embedded-fallback" id="raw-page-fallback"><strong>靜態替代內容：</strong>${escapeHtml(raw.staticFallback)}</p></section>`, routes, entries);
  return shell(route, entry.content.title, `<article aria-labelledby="entry-title"><h1 id="entry-title">${escapeHtml(entry.content.title)}</h1>${renderBlocks(entry.content.blocks, entry.blocks)}</article>`, routes, entries);
}


export function render(input) {
  const entries = new Map(input.entries.map((entry) => [`${entry.entryId}\0${entry.revisionId}`, entry]));
  const pages = input.routes.map((route) => {
    const entry = entries.get(`${route.entryId}\0${route.revisionId}`);
    if (entry === undefined) throw new Error("missing route entry");
    return { route: route.route, html: document(route.route, entry, input.routes, entries) };
  });
  return { contract: "theme-render-output/v1", pages };
}
