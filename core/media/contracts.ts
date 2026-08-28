import type { CoreResult, Digest, JsonValue, MessageRemediation } from "../foundation/index.js";

export type AssetVersionIdentity = Readonly<{ assetId: string; assetVersionId: string }>;
export type ImportLocalMediaInput = Readonly<AssetVersionIdentity & { importId: string; bytes: Uint8Array; metadata: JsonValue }>;
export type ReadyAssetVersion = Readonly<{ identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest; availability: "ready" }>;
export type MediaEvidence = Readonly<{ objectDigest: Digest; byteLength: number }>;
export type MediaStageToken = Readonly<{ readonly __mediaStage: unique symbol }>;
export type MediaFinalToken = Readonly<{ readonly __mediaFinal: unique symbol }>;
export interface MediaObjectStore { stage(input: Readonly<{ importId: string; bytes: Uint8Array; evidence: MediaEvidence }>): DataMediaResult<MediaStageToken>; promote(stage: MediaStageToken, evidence: MediaEvidence): DataMediaResult<MediaFinalToken>; verifyFinal(final: MediaFinalToken, evidence: MediaEvidence): DataMediaResult<void>; releaseStage(stage: MediaStageToken, final: MediaFinalToken): DataMediaResult<void>; verifyEvidence(evidence: MediaEvidence): DataMediaResult<void>; }
export type MediaImportIntent = Readonly<{ importId: string; identity: AssetVersionIdentity; objectDigest: Digest; byteLength: number; metadataBytes: Uint8Array; metadataDigest: Digest }>;
export type DataMediaPortResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;
export interface DataMediaPersistence { createMediaImportIntent(input: MediaImportIntent): DataMediaPortResult<MediaImportIntent>; commitReadyAssetVersion(input: MediaImportIntent): DataMediaPortResult<ReadyAssetVersion>; getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaPortResult<ReadyAssetVersion>; }
export type DataMediaFailureCode = "INVALID_MEDIA_INPUT" | "MEDIA_ROOT_FAILURE" | "MEDIA_IMPORT_CONFLICT" | "MEDIA_STAGING_FAILURE" | "MEDIA_PENDING_COMMIT_FAILURE" | "MEDIA_PROMOTION_FAILURE" | "MEDIA_FINAL_VERIFICATION_FAILURE" | "MEDIA_READY_COMMIT_FAILURE" | "MEDIA_VERSION_UNAVAILABLE";
export type DataMediaFailure = Readonly<{ code: DataMediaFailureCode; owner: "DataMedia"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type DataMediaResult<T> = CoreResult<T> | Readonly<{ ok: false; error: DataMediaFailure }>;
export interface DataMedia { importLocal(input: ImportLocalMediaInput): DataMediaResult<ReadyAssetVersion>; getReadyAssetVersion(identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion>; requireReadyAssetVersions(identities: readonly AssetVersionIdentity[]): DataMediaResult<readonly ReadyAssetVersion[]>; }
