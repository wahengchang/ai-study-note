import type { CoreResult, Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
export type AssetVersionAvailability = "ready" | "archived" | "missing";
export type PublishedAssetReference = Readonly<{ entryId: string; revisionId: string; assetVersion: AssetVersionIdentity }>;
export type TransactionDecision<T, E> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

export type AssetVersionIdentity = Readonly<{ assetId: string; assetVersionId: string }>;
export type ImportLocalMediaInput = Readonly<AssetVersionIdentity & { importId: string; bytes: Uint8Array; metadata: JsonValue }>;
export type AssetVersion = Readonly<{
  identity: AssetVersionIdentity;
  objectDigest: Digest;
  byteLength: number;
  metadataBytes: Uint8Array;
  metadataDigest: Digest;
  availability: AssetVersionAvailability;
}>;
export type AssetVersionRecord = AssetVersion;
export type ReadyAssetVersion = Readonly<AssetVersion & { availability: "ready" }>;
export type PublishedMediaSelection = Readonly<{ entryId: string; revisionId: string; assets: readonly ReadyAssetVersion[] }>;
export type MediaEvidence = Readonly<{ objectDigest: Digest; byteLength: number }>;
export type VerifiedReadyMediaObject = Readonly<{ asset: ReadyAssetVersion; bytes: Uint8Array }>;

export type MediaStageToken = Readonly<{ readonly __mediaStage: unique symbol }>;
export type MediaFinalToken = Readonly<{ readonly __mediaFinal: unique symbol }>;
export type MediaHardlinkPairToken = Readonly<{ readonly __mediaHardlinkPair: unique symbol }>;
export type MediaStageCandidate = Readonly<{ key: Digest; evidence: MediaEvidence; token: MediaStageToken; hardlinkPair?: MediaHardlinkPairToken }>;
export type MediaFinalCandidate = Readonly<{ key: Digest; evidence: MediaEvidence; token: MediaFinalToken; hardlinkPair?: MediaHardlinkPairToken }>;
export type MediaStorageSnapshot = Readonly<{ contract: "media-storage-snapshot/v1"; digest: Digest; stages: readonly MediaStageCandidate[]; finals: readonly MediaFinalCandidate[] }>;

export interface MediaObjectStore {
  stage(input: Readonly<{ importId: string; bytes: Uint8Array; evidence: MediaEvidence }>): DataMediaResult<MediaStageToken>;
  promote(stage: MediaStageToken, evidence: MediaEvidence): DataMediaResult<MediaFinalToken>;
  verifyFinal(final: MediaFinalToken, evidence: MediaEvidence): DataMediaResult<void>;
  releaseStage(stage: MediaStageToken, final: MediaFinalToken): DataMediaResult<void>;
  verifyEvidence(evidence: MediaEvidence): DataMediaResult<void>;
  readEvidence(evidence: MediaEvidence): DataMediaResult<Uint8Array>;
  inspectFinal(evidence: MediaEvidence): DataMediaResult<"healthy" | "absent" | "unhealthy">;
  readStartupSnapshot(): DataMediaResult<MediaStorageSnapshot>;
  removeOrphan(candidate: MediaStageToken | MediaFinalToken): DataMediaResult<void>;
}

export type MediaImportIntent = Readonly<{
  importId: string;
  identity: AssetVersionIdentity;
  objectDigest: Digest;
  byteLength: number;
  metadataBytes: Uint8Array;
  metadataDigest: Digest;
}>;
export type MediaStartupSnapshot = Readonly<{ pendingIntents: readonly MediaImportIntent[]; assetVersions: readonly AssetVersionRecord[] }>;
export type DataMediaPortResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;
export type ArchiveAssetImpact = Readonly<{
  contract: "archive-asset-impact/v1";
  assetVersion: AssetVersionIdentity;
  publishedReferences: readonly PublishedAssetReference[];
}>;
export type RestoreAssetInput = Readonly<AssetVersionIdentity & { recovery?: Readonly<{ bytes: Uint8Array; metadata: JsonValue }> }>;
export type RestoreAssetCommandDescriptor = Readonly<{
  contract: "restore-asset-command/v1";
  command: "RestoreAsset";
  assetVersion: AssetVersionIdentity;
  recovery: "none" | "local-bytes-and-metadata";
}>;
export type RestoreAvailabilityReport =
  | Readonly<{ contract: "restore-availability/v1"; status: "ready"; assets: readonly ReadyAssetVersion[] }>
  | Readonly<{ contract: "restore-availability/v1"; status: "blocked"; commands: readonly RestoreAssetCommandDescriptor[] }>;

export interface DataMediaTransaction {
  getAssetVersion(identity: AssetVersionIdentity): DataMediaPortResult<AssetVersionRecord>;
  setAssetVersionAvailability(identity: AssetVersionIdentity, availability: AssetVersionAvailability): DataMediaPortResult<AssetVersionRecord>;
  listPublishedAssetReferences(identity: AssetVersionIdentity): DataMediaPortResult<readonly PublishedAssetReference[]>;
  getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaPortResult<ReadyAssetVersion>;
}
export interface DataMediaPersistence extends DataMediaTransaction {
  createMediaImportIntent(input: MediaImportIntent): DataMediaPortResult<MediaImportIntent>;
  deleteMediaImportIntentExact(input: MediaImportIntent): DataMediaPortResult<void>;
  commitReadyAssetVersion(input: MediaImportIntent): DataMediaPortResult<ReadyAssetVersion>;
  readMediaStartupSnapshot(): DataMediaPortResult<MediaStartupSnapshot>;
  getEntryPointers(entryId: string): DataMediaPortResult<Readonly<{ entryId: string; currentRevisionId: string; publishedRevisionId?: string }>>;
  runTransaction<T, E>(operation: (transaction: DataMediaTransaction) => TransactionDecision<T, E>): TransactionDecision<T, E | unknown>;
  getRevisionReferences(revision: Readonly<{ entryId: string; revisionId: string }>): DataMediaPortResult<readonly Readonly<{ assetVersion: AssetVersionIdentity }>[]>;
}

export type DataMediaFailureCode =
  | "INVALID_MEDIA_INPUT"
  | "MEDIA_ROOT_FAILURE"
  | "MEDIA_IMPORT_CONFLICT"
  | "MEDIA_STAGING_FAILURE"
  | "MEDIA_PENDING_COMMIT_FAILURE"
  | "MEDIA_PROMOTION_FAILURE"
  | "MEDIA_FINAL_VERIFICATION_FAILURE"
  | "MEDIA_READY_COMMIT_FAILURE"
  | "MEDIA_VERSION_UNAVAILABLE"
  | "MEDIA_ARCHIVE_BLOCKED_PUBLISHED"
  | "MEDIA_ARCHIVE_FAILURE"
  | "MEDIA_RESTORE_REQUIRED"
  | "MEDIA_RESTORE_MISMATCH"
  | "MEDIA_RESTORE_FAILURE"
  | "MEDIA_RECONCILIATION_FAILURE";
export type DataMediaFailure = Readonly<{
  code: DataMediaFailureCode;
  owner: "DataMedia";
  subjectIds: readonly string[];
  remediation: MessageRemediation;
  archiveImpact?: ArchiveAssetImpact;
  restoreCommands?: readonly RestoreAssetCommandDescriptor[];
}>;
export type DataMediaResult<T> = CoreResult<T> | Readonly<{ ok: false; error: DataMediaFailure }>;
export interface DataMedia {
  importLocal(input: ImportLocalMediaInput): DataMediaResult<ReadyAssetVersion>;
  getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion>;
  readReadyObject(identity: AssetVersionIdentity): DataMediaResult<VerifiedReadyMediaObject>;
  requireReadyAssetVersions(identities: readonly AssetVersionIdentity[]): DataMediaResult<readonly ReadyAssetVersion[]>;
  resolvePublishedSelection(entryId: string): DataMediaResult<PublishedMediaSelection>;
  archiveAsset(identity: AssetVersionIdentity): DataMediaResult<AssetVersion>;
  restoreAsset(input: RestoreAssetInput): DataMediaResult<ReadyAssetVersion>;
  inspectRestoreAvailability(identities: readonly AssetVersionIdentity[]): DataMediaResult<RestoreAvailabilityReport>;
}
