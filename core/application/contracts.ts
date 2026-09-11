import type { Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
import type { ArchiveAssetImpact, AssetVersionIdentity, DataMedia, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { EntryPointerRecord, OperationLineageIdentity, PersistenceStore, RevisionRecord, RevisionReferenceRecord, SchemaVersionIdentity, SchemaVersionRecord } from "../persistence/index.js";
import type { CmsEditorBlockIdentity, CmsSeoAnalysisResult, PluginActivationIdentity, PluginHost, PluginHostFailure, SeoPluginSettingsV1 } from "../plugin-host/index.js";
import type { RouteClaim, RouteClaimReplacementProposal, RouteClaimReplacementResult, SiteDefinition } from "../site-definition/index.js";
import type { CreateTaxonomyRequest, RevisionTaxonomyTermBinding, Taxonomy, TaxonomyCatalog, TaxonomyCommand, TaxonomyCommandResult, TaxonomyFailure, TaxonomySnapshot } from "../taxonomy/index.js";

export type SaveRevisionRequest = Readonly<{ entryId: string; revisionId: string; operationId: string; expectedCurrentRevisionId: string | null; schemaIdentity: SchemaVersionIdentity; content: JsonValue; route: string; assetVersions: readonly AssetVersionIdentity[]; taxonomyTerms: readonly Readonly<{ taxonomyId: string; termId: string }>[] }>;
export type SaveRevisionMediaReferenceReplacementRequest = Readonly<{ kind: "media-reference-replacement"; entryId: string; revisionId: string; operationId: string; expectedCurrentRevisionId: string; targetAssetVersion: AssetVersionIdentity; replacementAssetVersion: AssetVersionIdentity }>;
export type SaveRevisionCommandRequest = SaveRevisionRequest | SaveRevisionMediaReferenceReplacementRequest;
export type PublishRevisionRequest = Readonly<{ entryId: string; expectedCurrentRevisionId: string; operationId: string }>;
export type RestoreRevisionRequest = Readonly<{ entryId: string; sourceRevisionId: string; revisionId: string; operationId: string }>;
export type ChangeRouteRequest = Readonly<{ operationId: string; proposal: RouteClaimReplacementProposal }>;
export interface RevisionSchemaValidator { validate(input: Readonly<{ schema: SchemaVersionRecord; contentBytes: Uint8Array; contentDigest: Digest }>): Readonly<{ ok: true }> | Readonly<{ ok: false }>; }
export type SaveRevisionSuccess = Readonly<{ revision: RevisionRecord; references: readonly RevisionReferenceRecord[]; currentPointer: EntryPointerRecord; currentClaim: RouteClaim; lineageIdentity: OperationLineageIdentity; stateDigest: Digest; activePluginStateDigest: Digest }>;
export type RestoreRevisionSuccess = Readonly<{
  revision: RevisionRecord;
  references: readonly RevisionReferenceRecord[];
  currentPointer: EntryPointerRecord;
  currentClaim: RouteClaim;
  lineageIdentity: OperationLineageIdentity;
  stateDigest: Digest;
}>;
export type ChangeRouteSuccess = Readonly<RouteClaimReplacementResult & { entryPointer: EntryPointerRecord; lineageIdentity: OperationLineageIdentity; stateDigest: Digest }>;
export type MediaAssetVersionV1 = Readonly<{ contract: "media-asset-version/v1"; identity: AssetVersionIdentity; evidence: Readonly<{ objectDigest: Digest; byteLength: number; metadataDigest: Digest }>; availability: "ready" | "archived" | "missing"; restoreCommand?: RestoreAssetCommandDescriptor }>;
export type MediaAssetV1 = Readonly<{ contract: "media-asset/v1"; assetId: string; versions: readonly MediaAssetVersionV1[] }>;
export type RevisionMediaReferenceV1 = Readonly<{ entryId: string; revisionId: string; assetVersion: AssetVersionIdentity }>;
export type MediaCatalogV1 = Readonly<{ contract: "media-catalog/v1"; items: readonly MediaAssetV1[]; stateDigest: Digest }>;
export type MediaAssetDetailV1 = Readonly<{ contract: "media-asset-detail/v1"; asset: MediaAssetV1; references: Readonly<{ current: readonly RevisionMediaReferenceV1[]; published: readonly RevisionMediaReferenceV1[] }>; stateDigest: Digest }>;
export type ImportMediaRequest = Readonly<{ importId: string; assetId: string; assetVersionId: string; bytes: Uint8Array; metadata: JsonValue }>;
export type GetMediaRequest = Readonly<{ assetId: string }>;
export type ArchiveMediaVersionRequest = Readonly<{ assetId: string; assetVersionId: string }>;
export type RestoreMediaVersionRequest = Readonly<{ assetId: string; assetVersionId: string; recovery?: Readonly<{ bytes: Uint8Array; metadata: JsonValue }> }>;
export type CreateMediaVersionRequest = Readonly<{ importId: string; assetId: string; assetVersionId: string; bytes: Uint8Array; metadata: JsonValue; replacement: Readonly<{ entryId: string; revisionId: string; operationId: string; expectedCurrentRevisionId: string; targetAssetVersionId: string }> }>;
export type MediaVersionReplacementReceiptV1 = Readonly<{ contract: "media-version-replacement-receipt/v1"; version: MediaAssetVersionV1; save: SaveRevisionSuccess; asset: MediaAssetDetailV1 }>;
export type DomainApplicationFailureCode = "INVALID_SAVE_REVISION_REQUEST" | "INVALID_PUBLISH_REVISION_REQUEST" | "INVALID_RESTORE_REVISION_REQUEST" | "INVALID_CHANGE_ROUTE_REQUEST" | "INVALID_PLUGIN_ACTIVATION_REQUEST" | "INVALID_PLUGIN_SETTINGS_REQUEST" | "INVALID_SEO_ANALYSIS_REQUEST" | "CMS_SEO_ANALYSIS_FAILED" | "INVALID_CMS_EDITOR_BLOCK_RESOLUTIONS_REQUEST" | "CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED" | "ENTRY_NOT_FOUND" | "CURRENT_REVISION_MISMATCH" | "MEDIA_REFERENCE_NOT_FOUND" | "MEDIA_REFERENCE_CONFLICT" | "MEDIA_IMPORT_CONFLICT" | "MEDIA_IMPORT_FAILED" | "MEDIA_ASSET_NOT_FOUND" | "MEDIA_VERSION_CREATED_REPLACEMENT_FAILED" | "MEDIA_ARCHIVE_BLOCKED_PUBLISHED" | "MEDIA_ARCHIVE_FAILED" | "MEDIA_RESTORE_REQUIRED" | "MEDIA_RESTORE_MISMATCH" | "MEDIA_RESTORE_FAILED" | "MEDIA_READ_STATE_STALE" | "MEDIA_READ_FAILED" | "SCHEMA_INVALID" | "MEDIA_UNAVAILABLE" | "BLOCKED_ARCHIVED_MEDIA_RESTORE" | "ROUTE_CONFLICT" | "ROUTE_CHANGE_REQUIRED" | "STALE_ROUTE_PROPOSAL" | "SAVE_REVISION_FAILED" | "PUBLISH_REVISION_FAILED" | "RESTORE_REVISION_FAILED" | "CHANGE_ROUTE_FAILED";
export type DomainApplicationCommandFailure = Readonly<{ code: DomainApplicationFailureCode; owner: "DomainApplication" | "Content" | "DataMedia" | "SiteDefinition"; subjectIds: readonly string[]; remediation: MessageRemediation; restoreCommands?: readonly RestoreAssetCommandDescriptor[]; archiveImpact?: ArchiveAssetImpact }>;
export type DomainApplicationFailure = DomainApplicationCommandFailure | PluginHostFailure | TaxonomyFailure;
export type DomainApplicationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainApplicationFailure }>;
export type PluginManagementSnapshotV1 = Readonly<{ contract: "plugin-management-snapshot/v1"; activationStateDigest: Digest; settingsStateDigest: Digest; plugins: readonly Readonly<{ identity: PluginActivationIdentity; status: "inactive" | "active" | "reactivation-required"; settings?: Readonly<{ settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1; settingsDigest: Digest }> }>[]; diagnostics: readonly PluginHostFailure[] }>;
export type PluginActivationRequest = Readonly<{ contract: "plugin-activation-request/v1"; identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>;
export type PluginSettingsReplaceRequest = Readonly<{ contract: "plugin-settings-replace-request/v1"; identity: PluginActivationIdentity; expectedSettingsStateDigest: Digest; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1 }>;
export type CmsSeoAnalysisRequest = Readonly<{ contract: "cms-seo-analysis-request/v1"; entryId: string; expectedCurrentRevisionId: string | null; schemaIdentity: SchemaVersionIdentity; content: JsonValue; route: string; documentDigest: Digest }>;
export type CmsSeoAnalysisResponse = Readonly<{ contract: "cms-seo-analysis-response/v1"; documentDigest: Digest; status: CmsSeoAnalysisResult["status"]; preview?: Readonly<{ title: string; description?: string; canonicalUrl?: string }>; suggestions: CmsSeoAnalysisResult["suggestions"]; diagnostics: CmsSeoAnalysisResult["diagnostics"] }>;
export type CmsEditorBlockResolutionsRequest = Readonly<{ contract: "cms-editor-block-resolutions-request/v1"; entryId: string }>;
export type CmsEditorBlockResolutionItem = Readonly<{
  blockIndex: number;
  pluginIdentity: CmsEditorBlockIdentity;
  source: JsonValue;
  sourceDigest: Digest;
  activeStateDigest: Digest;
} & (
  | Readonly<{ status: "active"; output: JsonValue; outputDigest: Digest }>
  | Readonly<{ status: "inactive" | "missing" | "identity-changed"; diagnostic: PluginHostFailure }>
)>;
export type CmsEditorBlockResolutions = Readonly<{ contract: "cms-editor-block-resolutions/v1"; entryId: string; revisionId: string; contentDigest: Digest; stateDigest: Digest; items: readonly CmsEditorBlockResolutionItem[] }>;
export type AuthoringEntryV1 = Readonly<{ contract: "authoring-entry/v1"; entryId: string; current: Readonly<{ revisionId: string; schemaIdentity: SchemaVersionIdentity; content: JsonValue; contentDigest: Digest; route: string; assets: readonly AssetVersionIdentity[]; taxonomyBindings: readonly RevisionTaxonomyTermBinding[] }>; stateDigest: Digest }>;
export interface DomainApplication {
  saveRevision(request: SaveRevisionCommandRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>>;
  publishRevision(request: PublishRevisionRequest): Promise<DomainApplicationResult<PublishRevisionSuccess>>;
  restoreRevision(request: RestoreRevisionRequest): Promise<DomainApplicationResult<RestoreRevisionSuccess>>;
  changeRoute(request: ChangeRouteRequest): Promise<DomainApplicationResult<ChangeRouteSuccess>>;
  listMedia(): Promise<DomainApplicationResult<MediaCatalogV1>>;
  importMedia(request: ImportMediaRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>>;
  getMedia(request: GetMediaRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>>;
  archiveMediaVersion(request: ArchiveMediaVersionRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>>;
  createMediaVersion(request: CreateMediaVersionRequest): Promise<DomainApplicationResult<MediaVersionReplacementReceiptV1>>;
  restoreMediaVersion(request: RestoreMediaVersionRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>>;
  listPlugins(): Promise<DomainApplicationResult<PluginManagementSnapshotV1>>;
  activatePlugin(request: PluginActivationRequest): Promise<DomainApplicationResult<PluginManagementSnapshotV1>>;
  replacePluginSettings(request: PluginSettingsReplaceRequest): Promise<DomainApplicationResult<PluginManagementSnapshotV1>>;
  analyzeCmsSeo(request: CmsSeoAnalysisRequest): Promise<DomainApplicationResult<CmsSeoAnalysisResponse>>;
  readCurrentEntry(entryId: string): Promise<DomainApplicationResult<AuthoringEntryV1>>;
  resolveCurrentCmsEditorBlocks(request: CmsEditorBlockResolutionsRequest): Promise<DomainApplicationResult<CmsEditorBlockResolutions>>;
  listTaxonomies(): Promise<DomainApplicationResult<TaxonomyCatalog>>;
  getTaxonomy(taxonomyId: string): Promise<DomainApplicationResult<TaxonomySnapshot>>;
  createTaxonomy(request: CreateTaxonomyRequest): Promise<DomainApplicationResult<TaxonomySnapshot>>;
  executeTaxonomyCommand(taxonomyId: string, command: TaxonomyCommand): Promise<DomainApplicationResult<TaxonomyCommandResult>>;
}
export type PublishRevisionSuccess = Readonly<{ revision: RevisionRecord; publishedPointer: EntryPointerRecord; publishedClaim: RouteClaim; lineageIdentity: OperationLineageIdentity; stateDigest: Digest }>;
export type DomainApplicationDependencies = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; schemaValidator: RevisionSchemaValidator; pluginHost: PluginHost; taxonomy: Taxonomy }>;
