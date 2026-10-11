import { z, type ZodType } from "zod";
import type { AuthoringSession } from "./session.js";
export const AUTHORING_RESOURCE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const jsonContent = z.unknown().refine((value) => value !== undefined);
const remediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
const authoringErrorSchema = z.object({ contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string(), owner: z.string(), subjectIds: z.array(z.string()), remediation: remediationSchema }).strict();
const mediaUsageV2Schema = z.object({ entryId: z.string().min(1), status: z.enum(["draft", "published"]) }).strict();
/**
 * 被 entry 引用的 current media asset 不得 Replace／Delete。這個 failure 帶完整 usage evidence，
 * generic `authoring-error/v1` 無法承載，因此以 exact contract 單獨驗證並保留給 UI 顯示。
 */
const mediaAssetReferencedErrorSchema = z.object({ contract: z.literal("media-asset-referenced/v2"), requestId: z.string(), code: z.literal("MEDIA_ASSET_REFERENCED"), owner: z.literal("DataMedia"), subjectIds: z.array(z.string()), remediation: remediationSchema, usage: z.array(mediaUsageV2Schema).nonempty() }).strict();
const contentFieldKindSchema = z.enum(["text", "textarea", "number", "boolean", "url", "date", "datetime", "single-select", "multi-select", "single-media", "multi-media"]);
const contentFieldOptionSchema = z.object({ optionId: z.string(), label: z.string(), order: z.number().int().safe() }).strict();
/**
 * persisted definition 的 field 形狀必須在 client 端完整解析：Builder 與 entry editor 都以同一份
 * parser 為唯一解讀路徑，解析失敗一律 fail closed，不得退化成「沒有欄位群組」。
 */
const contentFieldSchema = z.object({ fieldId: z.string(), kind: contentFieldKindSchema, label: z.string(), help: z.string(), order: z.number().int().safe(), required: z.boolean(), showInGenericTemplate: z.boolean(), constraints: z.record(z.string(), jsonContent), options: z.array(contentFieldOptionSchema).optional(), defaultValue: jsonContent.optional() }).strict();
const contentFieldGroupSchema = z.object({ groupId: z.string(), label: z.string(), help: z.string(), order: z.number().int().safe(), fields: z.array(contentFieldSchema) }).strict();
export type ContentFieldKind = Readonly<z.infer<typeof contentFieldKindSchema>>;
export type ContentField = Readonly<z.infer<typeof contentFieldSchema>>;
export type ContentFieldGroup = Readonly<z.infer<typeof contentFieldGroupSchema>>;
const contentTypeSummarySchema = z.object({ typeId: z.string().uuid(), label: z.string(), slug: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), stateDigest: digestSchema }).strict();
const contentTypeSchema = z.object({ contract: z.literal("content-type-definition/v1"), typeId: z.string().uuid(), label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), systemFields: z.array(z.string()), fieldGroups: z.array(contentFieldGroupSchema), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()), stateDigest: digestSchema }).strict();
const contentTypeCatalogSchema = z.object({ contract: z.literal("content-type-catalog/v1"), items: z.array(contentTypeSummarySchema), stateDigest: digestSchema }).strict();
const contentTypeDeletedSchema = z.object({ contract: z.literal("content-type-deleted/v1"), typeId: z.string().uuid(), releasedSlug: z.string() }).strict();
const currentTaxonomyRecordSchema = z.object({ taxonomyId: z.string().uuid(), label: z.string(), slug: z.string(), hierarchical: z.boolean() }).strict();
const taxonomyTermSchema = z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid(), label: z.string(), slug: z.string(), parentTermId: z.string().uuid().optional(), order: z.number().int().safe(), state: z.enum(["live", "retired"]) }).strict();
const taxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v2"), taxonomy: currentTaxonomyRecordSchema, terms: z.array(taxonomyTermSchema), stateDigest: digestSchema }).strict();
const taxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v2"), taxonomies: z.array(z.object({ taxonomy: currentTaxonomyRecordSchema, stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
const taxonomyDeletedSchema = z.object({ contract: z.literal("taxonomy-deleted/v1"), taxonomyId: z.string().uuid(), releasedSlug: z.string() }).strict();
const mediaImageV2Schema = z.object({ width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaThumbnailV2Schema = z.object({ digest: digestSchema, byteLength: z.number().int().nonnegative(), width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaAssetV2Schema = z.object({ contract: z.literal("media-asset/v2"), assetId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), altText: z.string().nullable(), caption: z.string(), description: z.string(), originalFilename: z.string().min(1), mimeType: z.string().min(1), byteLength: z.number().int().nonnegative(), checksum: digestSchema, uploadedAt: z.string().min(1), image: mediaImageV2Schema.nullable(), thumbnail: mediaThumbnailV2Schema.nullable(), stateDigest: digestSchema }).strict();
const mediaCatalogV2Schema = z.object({ contract: z.literal("media-catalog/v2"), items: z.array(mediaAssetV2Schema), stateDigest: digestSchema }).strict();
const mediaAssetDetailV2Schema = z.object({ contract: z.literal("media-asset-detail/v2"), asset: mediaAssetV2Schema, usage: z.array(mediaUsageV2Schema) }).strict();
const mediaDeleteReceiptV2Schema = z.object({ contract: z.literal("media-delete-receipt/v2"), assetId: z.string().min(1), releasedSlug: z.string().min(1) }).strict();
const interactiveDemoBlockSchema = z.object({
  kind: z.literal("interactive-demo"),
  identity: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  hook: z.literal("cms/editor-block/resolve"),
  manifestHash: digestSchema,
  source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(),
  staticFallback: z.string().min(1),
}).strict();
const articleBlockSchema = z.object({ kind: z.literal("article"), text: z.string().min(1) }).strict();
const cptEntrySchema = z.object({ contract: z.literal("cpt-entry/v1"), entryId: z.string(), typeId: z.string(), slug: z.string(), content: z.object({ contract: z.literal("cpt-content/v1"), typeId: z.string(), title: z.string(), blocks: z.array(z.discriminatedUnion("kind", [articleBlockSchema, interactiveDemoBlockSchema])).min(1), excerpt: z.string(), seo: z.object({ title: z.string().optional(), description: z.string().optional(), canonicalPath: z.string().optional() }).strict(), featuredMedia: z.string().optional(), customValues: z.array(z.object({ fieldId: z.string(), value: jsonContent }).strict()) }).strict(), taxonomyTerms: z.array(z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid() }).strict()), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), lastPublishedDigest: digestSchema.optional(), stateDigest: digestSchema }).strict();
const cptEntryCatalogSchema = z.object({ contract: z.literal("cpt-entry-catalog/v1"), typeId: z.string(), items: z.array(z.object({ entryId: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
const cptEntrySearchResultSchema = z.object({ contract: z.literal("entry-search-result/v1"), typeId: z.string(), page: z.number().int().positive(), pageSize: z.literal(20), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), items: cptEntryCatalogSchema.shape.items, stateDigest: digestSchema }).strict();
const cptEntryDeletedSchema = z.object({ contract: z.literal("cpt-entry-deleted/v1"), entryId: z.string() }).strict();
export type CptEntryDto = Readonly<z.infer<typeof cptEntrySchema>>;
export type CptEntryCatalogDto = Readonly<z.infer<typeof cptEntryCatalogSchema>>;
export type CptEntrySearchResultDto = Readonly<z.infer<typeof cptEntrySearchResultSchema>>;
export type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
export type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
export type TaxonomySnapshotDto = Readonly<z.infer<typeof taxonomySnapshotSchema>>;
export type TaxonomyCatalogDto = Readonly<z.infer<typeof taxonomyCatalogSchema>>;
export type MediaAssetV2Dto = Readonly<z.infer<typeof mediaAssetV2Schema>>;
export type MediaCatalogV2Dto = Readonly<z.infer<typeof mediaCatalogV2Schema>>;
export type MediaAssetDetailV2Dto = Readonly<z.infer<typeof mediaAssetDetailV2Schema>>;
export type MediaUsageV2Dto = Readonly<z.infer<typeof mediaUsageV2Schema>>;
export type StructuredBlock = CptEntryDto["content"]["blocks"][number];

export type TaxonomyTermIdentity = Readonly<{ taxonomyId: string; termId: string }>;
export type TaxonomyAttachment = ContentTypeDto["taxonomyAttachments"][number];

export class CmsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly remediation: string, readonly usage: readonly MediaUsageV2Dto[] = [], readonly subjectIds: readonly string[] = []) {
    super(remediation);
  }
}

export function message(reason: unknown): string {
  return reason instanceof CmsApiError ? reason.remediation : "無法完成 CMS request。";
}
export type MediaImportMetadata = Readonly<{ contract: "media-import-metadata/v2"; title: string; slug?: string; altText: string | null; caption: string; description: string }>;

export class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  listMedia(): Promise<MediaCatalogV2Dto> { return this.json("/v1/media", mediaCatalogV2Schema); }
  getMedia(assetId: string): Promise<MediaAssetDetailV2Dto> { return this.json(`/v1/media/${this.resourceId(assetId)}`, mediaAssetDetailV2Schema); }
  saveMediaMetadata(request: Readonly<{ assetId: string; expectedStateDigest: string; title: string; slug: string; altText: string | null; caption: string; description: string }>): Promise<MediaAssetV2Dto> {
    return this.json(`/v1/media/${this.resourceId(request.assetId)}/metadata`, mediaAssetV2Schema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "media-metadata-save-request/v2", ...request }) });
  }
  deleteMedia(request: Readonly<{ assetId: string; expectedStateDigest: string }>): Promise<Readonly<z.infer<typeof mediaDeleteReceiptV2Schema>>> {
    return this.json(`/v1/media/${this.resourceId(request.assetId)}/delete`, mediaDeleteReceiptV2Schema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "media-delete-request/v2", ...request }) });
  }
  /**
   * multipart 上傳只能走 XHR：`Content-Type` 必須由瀏覽器帶 boundary（手動設定會讓 framing 失敗），
   * 且只有 XHR 能在 file part 尚未送完前回報 upload progress。`assetId` 為 null 代表 import，否則為 replace。
   */
  uploadMedia(assetId: string | null, expectedStateDigest: string | null, file: File, metadata: MediaImportMetadata, options: Readonly<{ onProgress?: (sent: number, progressTotal: number) => void; signal?: AbortSignal }> = {}): Promise<MediaAssetV2Dto> {
    const path = assetId === null ? "/v1/media/import" : `/v1/media/${this.resourceId(assetId)}/replace`;
    const envelope: unknown = assetId === null || expectedStateDigest === null ? metadata : { contract: "media-replace-request/v2", assetId, expectedStateDigest, metadata };
    const form = new FormData();
    // metadata part 不得帶 filename：server 的 multipart framing 只接受單一無檔名 metadata part。
    form.append("metadata", JSON.stringify(envelope));
    form.append("file", file, file.name);
    return new Promise<MediaAssetV2Dto>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const signal = options.signal;
      if (signal?.aborted === true) { reject(new CmsApiError("CMS_REQUEST_ABORTED", 0, "上傳已取消。")); return; }
      request.open("POST", path);
      request.withCredentials = false;
      request.responseType = "text";
      request.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
      const abort = (): void => { request.abort(); };
      signal?.addEventListener("abort", abort, { once: true });
      request.onabort = () => reject(new CmsApiError("CMS_REQUEST_ABORTED", 0, "上傳已取消。"));
      request.onerror = () => reject(new CmsApiError("CMS_NETWORK_FAILURE", 0, "無法連線本機 CMS。"));
      request.onload = () => {
        signal?.removeEventListener("abort", abort);
        const value: unknown = ((): unknown => { try { return JSON.parse(request.responseText) as unknown; } catch { return undefined; } })();
        if (request.status < 200 || request.status >= 300) {
          const referenced = mediaAssetReferencedErrorSchema.safeParse(value);
          if (referenced.success) { reject(new CmsApiError(referenced.data.code, request.status, referenced.data.remediation.message, referenced.data.usage)); return; }
          const error = authoringErrorSchema.safeParse(value);
          if (error.success) { reject(new CmsApiError(error.data.code, request.status, error.data.remediation.message)); return; }
          reject(new CmsApiError("CMS_RESPONSE_INVALID", request.status, "CMS response 無法驗證。")); return;
        }
        const parsed = mediaAssetV2Schema.safeParse(value);
        if (!parsed.success) { reject(new CmsApiError("CMS_RESPONSE_INVALID", request.status, "CMS response 無法驗證。")); return; }
        resolve(parsed.data);
      };
      request.send(form);
    });
  }
  contentTypes(): Promise<ContentTypeCatalogDto> { return this.json("/v1/content-types", contentTypeCatalogSchema); }
  contentType(typeId: string): Promise<ContentTypeDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}`, contentTypeSchema); }
  createContentType(request: Record<string, unknown>): Promise<ContentTypeDto> { return this.json("/v1/content-types", contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  replaceContentType(typeId: string, request: Record<string, unknown>): Promise<ContentTypeDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}`, contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  deleteContentType(typeId: string, expectedStateDigest: string): Promise<Readonly<z.infer<typeof contentTypeDeletedSchema>>> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/delete`, contentTypeDeletedSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "content-type-delete-request/v1", expectedStateDigest }) }); }
  taxonomies(): Promise<TaxonomyCatalogDto> { return this.json("/v1/taxonomies", taxonomyCatalogSchema); }
  createTaxonomy(request: Readonly<{ expectedStateDigest: string; label: string; slug?: string; hierarchical: boolean }>): Promise<TaxonomySnapshotDto> { return this.json("/v1/taxonomies", taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-create-request/v2", ...request }) }); }
  taxonomy(taxonomyId: string): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}`, taxonomySnapshotSchema); }
  taxonomyCommand(taxonomyId: string, command: Readonly<Record<string, unknown>>): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}/commands`, taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-command/v2", ...command }) }); }
  deleteTaxonomy(taxonomyId: string, expectedStateDigest: string): Promise<Readonly<z.infer<typeof taxonomyDeletedSchema>>> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}/delete`, taxonomyDeletedSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-delete-request/v1", expectedStateDigest }) }); }
  entryCatalog(typeId: string): Promise<CptEntryCatalogDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntryCatalogSchema); }
  searchEntries(typeId: string, request: Readonly<{ search: string; statuses: readonly ("draft" | "published")[]; taxonomyFilters: readonly Readonly<{ taxonomyId: string; termIds: readonly string[] }>[]; page: number }>): Promise<CptEntrySearchResultDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/search`, cptEntrySearchResultSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "entry-search-request/v1", typeId, ...request }) }); }
  entry(typeId: string, entryId: string): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema); }
  createEntry(typeId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  saveEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  deleteEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<unknown> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}/delete`, cptEntryDeletedSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }

  private resourceId(value: string): string {
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(value)) throw new CmsApiError("CMS_RESPONSE_INVALID", 0, "CMS request 無法驗證。");
    return value;
  }

  private async json<T>(path: `/v1/${string}`, schema: ZodType<T> | undefined, init?: RequestInit): Promise<T> {
    const response = await this.session.authorizedFetch(path, init);
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = authoringErrorSchema.safeParse(value);
      if (error.success) throw new CmsApiError(error.data.code, response.status, error.data.remediation.message, [], error.data.subjectIds);
      const referenced = mediaAssetReferencedErrorSchema.safeParse(value);
      if (referenced.success) throw new CmsApiError(referenced.data.code, response.status, referenced.data.remediation.message, referenced.data.usage);
      throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    }
    if (schema === undefined) return value as T;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    return parsed.data;
  }
}
