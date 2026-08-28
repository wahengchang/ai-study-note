import type { Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
import type { AssetVersionIdentity, DataMedia } from "../media/index.js";
import type { EntryPointerRecord, OperationLineageIdentity, PersistenceStore, RevisionRecord, RevisionReferenceRecord, SchemaVersionIdentity, SchemaVersionRecord } from "../persistence/index.js";
import type { PluginHost, PluginHostFailure } from "../plugin-host/index.js";
import type { RouteClaim, SiteDefinition } from "../site-definition/index.js";

export type SaveRevisionRequest = Readonly<{ entryId: string; revisionId: string; operationId: string; schemaIdentity: SchemaVersionIdentity; content: JsonValue; route: string; assetVersions: readonly AssetVersionIdentity[] }>;
export interface RevisionSchemaValidator { validate(input: Readonly<{ schema: SchemaVersionRecord; contentBytes: Uint8Array; contentDigest: Digest }>): Readonly<{ ok: true }> | Readonly<{ ok: false }>; }
export type SaveRevisionSuccess = Readonly<{ revision: RevisionRecord; references: readonly RevisionReferenceRecord[]; currentPointer: EntryPointerRecord; currentClaim: RouteClaim; lineageIdentity: OperationLineageIdentity; stateDigest: Digest; activePluginStateDigest: Digest }>;
export type DomainApplicationFailureCode = "INVALID_SAVE_REVISION_REQUEST" | "SCHEMA_INVALID" | "MEDIA_UNAVAILABLE" | "ROUTE_CONFLICT" | "ROUTE_CHANGE_REQUIRED" | "STALE_ROUTE_PROPOSAL" | "SAVE_REVISION_FAILED";
export type DomainApplicationCommandFailure = Readonly<{ code: DomainApplicationFailureCode; owner: "DomainApplication" | "Content" | "DataMedia" | "SiteDefinition"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type DomainApplicationFailure = DomainApplicationCommandFailure | PluginHostFailure;
export type DomainApplicationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainApplicationFailure }>;
export interface DomainApplication { saveRevision(request: SaveRevisionRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>>; }
export type DomainApplicationDependencies = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; schemaValidator: RevisionSchemaValidator; pluginHost: PluginHost }>;
