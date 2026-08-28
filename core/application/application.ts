import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { PersistenceFailure } from "../persistence/index.js";
import type {
  DomainApplication, DomainApplicationDependencies, DomainApplicationFailure, DomainApplicationFailureCode,
  DomainApplicationResult, SaveRevisionRequest, SaveRevisionSuccess,
} from "./contracts.js";

const messages: Readonly<Record<DomainApplicationFailureCode, string>> = {
  INVALID_SAVE_REVISION_REQUEST: "請修正 SaveRevision request。",
  SCHEMA_INVALID: "草稿不符合選定的 schema version。",
  MEDIA_UNAVAILABLE: "請先完成所有引用媒體的匯入或復原。",
  ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。",
  ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。",
  STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。",
  SAVE_REVISION_FAILED: "草稿未儲存；canonical state 未變更。",
};

function failure(code: DomainApplicationFailureCode, owner: DomainApplicationFailure["owner"] = "DomainApplication", subjectIds: readonly string[] = []): DomainApplicationFailure {
  return { code, owner, subjectIds, remediation: { kind: "message", message: messages[code] } };
}

function fail<T>(code: DomainApplicationFailureCode, owner?: DomainApplicationFailure["owner"], subjectIds?: readonly string[]): DomainApplicationResult<T> {
  return { ok: false, error: failure(code, owner, subjectIds) };
}

export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator }: DomainApplicationDependencies): DomainApplication {
  return {
    saveRevision(request) {
      if (!valid(request) || duplicate(request.assetVersions)) return fail("INVALID_SAVE_REVISION_REQUEST");
      const content = canonicalJsonBytes(request.content);
      if (!content.ok) return fail("INVALID_SAVE_REVISION_REQUEST");
      const contentDigest = sha256Digest(content.value);

      const schema = persistence.getSchemaVersion(request.schemaIdentity);
      if (!schema.ok) {
        // 找不到 schema version 是呼叫端可修正的 request 問題，不是儲存失敗。
        return schema.error.code === "SCHEMA_VERSION_NOT_FOUND"
          ? fail("INVALID_SAVE_REVISION_REQUEST", "Content", [request.schemaIdentity.schemaId])
          : fail("SAVE_REVISION_FAILED");
      }
      try {
        if (!schemaValidator.validate({ schema: schema.value, contentBytes: content.value.slice(), contentDigest }).ok) {
          return fail("SCHEMA_INVALID", "Content", [request.schemaIdentity.schemaId]);
        }
      } catch { return fail("SAVE_REVISION_FAILED"); }

      const prepared = siteDefinition.prepareCurrentClaim({ owner: request.entryId, route: request.route, sourceRevisionId: request.revisionId });
      if (!prepared.ok) return routeFailure(prepared.error.code, request.entryId);

      const media = dataMedia.requireReadyAssetVersions(request.assetVersions);
      if (!media.ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", request.assetVersions.map((item) => item.assetId));

      const committed = persistence.runTransaction<SaveRevisionSuccess, DomainApplicationFailure>((transaction) => {
        const siteTransaction: Parameters<typeof siteDefinition.validateCurrentClaimInTransaction>[1] = transaction;
        const token = siteDefinition.validateCurrentClaimInTransaction(prepared.value, siteTransaction);
        if (!token.ok) return routeFailure(token.error.code, request.entryId);
        for (const identity of request.assetVersions) {
          if (!transaction.getReadyAssetVersion(identity).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [identity.assetId]);
        }
        // published pointer 必須在同一 transaction 內讀取；在 transaction 外讀會讓併發的
        // PublishRevision 結果被這次 SaveRevision 以舊值覆寫回去。
        const existing = transaction.getEntryPointers(request.entryId);
        if (!existing.ok && existing.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("SAVE_REVISION_FAILED");
        const published = existing.ok ? existing.value.publishedRevisionId : undefined;

        const created = transaction.createRevisionWithReferences({
          revision: {
            identity: { entryId: request.entryId, revisionId: request.revisionId },
            schemaIdentity: request.schemaIdentity,
            contentBytes: content.value,
            contentDigest,
            lineage: { operationId: request.operationId, operationKind: "SaveRevision" },
          },
          assetVersions: request.assetVersions,
        });
        if (!created.ok) return fail("SAVE_REVISION_FAILED");

        const pointer = transaction.setEntryPointers({
          entryId: request.entryId,
          currentRevisionId: request.revisionId,
          ...(published === undefined ? {} : { publishedRevisionId: published }),
          lineage: { revisionId: request.revisionId, operationId: request.operationId, operationKind: "SaveRevision" },
        });
        if (!pointer.ok) return fail("SAVE_REVISION_FAILED");

        const claim = siteDefinition.applyValidatedCurrentClaimInTransaction(token.value, siteTransaction);
        if (!claim.ok) return fail("SAVE_REVISION_FAILED");
        const state = transaction.canonicalState();
        if (!state.ok) return fail("SAVE_REVISION_FAILED");
        return {
          ok: true,
          value: {
            revision: created.value.revision,
            references: created.value.references,
            currentPointer: pointer.value,
            currentClaim: claim.value,
            lineageIdentity: { entryId: request.entryId, revisionId: request.revisionId, operationId: request.operationId },
            stateDigest: state.value.digest,
          },
        };
      });
      // transaction 內偵測到的 route／media 衝突已經是可行動的 failure，不能收斂成 SAVE_REVISION_FAILED。
      return committed.ok ? committed : { ok: false, error: domainFailure(committed.error) };
    },
  };
}

function domainFailure(error: DomainApplicationFailure | PersistenceFailure): DomainApplicationFailure {
  return error.owner === "Persistence" ? failure("SAVE_REVISION_FAILED") : error;
}

function valid(value: SaveRevisionRequest): boolean {
  return typeof value.entryId === "string" && value.entryId.length > 0
    && typeof value.revisionId === "string" && value.revisionId.length > 0
    && typeof value.operationId === "string" && value.operationId.length > 0
    && Array.isArray(value.assetVersions);
}

function duplicate(values: readonly { assetId: string; assetVersionId: string }[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = `${value.assetId}\0${value.assetVersionId}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function routeFailure<T>(code: string, entryId: string): DomainApplicationResult<T> {
  return code === "ROUTE_CONFLICT" || code === "ROUTE_CHANGE_REQUIRED" || code === "STALE_ROUTE_PROPOSAL"
    ? fail(code, "SiteDefinition", [entryId])
    : fail("SAVE_REVISION_FAILED");
}
