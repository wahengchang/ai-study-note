import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest } from "../foundation/index.js";
import type { StructuredContent } from "../content/index.js";

import type { CreateProjectionInput, PreviewDocument, Projection, ProjectionFailure, ProjectionResult, RendererInputArtifact, RendererInputV1 } from "./contracts.js";

function failure(code: ProjectionFailure["code"], subjectIds: readonly string[] = []): Readonly<{ ok: false; error: ProjectionFailure }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, owner: "Projection", subjectIds: Object.freeze([...subjectIds]), remediation: Object.freeze({ kind: "message", message: "Projection 無法建立已驗證輸出。" }) }) });
}
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function base64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
// sandbox document 內的 <style>／<script> 是 raw text element：css／javascript 裡的 `</` 會提前關閉元素並截斷 source。
// `<\/` 在 CSS string、JS string／regex／註解裡與 `</` 同意，因此可在不改變語意下保留完整 source。
function escapeRawText(value: string): string { return value.replaceAll("</", "<\\/"); }
function demoDocument(source: Readonly<{ html: string; css: string; javascript: string }>): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>${escapeRawText(source.css)}</style></head><body>${source.html}<script>${escapeRawText(source.javascript)}</script></body></html>`;
}
function previewHtml(content: StructuredContent): string {
  let demo = 0;
  const blocks = content.blocks.map((block) => {
    if (block.kind === "article") return `<p>${escapeHtml(block.text)}</p>`;
    if (block.kind === "raw-full-page") return `<section aria-label="原始文章預覽"><iframe sandbox srcdoc="${escapeHtml(block.html)}" title="原始文章預覽"></iframe><p>${escapeHtml(block.staticFallback)}</p></section>`;
    // 空值 sandbox 會連 script 一起禁止，Interactive Demo 將永遠退化成 static fallback；
    // allow-scripts 讓 source 實際執行，且因不含 allow-same-origin，frame 仍停在 opaque origin。
    demo += 1;
    const label = `互動示範 ${demo}`;
    return `<section aria-label="${label}"><iframe sandbox="allow-scripts" srcdoc="${escapeHtml(demoDocument(block.source))}" title="${label}"></iframe><p>${escapeHtml(block.staticFallback)}</p></section>`;
  }).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.title)}</title></head><body><main><article><h1>${escapeHtml(content.title)}</h1>${blocks}</article></main></body></html>`;
}

class Producer implements Projection {
  public constructor(private readonly input: CreateProjectionInput) {}

  // published projection 與 preview 共用同一條 revision → structured content 驗證鏈：
  // 先確認 revision bytes 與其宣告 digest 相符，再由 Content 解讀 canonical bytes；任一步不成立都不回 partial 結果。
  private resolveContent(entryId: string, revisionId: string): Readonly<{ content: StructuredContent; contentDigest: Digest }> | null {
    const revision = this.input.persistence.getRevision({ entryId, revisionId });
    if (!revision.ok || revision.value.contentDigest !== sha256Digest(revision.value.contentBytes)) return null;
    const content = this.input.contentReadModel.read({ schemaIdentity: revision.value.schemaIdentity, contentBytes: revision.value.contentBytes, contentDigest: revision.value.contentDigest });
    return content.ok ? Object.freeze({ content: content.value.content, contentDigest: revision.value.contentDigest }) : null;
  }

  public async producePublishedRendererInput(): Promise<ProjectionResult<RendererInputArtifact>> {
    const routes = this.input.siteDefinition.snapshot("published");
    if (!routes.ok) return failure("PUBLISHED_SELECTION_UNRESOLVED");
    // Plugin activation state 必須在 resolve 前後各取一次；只比對已解析 renderer 的 digest 會在
    // 沒有任何 public renderer plugin 時退化成恆真式，讓期間的 activation 變更無法偵測。
    const pluginsBefore = await this.input.pluginHost.getActiveSnapshot();
    const theme = await this.input.themeHost.resolveActiveRendererSource();
    const plugins = await this.input.pluginHost.resolveActivePublicRenderers();
    if (!theme.ok || !plugins.ok || !pluginsBefore.ok) return failure("PUBLISHED_SELECTION_UNRESOLVED");
    if (plugins.value.some((plugin) => plugin.activeStateDigest !== pluginsBefore.value.digest)) return failure("PUBLISHED_SELECTION_STALE");
    const entries: RendererInputV1["entries"][number][] = [];
    const selectedRoutes: RendererInputV1["routes"][number][] = [];
    const media: RendererInputV1["media"][number][] = [];
    for (const claim of routes.value.claims) {
      const pointer = this.input.persistence.getEntryPointers(claim.owner);
      if (!pointer.ok || pointer.value.publishedRevisionId !== claim.sourceRevisionId) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      const resolved = this.resolveContent(claim.owner, claim.sourceRevisionId);
      if (resolved === null) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      entries.push(Object.freeze({ entryId: claim.owner, revisionId: claim.sourceRevisionId, content: resolved.content, contentDigest: resolved.contentDigest }));
      selectedRoutes.push(Object.freeze({ route: claim.normalizedRoute, entryId: claim.owner, revisionId: claim.sourceRevisionId }));
      const selection = this.input.dataMedia.resolvePublishedSelection(claim.owner);
      if (!selection.ok || selection.value.revisionId !== claim.sourceRevisionId) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      for (const asset of selection.value.assets) media.push(Object.freeze({ entryId: claim.owner, revisionId: claim.sourceRevisionId, assetId: asset.identity.assetId, assetVersionId: asset.identity.assetVersionId, objectDigest: asset.objectDigest, byteLength: asset.byteLength, metadataDigest: asset.metadataDigest, publicPath: `/media/${asset.objectDigest}` }));
    }
    entries.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId));
    selectedRoutes.sort((left, right) => compare(left.route, right.route));
    media.sort((left, right) => compare(left.assetId, right.assetId) || compare(left.assetVersionId, right.assetVersionId) || compare(left.entryId, right.entryId));
    const routeAfter = this.input.siteDefinition.snapshot("published");
    const themeAfter = await this.input.themeHost.getActiveSnapshot();
    const pluginsAfter = await this.input.pluginHost.getActiveSnapshot();
    const mediaBytes = canonicalJsonBytes(media);
    if (!mediaBytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    if (!routeAfter.ok || !themeAfter.ok || !pluginsAfter.ok || routeAfter.value.digest !== routes.value.digest || themeAfter.value.digest !== theme.value.activeStateDigest || pluginsAfter.value.digest !== pluginsBefore.value.digest) return failure("PUBLISHED_SELECTION_STALE");
    const selection = Object.freeze({ publishedRevisionIds: Object.freeze(entries.map((entry) => Object.freeze({ entryId: entry.entryId, revisionId: entry.revisionId }))), routeGraphDigest: routes.value.digest, mediaSelectionDigest: sha256Digest(mediaBytes.value) });
    const payload = Object.freeze({
      contract: "renderer-input/v1" as const,
      selection,
      entries: Object.freeze(entries),
      routes: Object.freeze(selectedRoutes),
      media: Object.freeze(media),
      theme: Object.freeze({
        identity: theme.value.identity,
        entrySourceBase64: base64(theme.value.entryBytes),
        entryDigest: theme.value.entryDigest,
        resources: Object.freeze(theme.value.resources.map((resource) => Object.freeze({ file: resource.file, bytesBase64: base64(resource.bytes), digest: resource.digest }))),
      }),
      plugins: Object.freeze(plugins.value.map((plugin) => Object.freeze({
        identity: plugin.identity,
        entrySourceBase64: base64(plugin.entryBytes),
        entryDigest: sha256Digest(plugin.entryBytes),
        resources: Object.freeze(plugin.resources.map((resource) => Object.freeze({ file: resource.file, bytesBase64: base64(resource.bytes), digest: resource.digest }))),
        callbacks: Object.freeze(plugin.callbacks.map((callback) => Object.freeze({ ...callback }))),
      }))),
    });
    const payloadBytes = canonicalJsonBytes(payload);
    if (!payloadBytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    const input: RendererInputV1 = Object.freeze({ ...payload, inputDigest: sha256Digest(payloadBytes.value) });
    const bytes = canonicalJsonBytes(input);
    if (!bytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    return Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-input-artifact/v1", bytes: copyBytes(bytes.value), inputDigest: input.inputDigest }) });
  }

  public preview(input: Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }> }>): ProjectionResult<PreviewDocument> {
    if (input === null || typeof input !== "object" || (input.selection !== "current" && input.selection !== "published") || input.subject === null || typeof input.subject !== "object" || typeof input.subject.entryId !== "string" || input.subject.entryId.length === 0) return failure("INVALID_PREVIEW_INPUT");
    const before = this.input.persistence.canonicalState();
    if (!before.ok) return failure("PREVIEW_SELECTION_UNRESOLVED", [input.subject.entryId]);
    const pointer = this.input.persistence.getEntryPointers(input.subject.entryId);
    const revisionId = pointer.ok ? input.selection === "current" ? pointer.value.currentRevisionId : pointer.value.publishedRevisionId : undefined;
    if (revisionId === undefined) return failure("PREVIEW_SELECTION_UNRESOLVED", [input.subject.entryId]);
    const resolved = this.resolveContent(input.subject.entryId, revisionId);
    if (resolved === null) return failure("PREVIEW_SELECTION_UNRESOLVED", [input.subject.entryId]);
    const after = this.input.persistence.canonicalState();
    if (!after.ok || after.value.digest !== before.value.digest) return failure("PREVIEW_STATE_STALE", [input.subject.entryId]);
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        contract: "preview-document/v1",
        selection: input.selection,
        subject: Object.freeze({ entryId: input.subject.entryId }),
        revisionId,
        contentDigest: resolved.contentDigest,
        document: previewHtml(resolved.content),
      }),
    });
  }
}

export function createProjection(input: CreateProjectionInput): ProjectionResult<Projection> {
  if (input === null || typeof input !== "object" || input.persistence === null || input.siteDefinition === null || input.dataMedia === null || input.contentReadModel === null || input.themeHost === null || input.pluginHost === null) return failure("INVALID_PROJECTION_INPUT");
  return Object.freeze({ ok: true, value: new Producer(input) });
}
