import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest } from "../foundation/index.js";

import type {
  ContentReadFailureCode,
  ContentReadInput,
  ContentReadResult,
  ContentSchemaIdentity,
  CreatePublishedContentReadModelInput,
  InteractiveDemoBlock,
  PublishedContentReadModel,
  RawFullPageBlock,
  StructuredArticleBlock,
  StructuredContent,
  StructuredContentArtifact,
} from "./contracts.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

function failure(code: ContentReadFailureCode): ContentReadResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code,
      owner: "Content",
      subjectIds: Object.freeze([]),
      remediation: Object.freeze({ kind: "message", message: "Content 無法從 revision bytes 建立 structured read model。" }),
    }),
  });
}

function exact(value: unknown, keys: readonly string[]): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function schemaIdentity(value: unknown): value is ContentSchemaIdentity {
  return exact(value, ["schemaId", "version"])
    && typeof value.schemaId === "string" && value.schemaId.length > 0
    && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 0;
}

function schemaKey(value: ContentSchemaIdentity): string {
  return `${value.schemaId}\0${value.version}`;
}

function text(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0);
}

function pluginIdentity(value: unknown): value is InteractiveDemoBlock["pluginIdentity"] {
  return exact(value, ["id", "version", "hookContract", "manifestHash"])
    && text(value.id) && text(value.version) && value.hookContract === "plugin-hooks/v1"
    && typeof value.manifestHash === "string" && isDigest(value.manifestHash);
}

function block(value: unknown, approvedRawFullPageSchemas: ReadonlySet<string>): StructuredArticleBlock | RawFullPageBlock | InteractiveDemoBlock | ContentReadFailureCode {
  if (exact(value, ["kind", "text"]) && value.kind === "article" && text(value.text)) {
    return Object.freeze({ kind: "article", text: value.text });
  }
  if (exact(value, ["kind", "html", "staticFallback"]) && value.kind === "raw-full-page" && text(value.html) && text(value.staticFallback)) {
    if (approvedRawFullPageSchemas.size === 0) return "RAW_FULL_PAGE_NOT_APPROVED";
    return Object.freeze({ kind: "raw-full-page", html: value.html, staticFallback: value.staticFallback });
  }
  if (
    exact(value, ["kind", "pluginIdentity", "source", "staticFallback"])
    && value.kind === "interactive-demo"
    && pluginIdentity(value.pluginIdentity)
    && exact(value.source, ["html", "css", "javascript"])
    && text(value.source.html, true) && text(value.source.css, true) && text(value.source.javascript, true)
    && text(value.staticFallback)
  ) {
    return Object.freeze({
      kind: "interactive-demo",
      pluginIdentity: Object.freeze({ ...value.pluginIdentity }),
      source: Object.freeze({ html: value.source.html, css: value.source.css, javascript: value.source.javascript }),
      staticFallback: value.staticFallback,
    });
  }
  return "INVALID_STRUCTURED_CONTENT";
}

function structured(value: unknown, approvedRawFullPageSchemas: ReadonlySet<string>, schema: ContentSchemaIdentity): StructuredContent | ContentReadFailureCode {
  if (!exact(value, ["contract", "title", "blocks"])) return "INVALID_STRUCTURED_CONTENT";
  if (value.contract !== "site-content/v1") return "UNSUPPORTED_CONTENT_CONTRACT";
  if (!text(value.title) || !Array.isArray(value.blocks)) return "INVALID_STRUCTURED_CONTENT";
  const allowRawFullPage = approvedRawFullPageSchemas.has(schemaKey(schema));
  const blocks: Array<StructuredArticleBlock | RawFullPageBlock | InteractiveDemoBlock> = [];
  for (const item of value.blocks) {
    const parsed = block(item, allowRawFullPage ? approvedRawFullPageSchemas : new Set());
    if (typeof parsed === "string") return parsed;
    blocks.push(parsed);
  }
  return Object.freeze({ contract: "site-content/v1", title: value.title, blocks: Object.freeze(blocks) });
}

class ReadModel implements PublishedContentReadModel {
  public constructor(private readonly approvedRawFullPageSchemas: ReadonlySet<string>) {}

  public read(input: ContentReadInput): ContentReadResult<StructuredContentArtifact> {
    if (input === null || typeof input !== "object" || !schemaIdentity(input.schemaIdentity) || !(input.contentBytes instanceof Uint8Array) || typeof input.contentDigest !== "string" || !isDigest(input.contentDigest)) return failure("INVALID_CONTENT_MODEL_INPUT");
    if (sha256Digest(input.contentBytes) !== input.contentDigest) return failure("CONTENT_DIGEST_MISMATCH");
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.contentBytes));
    } catch {
      return failure("NON_CANONICAL_CONTENT_BYTES");
    }
    const canonical = canonicalJsonBytes(parsed);
    if (!canonical.ok || canonical.value.byteLength !== input.contentBytes.byteLength || canonical.value.some((byte, index) => byte !== input.contentBytes[index])) return failure("NON_CANONICAL_CONTENT_BYTES");
    const content = structured(parsed, this.approvedRawFullPageSchemas, input.schemaIdentity);
    if (typeof content === "string") return failure(content);
    const bytes = canonicalJsonBytes(content);
    if (!bytes.ok) return failure("INVALID_STRUCTURED_CONTENT");
    return Object.freeze({
      ok: true,
      value: Object.freeze({ contract: "structured-content-artifact/v1", content, bytes: copyBytes(bytes.value), digest: sha256Digest(bytes.value) }),
    });
  }
}

export function createPublishedContentReadModel(input: CreatePublishedContentReadModelInput): ContentReadResult<PublishedContentReadModel> {
  if (input === null || typeof input !== "object" || !Array.isArray(input.approvedRawFullPageSchemas)) return failure("INVALID_CONTENT_MODEL_INPUT");
  const approved = new Set<string>();
  for (const identity of input.approvedRawFullPageSchemas) {
    if (!schemaIdentity(identity) || approved.has(schemaKey(identity))) return failure("INVALID_CONTENT_MODEL_INPUT");
    approved.add(schemaKey(identity));
  }
  return Object.freeze({ ok: true, value: new ReadModel(approved) });
}
