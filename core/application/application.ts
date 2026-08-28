import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { DomainApplication, DomainApplicationDependencies, DomainApplicationFailure, DomainApplicationFailureCode, DomainApplicationResult, SaveRevisionRequest, SaveRevisionSuccess } from "./contracts.js";

const messages: Readonly<Record<DomainApplicationFailureCode, string>> = { INVALID_SAVE_REVISION_REQUEST: "請修正 SaveRevision request。", SCHEMA_INVALID: "草稿不符合選定的 schema version。", MEDIA_UNAVAILABLE: "請先完成所有引用媒體的匯入或復原。", ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。", ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。", STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。", SAVE_REVISION_FAILED: "草稿未儲存；canonical state 未變更。" };
export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator }: DomainApplicationDependencies): DomainApplication {
  const fail = <T>(code: DomainApplicationFailureCode, owner: DomainApplicationFailure["owner"] = "DomainApplication", subjectIds: readonly string[] = []): DomainApplicationResult<T> => ({ ok: false, error: { code, owner, subjectIds, remediation: { kind: "message", message: messages[code] } } });
  return { saveRevision(request) {
    if (!valid(request) || duplicate(request.assetVersions)) return fail("INVALID_SAVE_REVISION_REQUEST");
    const content = canonicalJsonBytes(request.content); if (!content.ok) return fail("INVALID_SAVE_REVISION_REQUEST");
    const schema = persistence.getSchemaVersion(request.schemaIdentity); if (!schema.ok) return fail("SAVE_REVISION_FAILED");
    try { if (!schemaValidator.validate({ schema: schema.value, contentBytes: content.value.slice(), contentDigest: sha256Digest(content.value) }).ok) return fail("SCHEMA_INVALID", "Content", [request.schemaIdentity.schemaId]); } catch { return fail("SAVE_REVISION_FAILED"); }
    const prepared = siteDefinition.prepareCurrentClaim({ owner: request.entryId, route: request.route, sourceRevisionId: request.revisionId });
    if (!prepared.ok) return routeFailure(prepared.error.code, fail, request.entryId);
    const media = dataMedia.requireReadyAssetVersions(request.assetVersions); if (!media.ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", request.assetVersions.map((item) => item.assetId));
    const existingPointers = persistence.getEntryPointers(request.entryId);
    const committed = persistence.runTransaction<SaveRevisionSuccess, DomainApplicationFailure>((transaction) => {
      const siteTransaction = transaction as unknown as Parameters<typeof siteDefinition.validateCurrentClaimInTransaction>[1];
      const token = siteDefinition.validateCurrentClaimInTransaction(prepared.value, siteTransaction); if (!token.ok) return routeFailure(token.error.code, fail, request.entryId);
      for (const identity of request.assetVersions) if (!transaction.getReadyAssetVersion(identity).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [identity.assetId]);
      const created = transaction.createRevisionWithReferences({ revision: { identity: { entryId: request.entryId, revisionId: request.revisionId }, schemaIdentity: request.schemaIdentity, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: request.operationId, operationKind: "SaveRevision" } }, assetVersions: request.assetVersions }); if (!created.ok) return fail("SAVE_REVISION_FAILED");
      const pointer = transaction.setEntryPointers({ entryId: request.entryId, currentRevisionId: request.revisionId, ...(existingPointers.ok && existingPointers.value.publishedRevisionId !== undefined ? { publishedRevisionId: existingPointers.value.publishedRevisionId } : {}), lineage: { revisionId: request.revisionId, operationId: request.operationId, operationKind: "SaveRevision" } }); if (!pointer.ok) return fail("SAVE_REVISION_FAILED");
      const claim = siteDefinition.applyValidatedCurrentClaimInTransaction(token.value, siteTransaction); if (!claim.ok) return fail("SAVE_REVISION_FAILED");
      const state = transaction.canonicalState(); if (!state.ok) return fail("SAVE_REVISION_FAILED");
      return { ok: true, value: { revision: created.value.revision, references: created.value.references, currentPointer: pointer.value, currentClaim: claim.value, lineageIdentity: { entryId: request.entryId, revisionId: request.revisionId, operationId: request.operationId }, stateDigest: state.value.digest } };
    });
    return committed.ok ? committed : fail("SAVE_REVISION_FAILED");
  } };
}
function valid(value: SaveRevisionRequest): boolean { return typeof value.entryId === "string" && value.entryId.length > 0 && typeof value.revisionId === "string" && value.revisionId.length > 0 && typeof value.operationId === "string" && value.operationId.length > 0 && Array.isArray(value.assetVersions); }
function duplicate(values: readonly { assetId: string; assetVersionId: string }[]): boolean { const seen = new Set<string>(); for (const value of values) { const key = `${value.assetId}\0${value.assetVersionId}`; if (seen.has(key)) return true; seen.add(key); } return false; }
function routeFailure<T>(code: string, fail: <V>(code: DomainApplicationFailureCode, owner?: DomainApplicationFailure["owner"], subjectIds?: readonly string[]) => DomainApplicationResult<V>, entryId: string): DomainApplicationResult<T> { return code === "ROUTE_CONFLICT" || code === "ROUTE_CHANGE_REQUIRED" || code === "STALE_ROUTE_PROPOSAL" ? fail(code, "SiteDefinition", [entryId]) : fail("SAVE_REVISION_FAILED"); }
