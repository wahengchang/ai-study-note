import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createPublishedContentReadModel } from "../../../core/content/index.js";

function source(value: unknown): Readonly<{ bytes: Uint8Array; digest: `sha256:${string}` }> {
  const bytes = canonicalJsonBytes(value);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error("canonical source required");
  return { bytes: bytes.value, digest: sha256Digest(bytes.value) };
}

function input(value: unknown, schemaIdentity = { schemaId: "site-content", version: 1 }) {
  const content = source(value);
  return { schemaIdentity, contentBytes: content.bytes, contentDigest: content.digest };
}

const demoIdentity = { id: "demo", version: "1.0.0", hookContract: "plugin-hooks/v1" as const, manifestHash: sha256Digest(new TextEncoder().encode("demo")) };

test("相同 canonical revision bytes 產生 byte-identical structured content artifact", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const revision = input({ contract: "site-content/v1", title: "公開筆記", blocks: [{ kind: "article", text: "內容" }] });
  const before = new Uint8Array(revision.contentBytes);
  const first = model.value.read(revision);
  const second = model.value.read({ ...revision, contentBytes: new Uint8Array(revision.contentBytes) });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.deepEqual(revision.contentBytes, before);
  assert.deepEqual(first.value.content, { contract: "site-content/v1", title: "公開筆記", blocks: [{ kind: "article", text: "內容" }] });
});

test("model 拒絕非 canonical 或 digest 不符的 revision bytes，不產生 partial content", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const nonCanonical = new TextEncoder().encode('{"title":"x","contract":"site-content/v1","blocks":[]}');
  const malformed = model.value.read({ schemaIdentity: { schemaId: "site-content", version: 1 }, contentBytes: nonCanonical, contentDigest: sha256Digest(nonCanonical) });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "NON_CANONICAL_CONTENT_BYTES");
  const valid = input({ contract: "site-content/v1", title: "x", blocks: [] });
  const digestMismatch = model.value.read({ ...valid, contentDigest: sha256Digest(new TextEncoder().encode("different")) });
  assert.equal(digestMismatch.ok, false);
  if (!digestMismatch.ok) assert.equal(digestMismatch.error.code, "CONTENT_DIGEST_MISMATCH");
});

test("raw full-page 僅由明確核准 schema identity 讀取", () => {
  const raw = { contract: "site-content/v1", title: "核准原始頁", blocks: [{ kind: "raw-full-page", html: "<main>raw</main>", staticFallback: "raw fallback" }] };
  const denied = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(denied.ok, true);
  if (!denied.ok) return;
  const deniedResult = denied.value.read(input(raw));
  assert.equal(deniedResult.ok, false);
  if (!deniedResult.ok) assert.equal(deniedResult.error.code, "RAW_FULL_PAGE_NOT_APPROVED");

  const allowed = createPublishedContentReadModel({ approvedRawFullPageSchemas: [{ schemaId: "site-content", version: 1 }] });
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  const allowedResult = allowed.value.read(input(raw));
  assert.equal(allowedResult.ok, true);
  const anotherSchema = allowed.value.read(input(raw, { schemaId: "site-content", version: 2 }));
  assert.equal(anotherSchema.ok, false);
  if (!anotherSchema.ok) assert.equal(anotherSchema.error.code, "RAW_FULL_PAGE_NOT_APPROVED");
});

test("interactive demo 保留 exact Plugin identity、全部 sandbox source 與 fallback", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const result = model.value.read(input({
    contract: "site-content/v1",
    title: "互動示範",
    blocks: [{ kind: "interactive-demo", pluginIdentity: demoIdentity, source: { html: "<button>run</button>", css: "button{}", javascript: "void 0" }, staticFallback: "示範無法使用時的說明" }],
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.content.blocks[0], { kind: "interactive-demo", pluginIdentity: demoIdentity, source: { html: "<button>run</button>", css: "button{}", javascript: "void 0" }, staticFallback: "示範無法使用時的說明" });
});

test("model fail-closed 拒絕未知 block 與不完整 demo source", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const unknown = model.value.read(input({ contract: "site-content/v1", title: "x", blocks: [{ kind: "unknown" }] }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error.code, "INVALID_STRUCTURED_CONTENT");
  const incompleteDemo = model.value.read(input({ contract: "site-content/v1", title: "x", blocks: [{ kind: "interactive-demo", pluginIdentity: demoIdentity, source: { html: "", css: "" }, staticFallback: "fallback" }] }));
  assert.equal(incompleteDemo.ok, false);
  if (!incompleteDemo.ok) assert.equal(incompleteDemo.error.code, "INVALID_STRUCTURED_CONTENT");
});
