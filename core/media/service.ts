import { canonicalJsonBytes, copyBytes, sha256Digest } from "../foundation/index.js";
import type {
  AssetVersion,
  ArchiveAssetImpact,
  AssetVersionIdentity,
  DataMedia,
  DataMediaFailureCode,
  DataMediaPersistence,
  DataMediaResult,
  ImportLocalMediaInput,
  MediaImportIntent,
  MediaObjectStore,
  ReadyAssetVersion,
  RestoreAssetCommandDescriptor,
  RestoreAssetInput,
} from "./contracts.js";

const messages: Readonly<Record<DataMediaFailureCode, string>> = {
  INVALID_MEDIA_INPUT: "請提供有效的 media import 輸入。",
  MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。",
  MEDIA_IMPORT_CONFLICT: "Media import identity 與既有紀錄衝突。",
  MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。",
  MEDIA_PENDING_COMMIT_FAILURE: "Media import intent 尚未提交為 pending。",
  MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。",
  MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。",
  MEDIA_READY_COMMIT_FAILURE: "Media asset version 尚未提交為 ready。",
  MEDIA_VERSION_UNAVAILABLE: "指定的 media asset version 尚不可用。",
  MEDIA_ARCHIVE_BLOCKED_PUBLISHED: "仍被已發布內容引用，無法封存此媒體版本。",
  MEDIA_ARCHIVE_FAILURE: "Media asset version 尚未完成封存。",
  MEDIA_RESTORE_REQUIRED: "請提供符合既有 evidence 的本機 recovery bytes 與 metadata。",
  MEDIA_RESTORE_MISMATCH: "Recovery bytes 或 metadata 與既有 asset version 不一致。",
  MEDIA_RESTORE_FAILURE: "Media asset version 尚未完成復原。",
};

export function createDataMedia({ persistence, objectStore }: Readonly<{ persistence: DataMediaPersistence; objectStore: MediaObjectStore }>): DataMedia {
  const fail = <T>(code: DataMediaFailureCode, subjectIds: readonly string[] = [], extra: Readonly<{ restoreCommands?: readonly RestoreAssetCommandDescriptor[]; archiveImpact?: ArchiveAssetImpact }> = {}): DataMediaResult<T> => ({
    ok: false,
    error: { code, owner: "DataMedia", subjectIds, remediation: { kind: "message", message: messages[code] }, ...extra },
  });
  const objectHealth = (record: AssetVersion, requireReady: boolean): DataMediaResult<AssetVersion> => {
    if ((requireReady && record.availability !== "ready") || !validMetadata(record) || !objectStore.verifyEvidence({ objectDigest: record.objectDigest, byteLength: record.byteLength }).ok) return fail("MEDIA_VERSION_UNAVAILABLE", identitySubjects(record.identity));
    return { ok: true, value: cloneAsset(record) };
  };
  const resolve = (identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion> => {
    const record = persistence.getAssetVersion(identity);
    if (!record.ok) return fail("MEDIA_VERSION_UNAVAILABLE", identitySubjects(identity));
    const healthy = objectHealth(record.value, true);
    return healthy.ok ? { ok: true, value: healthy.value as ReadyAssetVersion } : healthy;
  };
  const commitReady = (identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion> => {
    const result = persistence.runTransaction<ReadyAssetVersion, DataMediaResult<never>>((transaction) => {
      const current = transaction.getAssetVersion(identity);
      if (!current.ok || !validMetadata(current.value) || !objectStore.verifyEvidence({ objectDigest: current.value.objectDigest, byteLength: current.value.byteLength }).ok) return { ok: false, error: fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity)) };
      const updated = transaction.setAssetVersionAvailability(identity, "ready");
      return updated.ok ? { ok: true, value: cloneAsset(updated.value) as ReadyAssetVersion } : { ok: false, error: fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity)) };
    });
    return result.ok ? result : typeof result.error === "object" && result.error !== null && "ok" in result.error ? result.error as DataMediaResult<ReadyAssetVersion> : fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
  };

  return {
    importLocal(input) {
      if (!validImport(input)) return fail("INVALID_MEDIA_INPUT");
      const metadata = canonicalJsonBytes(input.metadata);
      if (!metadata.ok) return fail("INVALID_MEDIA_INPUT");
      const evidence = { objectDigest: sha256Digest(input.bytes), byteLength: input.bytes.byteLength };
      const intent: MediaImportIntent = {
        importId: input.importId,
        identity: { assetId: input.assetId, assetVersionId: input.assetVersionId },
        ...evidence,
        metadataBytes: copyBytes(metadata.value),
        metadataDigest: sha256Digest(metadata.value),
      };
      const staged = objectStore.stage({ importId: input.importId, bytes: copyBytes(input.bytes), evidence });
      if (!staged.ok) return fail("MEDIA_STAGING_FAILURE");
      if (!persistence.createMediaImportIntent(intent).ok) return fail("MEDIA_PENDING_COMMIT_FAILURE");
      const final = objectStore.promote(staged.value, evidence);
      if (!final.ok) return fail("MEDIA_PROMOTION_FAILURE");
      if (!objectStore.verifyFinal(final.value, evidence).ok) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
      if (!objectStore.releaseStage(staged.value, final.value).ok) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
      const ready = persistence.commitReadyAssetVersion(intent);
      return ready.ok ? { ok: true, value: cloneAsset(ready.value) as ReadyAssetVersion } : fail("MEDIA_READY_COMMIT_FAILURE");
    },
    getReadyAssetVersion: resolve,
    requireReadyAssetVersions(identities) {
      if (!Array.isArray(identities)) return fail("INVALID_MEDIA_INPUT");
      const values: ReadyAssetVersion[] = [];
      for (const identity of identities) {
        const value = resolve(identity);
        if (!value.ok) {
          const report = this.inspectRestoreAvailability(identities);
          return !report.ok ? report : report.value.status === "blocked" ? fail("MEDIA_VERSION_UNAVAILABLE", commandSubjects(report.value.commands), { restoreCommands: report.value.commands }) : value;
        }
        values.push(value.value);
      }
      return { ok: true, value: values };
    },
    resolvePublishedSelection(entryId) {
      if (!validText(entryId)) return fail("INVALID_MEDIA_INPUT");
      const pointer = persistence.getEntryPointers(entryId);
      if (!pointer.ok || pointer.value.publishedRevisionId === undefined) return fail("MEDIA_VERSION_UNAVAILABLE", [entryId]);
      const references = persistence.getRevisionReferences({ entryId, revisionId: pointer.value.publishedRevisionId });
      if (!references.ok) return fail("MEDIA_VERSION_UNAVAILABLE", [entryId, pointer.value.publishedRevisionId]);
      const assets: ReadyAssetVersion[] = [];
      for (const reference of references.value) {
        const asset = resolve(reference.assetVersion);
        if (!asset.ok) return asset;
        assets.push(asset.value);
      }
      return { ok: true, value: { entryId, revisionId: pointer.value.publishedRevisionId, assets } };
    },
    archiveAsset(identity) {
      if (!validIdentity(identity)) return fail("INVALID_MEDIA_INPUT");
      const result = persistence.runTransaction<AssetVersion, DataMediaResult<never>>((transaction) => {
        const record = transaction.getAssetVersion(identity);
        if (!record.ok || record.value.availability === "missing") return { ok: false, error: fail("MEDIA_ARCHIVE_FAILURE", identitySubjects(identity)) };
        const healthy = objectHealth(record.value, false);
        if (!healthy.ok) return { ok: false, error: fail("MEDIA_ARCHIVE_FAILURE", identitySubjects(identity)) };
        const references = transaction.listPublishedAssetReferences(identity);
        if (!references.ok) return { ok: false, error: fail("MEDIA_ARCHIVE_FAILURE", identitySubjects(identity)) };
        if (references.value.length > 0) return { ok: false, error: fail("MEDIA_ARCHIVE_BLOCKED_PUBLISHED", identitySubjects(identity), { archiveImpact: { contract: "archive-asset-impact/v1", assetVersion: { ...identity }, publishedReferences: references.value } }) };
        if (record.value.availability === "archived") return { ok: true, value: cloneAsset(record.value) };
        const archived = transaction.setAssetVersionAvailability(identity, "archived");
        return archived.ok ? { ok: true, value: cloneAsset(archived.value) } : { ok: false, error: fail("MEDIA_ARCHIVE_FAILURE", identitySubjects(identity)) };
      });
      return result.ok ? result : unwrap(result.error, "MEDIA_ARCHIVE_FAILURE", identitySubjects(identity));
    },
    restoreAsset(input) {
      if (!validRestore(input)) return fail("INVALID_MEDIA_INPUT");
      const identity = { assetId: input.assetId, assetVersionId: input.assetVersionId };
      const record = persistence.getAssetVersion(identity);
      if (!record.ok || !validMetadata(record.value)) return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
      const evidence = { objectDigest: record.value.objectDigest, byteLength: record.value.byteLength };
      const final = objectStore.inspectFinal(evidence);
      if (!final.ok || final.value === "unhealthy") return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
      if (final.value === "healthy") return input.recovery === undefined ? commitReady(identity) : fail("MEDIA_RESTORE_MISMATCH", identitySubjects(identity));
      if (input.recovery === undefined) return fail("MEDIA_RESTORE_REQUIRED", identitySubjects(identity));
      const metadata = canonicalJsonBytes(input.recovery.metadata);
      if (!metadata.ok || !sameBytes(metadata.value, record.value.metadataBytes) || sha256Digest(input.recovery.bytes) !== evidence.objectDigest || input.recovery.bytes.byteLength !== evidence.byteLength) return fail("MEDIA_RESTORE_MISMATCH", identitySubjects(identity));
      const staged = objectStore.stage({ importId: `restore:${identity.assetId}\u0000${identity.assetVersionId}`, bytes: copyBytes(input.recovery.bytes), evidence });
      if (!staged.ok) return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
      const promoted = objectStore.promote(staged.value, evidence);
      if (!promoted.ok || !objectStore.verifyFinal(promoted.ok ? promoted.value : ({} as never), evidence).ok) return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
      const ready = commitReady(identity);
      if (!ready.ok) return ready;
      if (!objectStore.releaseStage(staged.value, promoted.value).ok) return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
      return ready;
    },
    inspectRestoreAvailability(identities) {
      if (!Array.isArray(identities) || identities.some((identity) => !validIdentity(identity))) return fail("INVALID_MEDIA_INPUT");
      const ordered = [...identities].sort(compareIdentity);
      const assets: ReadyAssetVersion[] = [];
      const commands: RestoreAssetCommandDescriptor[] = [];
      for (const identity of ordered) {
        const record = persistence.getAssetVersion(identity);
        if (!record.ok || !validMetadata(record.value)) return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
        const final = objectStore.inspectFinal({ objectDigest: record.value.objectDigest, byteLength: record.value.byteLength });
        if (!final.ok || final.value === "unhealthy") return fail("MEDIA_RESTORE_FAILURE", identitySubjects(identity));
        if (record.value.availability === "ready" && final.value === "healthy") {
          assets.push(cloneAsset(record.value) as ReadyAssetVersion);
        } else if (final.value === "healthy") {
          commands.push(command(identity, "none"));
        } else {
          commands.push(command(identity, "local-bytes-and-metadata"));
        }
      }
      return commands.length === 0 ? { ok: true, value: { contract: "restore-availability/v1", status: "ready", assets } } : { ok: true, value: { contract: "restore-availability/v1", status: "blocked", commands } };
    },
  };
}

function unwrap<T>(error: unknown, code: DataMediaFailureCode, subjects: readonly string[]): DataMediaResult<T> {
  return typeof error === "object" && error !== null && "ok" in error ? error as DataMediaResult<T> : { ok: false, error: { code, owner: "DataMedia", subjectIds: subjects, remediation: { kind: "message", message: messages[code] } } };
}
function validImport(input: ImportLocalMediaInput): boolean { return validText(input.importId) && validIdentity(input) && input.bytes instanceof Uint8Array; }
function validRestore(input: RestoreAssetInput): boolean { return validIdentity(input) && (input.recovery === undefined || (input.recovery.bytes instanceof Uint8Array)); }
function validIdentity(value: AssetVersionIdentity): boolean { return validText(value.assetId) && validText(value.assetVersionId); }
function validText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && !value.includes("\u0000"); }
function validMetadata(record: AssetVersion): boolean {
  try {
    const bytes = canonicalJsonBytes(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.metadataBytes)));
    return bytes.ok && sameBytes(bytes.value, record.metadataBytes) && sha256Digest(record.metadataBytes) === record.metadataDigest;
  } catch { return false; }
}
function cloneAsset(record: AssetVersion): AssetVersion { return { ...record, identity: { ...record.identity }, metadataBytes: copyBytes(record.metadataBytes) }; }
function sameBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]); }
function identitySubjects(identity: AssetVersionIdentity): readonly string[] { return [identity.assetId, identity.assetVersionId]; }
function command(assetVersion: AssetVersionIdentity, recovery: "none" | "local-bytes-and-metadata"): RestoreAssetCommandDescriptor { return { contract: "restore-asset-command/v1", command: "RestoreAsset", assetVersion: { ...assetVersion }, recovery }; }
function commandSubjects(commands: readonly RestoreAssetCommandDescriptor[]): readonly string[] { return commands.flatMap((item) => identitySubjects(item.assetVersion)); }
function compareIdentity(left: AssetVersionIdentity, right: AssetVersionIdentity): number { return left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : left.assetVersionId < right.assetVersionId ? -1 : left.assetVersionId > right.assetVersionId ? 1 : 0; }
