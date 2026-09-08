import type { ZodType } from "zod";

import { AUTHORING_RESOURCE_ID_PATTERN } from "../origin.js";
import {
  authoringErrorSchema,
  contentTypeCatalogSchema,
  contentTypeSchema,
  createContentTypeRequestSchema,
  entryCatalogSchema,
  entryDetailSchema,
  entryRevisionCatalogSchema,
  previewDocumentSchema,
  publishRevisionSuccessSchema,
  saveRevisionSuccessSchema,
  type ContentTypeCatalogDto,
  type ContentTypeDto,
  type EntryCatalogDto,
  type EntryDetailDto,
  type EntryRevisionCatalogDto,
  type PreviewDocumentDto,
  type PublishRevisionSuccessDto,
  type SaveRevisionSuccessDto,
} from "../transport-contracts.js";
import type { AuthoringSession } from "./authoring-session.js";

export class CmsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly remediation: string) {
    super(remediation);
  }
}

/** save-revision-request/v1 沒有 expected-current 欄位：這裡不得宣告 transport 送不出去的 optimistic concurrency 輸入。 */
export type ArticleSeo = Readonly<{ title?: string; description?: string; canonicalPath?: string }>
export type ArticleSaveInput = Readonly<{ revisionId: string; operationId: string; title: string; slug: string; text: string; seo: ArticleSeo }>;

export class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  async listContentTypes(): Promise<ContentTypeCatalogDto> { return this.json("/v1/content-types", contentTypeCatalogSchema); }
  async getContentType(schemaId: string): Promise<ContentTypeDto> { return this.json(`/v1/content-types/${this.resourceId(schemaId)}`, contentTypeSchema); }
  async createArticleType(): Promise<ContentTypeDto> {
    const body = { contract: "create-content-type-request/v1" as const, schemaId: "article", schema: articleSchema };
    if (!createContentTypeRequestSchema.safeParse(body).success) throw new CmsApiError("CMS_RESPONSE_INVALID", 0, "CMS response 無法驗證。");
    return this.json("/v1/content-types", contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async getEntries(): Promise<EntryCatalogDto> { return this.json("/v1/entries", entryCatalogSchema); }
  async getEntry(entryId: string): Promise<EntryDetailDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}`, entryDetailSchema); }
  async getEntryRevisions(entryId: string): Promise<EntryRevisionCatalogDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/revisions`, entryRevisionCatalogSchema); }
  async save(entryId: string, input: ArticleSaveInput): Promise<SaveRevisionSuccessDto> {
    const body = { contract: "save-revision-request/v1", revisionId: input.revisionId, operationId: input.operationId, schemaIdentity: { schemaId: "article", version: 1 }, content: { contract: "site-content/v1", title: input.title, blocks: [{ kind: "article", text: input.text }], seo: input.seo }, route: `/${input.slug}`, assetVersions: [] };
    return this.json(`/v1/entries/${this.resourceId(entryId)}/revisions`, saveRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async publish(entryId: string, expectedCurrentRevisionId: string): Promise<PublishRevisionSuccessDto> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/publish`, publishRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId, operationId: crypto.randomUUID() }) });
  }
  async preview(entryId: string, selection: "current" | "published"): Promise<PreviewDocumentDto> {
    return this.json("/v1/preview", previewDocumentSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "preview-request/v1", selection, subject: { entryId: this.resourceId(entryId) } }) });
  }

  private resourceId(value: string): string {
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(value)) throw new CmsApiError("CMS_RESPONSE_INVALID", 0, "CMS request 無法驗證。");
    return value;
  }

  private async json<T>(path: `/v1/${string}`, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    const response = await this.session.authorizedFetch(path, init);
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = authoringErrorSchema.safeParse(value);
      if (error.success) throw new CmsApiError(error.data.code, response.status, error.data.remediation.message);
      throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    return parsed.data;
  }
}

export const articleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["contract", "title", "blocks", "seo"],
  properties: {
    contract: { const: "site-content/v1" },
    title: { type: "string", pattern: ".*\\S.*" },
    blocks: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: false, required: ["kind", "text"], properties: { kind: { const: "article" }, text: { type: "string", minLength: 1 } } } },
    seo: { type: "object", additionalProperties: false, properties: { title: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 }, canonicalPath: { type: "string", minLength: 1 } } },
  },
} as const;
