import type { ContentReadModel, StructuredContent } from "../content/index.js";
import type { Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
import type { AssetVersionIdentity, DataMedia, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { EntryPointerRecord, OperationLineageIdentity, PersistenceStore, RevisionRecord, RevisionReferenceRecord, SchemaVersionIdentity, SchemaVersionRecord } from "../persistence/index.js";
import type { PluginActivationIdentity, PluginCandidate, PluginDiagnosticDetail, PluginHost, PluginHostFailure, SeoPluginSettingsV1 } from "../plugin-host/index.js";
import type { RouteClaim, RouteClaimReplacementProposal, RouteClaimReplacementResult, SiteDefinition } from "../site-definition/index.js";

export type SaveRevisionRequest = Readonly<{ entryId: string; revisionId: string; operationId: string; expectedCurrentRevisionId: string | null; schemaIdentity: SchemaVersionIdentity; content: JsonValue; route: string; assetVersions: readonly AssetVersionIdentity[] }>;
export type SaveRevisionMediaReferenceReplacementRequest = Readonly<{ kind: "media-reference-replacement"; entryId: string; revisionId: string; operationId: string; expectedCurrentRevisionId: string; targetAssetVersion: AssetVersionIdentity; replacementAssetVersion: AssetVersionIdentity }>;
export type SaveRevisionCommandRequest = SaveRevisionRequest | SaveRevisionMediaReferenceReplacementRequest;
export type PublishRevisionRequest = Readonly<{ entryId: string; expectedCurrentRevisionId: string; operationId: string }>;
export type RestoreRevisionRequest = Readonly<{ entryId: string; sourceRevisionId: string; revisionId: string; operationId: string }>;
export type ChangeRouteRequest = Readonly<{ operationId: string; proposal: RouteClaimReplacementProposal }>;
export type AuthoringEntryV1 = Readonly<{
  contract: "authoring-entry/v1";
  entryId: string;
  currentRevisionId: string;
  publishedRevisionId: string | null;
  schemaIdentity: SchemaVersionIdentity;
  content: StructuredContent;
  route: string;
  assetVersions: readonly AssetVersionIdentity[];
}>;
export type CmsSeoAnalysisRequest = Readonly<{
  contract: "cms-seo-analysis-request/v1";
  entryId: string;
  expectedCurrentRevisionId: string | null;
  schemaIdentity: SchemaVersionIdentity;
  content: StructuredContent;
  route: string;
  documentDigest: Digest;
}>;
export type CmsSeoAnalysisResultV1 =
  | Readonly<{
      contract: "cms-seo-analysis-result/v1";
      status: "available";
      documentDigest: Digest;
      preview: Readonly<{ title: string; description?: string; canonicalUrl: string }>;
      suggestions: readonly Readonly<{ code: "SEO_TITLE_MISSING" | "SEO_DESCRIPTION_MISSING"; field: "title" | "description" }>[];
      producers: readonly Readonly<{ identity: PluginActivationIdentity; hook: "cms/seo/analyze"; priority: number; inputDigest: Digest; outputDigest: Digest; settingsDigest: Digest }>[];
    }>
  | Readonly<{
      contract: "cms-seo-analysis-result/v1";
      status: "unavailable";
      documentDigest: Digest;
      diagnostics: readonly PluginHostFailure[];
    }>;
export type CmsSeoAnalysisSuccess = Readonly<{ contract: "cms-seo-analysis-success/v1"; entryId: string; result: CmsSeoAnalysisResultV1 }>;
export type PluginActivationRequestV1 = Readonly<{ contract: "plugin-activation-request/v1"; identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>;
export type PluginSettingsReplaceRequestV1 = Readonly<{
  contract: "plugin-settings-replace-request/v1";
  identity: PluginActivationIdentity;
  expectedSettingsStateDigest: Digest;
  settingsContract: "seo-plugin-settings/v1";
  settings: SeoPluginSettingsV1;
}>;
export type PluginManagementSnapshotV1 = Readonly<{
  contract: "plugin-management-snapshot/v1";
  activationStateDigest: Digest;
  settingsStateDigest: Digest;
  plugins: readonly Readonly<{
    identity: PluginCandidate;
    activation: "inactive" | "active" | "reactivation-required";
    settings:
      | Readonly<{ status: "missing" }>
      | Readonly<{ status: "valid"; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1; settingsDigest: Digest }>
      | Readonly<{ status: "identity-mismatch" | "contract-mismatch" | "invalid"; settingsDigest: Digest }>;
  }>[];
  diagnostics: readonly PluginDiagnosticDetail[];
}>;
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
export type DomainApplicationFailureCode = "INVALID_SAVE_REVISION_REQUEST" | "INVALID_PUBLISH_REVISION_REQUEST" | "INVALID_RESTORE_REVISION_REQUEST" | "INVALID_CHANGE_ROUTE_REQUEST" | "INVALID_SEO_ANALYSIS_REQUEST" | "INVALID_PLUGIN_ACTIVATION_REQUEST" | "INVALID_PLUGIN_SETTINGS_REQUEST" | "ENTRY_NOT_FOUND" | "READ_CURRENT_ENTRY_FAILED" | "CURRENT_REVISION_MISMATCH" | "MEDIA_REFERENCE_NOT_FOUND" | "MEDIA_REFERENCE_CONFLICT" | "SCHEMA_INVALID" | "MEDIA_UNAVAILABLE" | "BLOCKED_ARCHIVED_MEDIA_RESTORE" | "ROUTE_CONFLICT" | "ROUTE_CHANGE_REQUIRED" | "STALE_ROUTE_PROPOSAL" | "SAVE_REVISION_FAILED" | "PUBLISH_REVISION_FAILED" | "RESTORE_REVISION_FAILED" | "CHANGE_ROUTE_FAILED";
export type DomainApplicationCommandFailure = Readonly<{ code: DomainApplicationFailureCode; owner: "DomainApplication" | "Content" | "DataMedia" | "SiteDefinition"; subjectIds: readonly string[]; remediation: MessageRemediation; restoreCommands?: readonly RestoreAssetCommandDescriptor[] }>;
export type DomainApplicationFailure = DomainApplicationCommandFailure | PluginHostFailure;
export type DomainApplicationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainApplicationFailure }>;
export interface DomainApplication {
  saveRevision(request: SaveRevisionCommandRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>>;
  publishRevision(request: PublishRevisionRequest): Promise<DomainApplicationResult<PublishRevisionSuccess>>;
  restoreRevision(request: RestoreRevisionRequest): Promise<DomainApplicationResult<RestoreRevisionSuccess>>;
  changeRoute(request: ChangeRouteRequest): Promise<DomainApplicationResult<ChangeRouteSuccess>>;
  readCurrentEntry(input: Readonly<{ entryId: string }>): Promise<DomainApplicationResult<AuthoringEntryV1>>;
  analyzeCmsSeo(request: CmsSeoAnalysisRequest): Promise<DomainApplicationResult<CmsSeoAnalysisSuccess>>;
  replacePluginSettings(request: PluginSettingsReplaceRequestV1): Promise<DomainApplicationResult<Readonly<{ settingsStateDigest: Digest }>>>;
  listPlugins(): Promise<DomainApplicationResult<PluginManagementSnapshotV1>>;
  activatePlugin(request: PluginActivationRequestV1): Promise<DomainApplicationResult<Readonly<{ activationStateDigest: Digest }>>>;
}
export type PublishRevisionSuccess = Readonly<{ revision: RevisionRecord; publishedPointer: EntryPointerRecord; publishedClaim: RouteClaim; lineageIdentity: OperationLineageIdentity; stateDigest: Digest }>;
export type DomainApplicationDependencies = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; schemaValidator: RevisionSchemaValidator; pluginHost: PluginHost; contentReadModel: ContentReadModel }>;
