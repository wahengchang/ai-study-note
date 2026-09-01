import type { CoreResult, Digest, JsonValue, MessageRemediation } from "../foundation/index.js";

export type AssetVersionIdentity = Readonly<{ assetId: string; assetVersionId: string }>;
export type ImportLocalMediaInput = Readonly<AssetVersionIdentity & { importId: string; bytes: Uint8Array; metadata: JsonValue }>;
export type MediaEvidence = Readonly<{ objectDigest: Digest; byteLength: number }>;
export type MediaAvailability = "ready" | "archived" | "missing";
export type MediaAssetVersionRecord = Readonly<{ identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest; availability: MediaAvailability }>;
export type ReadyAssetVersion = Readonly<{ identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest; availability: "ready" }>;
export type PublishedMediaSelection = Readonly<{ entryId: string; revisionId: string; assets: readonly ReadyAssetVersion[] }>;

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
  readStartupSnapshot(): DataMediaResult<MediaStorageSnapshot>;
  removeOrphan(candidate: MediaStageToken | MediaFinalToken): DataMediaResult<void>;
}

export type MediaImportIntent = Readonly<{ importId: string; identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest }>;
export type MediaStartupSnapshot = Readonly<{ pendingIntents: readonly MediaImportIntent[]; assetVersions: readonly MediaAssetVersionRecord[] }>;
export type DataMediaPortResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;
export interface DataMediaPersistence {
  createMediaImportIntent(input: MediaImportIntent): DataMediaPortResult<MediaImportIntent>;
  deleteMediaImportIntentExact(input: MediaImportIntent): DataMediaPortResult<void>;
  commitReadyAssetVersion(input: MediaImportIntent): DataMediaPortResult<ReadyAssetVersion>;
  getAssetVersion(identity: AssetVersionIdentity): DataMediaPortResult<MediaAssetVersionRecord | undefined>;
  getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaPortResult<ReadyAssetVersion>;
  readMediaStartupSnapshot(): DataMediaPortResult<MediaStartupSnapshot>;
  getEntryPointers(entryId: string): DataMediaPortResult<Readonly<{ entryId: string; currentRevisionId: string; publishedRevisionId?: string }>>;
  getRevisionReferences(revision: Readonly<{ entryId: string; revisionId: string }>): DataMediaPortResult<readonly Readonly<{ assetVersion: AssetVersionIdentity }>[]>;
}

export type DataMediaFailureCode = "INVALID_MEDIA_INPUT" | "MEDIA_ROOT_FAILURE" | "MEDIA_IMPORT_CONFLICT" | "MEDIA_STAGING_FAILURE" | "MEDIA_PENDING_COMMIT_FAILURE" | "MEDIA_PROMOTION_FAILURE" | "MEDIA_FINAL_VERIFICATION_FAILURE" | "MEDIA_READY_COMMIT_FAILURE" | "MEDIA_VERSION_UNAVAILABLE" | "MEDIA_RECONCILIATION_FAILURE";
export type DataMediaFailure = Readonly<{ code: DataMediaFailureCode; owner: "DataMedia"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type DataMediaResult<T> = CoreResult<T> | Readonly<{ ok: false; error: DataMediaFailure }>;
export interface DataMedia {
  importLocal(input: ImportLocalMediaInput): DataMediaResult<ReadyAssetVersion>;
  getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion>;
  requireReadyAssetVersions(identities: readonly AssetVersionIdentity[]): DataMediaResult<readonly ReadyAssetVersion[]>;
  resolvePublishedSelection(entryId: string): DataMediaResult<PublishedMediaSelection>;
}
