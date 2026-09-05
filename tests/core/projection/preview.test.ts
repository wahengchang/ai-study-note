import assert from "node:assert/strict";
import test from "node:test";

import { createPublishedContentReadModel } from "../../../core/content/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createProjection } from "../../../core/projection/index.js";

function revision(revisionId: string, content: unknown) {
  const bytes = canonicalJsonBytes(content);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error();
  return {
    identity: { entryId: "note", revisionId },
    schemaIdentity: { schemaId: "site-content", version: 1 },
    contentBytes: bytes.value,
    contentDigest: sha256Digest(bytes.value),
    lineage: { operationId: "operation", operationKind: "save" },
  };
}

function previewProjection(input: Readonly<{ current: ReturnType<typeof revision>; published?: ReturnType<typeof revision>; canonicalDigests?: readonly `sha256:${string}`[] }>) {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [{ schemaId: "site-content", version: 1 }] });
  assert.equal(model.ok, true);
  if (!model.ok) throw new Error();
  let stateRead = 0;
  const digests = input.canonicalDigests ?? [sha256Digest(new TextEncoder().encode("state"))];
  return createProjection({
    persistence: {
      canonicalState: () => ({ ok: true, value: { contract: "persistence-canonical-state/v2", bytes: new Uint8Array(), digest: digests[Math.min(stateRead++, digests.length - 1)]!, counts: {} } }),
      getEntryPointers: () => ({ ok: true, value: { entryId: "note", currentRevisionId: input.current.identity.revisionId, ...(input.published === undefined ? {} : { publishedRevisionId: input.published.identity.revisionId }) } }),
      getRevision: ({ revisionId }: { revisionId: string }) => revisionId === input.current.identity.revisionId ? { ok: true, value: input.current } : input.published !== undefined && revisionId === input.published.identity.revisionId ? { ok: true, value: input.published } : { ok: false, error: {} },
    } as never,
    contentReadModel: model.value,
    siteDefinition: {} as never,
    dataMedia: {} as never,
    themeHost: {} as never,
    pluginHost: {} as never,
  });
}

test("Preview 依 selection 隔離 current draft 與 published revision，且 canonical state digest 不變", () => {
  const projection = previewProjection({
    current: revision("draft", { contract: "site-content/v1", title: "草稿標題", blocks: [{ kind: "article", text: "草稿內容" }] }),
    published: revision("published", { contract: "site-content/v1", title: "公開標題", blocks: [{ kind: "article", text: "公開內容" }] }),
  });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const current = projection.value.preview({ selection: "current", subject: { entryId: "note" } });
  const published = projection.value.preview({ selection: "published", subject: { entryId: "note" } });
  assert.equal(current.ok && published.ok, true);
  if (!current.ok || !published.ok) return;
  assert.equal(current.value.revisionId, "draft");
  assert.match(current.value.document, /草稿標題/);
  assert.equal(published.value.revisionId, "published");
  assert.match(published.value.document, /公開標題/);
  assert.doesNotMatch(published.value.document, /草稿標題|草稿內容/);
});

test("Preview 將 raw 與 Interactive Demo 的所有 source 放入 sandbox srcdoc 並保留 fallback", () => {
  const projection = previewProjection({
    current: revision("draft", {
      contract: "site-content/v1",
      title: "Sandbox",
      blocks: [
        { kind: "raw-full-page", html: "<main>raw source</main>", staticFallback: "raw fallback" },
        { kind: "interactive-demo", pluginIdentity: { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: sha256Digest(new TextEncoder().encode("demo")) }, source: { html: "<button>run</button>", css: "button{color:red}", javascript: "window.ran=true" }, staticFallback: "demo fallback" },
      ],
    }),
  });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const preview = projection.value.preview({ selection: "current", subject: { entryId: "note" } });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal((preview.value.document.match(/<iframe sandbox/g) ?? []).length, 2);
  assert.doesNotMatch(preview.value.document, /allow-same-origin/);
  assert.match(preview.value.document, /raw fallback/);
  assert.match(preview.value.document, /demo fallback/);
  assert.match(preview.value.document, /srcdoc="&lt;main&gt;raw source&lt;\/main&gt;"/);
  assert.match(preview.value.document, /srcdoc="&lt;!doctype html/);
  assert.doesNotMatch(preview.value.document, /<button>run<\/button>/);
  // raw article preview 只需 sandbox；Interactive Demo 必須真的執行 source，因此只加 allow-scripts。
  assert.match(preview.value.document, /<iframe sandbox srcdoc="&lt;main/);
  assert.match(preview.value.document, /<iframe sandbox="allow-scripts" srcdoc="&lt;!doctype html/);
});

test("Preview 保留 demo source 的 raw text，`</script>` 不會提前關閉 sandbox document", () => {
  const projection = previewProjection({
    current: revision("draft", {
      contract: "site-content/v1",
      title: "Raw text",
      blocks: [
        { kind: "interactive-demo", pluginIdentity: { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1", manifestHash: sha256Digest(new TextEncoder().encode("demo")) }, source: { html: "<p>x</p>", css: 'p::after{content:"</style>"}', javascript: 'document.title = "</script>";' }, staticFallback: "demo fallback" },
      ],
    }),
  });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const preview = projection.value.preview({ selection: "current", subject: { entryId: "note" } });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const srcdoc = /srcdoc="([^"]*)"/u.exec(preview.value.document)?.[1] ?? "";
  const source = srcdoc.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
  assert.equal((source.match(/<\/style>/g) ?? []).length, 1);
  assert.equal((source.match(/<\/script>/g) ?? []).length, 1);
  assert.match(source, /content:"<\\\/style>"/);
  assert.match(source, /document\.title = "<\\\/script>";/);
});

test("Preview 對未發布、unresolved content 與 state race fail closed，不回 partial document", () => {
  const noPublished = previewProjection({ current: revision("draft", { contract: "site-content/v1", title: "草稿", blocks: [] }) });
  assert.equal(noPublished.ok, true);
  if (!noPublished.ok) return;
  const missing = noPublished.value.preview({ selection: "published", subject: { entryId: "note" } });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "PREVIEW_SELECTION_UNRESOLVED");

  const stateRace = previewProjection({
    current: revision("draft", { contract: "site-content/v1", title: "草稿", blocks: [] }),
    canonicalDigests: [sha256Digest(new TextEncoder().encode("before")), sha256Digest(new TextEncoder().encode("after"))],
  });
  assert.equal(stateRace.ok, true);
  if (!stateRace.ok) return;
  const raced = stateRace.value.preview({ selection: "current", subject: { entryId: "note" } });
  assert.equal(raced.ok, false);
  if (!raced.ok) assert.equal(raced.error.code, "PREVIEW_STATE_STALE");
});

test("Preview 對無效 selection 與 subject 回 INVALID_PREVIEW_INPUT", () => {
  const projection = previewProjection({ current: revision("draft", { contract: "site-content/v1", title: "草稿", blocks: [] }) });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  for (const invalid of [{ selection: "draft", subject: { entryId: "note" } }, { selection: "current", subject: { entryId: "" } }, { selection: "current", subject: null }]) {
    const rejected = projection.value.preview(invalid as never);
    assert.equal(rejected.ok, false, JSON.stringify(invalid));
    if (!rejected.ok) assert.equal(rejected.error.code, "INVALID_PREVIEW_INPUT", JSON.stringify(invalid));
  }
});
