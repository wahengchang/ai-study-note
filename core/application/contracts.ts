import type { Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
import type { AssetVersionIdentity, DataMedia, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { EntryPointerRecord, OperationLineageIdentity, PersistenceStore, RevisionRecord, RevisionReferenceRecord, SchemaVersionIdentity, SchemaVersionRecord } from "../persistence/index.js";
import type { PluginHost, PluginHostFailure } from "../plugin-host/index.js";
import type { RouteClaim, RouteClaimReplacementProposal, RouteClaimReplacementResult, SiteDefinition } from "../site-definition/index.js";

export type SaveRevisionRequest = Readonly<{ entryId: string; revisionId: string; operationId: string; schemaIdentity: SchemaVersionIdentity; content: JsonValue; route: string; assetVersions: readonly AssetVersionIdentity[] }>;
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
export type DomainApplicationFailureCode = "INVALID_SAVE_REVISION_REQUEST" | "INVALID_PUBLISH_REVISION_REQUEST" | "INVALID_RESTORE_REVISION_REQUEST" | "INVALID_CHANGE_ROUTE_REQUEST" | "CURRENT_REVISION_MISMATCH" | "MEDIA_REFERENCE_NOT_FOUND" | "MEDIA_REFERENCE_CONFLICT" | "SCHEMA_INVALID" | "MEDIA_UNAVAILABLE" | "BLOCKED_ARCHIVED_MEDIA_RESTORE" | "ROUTE_CONFLICT" | "ROUTE_CHANGE_REQUIRED" | "STALE_ROUTE_PROPOSAL" | "SAVE_REVISION_FAILED" | "PUBLISH_REVISION_FAILED" | "RESTORE_REVISION_FAILED" | "CHANGE_ROUTE_FAILED";
export type DomainApplicationCommandFailure = Readonly<{ code: DomainApplicationFailureCode; owner: "DomainApplication" | "Content" | "DataMedia" | "SiteDefinition"; subjectIds: readonly string[]; remediation: MessageRemediation; restoreCommands?: readonly RestoreAssetCommandDescriptor[] }>;
export type DomainApplicationFailure = DomainApplicationCommandFailure | PluginHostFailure;
export type DomainApplicationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainApplicationFailure }>;
export interface DomainApplication { saveRevision(request: SaveRevisionCommandRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>>; publishRevision(request: PublishRevisionRequest): Promise<DomainApplicationResult<PublishRevisionSuccess>>; restoreRevision(request: RestoreRevisionRequest): Promise<DomainApplicationResult<RestoreRevisionSuccess>>; changeRoute(request: ChangeRouteRequest): Promise<DomainApplicationResult<ChangeRouteSuccess>>; }
export type PublishRevisionSuccess = Readonly<{ revision: RevisionRecord; publishedPointer: EntryPointerRecord; publishedClaim: RouteClaim; lineageIdentity: OperationLineageIdentity; stateDigest: Digest }>;
export type DomainApplicationDependencies = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; schemaValidator: RevisionSchemaValidator; pluginHost: PluginHost }>;
