import type { AuthoringReadFailureCode, ContentTypeAdministrationFailureCode, ContentTypeMigrationFailureCode, CurrentEntryAdministrationFailureCode, DomainApplicationFailureCode, TaxonomyFailureCode } from "../../core/application/index.js";
import type { DataMediaFailureCode } from "../../core/media/index.js";
import type { ContentReadFailureCode } from "../../core/content/index.js";
import type { PluginHostFailureCode } from "../../core/plugin-host/index.js";
import type { ProjectionFailureCode } from "../../core/projection/index.js";
import type { ThemeHostFailureCode } from "../../core/theme-host/index.js";
import type { ReleaseTransportFailureCode } from "./release-transport.js";
import { z } from "zod";

import { API_KEY_PATTERN, BROWSER_TICKET_PATTERN, SECRET_TEXT_PATTERN } from "./origin.js";

const positiveInteger = z.number().int().safe().positive();
const stringArray = z.array(z.string());
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const messageRemediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
/**
 * wire 上的 `content` 一定來自 `JSON.parse`，因此 `undefined` 不可能出現；但
 * `z.unknown()` 會放行 in-process caller 傳進來的 explicit `undefined`，而
 * `JSON.stringify` 又會把該 key 整個丟掉。若不擋在 client 端，caller 會拿到
 * listener 回來的 `INVALID_REQUEST_BODY`，而不是本地的 `INVALID_CLIENT_REQUEST`。
 */
const jsonContent = z.unknown().refine((value) => value !== undefined);
const schemaIdentitySchema = z.object({ schemaId: z.string(), version: positiveInteger }).strict();
const routeSchema = z.object({ normalizedRoute: z.string(), sourceRevisionId: z.string() }).strict();
const referenceSchema = z.object({ assetId: z.string(), assetVersionId: z.string(), availability: z.enum(["ready", "archived", "missing"]) }).strict();
const revisionDocumentSchema = z.object({ revisionId: z.string(), schemaIdentity: schemaIdentitySchema, content: jsonContent, contentDigest: z.string(), lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(), restoredFromRevisionId: z.string().optional(), references: z.array(referenceSchema) }).strict();
const routeGraphsSchema = z.object({ current: z.object({ digest: z.string(), claims: z.array(z.unknown()) }).strict(), published: z.object({ digest: z.string(), claims: z.array(z.unknown()) }).strict() }).strict();
const routeClaimSchema = z.object({ graph: z.enum(["current", "published"]), normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict();
const routeGraphDigestsSchema = z.object({ current: digestSchema, published: digestSchema }).strict();
const routeImpactSchema = z.object({ change: z.enum(["route-move", "attribution-only", "retained"]), graph: z.enum(["current", "published"]), owner: z.string(), from: z.string(), to: z.string(), resultingSourceRevisionId: z.string() }).strict();
export const siteRouteGraphSchema = z.object({ contract: z.literal("route-graph/v1"), normalization: z.literal("route-normalization/v1"), graph: z.enum(["current", "published"]), claims: z.array(routeClaimSchema), digest: digestSchema }).strict();
export const routeChangeProposalRequestSchema = z.object({ contract: z.literal("route-change-proposal-request/v1"), expectedRouteGraphDigests: routeGraphDigestsSchema, graph: z.enum(["current", "published"]), owner: z.string(), route: z.string(), sourceRevisionId: z.string() }).strict();
export const routeChangeProposalSchema = z.object({ contract: z.literal("route-change-proposal/v1"), baselineDigests: routeGraphDigestsSchema, claim: routeClaimSchema, impact: z.array(routeImpactSchema), resultingDigests: routeGraphDigestsSchema }).strict();
export const changeRouteCommandSchema = z.object({ contract: z.literal("change-route-command/v1"), operationId: z.string(), proposal: routeChangeProposalSchema }).strict();
export const changeRouteSuccessSchema = z.object({ contract: z.literal("change-route-success/v1"), claim: routeClaimSchema, impact: z.array(routeImpactSchema), baselineDigests: routeGraphDigestsSchema, resultingDigests: routeGraphDigestsSchema, entryPointer: z.object({ entryId: z.string(), currentRevisionId: z.string(), publishedRevisionId: z.string().optional() }).strict(), lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(), stateDigest: digestSchema }).strict();

const contentTypeSummarySchema = z.object({ typeId: z.string().uuid(), label: z.string(), slug: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), stateDigest: digestSchema }).strict();
const contentTypeDefinitionBaseSchema = z.object({ contract: z.literal("content-type-definition/v1"), typeId: z.string().uuid(), label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), systemFields: z.array(z.string()), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
export const contentTypeSchema = contentTypeDefinitionBaseSchema.extend({ stateDigest: digestSchema }).strict();
export const contentTypeCatalogSchema = z.object({ contract: z.literal("content-type-catalog/v1"), items: z.array(contentTypeSummarySchema), stateDigest: digestSchema }).strict();
export const createContentTypeRequestSchema = z.object({ contract: z.literal("content-type-create-request/v1"), expectedStateDigest: digestSchema, label: z.string(), slug: z.string().optional(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
export const replaceContentTypeRequestSchema = z.object({ contract: z.literal("content-type-replace-request/v1"), expectedStateDigest: digestSchema, label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), fieldGroups: z.array(jsonContent), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()) }).strict();
const migrationRevisionSchema = z.object({ entryId: z.string(), revisionId: z.string() }).strict();
const migrationPolicySchema = z.object({ entryId: z.string(), pointer: z.enum(["current", "published"]), policy: z.enum(["move", "pin"]) }).strict();
const migrationMappingSchema = z.object({ sourceRevision: migrationRevisionSchema, replacement: jsonContent }).strict();
const migrationProposalBaseSchema = z.object({ contract: z.literal("content-type-migration/v1"), sourceVersion: positiveInteger, targetSchema: jsonContent, pointerPolicies: z.array(migrationPolicySchema), mappings: z.array(migrationMappingSchema) }).strict();
export const contentTypeMigrationProposalSchema = migrationProposalBaseSchema.extend({ kind: z.literal("proposal") }).strict();
export const contentTypeMigrationCommandSchema = migrationProposalBaseSchema.extend({ kind: z.literal("command"), expectedStateDigest: digestSchema, operationId: z.string(), replacements: z.array(z.object({ sourceRevision: migrationRevisionSchema, replacementRevisionId: z.string() }).strict()) }).strict();
const migrationAffectedPointerSchema = z.object({ entryId: z.string(), pointer: z.enum(["current", "published"]), revisionId: z.string(), targetSchemaIdentity: schemaIdentitySchema, policy: z.enum(["move", "pin", "unassigned"]) }).strict();
const migrationBlockedReasonSchema = z.object({ code: z.enum(["POINTER_POLICY_MISSING", "MAPPING_NOT_PROVIDED", "MISSING_REQUIRED_FIELD", "INVALID_SELECT_MAPPING", "TARGET_SCHEMA_REJECTED"]), remediation: messageRemediationSchema, schemaPath: z.string().optional() }).strict();
const migrationBlockedRowSchema = z.object({ subject: z.union([z.object({ kind: z.literal("pointer"), entryId: z.string(), pointer: z.enum(["current", "published"]), revisionId: z.string() }).strict(), z.object({ kind: z.literal("mapping"), sourceRevision: migrationRevisionSchema }).strict()]), reasons: z.array(migrationBlockedReasonSchema) }).strict();
const migrationImpactBaseSchema = z.object({ contract: z.literal("content-type-migration/v1"), sourceSchemaIdentity: schemaIdentitySchema, targetSchemaIdentity: schemaIdentitySchema, mappingIdentity: digestSchema, affectedPointers: z.array(migrationAffectedPointerSchema), historicalRevisions: z.array(z.object({ revision: migrationRevisionSchema, disposition: z.literal("retained") }).strict()), mapping: z.array(z.object({ sourceRevision: migrationRevisionSchema, targetSchemaIdentity: schemaIdentitySchema, affectedPointers: z.array(migrationAffectedPointerSchema), outcome: z.enum(["validated", "blocked"]) }).strict()), blockedRows: z.array(migrationBlockedRowSchema), stateDigest: digestSchema }).strict();
const migrationPreviewSchema = migrationImpactBaseSchema.extend({ kind: z.literal("preview") }).strict();
const migrationBlockedImpactSchema = migrationImpactBaseSchema.extend({ kind: z.literal("blocked") }).strict();
const migrationExecutionSchema = migrationImpactBaseSchema.extend({ kind: z.literal("execution"), operationId: z.string(), replacements: z.array(z.object({ sourceRevision: migrationRevisionSchema, replacementRevision: migrationRevisionSchema }).strict()), pointers: z.array(z.object({ entryId: z.string(), pointer: z.enum(["current", "published"]), sourceRevisionId: z.string(), policy: z.enum(["move", "pin"]), resultRevisionId: z.string() }).strict()), afterDigest: digestSchema }).strict();
export const contentTypeMigrationOutcomeSchema = z.union([migrationPreviewSchema, migrationBlockedImpactSchema, migrationExecutionSchema]);
export const contentTypeMigrationBlockedErrorSchema = z.object({ contract: z.literal("content-type-migration-blocked/v1"), requestId: z.string(), code: z.literal("CONTENT_TYPE_MIGRATION_BLOCKED"), owner: z.literal("ContentTypeMigration"), subjectIds: stringArray, remediation: messageRemediationSchema, impact: migrationBlockedImpactSchema }).strict();
export const entryCatalogSchema = z.object({ contract: z.literal("entry-catalog/v1"), items: z.array(z.object({ entryId: z.string(), title: z.string(), status: z.enum(["draft", "published", "published-with-draft"]), current: z.object({ revisionId: z.string(), contentDigest: z.string(), normalizedRoute: z.string() }).strict(), published: z.object({ revisionId: z.string(), contentDigest: z.string(), normalizedRoute: z.string() }).strict().optional() }).strict()), routeGraphs: routeGraphsSchema, stateDigest: z.string() }).strict();
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
}).strict();
export const cptEntrySchema = z.object({
  contract: z.literal("cpt-entry/v1"),
  entryId: z.string(),
  typeId: z.string(),
  slug: z.string(),
  content: cptContentSchema,
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().optional(),
  lastPublishedDigest: digestSchema.optional(),
  stateDigest: digestSchema,
}).strict();
const cptEntrySummarySchema = z.object({ entryId: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), stateDigest: digestSchema }).strict();
export const cptEntryCatalogSchema = z.object({ contract: z.literal("cpt-entry-catalog/v1"), typeId: z.string(), items: z.array(cptEntrySummarySchema), stateDigest: digestSchema }).strict();
export const cptEntryCreateRequestSchema = z.object({ contract: z.literal("cpt-entry-create-request/v1"), expectedStateDigest: digestSchema, slug: z.string().optional(), content: cptContentSchema, status: z.string() }).strict();
export const cptEntrySaveRequestSchema = z.object({ contract: z.literal("cpt-entry-save-request/v1"), expectedStateDigest: digestSchema, slug: z.string(), content: cptContentSchema, status: z.string() }).strict();
export const cptEntryDeleteRequestSchema = z.object({ contract: z.literal("cpt-entry-delete-request/v1"), expectedStateDigest: digestSchema }).strict();
export const cptEntryDeletedSchema = z.object({ contract: z.literal("cpt-entry-deleted/v1"), entryId: z.string() }).strict();
export const entryDetailSchema = z.object({ contract: z.literal("entry-detail/v1"), entryId: z.string(), status: z.enum(["draft", "published", "published-with-draft"]), pointer: z.object({ entryId: z.string(), currentRevisionId: z.string(), publishedRevisionId: z.string().optional() }).strict(), current: z.object({ revision: revisionDocumentSchema, route: routeSchema }).strict(), published: z.object({ revision: revisionDocumentSchema, route: routeSchema }).strict().optional(), pointerLineage: z.array(z.object({ entryId: z.string(), currentRevisionId: z.string(), publishedRevisionId: z.string().optional(), lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict() }).strict()), routeGraphs: routeGraphsSchema, stateDigest: z.string() }).strict();
export const entryRevisionCatalogSchema = z.object({ contract: z.literal("entry-revision-catalog/v1"), entryId: z.string(), items: z.array(revisionDocumentSchema), stateDigest: z.string() }).strict();
export const previewRequestSchema = z.object({ contract: z.literal("preview-request/v1"), selection: z.enum(["current", "published"]), subject: z.object({ entryId: z.string() }).strict() }).strict();
export const previewDocumentSchema = z.object({ contract: z.literal("preview-document/v1"), selection: z.enum(["current", "published"]), subject: z.object({ entryId: z.string() }).strict(), revisionId: z.string(), contentDigest: z.string(), document: z.string() }).strict();
const mediaIdentitySchema = z.object({ assetId: z.string(), assetVersionId: z.string() }).strict();
const restoreCommandSchema = z.object({ contract: z.literal("restore-asset-command/v1"), command: z.literal("RestoreAsset"), assetVersion: mediaIdentitySchema, recovery: z.enum(["none", "local-bytes-and-metadata"]) }).strict();
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

export const saveRevisionRequestSchema = z.object({
  contract: z.literal("save-revision-request/v1"),
  revisionId: z.string(),
  operationId: z.string(),
  expectedCurrentRevisionId: z.string().nullable(),
  schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
  content: jsonContent,
  route: z.string(),
  assetVersions: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
  taxonomyTerms: z.array(z.object({ taxonomyId: z.string(), termId: z.string() }).strict()),
}).strict();

export const saveRevisionSuccessSchema = z.object({
  contract: z.literal("save-revision-success/v1"),
  entryId: z.string(),
  revision: z.object({
    revisionId: z.string(),
    schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
    contentDigest: z.string(),
    lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(),
  }).strict(),
  references: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
  pointer: z.object({ currentRevisionId: z.string(), publishedRevisionId: z.string().optional() }).strict(),
  currentRoute: z.object({ normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict(),
  lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(),
  stateDigest: z.string(),
  activePluginStateDigest: z.string(),
}).strict();

export const restoreRevisionRequestSchema = z.object({
  contract: z.literal("restore-revision-request/v1"),
  sourceRevisionId: z.string(),
  newRevisionId: z.string(),
  operationId: z.string(),
}).strict();

export const restoreRevisionSuccessSchema = z.object({
  contract: z.literal("restore-revision-success/v1"),
  entryId: z.string(),
  revision: z.object({
    revisionId: z.string(),
    schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
    contentDigest: z.string(),
    lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(),
    restoredFromRevisionId: z.string(),
  }).strict(),
  references: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
  pointer: z.object({ currentRevisionId: z.string(), publishedRevisionId: z.string().optional() }).strict(),
  currentRoute: z.object({ normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict(),
  lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(),
  stateDigest: z.string(),
}).strict();

export const publishRevisionRequestSchema = z.object({
  contract: z.literal("publish-revision-request/v1"),
  expectedCurrentRevisionId: z.string(),
  operationId: z.string(),
}).strict();

export const publishRevisionSuccessSchema = z.object({
  contract: z.literal("publish-revision-success/v1"),
  entryId: z.string(),
  revision: z.object({
    revisionId: z.string(),
    schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
    contentDigest: z.string(),
    lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(),
  }).strict(),
  publishedPointer: z.object({ currentRevisionId: z.string(), publishedRevisionId: z.string() }).strict(),
  publishedRoute: z.object({ normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict(),
  lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(),
  stateDigest: z.string(),
}).strict();

const pluginIdentitySchema = z.object({ id: z.string(), version: z.string(), hookContract: z.literal("plugin-hooks/v1"), manifestHash: digestSchema, capabilities: z.array(z.string()) }).strict();
const seoSettingsSchema = z.object({ contract: z.literal("seo-plugin-settings/v1"), publicSiteUrl: z.string().url(), indexing: z.enum(["allow", "disallow"]) }).strict();
export const pluginActivationRequestSchema = z.object({ contract: z.literal("plugin-activation-request/v1"), identity: pluginIdentitySchema, expectedActivationStateDigest: digestSchema }).strict();
export const pluginSettingsReplaceRequestSchema = z.object({ contract: z.literal("plugin-settings-replace-request/v1"), identity: pluginIdentitySchema, expectedSettingsStateDigest: digestSchema, settingsContract: z.literal("seo-plugin-settings/v1"), settings: seoSettingsSchema }).strict();
export const cmsSeoAnalysisRequestSchema = z.object({ contract: z.literal("cms-seo-analysis-request/v1"), entryId: z.string(), expectedCurrentRevisionId: z.string().nullable(), schemaIdentity: schemaIdentitySchema, content: jsonContent, route: z.string(), documentDigest: digestSchema }).strict();
export const pluginManagementSnapshotSchema = z.object({ contract: z.literal("plugin-management-snapshot/v1"), activationStateDigest: digestSchema, settingsStateDigest: digestSchema, plugins: z.array(z.object({ identity: pluginIdentitySchema, status: z.enum(["inactive", "active", "reactivation-required"]), settings: z.object({ settingsContract: z.literal("seo-plugin-settings/v1"), settings: seoSettingsSchema, settingsDigest: digestSchema }).strict().optional() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const taxonomyTermIdentitySchema = z.object({ taxonomyId: z.string(), termId: z.string() }).strict();
const taxonomyTermEvidenceSchema = taxonomyTermIdentitySchema.extend({ label: z.string(), slug: z.string(), order: z.number().int().safe() }).strict();
const taxonomyTermSchema = taxonomyTermEvidenceSchema.extend({ state: z.enum(["live", "retired"]) }).strict();
const taxonomyBindingSchema = taxonomyTermIdentitySchema.extend({ evidence: taxonomyTermEvidenceSchema, evidenceDigest: digestSchema }).strict();
const taxonomyRecordSchema = z.object({ taxonomyId: z.string(), label: z.string() }).strict();
export const taxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v1"), taxonomy: taxonomyRecordSchema, terms: z.array(taxonomyTermSchema), stateDigest: digestSchema }).strict();
export const taxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v1"), taxonomies: z.array(z.object({ taxonomy: taxonomyRecordSchema, stateDigest: digestSchema }).strict()) }).strict();
export const createTaxonomyRequestSchema = z.object({ contract: z.literal("taxonomy-create-request/v1"), taxonomyId: z.string(), label: z.string() }).strict();
const taxonomyCommandBaseSchema = z.object({ contract: z.literal("taxonomy-command/v1"), expectedStateDigest: digestSchema }).strict();
export const taxonomyCommandSchema = z.discriminatedUnion("kind", [
  taxonomyCommandBaseSchema.extend({ kind: z.literal("create-term"), termId: z.string(), label: z.string(), slug: z.string(), order: z.number().int().safe() }).strict(),
  taxonomyCommandBaseSchema.extend({ kind: z.literal("rename-term"), termId: z.string(), label: z.string() }).strict(),
  taxonomyCommandBaseSchema.extend({ kind: z.literal("retire-term"), termId: z.string() }).strict(),
  taxonomyCommandBaseSchema.extend({ kind: z.literal("delete-term"), termId: z.string() }).strict(),
  taxonomyCommandBaseSchema.extend({ kind: z.literal("migrate-bindings"), operationId: z.string(), mappings: z.array(z.object({ source: taxonomyTermIdentitySchema, replacement: taxonomyTermIdentitySchema }).strict()), replacements: z.array(z.object({ entryId: z.string(), sourceRevisionId: z.string(), replacementRevisionId: z.string() }).strict()) }).strict(),
]);
export const taxonomyCommandResultSchema = z.object({ snapshot: taxonomySnapshotSchema, impact: z.object({ current: z.array(z.object({ entryId: z.string(), revisionId: z.string(), pointer: z.literal("current") }).strict()), published: z.array(z.object({ entryId: z.string(), revisionId: z.string(), pointer: z.literal("published") }).strict()) }).strict(), migration: z.object({ operationId: z.string(), replacements: z.array(z.object({ source: z.object({ entryId: z.string(), revisionId: z.string() }).strict(), replacement: z.object({ entryId: z.string(), revisionId: z.string() }).strict() }).strict()) }).strict().optional() }).strict();
export const authoringEntrySchema = z.object({ contract: z.literal("authoring-entry/v1"), entryId: z.string(), current: z.object({ revisionId: z.string(), schemaIdentity: schemaIdentitySchema, content: jsonContent, contentDigest: digestSchema, route: z.string(), assets: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()), taxonomyBindings: z.array(taxonomyBindingSchema) }).strict(), stateDigest: digestSchema }).strict();
export const cmsSeoAnalysisResponseSchema = z.object({ contract: z.literal("cms-seo-analysis-response/v1"), documentDigest: digestSchema, status: z.enum(["available", "unavailable"]), preview: z.object({ title: z.string(), description: z.string().optional(), canonicalUrl: z.string().url().optional() }).strict().optional(), suggestions: z.array(z.object({ code: z.string() }).strict()), diagnostics: z.array(z.unknown()) }).strict();

export const releaseDiagnoseRequestSchema = z.object({ contract: z.literal("release-diagnose-request/v1") }).strict();
export const releaseBuildRequestSchema = z.object({ contract: z.literal("release-build-request/v1") }).strict();
export const releaseRequestSchema = z.object({ contract: z.literal("release-request/v1"), artifactDigest: digestSchema }).strict();
export const redeliverRequestSchema = z.object({ contract: z.literal("redeliver-request/v1"), artifactDigest: digestSchema }).strict();
const releaseDiagnosticSchema = z.object({ code: z.string().regex(/^[A-Z0-9_]+$/u) }).strict();
export const releaseDiagnosisSchema = z.object({ contract: z.literal("release-diagnosis/v1"), status: z.enum(["ready", "blocked"]), diagnostics: z.array(releaseDiagnosticSchema) }).strict();
export const releaseBuildSchema = z.object({ contract: z.literal("release-build/v1"), artifactDigest: digestSchema, diagnostics: z.array(releaseDiagnosticSchema) }).strict();
export const releaseReceiptSchema = z.object({ contract: z.literal("release-receipt/v1"), artifactDigest: digestSchema, targetDigest: digestSchema }).strict();

const cmsEditorBlockIdentitySchema = z.object({ id: z.string(), version: z.string(), hook: z.literal("cms/editor-block/resolve"), manifestHash: digestSchema }).strict();
const cmsEditorBlockSourceSchema = z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict();
const cmsEditorBlockDiagnostic = (code: "PLUGIN_BLOCK_INACTIVE" | "PLUGIN_BLOCK_MISSING" | "PLUGIN_BLOCK_IDENTITY_CHANGED", cause: "inactive" | "missing" | "identity-changed") => z.object({
  code: z.literal(code),
  owner: z.literal("PluginHost"),
  subjectIds: z.array(z.string()),
  remediation: messageRemediationSchema,
  detail: z.object({ pluginId: z.string(), hook: z.literal("cms/editor-block/resolve"), capability: z.literal("cms-editor-block-resolution"), entryId: z.string(), cause: z.literal(cause) }).strict(),
}).strict();
const cmsEditorBlockResolutionBase = z.object({ blockIndex: z.number().int().nonnegative(), pluginIdentity: cmsEditorBlockIdentitySchema, source: cmsEditorBlockSourceSchema, sourceDigest: digestSchema, activeStateDigest: digestSchema });
export const cmsEditorBlockResolutionsSchema = z.object({
  contract: z.literal("cms-editor-block-resolutions/v1"),
  entryId: z.string(),
  revisionId: z.string(),
  contentDigest: digestSchema,
  stateDigest: digestSchema,
  items: z.array(z.discriminatedUnion("status", [
    cmsEditorBlockResolutionBase.extend({ status: z.literal("active"), output: jsonContent, outputDigest: digestSchema }).strict(),
    cmsEditorBlockResolutionBase.extend({ status: z.literal("inactive"), diagnostic: cmsEditorBlockDiagnostic("PLUGIN_BLOCK_INACTIVE", "inactive") }).strict(),
    cmsEditorBlockResolutionBase.extend({ status: z.literal("missing"), diagnostic: cmsEditorBlockDiagnostic("PLUGIN_BLOCK_MISSING", "missing") }).strict(),
    cmsEditorBlockResolutionBase.extend({ status: z.literal("identity-changed"), diagnostic: cmsEditorBlockDiagnostic("PLUGIN_BLOCK_IDENTITY_CHANGED", "identity-changed") }).strict(),
  ])),
}).strict();
export type TransportCode =
  | "INVALID_REQUEST_FRAMING" | "MISDIRECTED_REQUEST" | "ORIGIN_FORBIDDEN"
  | "AUTHORIZATION_REQUIRED" | "AUTHORIZATION_MALFORMED" | "AUTHORIZATION_DUPLICATE"
  | "AUTHORIZATION_ALTERNATE_TRANSPORT" | "AUTHORIZATION_INVALID" | "AUTHORIZATION_REVOKED"
  | "SERVER_PROOF_GENERATION_MISMATCH" | "BROWSER_BOOTSTRAP_INVALID" | "INVALID_REQUEST_BODY"
  | "REQUEST_BODY_TOO_LARGE" | "ROUTE_NOT_FOUND" | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_SERVER_ERROR";
type RemoteFailureCode = (typeof mediaLibraryCodes)[number] | TransportCode | ReleaseTransportFailureCode | DomainApplicationFailureCode | TaxonomyFailureCode | ContentReadFailureCode | PluginHostFailureCode | AuthoringReadFailureCode | ContentTypeAdministrationFailureCode | ContentTypeMigrationFailureCode | ProjectionFailureCode | ThemeHostFailureCode;
const transportStatuses: Readonly<Record<TransportCode, readonly number[]>> = {
  INVALID_REQUEST_FRAMING: [400], MISDIRECTED_REQUEST: [421], ORIGIN_FORBIDDEN: [403],
  AUTHORIZATION_REQUIRED: [401], AUTHORIZATION_MALFORMED: [401], AUTHORIZATION_DUPLICATE: [401], AUTHORIZATION_ALTERNATE_TRANSPORT: [401], AUTHORIZATION_INVALID: [401], AUTHORIZATION_REVOKED: [401],
  SERVER_PROOF_GENERATION_MISMATCH: [401], BROWSER_BOOTSTRAP_INVALID: [401], INVALID_REQUEST_BODY: [400], REQUEST_BODY_TOO_LARGE: [400],
  ROUTE_NOT_FOUND: [404], METHOD_NOT_ALLOWED: [405], UNSUPPORTED_MEDIA_TYPE: [415], INTERNAL_SERVER_ERROR: [500, 503],
};
const releaseStatuses: Readonly<Record<ReleaseTransportFailureCode, readonly number[]>> = {
  RELEASE_BUILD_BLOCKED: [422], RELEASE_BUILD_FAILED: [500], RELEASE_ARTIFACT_INVALID: [422], RELEASE_TARGET_CONFLICT: [409], RELEASE_TARGET_FAILED: [500],
};
const conflictCodes = ["CURRENT_REVISION_MISMATCH", "ROUTE_CONFLICT", "ROUTE_CHANGE_REQUIRED", "STALE_ROUTE_PROPOSAL", "PLUGIN_IDENTITY_CONFLICT", "ACTIVATION_STATE_CONFLICT", "ACTIVE_PLUGIN_IDENTITY_MISMATCH", "INVALID_PLUGIN_OPERATION_SNAPSHOT", "TAXONOMY_CONFLICT", "TAXONOMY_STATE_CONFLICT"] as const;
const invalidCodes = ["INVALID_SAVE_REVISION_REQUEST", "INVALID_PUBLISH_REVISION_REQUEST", "INVALID_RESTORE_REVISION_REQUEST", "INVALID_CHANGE_ROUTE_REQUEST", "INVALID_PLUGIN_ACTIVATION_REQUEST", "INVALID_PLUGIN_SETTINGS_REQUEST", "INVALID_SEO_ANALYSIS_REQUEST", "INVALID_CMS_EDITOR_BLOCK_RESOLUTIONS_REQUEST", "SCHEMA_INVALID", "MEDIA_UNAVAILABLE", "BLOCKED_ARCHIVED_MEDIA_RESTORE", "PLUGIN_NOT_FOUND", "PLUGIN_NOT_ACTIVE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING", "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CAPABILITY_DENIED", "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED", "INVALID_TAXONOMY_REQUEST", "TERM_NOT_FOUND", "TERM_ACTIVE_USAGE", "TAXONOMY_MAPPING_UNRESOLVABLE"] as const;
const notFoundCodes = ["ENTRY_NOT_FOUND", "ROUTE_CLAIM_NOT_FOUND", "TAXONOMY_NOT_FOUND"] as const;
const domainCodes = ["INVALID_SAVE_REVISION_REQUEST", "INVALID_PUBLISH_REVISION_REQUEST", "INVALID_RESTORE_REVISION_REQUEST", "INVALID_CHANGE_ROUTE_REQUEST", "INVALID_PLUGIN_ACTIVATION_REQUEST", "INVALID_PLUGIN_SETTINGS_REQUEST", "INVALID_SEO_ANALYSIS_REQUEST", "CMS_SEO_ANALYSIS_FAILED", "INVALID_CMS_EDITOR_BLOCK_RESOLUTIONS_REQUEST", "CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED", "ENTRY_NOT_FOUND", "CURRENT_REVISION_MISMATCH", "SCHEMA_INVALID", "MEDIA_UNAVAILABLE", "BLOCKED_ARCHIVED_MEDIA_RESTORE", "ROUTE_CONFLICT", "ROUTE_CLAIM_NOT_FOUND", "ROUTE_CHANGE_REQUIRED", "STALE_ROUTE_PROPOSAL", "SAVE_REVISION_FAILED", "PUBLISH_REVISION_FAILED", "RESTORE_REVISION_FAILED", "CHANGE_ROUTE_FAILED"] as const satisfies readonly DomainApplicationFailureCode[];
const taxonomyCodes = ["INVALID_TAXONOMY_REQUEST", "TAXONOMY_NOT_FOUND", "TAXONOMY_CONFLICT", "TAXONOMY_STATE_CONFLICT", "TERM_NOT_FOUND", "TERM_ACTIVE_USAGE", "TAXONOMY_MAPPING_UNRESOLVABLE", "TAXONOMY_FAILED"] as const satisfies readonly TaxonomyFailureCode[];
const pluginCodes = ["INVALID_PLUGIN_HOST_INPUT", "INVALID_TRUSTED_ROOT", "PLUGIN_DISCOVERY_FAILED", "PLUGIN_NOT_FOUND", "INVALID_PLUGIN_MANIFEST", "UNSUPPORTED_HOOK_CONTRACT", "UNSUPPORTED_CAPABILITY", "PLUGIN_EVIDENCE_MISMATCH", "PLUGIN_IDENTITY_CONFLICT", "PLUGIN_MODULE_INVALID", "PLUGIN_NOT_ACTIVE", "ACTIVE_PLUGIN_IDENTITY_MISMATCH", "ACTIVATION_STATE_CONFLICT", "ACTIVATION_STATE_FAILURE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING", "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CALLBACK_RESULT_INVALID", "PLUGIN_CALLBACK_FAILED", "PLUGIN_CAPABILITY_DENIED", "INVALID_PLUGIN_OPERATION_SNAPSHOT", "PLUGIN_VALIDATION_SERVICE_FAILED", "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED"] as const satisfies readonly PluginHostFailureCode[];
const contentCodes = ["INVALID_CONTENT_MODEL_INPUT", "CONTENT_DIGEST_MISMATCH", "NON_CANONICAL_CONTENT_BYTES", "UNSUPPORTED_CONTENT_CONTRACT", "INVALID_STRUCTURED_CONTENT", "RAW_FULL_PAGE_NOT_APPROVED"] as const satisfies readonly ContentReadFailureCode[];
const contentTypeMigrationStatuses: Readonly<Record<ContentTypeMigrationFailureCode, readonly number[]>> = { CONTENT_TYPE_NOT_FOUND: [404], CONTENT_TYPE_MIGRATION_STALE: [409], INVALID_CONTENT_TYPE_MIGRATION: [422], CONTENT_TYPE_MIGRATION_FAILED: [500] };
const themeCodes = ["INVALID_THEME_HOST_INPUT", "INVALID_TRUSTED_ROOT", "THEME_DISCOVERY_FAILED", "THEME_NOT_FOUND", "INVALID_THEME_MANIFEST", "THEME_EVIDENCE_MISMATCH", "THEME_IDENTITY_CONFLICT", "THEME_RUNTIME_INVALID", "THEME_FILE_NOT_DECLARED"] as const satisfies readonly ThemeHostFailureCode[];
const domainStatuses: Readonly<Record<DomainApplicationFailureCode, readonly number[]>> = Object.fromEntries(domainCodes.map((code) => [code, notFoundCodes.includes(code as never) ? [404] : conflictCodes.includes(code as never) ? [409] : invalidCodes.includes(code as never) ? [422] : [500]])) as unknown as Readonly<Record<DomainApplicationFailureCode, readonly number[]>>;
const taxonomyStatuses: Readonly<Record<TaxonomyFailureCode, readonly number[]>> = Object.fromEntries(taxonomyCodes.map((code) => [code, notFoundCodes.includes(code as never) ? [404] : conflictCodes.includes(code as never) ? [409] : invalidCodes.includes(code as never) ? [422] : [500]])) as unknown as Readonly<Record<TaxonomyFailureCode, readonly number[]>>;
const pluginStatuses: Readonly<Record<PluginHostFailureCode, readonly number[]>> = Object.fromEntries(pluginCodes.map((code) => [code, conflictCodes.includes(code as never) ? [409] : invalidCodes.includes(code as never) ? [422] : [500]])) as unknown as Readonly<Record<PluginHostFailureCode, readonly number[]>>;
const contentStatuses: Readonly<Record<ContentReadFailureCode, readonly number[]>> = Object.fromEntries(contentCodes.map((code) => [code, code === "INVALID_CONTENT_MODEL_INPUT" || code === "UNSUPPORTED_CONTENT_CONTRACT" || code === "INVALID_STRUCTURED_CONTENT" || code === "RAW_FULL_PAGE_NOT_APPROVED" ? [422] : [500]])) as unknown as Readonly<Record<ContentReadFailureCode, readonly number[]>>;
const themeStatuses: Readonly<Record<ThemeHostFailureCode, readonly number[]>> = Object.fromEntries(themeCodes.map((code) => [code, code === "THEME_NOT_FOUND" ? [404] : code === "THEME_IDENTITY_CONFLICT" ? [409] : code === "INVALID_THEME_HOST_INPUT" ? [422] : [500]])) as unknown as Readonly<Record<ThemeHostFailureCode, readonly number[]>>;
const readStatuses: Readonly<Record<AuthoringReadFailureCode, readonly number[]>> = { INVALID_AUTHORING_READ_INPUT: [422], CONTENT_TYPE_NOT_FOUND: [404], ENTRY_NOT_FOUND: [404], AUTHORING_CONTENT_UNSUPPORTED: [422], AUTHORING_READ_STATE_STALE: [409], AUTHORING_READ_FAILED: [500] };
const contentTypeAdministrationStatuses: Readonly<Record<ContentTypeAdministrationFailureCode, readonly number[]>> = { INVALID_CONTENT_TYPE_DEFINITION: [422], CONTENT_TYPE_NOT_FOUND: [404], CONTENT_TYPE_STATE_CONFLICT: [409], CONTENT_TYPE_BREAKING_CHANGE: [422], CONTENT_TYPE_ADMINISTRATION_FAILED: [500] };
const entryAdministrationStatuses: Readonly<Record<CurrentEntryAdministrationFailureCode, readonly number[]>> = { INVALID_ENTRY_CONTENT: [422], ENTRY_NOT_FOUND: [404], CONTENT_TYPE_NOT_FOUND: [404], ENTRY_STATE_CONFLICT: [409], ENTRY_ADMINISTRATION_FAILED: [500] };
const projectionStatuses: Readonly<Record<ProjectionFailureCode, readonly number[]>> = {
  INVALID_PROJECTION_INPUT: [422], SUBJECT_NOT_FOUND: [404], SUBJECT_NOT_PUBLISHED: [404],
  PROJECTION_STORAGE_FAILURE: [500], INVALID_REVISION_EVIDENCE: [500],
  UNRESOLVED_ROUTE_REFERENCE: [422], UNRESOLVED_MEDIA_REFERENCE: [422],
  PROJECTION_STATE_CHANGED: [409], PROJECTION_PAYLOAD_TOO_LARGE: [422],
  PROJECTION_ENCODING_FAILED: [500], INVALID_RENDERER_INPUT: [422], INVALID_PREVIEW_INPUT: [422],
};
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
const statusByCode: Readonly<Record<RemoteFailureCode, readonly number[]>> = { ...transportStatuses, ...releaseStatuses, ...domainStatuses, ...taxonomyStatuses, ...contentStatuses, ...pluginStatuses, ...readStatuses, ...contentTypeAdministrationStatuses, ...contentTypeMigrationStatuses, ...entryAdministrationStatuses, ...projectionStatuses, ...themeStatuses, ...mediaLibraryStatuses };
export type AuthoringRemoteErrorCode = keyof typeof statusByCode;
export function authoringErrorStatuses(code: string): readonly number[] | undefined {
  return Object.prototype.hasOwnProperty.call(statusByCode, code) ? statusByCode[code as AuthoringRemoteErrorCode] : undefined;
}
export type MediaMetadataSaveRequestDto = Readonly<z.infer<typeof mediaMetadataSaveRequestSchema>>;
export type MediaDeleteRequestDto = Readonly<z.infer<typeof mediaDeleteRequestSchema>>;
/**
 * 被 entry 引用的 current media asset 不得 Replace／Delete；這個 failure 必須帶完整且排序固定的
 * usage evidence，generic `authoring-error/v1` 無法承載，因此以 exact contract 單獨投影。
 */
export const mediaAssetReferencedErrorSchema = z.object({
  contract: z.literal("media-asset-referenced/v2"), requestId: z.string(), code: z.literal("MEDIA_ASSET_REFERENCED"), owner: z.literal("DataMedia"),
  subjectIds: stringArray, remediation: messageRemediationSchema,
  usage: z.array(mediaUsageSchema).nonempty(),
}).strict();
export type MediaAssetReferencedErrorDto = Readonly<z.infer<typeof mediaAssetReferencedErrorSchema>>;
export const authoringErrorSchema = z.object({
  contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string().refine((code) => authoringErrorStatuses(code) !== undefined),
  owner: z.enum(["AuthoringApi", "AuthoringCredential", "DomainApplication", "Content", "DataMedia", "SiteDefinition", "PluginHost", "ThemeHost", "AuthoringReadFacade", "ContentTypeAdministration", "ContentTypeMigration", "CurrentEntryAdministration", "Projection", "Taxonomy", "Delivery"]),
  subjectIds: stringArray, remediation: messageRemediationSchema, restoreCommands: z.array(restoreCommandSchema).optional(),
}).strict();
export type ServerProofChallengeDto = Readonly<z.infer<typeof serverProofChallengeSchema>>;
export type ServerProofDto = Readonly<z.infer<typeof serverProofSchema>>;
export type BrowserTicketMintRequestDto = Readonly<z.infer<typeof browserTicketMintRequestSchema>>;
export type BrowserTicketDto = Readonly<z.infer<typeof browserTicketSchema>>;
export type BrowserSessionExchangeDto = Readonly<z.infer<typeof browserSessionExchangeSchema>>;
export type BrowserSessionDto = Readonly<z.infer<typeof browserSessionSchema>>;
export type SaveRevisionRequestDto = Readonly<z.infer<typeof saveRevisionRequestSchema>>;
export type SaveRevisionSuccessDto = Readonly<z.infer<typeof saveRevisionSuccessSchema>>;
export type PublishRevisionRequestDto = Readonly<z.infer<typeof publishRevisionRequestSchema>>;
export type RestoreRevisionRequestDto = Readonly<z.infer<typeof restoreRevisionRequestSchema>>;
export type RestoreRevisionSuccessDto = Readonly<z.infer<typeof restoreRevisionSuccessSchema>>;
export type MediaCatalogV2Dto = Readonly<z.infer<typeof mediaCatalogV2Schema>>;
export type MediaAssetDetailV2Dto = Readonly<z.infer<typeof mediaAssetDetailV2Schema>>;
export type MediaAssetV2Dto = Readonly<z.infer<typeof mediaAssetV2Schema>>;
export type MediaDeleteReceiptDto = Readonly<z.infer<typeof mediaDeleteReceiptSchema>>;
export type MediaReplaceRequestDto = Readonly<z.infer<typeof mediaReplaceRequestSchema>>;
export type MediaImportMetadataDto = Readonly<z.infer<typeof mediaImportMetadataSchema>>;
export type PublishRevisionSuccessDto = Readonly<z.infer<typeof publishRevisionSuccessSchema>>;
export type CreateContentTypeRequestDto = Readonly<z.infer<typeof createContentTypeRequestSchema>>;
export type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
export type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
export type EntryCatalogDto = Readonly<z.infer<typeof entryCatalogSchema>>;
export type CptEntryDto = Readonly<z.infer<typeof cptEntrySchema>>;
export type CptEntryCatalogDto = Readonly<z.infer<typeof cptEntryCatalogSchema>>;
export type CptEntryCreateRequestDto = Readonly<z.infer<typeof cptEntryCreateRequestSchema>>;
export type CptEntrySaveRequestDto = Readonly<z.infer<typeof cptEntrySaveRequestSchema>>;
export type CptEntryDeleteRequestDto = Readonly<z.infer<typeof cptEntryDeleteRequestSchema>>;
export type CptEntryDeletedDto = Readonly<z.infer<typeof cptEntryDeletedSchema>>;
export type EntryDetailDto = Readonly<z.infer<typeof entryDetailSchema>>;
export type EntryRevisionCatalogDto = Readonly<z.infer<typeof entryRevisionCatalogSchema>>;
export type PreviewRequestDto = Readonly<z.infer<typeof previewRequestSchema>>;
export type PreviewDocumentDto = Readonly<z.infer<typeof previewDocumentSchema>>;
export type AuthoringErrorDto = Readonly<z.infer<typeof authoringErrorSchema>>;
export type PluginManagementSnapshotDto = Readonly<z.infer<typeof pluginManagementSnapshotSchema>>;
export type AuthoringEntryDto = Readonly<z.infer<typeof authoringEntrySchema>>;
export type CmsSeoAnalysisResponseDto = Readonly<z.infer<typeof cmsSeoAnalysisResponseSchema>>;
export type CmsEditorBlockResolutionsDto = Readonly<z.infer<typeof cmsEditorBlockResolutionsSchema>>;
export type TaxonomyCatalogDto = Readonly<z.infer<typeof taxonomyCatalogSchema>>;
export type SiteRouteGraphDto = Readonly<z.infer<typeof siteRouteGraphSchema>>;
export type RouteChangeProposalRequestDto = Readonly<z.infer<typeof routeChangeProposalRequestSchema>>;
export type RouteChangeProposalDto = Readonly<z.infer<typeof routeChangeProposalSchema>>;
export type ChangeRouteCommandDto = Readonly<z.infer<typeof changeRouteCommandSchema>>;
export type ChangeRouteSuccessDto = Readonly<z.infer<typeof changeRouteSuccessSchema>>;
export type TaxonomySnapshotDto = Readonly<z.infer<typeof taxonomySnapshotSchema>>;
export type CreateTaxonomyRequestDto = Readonly<z.infer<typeof createTaxonomyRequestSchema>>;
export type TaxonomyCommandDto = Readonly<z.infer<typeof taxonomyCommandSchema>>;
export type TaxonomyCommandResultDto = Readonly<z.infer<typeof taxonomyCommandResultSchema>>;
export type ReleaseDiagnoseRequestDto = Readonly<z.infer<typeof releaseDiagnoseRequestSchema>>;
export type ReleaseBuildRequestDto = Readonly<z.infer<typeof releaseBuildRequestSchema>>;
export type ReleaseRequestDto = Readonly<z.infer<typeof releaseRequestSchema>>;
export type RedeliverRequestDto = Readonly<z.infer<typeof redeliverRequestSchema>>;
export type ReleaseDiagnosisDto = Readonly<z.infer<typeof releaseDiagnosisSchema>>;
export type ReleaseBuildDto = Readonly<z.infer<typeof releaseBuildSchema>>;
export type ReleaseReceiptDto = Readonly<z.infer<typeof releaseReceiptSchema>>;
