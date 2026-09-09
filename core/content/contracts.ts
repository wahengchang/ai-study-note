import type { Digest, MessageRemediation } from "../foundation/index.js";

export const SiteContentSchemaIdentity = Object.freeze({ schemaId: "site-content", version: 1 } as const);
export type SiteContentSchemaIdentity = typeof SiteContentSchemaIdentity;

export type StructuredArticleBlock = Readonly<{ kind: "article"; text: string }>;
export type RawFullPageBlock = Readonly<{ kind: "raw-full-page"; html: string; staticFallback: string }>;
export type InteractiveDemoBlock = Readonly<{
  kind: "interactive-demo";
  identity: Readonly<{ id: string; version: string }>;
  hook: "cms/editor-block/resolve";
  manifestHash: Digest;
  source: Readonly<{ html: string; css: string; javascript: string }>;
  staticFallback: string;
}>;
export type StructuredSeo = Readonly<{
  title?: string;
  description?: string;
  canonicalPath?: string;
}>;

export type StructuredContent = Readonly<{
  contract: "site-content/v1";
  title: string;
  blocks: readonly (StructuredArticleBlock | RawFullPageBlock | InteractiveDemoBlock)[];
  seo: StructuredSeo;
}>;
export type StructuredContentArtifact = Readonly<{
  contract: "structured-content-artifact/v1";
  content: StructuredContent;
  bytes: Uint8Array;
  digest: Digest;
}>;

/** Content 只解讀 canonical revision bytes；呼叫端負責先依 current/published pointer 選定 revision。 */
export type ContentReadInput = Readonly<{
  schemaIdentity: SiteContentSchemaIdentity;
  contentBytes: Uint8Array;
  contentDigest: Digest;
}>;
export type ContentReadFailureCode =
  | "INVALID_CONTENT_MODEL_INPUT"
  | "CONTENT_DIGEST_MISMATCH"
  | "NON_CANONICAL_CONTENT_BYTES"
  | "UNSUPPORTED_CONTENT_CONTRACT"
  | "INVALID_STRUCTURED_CONTENT"
  | "RAW_FULL_PAGE_NOT_APPROVED";
export type ContentReadFailure = Readonly<{
  code: ContentReadFailureCode;
  owner: "Content";
  subjectIds: readonly string[];
  remediation: MessageRemediation;
}>;
export type ContentReadResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: ContentReadFailure }>;

/** raw full-page 僅在 composition 明確列出的 schema identity 下可進入 structured model。 */
export type CreatePublishedContentReadModelInput = Readonly<{
  approvedRawFullPageSchemas: readonly SiteContentSchemaIdentity[];
}>;
export type PublishedContentReadModel = Readonly<{
  read(input: ContentReadInput): ContentReadResult<StructuredContentArtifact>;
}>;
