import type { StructuredContent } from "../content/index.js";

import type { ParsedPreviewInput, ProjectionResult } from "./contracts.js";

export type PreviewDocument = Readonly<{ contract: "preview-document/v1"; subject: Readonly<{ entryId: string }>; revisionId: string; contentDigest: string; document: string }>;

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeRawText(value: string): string { return value.replaceAll("</", "<\\/"); }
function demoDocument(source: Readonly<{ html: string; css: string; javascript: string }>): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>${escapeRawText(source.css)}</style></head><body>${source.html}<script>${escapeRawText(source.javascript)}</script></body></html>`;
}
function document(content: StructuredContent): string {
  let demo = 0;
  const blocks = content.blocks.map((block) => {
    if (block.kind === "article") return `<p>${escapeHtml(block.text)}</p>`;
    if (block.kind === "raw-full-page") return `<section aria-label="原始文章預覽"><iframe sandbox srcdoc="${escapeHtml(block.html)}" title="原始文章預覽"></iframe><p>${escapeHtml(block.staticFallback)}</p></section>`;
    demo += 1;
    const id = `preview-demo-${demo}`;
    return `<section aria-labelledby="${id}"><h2 id="${id}">互動示範 ${demo}</h2><iframe sandbox="allow-scripts" srcdoc="${escapeHtml(demoDocument(block.source))}" title="互動示範 ${demo}"></iframe><p>${escapeHtml(block.staticFallback)}</p></section>`;
  }).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.title)}</title></head><body><main><article><h1>${escapeHtml(content.title)}</h1>${blocks}</article></main></body></html>`;
}

export function renderPreviewDocument(parsed: ParsedPreviewInput): ProjectionResult<PreviewDocument> {
  const input = parsed.input;
  return Object.freeze({ ok: true, value: Object.freeze({ contract: "preview-document/v1", subject: Object.freeze({ ...input.subject }), revisionId: input.entry.revisionId, contentDigest: input.entry.contentDigest, document: document(input.entry.content) }) });
}
