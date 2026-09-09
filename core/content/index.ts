import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import { SiteContentSchemaIdentity } from "./contracts.js";

export { createPublishedContentReadModel, isSiteContentSchemaIdentity } from "./read-model.js";
export { SiteContentSchemaIdentity };
export type {
  ContentReadFailure,
  ContentReadFailureCode,
  ContentReadInput,
  ContentReadResult,
  CreatePublishedContentReadModelInput,
  InteractiveDemoBlock,
  PublishedContentReadModel,
  RawFullPageBlock,
  StructuredArticleBlock,
  StructuredContent,
  StructuredContentArtifact,
  StructuredSeo,
} from "./contracts.js";

export type SiteContentSchemaEvidence = Readonly<{
  identity: SiteContentSchemaIdentity;
  schema: JsonValue;
  schemaBytes: Uint8Array;
  schemaDigest: Digest;
}>;

export const SiteContentSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "site-content/v1",
  type: "object",
  additionalProperties: false,
  required: ["contract", "title", "blocks", "seo"],
  properties: {
    contract: { const: "site-content/v1" },
    title: { type: "string", minLength: 1 },
    blocks: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "text"],
            properties: { kind: { const: "article" }, text: { type: "string", minLength: 1 } },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "html", "staticFallback"],
            properties: {
              kind: { const: "raw-full-page" },
              html: { type: "string", minLength: 1 },
              staticFallback: { type: "string", minLength: 1 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "identity", "hook", "manifestHash", "source", "staticFallback"],
            properties: {
              kind: { const: "interactive-demo" },
              identity: {
                type: "object",
                additionalProperties: false,
                required: ["id", "version"],
                properties: { id: { type: "string", minLength: 1 }, version: { type: "string", minLength: 1 } },
              },
              hook: { const: "cms/editor-block/resolve" },
              manifestHash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
              source: {
                type: "object",
                additionalProperties: false,
                required: ["html", "css", "javascript"],
                properties: { html: { type: "string" }, css: { type: "string" }, javascript: { type: "string" } },
              },
              staticFallback: { type: "string", minLength: 1 },
            },
          },
        ],
      },
    },
    seo: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        canonicalPath: { type: "string", minLength: 1 },
      },
    },
  },
});

const encodedSiteContentSchema = canonicalJsonBytes(SiteContentSchema);
if (!encodedSiteContentSchema.ok) throw new Error("site-content schema must be canonical JSON");
const siteContentSchemaBytes = encodedSiteContentSchema.value;
const siteContentSchemaDigest = sha256Digest(siteContentSchemaBytes);

export function getSiteContentSchemaEvidence(): SiteContentSchemaEvidence {
  return Object.freeze({
    identity: Object.freeze({ ...SiteContentSchemaIdentity }),
    schema: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(siteContentSchemaBytes)) as JsonValue,
    schemaBytes: copyBytes(siteContentSchemaBytes),
    schemaDigest: siteContentSchemaDigest,
  });
}
