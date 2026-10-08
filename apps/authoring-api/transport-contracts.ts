import type { ContentTypeAdministrationFailureCode, CurrentEntryAdministrationFailureCode, CurrentTaxonomyFailureCode } from "../../core/application/index.js";
import type { DataMediaFailureCode } from "../../core/media/index.js";
import { z } from "zod";
import { API_KEY_PATTERN, BROWSER_TICKET_PATTERN, SECRET_TEXT_PATTERN } from "./origin.js";

const positiveInteger = z.number().int().safe().positive();
const stringArray = z.array(z.string());
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const messageRemediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
const jsonContent = z.unknown().refine((value) => value !== undefined);
const contentTypeSummarySchema = z.object({ typeId: z.string().uuid(), label: z.string(), slug: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), stateDigest: digestSchema }).strict();
const contentTypeDefinitionBaseSchema = z.object({ contract: z.literal("content-type-definition/v1"), typeId: z.string().uuid(), label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), systemFields: z.array(z.string()), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
export const contentTypeSchema = contentTypeDefinitionBaseSchema.extend({ stateDigest: digestSchema }).strict();
export const contentTypeCatalogSchema = z.object({ contract: z.literal("content-type-catalog/v1"), items: z.array(contentTypeSummarySchema), stateDigest: digestSchema }).strict();
export const createContentTypeRequestSchema = z.object({ contract: z.literal("content-type-create-request/v1"), expectedStateDigest: digestSchema, label: z.string(), slug: z.string().optional(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
export const replaceContentTypeRequestSchema = z.object({ contract: z.literal("content-type-replace-request/v1"), expectedStateDigest: digestSchema, label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
const cptArticleBlockSchema = z.object({ kind: z.literal("article"), text: z.string().min(1) }).strict();
const cptInteractiveDemoBlockSchema = z.object({
  kind: z.literal("interactive-demo"),
  identity: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  hook: z.literal("cms/editor-block/resolve"),
  manifestHash: digestSchema,
  source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(),
  staticFallback: z.string().min(1),
}).strict();
const cptContentSchema = z.object({
  contract: z.literal("cpt-content/v1"),
  typeId: z.string(),
  title: z.string(),
  blocks: z.array(z.discriminatedUnion("kind", [cptArticleBlockSchema, cptInteractiveDemoBlockSchema])).min(1),
  excerpt: z.string(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional(), canonicalPath: z.string().optional() }).strict(),
  featuredMedia: z.string().optional(),
  /** transport 只固定 DTO 形狀與排序容器；kind shape 與 constraints 由 Application 決定（422）。 */
  customValues: z.array(z.object({ fieldId: z.string(), value: jsonContent }).strict()),
}).strict();
export const cptEntrySchema = z.object({
  contract: z.literal("cpt-entry/v1"),
  entryId: z.string(),
  typeId: z.string(),
  slug: z.string(),
  content: cptContentSchema,
  taxonomyTerms: z.array(z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid() }).strict()),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().optional(),
  lastPublishedDigest: digestSchema.optional(),
  stateDigest: digestSchema,
}).strict();
const cptEntrySummarySchema = z.object({ entryId: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), stateDigest: digestSchema }).strict();
export const cptEntryCatalogSchema = z.object({ contract: z.literal("cpt-entry-catalog/v1"), typeId: z.string(), items: z.array(cptEntrySummarySchema), stateDigest: digestSchema }).strict();
export const cptEntrySearchRequestSchema = z.object({ contract: z.literal("entry-search-request/v1"), typeId: z.string(), search: z.string(), statuses: z.array(z.enum(["draft", "published"])), taxonomyFilters: z.array(z.object({ taxonomyId: z.string(), termIds: z.array(z.string()) }).strict()), page: z.number().int().positive() }).strict();
export const cptEntrySearchResultSchema = z.object({ contract: z.literal("entry-search-result/v1"), typeId: z.string(), page: z.number().int().positive(), pageSize: z.literal(20), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), items: z.array(cptEntrySummarySchema), stateDigest: digestSchema }).strict();
export const cptEntryCreateRequestSchema = z.object({ contract: z.literal("cpt-entry-create-request/v1"), expectedStateDigest: digestSchema, slug: z.string().optional(), content: cptContentSchema, taxonomyTerms: z.array(z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid() }).strict()), status: z.string() }).strict();
export const cptEntrySaveRequestSchema = z.object({ contract: z.literal("cpt-entry-save-request/v1"), expectedStateDigest: digestSchema, slug: z.string(), content: cptContentSchema, taxonomyTerms: z.array(z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid() }).strict()), status: z.string() }).strict();
export const cptEntryDeleteRequestSchema = z.object({ contract: z.literal("cpt-entry-delete-request/v1"), expectedStateDigest: digestSchema }).strict();
export const cptEntryDeletedSchema = z.object({ contract: z.literal("cpt-entry-deleted/v1"), entryId: z.string() }).strict();
const currentTaxonomyRecordSchema = z.object({ taxonomyId: z.string().uuid(), label: z.string().min(1), slug: z.string().min(1), hierarchical: z.boolean() }).strict();
const currentTermRecordSchema = z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid(), label: z.string().min(1), slug: z.string().min(1), parentTermId: z.string().uuid().optional(), order: z.number().int().nonnegative(), state: z.enum(["live", "retired"]) }).strict();
export const currentTaxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v2"), taxonomy: currentTaxonomyRecordSchema, terms: z.array(currentTermRecordSchema), stateDigest: digestSchema }).strict();
export const currentTaxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v2"), taxonomies: z.array(z.object({ taxonomy: currentTaxonomyRecordSchema, stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
export const currentTaxonomyCreateSchema = z.object({ contract: z.literal("taxonomy-create-request/v2"), expectedStateDigest: digestSchema, label: z.string().min(1), slug: z.string().optional(), hierarchical: z.boolean() }).strict();
export const currentTaxonomyCommandSchema = z.discriminatedUnion("kind", [
  z.object({ contract: z.literal("taxonomy-command/v2"), kind: z.literal("replace-taxonomy"), expectedStateDigest: digestSchema, label: z.string().min(1), slug: z.string(), hierarchical: z.boolean() }).strict(),
  z.object({ contract: z.literal("taxonomy-command/v2"), kind: z.literal("create-term"), expectedStateDigest: digestSchema, label: z.string().min(1), slug: z.string().optional(), parentTermId: z.string().uuid().optional(), order: z.number().int().nonnegative() }).strict(),
  z.object({ contract: z.literal("taxonomy-command/v2"), kind: z.literal("replace-term"), expectedStateDigest: digestSchema, termId: z.string().uuid(), label: z.string().min(1), slug: z.string(), parentTermId: z.string().uuid().optional(), order: z.number().int().nonnegative(), state: z.enum(["live", "retired"]) }).strict(),
  z.object({ contract: z.literal("taxonomy-command/v2"), kind: z.literal("delete-term"), expectedStateDigest: digestSchema, termId: z.string().uuid() }).strict(),
]);
const mediaImageSchema = z.object({ width: positiveInteger, height: positiveInteger }).strict();
const mediaThumbnailSchema = z.object({ digest: digestSchema, byteLength: z.number().int().nonnegative(), width: positiveInteger, height: positiveInteger }).strict();
export const mediaAssetV2Schema = z.object({
  contract: z.literal("media-asset/v2"), assetId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1),
  altText: z.string().nullable(), caption: z.string(), description: z.string(),
  originalFilename: z.string().min(1), mimeType: z.string().min(1), byteLength: z.number().int().nonnegative(), checksum: digestSchema, uploadedAt: z.string().min(1),
  image: mediaImageSchema.nullable(), thumbnail: mediaThumbnailSchema.nullable(), stateDigest: digestSchema,
}).strict();
export const mediaCatalogV2Schema = z.object({ contract: z.literal("media-catalog/v2"), items: z.array(mediaAssetV2Schema), stateDigest: digestSchema }).strict();
export const mediaUsageSchema = z.object({ entryId: z.string().min(1), status: z.enum(["draft", "published"]) }).strict();
export const mediaAssetDetailV2Schema = z.object({ contract: z.literal("media-asset-detail/v2"), asset: mediaAssetV2Schema, usage: z.array(mediaUsageSchema) }).strict();
/** Multipart 的 metadata part 內容；bytes 不走 JSON。 */
export const mediaImportMetadataSchema = z.object({ contract: z.literal("media-import-metadata/v2"), title: z.string(), slug: z.string().optional(), altText: z.string().nullable().optional(), caption: z.string().optional(), description: z.string().optional() }).strict();
export const mediaReplaceRequestSchema = z.object({ contract: z.literal("media-replace-request/v2"), assetId: z.string().min(1), expectedStateDigest: digestSchema, metadata: mediaImportMetadataSchema }).strict();
export const mediaMetadataSaveRequestSchema = z.object({ contract: z.literal("media-metadata-save-request/v2"), assetId: z.string().min(1), expectedStateDigest: digestSchema, title: z.string(), slug: z.string(), altText: z.string().nullable(), caption: z.string(), description: z.string() }).strict();
export const mediaDeleteRequestSchema = z.object({ contract: z.literal("media-delete-request/v2"), assetId: z.string().min(1), expectedStateDigest: digestSchema }).strict();
export const mediaDeleteReceiptSchema = z.object({ contract: z.literal("media-delete-receipt/v2"), assetId: z.string().min(1), releasedSlug: z.string().min(1) }).strict();

export const serverProofChallengeSchema = z.object({
  contract: z.literal("authoring-server-proof-challenge/v1"),
  generation: positiveInteger,
  nonce: z.string().regex(SECRET_TEXT_PATTERN),
}).strict();

export const serverProofSchema = z.object({
  contract: z.literal("authoring-server-proof/v1"),
  generation: positiveInteger,
  nonce: z.string().regex(SECRET_TEXT_PATTERN),
  mac: z.string().regex(SECRET_TEXT_PATTERN),
}).strict();

export const browserTicketMintRequestSchema = z.object({
  contract: z.literal("browser-ticket-mint-request/v1"),
  generation: positiveInteger,
  proofNonce: z.string().regex(SECRET_TEXT_PATTERN),
}).strict();

export const browserTicketSchema = z.object({
  contract: z.literal("browser-ticket/v1"),
  ticket: z.string().regex(BROWSER_TICKET_PATTERN),
  generation: positiveInteger,
  expiresInSeconds: z.literal(60),
}).strict();

export const browserSessionExchangeSchema = z.object({
  contract: z.literal("browser-session-exchange/v1"),
  ticket: z.string().regex(BROWSER_TICKET_PATTERN),
}).strict();

export const browserSessionSchema = z.object({
  contract: z.literal("browser-session/v1"),
  generation: positiveInteger,
  apiKey: z.string().regex(API_KEY_PATTERN),
}).strict();
export type TransportCode =
  | "INVALID_REQUEST_FRAMING" | "MISDIRECTED_REQUEST" | "ORIGIN_FORBIDDEN"
  | "AUTHORIZATION_REQUIRED" | "AUTHORIZATION_MALFORMED" | "AUTHORIZATION_DUPLICATE"
  | "AUTHORIZATION_ALTERNATE_TRANSPORT" | "AUTHORIZATION_INVALID" | "AUTHORIZATION_REVOKED"
  | "SERVER_PROOF_GENERATION_MISMATCH" | "BROWSER_BOOTSTRAP_INVALID" | "INVALID_REQUEST_BODY"
  | "REQUEST_BODY_TOO_LARGE" | "ROUTE_NOT_FOUND" | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_SERVER_ERROR";
type RemoteFailureCode = (typeof mediaLibraryCodes)[number] | TransportCode | CurrentTaxonomyFailureCode | ContentTypeAdministrationFailureCode | CurrentEntryAdministrationFailureCode;
const transportStatuses: Readonly<Record<TransportCode, readonly number[]>> = {
  INVALID_REQUEST_FRAMING: [400], MISDIRECTED_REQUEST: [421], ORIGIN_FORBIDDEN: [403],
  AUTHORIZATION_REQUIRED: [401], AUTHORIZATION_MALFORMED: [401], AUTHORIZATION_DUPLICATE: [401], AUTHORIZATION_ALTERNATE_TRANSPORT: [401], AUTHORIZATION_INVALID: [401], AUTHORIZATION_REVOKED: [401],
  SERVER_PROOF_GENERATION_MISMATCH: [401], BROWSER_BOOTSTRAP_INVALID: [401], INVALID_REQUEST_BODY: [400], REQUEST_BODY_TOO_LARGE: [400],
  ROUTE_NOT_FOUND: [404], METHOD_NOT_ALLOWED: [405], UNSUPPORTED_MEDIA_TYPE: [415], INTERNAL_SERVER_ERROR: [500, 503],
};
const contentTypeAdministrationStatuses: Readonly<Record<ContentTypeAdministrationFailureCode, readonly number[]>> = { INVALID_CONTENT_TYPE_DEFINITION: [422], CONTENT_TYPE_NOT_FOUND: [404], CONTENT_TYPE_STATE_CONFLICT: [409], CONTENT_TYPE_BREAKING_CHANGE: [422], CONTENT_TYPE_ADMINISTRATION_FAILED: [500] };
const entryAdministrationStatuses: Readonly<Record<CurrentEntryAdministrationFailureCode, readonly number[]>> = { INVALID_ENTRY_CONTENT: [422], INVALID_ENTRY_CUSTOM_VALUES: [422], INVALID_ENTRY_MEDIA: [422], INVALID_ENTRY_TAXONOMY: [422], INVALID_ENTRY_SEARCH: [422], ENTRY_NOT_FOUND: [404], CONTENT_TYPE_NOT_FOUND: [404], ENTRY_STATE_CONFLICT: [409], ENTRY_ADMINISTRATION_FAILED: [500] };
const currentTaxonomyStatuses: Readonly<Record<CurrentTaxonomyFailureCode, readonly number[]>> = { INVALID_TAXONOMY: [422], TAXONOMY_NOT_FOUND: [404], TAXONOMY_STATE_CONFLICT: [409], TERM_NOT_FOUND: [404], TERM_IN_USE: [409], TAXONOMY_FAILED: [500] };
/**
 * Current media library 只會回傳這些 DataMedia code；逐一列出可讓 status 與 wire contract 對齊，
 * 不必讓整個 v1 DataMedia failure union 進入 transport status 表。
 */
const mediaLibraryCodes = ["INVALID_MEDIA_LIBRARY_INPUT", "MEDIA_ROOT_FAILURE", "MEDIA_STAGING_FAILURE", "MEDIA_PROMOTION_FAILURE", "MEDIA_FINAL_VERIFICATION_FAILURE", "MEDIA_ASSET_NOT_FOUND", "MEDIA_ASSET_STATE_CONFLICT", "MEDIA_ASSET_REFERENCED", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_TYPE_MISMATCH", "MEDIA_THUMBNAIL_FAILURE", "MEDIA_LIBRARY_FAILURE", "MEDIA_SIZE_LIMIT_EXCEEDED"] as const satisfies readonly DataMediaFailureCode[];
const mediaLibraryStatuses: Readonly<Record<(typeof mediaLibraryCodes)[number], readonly number[]>> = {
  INVALID_MEDIA_LIBRARY_INPUT: [422], MEDIA_ROOT_FAILURE: [500], MEDIA_STAGING_FAILURE: [500],
  MEDIA_PROMOTION_FAILURE: [500], MEDIA_FINAL_VERIFICATION_FAILURE: [500], MEDIA_ASSET_NOT_FOUND: [404],
  MEDIA_ASSET_STATE_CONFLICT: [409], MEDIA_ASSET_REFERENCED: [409], MEDIA_UNSUPPORTED_TYPE: [422],
  MEDIA_TYPE_MISMATCH: [422], MEDIA_THUMBNAIL_FAILURE: [500], MEDIA_LIBRARY_FAILURE: [500], MEDIA_SIZE_LIMIT_EXCEEDED: [400],
};
const statusByCode: Readonly<Record<RemoteFailureCode, readonly number[]>> = { ...transportStatuses, ...contentTypeAdministrationStatuses, ...entryAdministrationStatuses, ...currentTaxonomyStatuses, ...mediaLibraryStatuses };
export type AuthoringRemoteErrorCode = keyof typeof statusByCode;
export function authoringErrorStatuses(code: string): readonly number[] | undefined {
  return Object.prototype.hasOwnProperty.call(statusByCode, code) ? statusByCode[code as AuthoringRemoteErrorCode] : undefined;
}
export type MediaMetadataSaveRequestDto = Readonly<z.infer<typeof mediaMetadataSaveRequestSchema>>;
export type MediaDeleteRequestDto = Readonly<z.infer<typeof mediaDeleteRequestSchema>>;
export const mediaAssetReferencedErrorSchema = z.object({
  contract: z.literal("media-asset-referenced/v2"), requestId: z.string(), code: z.literal("MEDIA_ASSET_REFERENCED"), owner: z.literal("DataMedia"),
  subjectIds: stringArray, remediation: messageRemediationSchema, usage: z.array(mediaUsageSchema).nonempty(),
}).strict();
export type MediaAssetReferencedErrorDto = Readonly<z.infer<typeof mediaAssetReferencedErrorSchema>>;
export const authoringErrorSchema = z.object({
  contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string().refine((code) => authoringErrorStatuses(code) !== undefined),
  owner: z.enum(["AuthoringApi", "AuthoringCredential", "DataMedia", "ContentTypeAdministration", "CurrentEntryAdministration", "CurrentTaxonomyAdministration"]),
  subjectIds: stringArray, remediation: messageRemediationSchema,
}).strict();
export type ServerProofChallengeDto = Readonly<z.infer<typeof serverProofChallengeSchema>>;
export type ServerProofDto = Readonly<z.infer<typeof serverProofSchema>>;
export type BrowserTicketMintRequestDto = Readonly<z.infer<typeof browserTicketMintRequestSchema>>;
export type BrowserTicketDto = Readonly<z.infer<typeof browserTicketSchema>>;
export type BrowserSessionExchangeDto = Readonly<z.infer<typeof browserSessionExchangeSchema>>;
export type BrowserSessionDto = Readonly<z.infer<typeof browserSessionSchema>>;
export type MediaCatalogV2Dto = Readonly<z.infer<typeof mediaCatalogV2Schema>>;
export type MediaAssetDetailV2Dto = Readonly<z.infer<typeof mediaAssetDetailV2Schema>>;
export type MediaAssetV2Dto = Readonly<z.infer<typeof mediaAssetV2Schema>>;
export type MediaDeleteReceiptDto = Readonly<z.infer<typeof mediaDeleteReceiptSchema>>;
export type MediaReplaceRequestDto = Readonly<z.infer<typeof mediaReplaceRequestSchema>>;
export type MediaImportMetadataDto = Readonly<z.infer<typeof mediaImportMetadataSchema>>;
export type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
export type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
export type CptEntryDto = Readonly<z.infer<typeof cptEntrySchema>>;
export type CptEntryCatalogDto = Readonly<z.infer<typeof cptEntryCatalogSchema>>;
export type CptEntryDeletedDto = Readonly<z.infer<typeof cptEntryDeletedSchema>>;
export type CurrentTaxonomySnapshotDto = Readonly<z.infer<typeof currentTaxonomySnapshotSchema>>;
export type CurrentTaxonomyCatalogDto = Readonly<z.infer<typeof currentTaxonomyCatalogSchema>>;
