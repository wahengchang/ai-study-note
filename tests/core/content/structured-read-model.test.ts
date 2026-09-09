import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import {
  createPublishedContentReadModel,
  getSiteContentSchemaEvidence,
  SiteContentSchemaIdentity,
  type ContentReadInput,
  type SiteContentSchemaIdentity as SiteContentSchemaIdentityType,
} from "../../../core/content/index.js";

function source(value: unknown): Readonly<{ bytes: Uint8Array; digest: `sha256:${string}` }> {
  const bytes = canonicalJsonBytes(value);
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error("canonical source required");
  return { bytes: bytes.value, digest: sha256Digest(bytes.value) };
}

function input(value: unknown, schemaIdentity: SiteContentSchemaIdentityType = SiteContentSchemaIdentity): ContentReadInput {
  const content = source(value);
  return { schemaIdentity, contentBytes: content.bytes, contentDigest: content.digest };
}

const demoIdentity = { id: "demo", version: "1.0.0" } as const;
const demoManifestHash = sha256Digest(new TextEncoder().encode("demo"));
const content = (overrides: Record<string, unknown> = {}) => ({
  contract: "site-content/v1",
  title: "公開筆記",
  blocks: [{ kind: "article", text: "內容" }],
  seo: {},
  ...overrides,
});

test("site-content schema evidence has the approved Draft 2020-12 literal, JCS bytes, digest, and defensive copies", () => {
  const first = getSiteContentSchemaEvidence();
  assert.deepEqual(first.identity, SiteContentSchemaIdentity);
  assert.deepEqual(first.schema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "site-content/v1",
    type: "object",
    additionalProperties: false,
    required: ["contract", "title", "blocks", "seo"],
    properties: (first.schema as Record<string, unknown>).properties,
  });
  const encoded = canonicalJsonBytes(first.schema);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  assert.deepEqual(first.schemaBytes, encoded.value);
  assert.equal(first.schemaDigest, sha256Digest(encoded.value));

  const firstByte = first.schemaBytes.at(0);
  if (firstByte === undefined) throw new Error("schema bytes must be non-empty");
  first.schemaBytes[0] = firstByte ^ 0xff;
  (first.schema as Record<string, unknown>).$id = "mutated";
  const second = getSiteContentSchemaEvidence();
  assert.equal(second.schemaDigest, sha256Digest(second.schemaBytes));
  assert.equal((second.schema as Record<string, unknown>).$id, "site-content/v1");
  assert.notDeepEqual(first.schemaBytes, second.schemaBytes);
});

test("same canonical revision bytes produce byte-identical structured content artifact", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const revision = input(content());
  const before = new Uint8Array(revision.contentBytes);
  const first = model.value.read(revision);
  const second = model.value.read({ ...revision, contentBytes: new Uint8Array(revision.contentBytes) });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.deepEqual(revision.contentBytes, before);
  assert.deepEqual(first.value.content, content());
});

test("model rejects non-canonical, digest-mismatched, and non-site-content schema revision bytes", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const nonCanonical = new TextEncoder().encode('{"title":"x","contract":"site-content/v1","blocks":[],"seo":{}}');
  const malformed = model.value.read({ schemaIdentity: SiteContentSchemaIdentity, contentBytes: nonCanonical, contentDigest: sha256Digest(nonCanonical) });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "NON_CANONICAL_CONTENT_BYTES");
  const valid = input(content({ title: "x", blocks: [] }));
  const digestMismatch = model.value.read({ ...valid, contentDigest: sha256Digest(new TextEncoder().encode("different")) });
  assert.equal(digestMismatch.ok, false);
  if (!digestMismatch.ok) assert.equal(digestMismatch.error.code, "CONTENT_DIGEST_MISMATCH");
  const wrongSchema = model.value.read({ ...valid, schemaIdentity: { schemaId: "note", version: 1 } } as never);
  assert.equal(wrongSchema.ok, false);
  if (!wrongSchema.ok) assert.equal(wrongSchema.error.code, "INVALID_CONTENT_MODEL_INPUT");
});

test("raw full-page is only read with the explicit site-content identity approval", () => {
  const raw = content({ title: "核准原始頁", blocks: [{ kind: "raw-full-page", html: "<main>raw</main>", staticFallback: "raw fallback" }] });
  const denied = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(denied.ok, true);
  if (!denied.ok) return;
  const deniedResult = denied.value.read(input(raw));
  assert.equal(deniedResult.ok, false);
  if (!deniedResult.ok) assert.equal(deniedResult.error.code, "RAW_FULL_PAGE_NOT_APPROVED");

  const allowed = createPublishedContentReadModel({ approvedRawFullPageSchemas: [SiteContentSchemaIdentity] });
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.equal(allowed.value.read(input(raw)).ok, true);
});

test("interactive demo retains the exact identity, hook, manifest evidence, sandbox source, and fallback", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const demo = {
    kind: "interactive-demo",
    identity: demoIdentity,
    hook: "cms/editor-block/resolve",
    manifestHash: demoManifestHash,
    source: { html: "<button>run</button>", css: "button{}", javascript: "void 0" },
    staticFallback: "示範無法使用時的說明",
  };
  const result = model.value.read(input(content({ title: "互動示範", blocks: [demo] })));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.content.blocks[0], demo);

  const legacy = model.value.read(input(content({
    blocks: [{ kind: "interactive-demo", pluginIdentity: { ...demoIdentity, hookContract: "plugin-hooks/v1", manifestHash: demoManifestHash }, source: demo.source, staticFallback: demo.staticFallback }],
  })));
  assert.equal(legacy.ok, false);
  if (!legacy.ok) assert.equal(legacy.error.code, "INVALID_STRUCTURED_CONTENT");
});

test("required exact SEO object succeeds empty and fail-closes absent, null, array, empty, and unknown values", () => {
  const model = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  const empty = model.value.read(input(content()));
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.value.content.seo, {});

  const missing = { contract: "site-content/v1", title: "舊內容", blocks: [{ kind: "article", text: "內容" }] };
  for (const seo of [undefined, null, [], { title: "" }, { description: "" }, { canonicalPath: "" }, { unknown: "x" }] as const) {
    const result: ReturnType<typeof model.value.read> = seo === undefined ? model.value.read(input(missing)) : model.value.read(input(content({ seo })));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "INVALID_STRUCTURED_CONTENT");
  }
});
