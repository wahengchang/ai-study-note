import { canonicalJsonBytes, copyBytes, sha256Digest } from "../foundation/index.js";
import type { AssetVersionIdentity, DataMedia, DataMediaFailureCode, DataMediaPersistence, DataMediaResult, ImportLocalMediaInput, MediaAssetVersionRecord, MediaEvidence, MediaFinalCandidate, MediaFinalToken, MediaImportIntent, MediaObjectStore, MediaStageCandidate, ReadyAssetVersion } from "./contracts.js";

const messages: Readonly<Record<DataMediaFailureCode, string>> = { INVALID_MEDIA_INPUT: "請提供有效的 media import 輸入。", MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。", MEDIA_IMPORT_CONFLICT: "Media import identity 與既有紀錄衝突。", MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。", MEDIA_PENDING_COMMIT_FAILURE: "Media import intent 尚未提交為 pending。", MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。", MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。", MEDIA_READY_COMMIT_FAILURE: "Media asset version 尚未提交為 ready。", MEDIA_VERSION_UNAVAILABLE: "指定的 media asset version 尚不可用。", MEDIA_RECONCILIATION_FAILURE: "DataMedia 啟動收斂失敗；請保留現有 evidence，修復列出的媒體或匯入狀態後重試。" };

export function startDataMedia({ persistence, objectStore }: Readonly<{ persistence: DataMediaPersistence; objectStore: MediaObjectStore }>): DataMediaResult<DataMedia> {
  const first = persistence.readMediaStartupSnapshot(), storage = objectStore.readStartupSnapshot();
  if (!first.ok || !storage.ok) return reconciliationFailure([]);
  const failures = new Set<string>();
  const subject = (intent: MediaImportIntent): void => { failures.add(intent.importId); failures.add(intent.identity.assetId); failures.add(intent.identity.assetVersionId); };
  const finals = new Map<string, MediaFinalCandidate>();
  const stages = new Map<string, MediaStageCandidate>();
  for (const final of storage.value.finals) { if (finals.has(final.key) || final.key !== final.evidence.objectDigest) failures.add(final.key); else finals.set(final.key, final); }
  for (const stage of storage.value.stages) { if (stages.has(stage.key)) failures.add(stage.key); else stages.set(stage.key, stage); }
  const intents = [...first.value.pendingIntents].sort(compareIntents);
  const stageUse = new Map<string, number>(); for (const intent of intents) { const key = stageKey(intent.importId); stageUse.set(key, (stageUse.get(key) ?? 0) + 1); }
  for (const version of first.value.assetVersions) {
    if (!canonicalMetadata(version.metadataBytes, version.metadataDigest)) { failures.add(version.identity.assetId); failures.add(version.identity.assetVersionId); continue; }
    const final = finals.get(version.objectDigest);
    if (final !== undefined && (!sameEvidence(final.evidence, version) || !objectStore.verifyFinal(final.token, version).ok)) { failures.add(version.identity.assetId); failures.add(version.identity.assetVersionId); continue; }
    if (version.availability === "ready" && final === undefined) { failures.add(version.identity.assetId); failures.add(version.identity.assetVersionId); }
  }
  for (const intent of intents) {
    const stage = stages.get(stageKey(intent.importId)), final = finals.get(intent.objectDigest);
    if (!canonicalMetadata(intent.metadataBytes, intent.metadataDigest)) { subject(intent); continue; }
    if (stage !== undefined && !sameEvidence(stage.evidence, intent)) { subject(intent); continue; }
    if (final !== undefined && !sameEvidence(final.evidence, intent)) { subject(intent); continue; }
    if (stage?.hardlinkPair !== undefined && (final?.hardlinkPair !== stage.hardlinkPair || stageUse.get(stage.key) !== 1)) { subject(intent); continue; }
    const existing = persistence.getAssetVersion(intent.identity);
    if (!existing.ok) { subject(intent); continue; }
    if (existing.value !== undefined && !sameReady(existing.value, intent)) { subject(intent); continue; }
    let finalToken: MediaFinalToken | undefined = final?.token;
    if (finalToken !== undefined && !objectStore.verifyFinal(finalToken, intent).ok) { subject(intent); continue; }
    if (stage !== undefined && finalToken !== undefined) {
      if (!objectStore.releaseStage(stage.token, finalToken).ok || !objectStore.verifyFinal(finalToken, intent).ok) { subject(intent); continue; }
    } else if (stage !== undefined) {
      const promoted = objectStore.promote(stage.token, intent); if (!promoted.ok || !objectStore.verifyFinal(promoted.value, intent).ok || !objectStore.releaseStage(stage.token, promoted.value).ok || !objectStore.verifyFinal(promoted.value, intent).ok) { subject(intent); continue; }
      finalToken = promoted.value;
    } else if (finalToken === undefined) {
      const removed = persistence.deleteMediaImportIntentExact(intent); if (!removed.ok) subject(intent); continue;
    }
    if (finalToken === undefined) { subject(intent); continue; }
    const completed = existing.value !== undefined ? persistence.deleteMediaImportIntentExact(intent) : persistence.commitReadyAssetVersion(intent);
    if (!completed.ok) subject(intent);
  }
  if (failures.size > 0) return reconciliationFailure([...failures]);
  const fresh = persistence.readMediaStartupSnapshot(), freshStorage = objectStore.readStartupSnapshot();
  if (!fresh.ok || !freshStorage.ok || fresh.value.pendingIntents.length !== 0 || !healthyVersions(fresh.value.assetVersions, freshStorage.value.finals, objectStore)) return reconciliationFailure([]);
  const protectedFinals = new Set(fresh.value.assetVersions.map((version) => version.objectDigest));
  const orphanTokens = [
    ...freshStorage.value.stages.filter((candidate) => !candidate.hardlinkPair),
    ...freshStorage.value.finals.filter((candidate) => !candidate.hardlinkPair && !protectedFinals.has(candidate.key)),
  ].sort((left,right) => ("key" in left && "key" in right ? compareCodeUnits(left.key,right.key) : 0));
  for (const candidate of orphanTokens) if (!objectStore.removeOrphan(candidate.token).ok) return reconciliationFailure([]);
  const completed = persistence.readMediaStartupSnapshot(), completedStorage = objectStore.readStartupSnapshot();
  if (!completed.ok || !completedStorage.ok || completed.value.pendingIntents.length !== 0 || !healthyVersions(completed.value.assetVersions, completedStorage.value.finals, objectStore) || completedStorage.value.stages.length !== 0 || completedStorage.value.finals.some((candidate) => !completed.value.assetVersions.some((version) => version.objectDigest === candidate.key))) return reconciliationFailure([]);
  return { ok: true, value: createOperationalDataMedia({ persistence, objectStore }) };
}

function createOperationalDataMedia({ persistence, objectStore }: Readonly<{ persistence: DataMediaPersistence; objectStore: MediaObjectStore }>): DataMedia {
  const fail = <T>(code: DataMediaFailureCode): DataMediaResult<T> => ({ ok: false, error: { code, owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: messages[code] } } });
  const resolve = (identity: AssetVersionIdentity): DataMediaResult<ReadyAssetVersion> => {
    const record = persistence.getReadyAssetVersion(identity); if (!record.ok || !canonicalMetadata(record.value.metadataBytes, record.value.metadataDigest)) return fail("MEDIA_VERSION_UNAVAILABLE");
    const verified = objectStore.verifyEvidence(record.value); return verified.ok ? { ok: true, value: readyCopy(record.value) } : fail("MEDIA_VERSION_UNAVAILABLE");
  };
  return {
    importLocal(input) {
      if (!valid(input)) return fail("INVALID_MEDIA_INPUT"); const metadata = canonicalJsonBytes(input.metadata); if (!metadata.ok) return fail("INVALID_MEDIA_INPUT");
      const evidence = { objectDigest: sha256Digest(input.bytes), byteLength: input.bytes.byteLength }; const intent: MediaImportIntent = { importId: input.importId, identity: { assetId: input.assetId, assetVersionId: input.assetVersionId }, ...evidence, metadataBytes: copyBytes(metadata.value), metadataDigest: sha256Digest(metadata.value) };
      const current = persistence.getAssetVersion(intent.identity);
      if (!current.ok) return fail("MEDIA_IMPORT_CONFLICT");
      if (current.value !== undefined) return sameReady(current.value, intent) && objectStore.verifyEvidence(intent).ok ? { ok: true, value: readyCopy(current.value) } : fail("MEDIA_IMPORT_CONFLICT");
      const staged = objectStore.stage({ importId: input.importId, bytes: copyBytes(input.bytes), evidence }); if (!staged.ok) return fail("MEDIA_STAGING_FAILURE");
      const pending = persistence.createMediaImportIntent(intent); if (!pending.ok) return fail("MEDIA_PENDING_COMMIT_FAILURE");
      const final = objectStore.promote(staged.value, evidence); if (!final.ok) return fail("MEDIA_PROMOTION_FAILURE");
      if (!objectStore.verifyFinal(final.value, evidence).ok || !objectStore.releaseStage(staged.value, final.value).ok || !objectStore.verifyFinal(final.value, evidence).ok) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
      const ready = persistence.commitReadyAssetVersion(intent); return ready.ok ? { ok: true, value: readyCopy(ready.value) } : fail("MEDIA_READY_COMMIT_FAILURE");
    },
    getReadyAssetVersion: resolve,
    requireReadyAssetVersions(identities) { if (!Array.isArray(identities)) return fail("INVALID_MEDIA_INPUT"); const values: ReadyAssetVersion[] = []; for (const identity of identities) { const value = resolve(identity); if (!value.ok) return fail("MEDIA_VERSION_UNAVAILABLE"); values.push(value.value); } return { ok: true, value: values }; },
    resolvePublishedSelection(entryId) { if (typeof entryId !== "string" || entryId.length === 0) return fail("INVALID_MEDIA_INPUT"); const pointer = persistence.getEntryPointers(entryId); if (!pointer.ok || pointer.value.publishedRevisionId === undefined) return fail("MEDIA_VERSION_UNAVAILABLE"); const references = persistence.getRevisionReferences({ entryId, revisionId: pointer.value.publishedRevisionId }); if (!references.ok) return fail("MEDIA_VERSION_UNAVAILABLE"); const assets: ReadyAssetVersion[] = []; for (const reference of references.value) { const asset = resolve(reference.assetVersion); if (!asset.ok) return fail("MEDIA_VERSION_UNAVAILABLE"); assets.push(asset.value); } return { ok: true, value: { entryId, revisionId: pointer.value.publishedRevisionId, assets } }; },
  };
}
function healthyVersions(versions: readonly MediaAssetVersionRecord[], finals: readonly MediaFinalCandidate[], objectStore: MediaObjectStore): boolean { const map = new Map(finals.map((candidate) => [candidate.key,candidate])); return versions.every((version) => canonicalMetadata(version.metadataBytes,version.metadataDigest) && (version.availability !== "ready" || (map.has(version.objectDigest) && sameEvidence(map.get(version.objectDigest)!.evidence,version) && objectStore.verifyFinal(map.get(version.objectDigest)!.token,version).ok)) && (map.get(version.objectDigest) === undefined || (sameEvidence(map.get(version.objectDigest)!.evidence,version) && objectStore.verifyFinal(map.get(version.objectDigest)!.token,version).ok))); }
function reconciliationFailure(subjectIds: readonly string[]): DataMediaResult<never> { const safe = [...new Set(subjectIds.filter((id) => typeof id === "string" && id.length > 0))].sort(compareCodeUnits); return { ok: false, error: { code: "MEDIA_RECONCILIATION_FAILURE", owner: "DataMedia", subjectIds: safe, remediation: { kind: "message", message: messages.MEDIA_RECONCILIATION_FAILURE } } }; }
function stageKey(importId: string) { return sha256Digest(new TextEncoder().encode(importId)); }
function sameReady(record: MediaAssetVersionRecord, intent: MediaImportIntent): record is ReadyAssetVersion { return record.availability === "ready" && record.objectDigest === intent.objectDigest && record.byteLength === intent.byteLength && record.metadataDigest === intent.metadataDigest && sameBytes(record.metadataBytes,intent.metadataBytes); }
function canonicalMetadata(bytes: Uint8Array, digest: string): boolean { if (sha256Digest(bytes) !== digest) return false; try { const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); const canonical = canonicalJsonBytes(parsed as never); return canonical.ok && sameBytes(canonical.value,bytes); } catch { return false; } }
function readyCopy(record: ReadyAssetVersion): ReadyAssetVersion { return { ...record, identity: { ...record.identity }, metadataBytes: copyBytes(record.metadataBytes) }; }
function sameEvidence(left: MediaEvidence, right: MediaEvidence): boolean { return left.objectDigest === right.objectDigest && left.byteLength === right.byteLength; }
function sameBytes(left: Uint8Array, right: Uint8Array): boolean { if (left.byteLength !== right.byteLength) return false; for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false; return true; }
function compareIntents(left: MediaImportIntent, right: MediaImportIntent): number { return compareCodeUnits(left.importId,right.importId) || compareCodeUnits(left.identity.assetId,right.identity.assetId) || compareCodeUnits(left.identity.assetVersionId,right.identity.assetVersionId); }
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function valid(input: ImportLocalMediaInput): boolean { return typeof input.importId === "string" && input.importId.length > 0 && typeof input.assetId === "string" && input.assetId.length > 0 && typeof input.assetVersionId === "string" && input.assetVersionId.length > 0 && input.bytes instanceof Uint8Array; }
