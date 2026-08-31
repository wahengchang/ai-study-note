import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { PluginHostFailure } from "../plugin-host/index.js";
import type { DomainApplication, DomainApplicationCommandFailure, DomainApplicationDependencies, DomainApplicationFailure, DomainApplicationFailureCode, DomainApplicationResult, PublishRevisionRequest, PublishRevisionSuccess, ReplaceMediaReferenceRequest, SaveRevisionRequest, SaveRevisionSuccess } from "./contracts.js";
const messages: Readonly<Record<DomainApplicationFailureCode, string>> = { INVALID_SAVE_REVISION_REQUEST: "請修正 SaveRevision request。", INVALID_PUBLISH_REVISION_REQUEST: "請修正 PublishRevision request。", INVALID_REPLACE_MEDIA_REFERENCE_REQUEST: "請修正 ReplaceMediaReference request。", CURRENT_REVISION_MISMATCH: "目前 revision 已變更，請重新確認後再發布。", MEDIA_REFERENCE_NOT_FOUND: "來源 revision 不含指定的媒體引用。", SCHEMA_INVALID: "草稿不符合選定的 schema version。", MEDIA_UNAVAILABLE: "請先完成所有引用媒體的匯入或復原。", ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。", ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。", STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。", SAVE_REVISION_FAILED: "草稿未儲存；canonical state 未變更。", PUBLISH_REVISION_FAILED: "發布未完成；canonical state 未變更。", REPLACE_MEDIA_REFERENCE_FAILED: "媒體引用未替換；canonical state 未變更。" };
function fail<T>(code: DomainApplicationFailureCode, owner: DomainApplicationCommandFailure["owner"] = "DomainApplication", subjectIds: readonly string[] = []): DomainApplicationResult<T> { return { ok: false, error: { code, owner, subjectIds, remediation: { kind: "message", message: messages[code] } } }; }
function plugin(error: PluginHostFailure): DomainApplicationResult<never> { return error.code === "PLUGIN_VALIDATION_SERVICE_FAILED" ? fail("SAVE_REVISION_FAILED") : { ok: false, error }; }
function content(value: JsonValue): Readonly<{ value: JsonValue; bytes: Uint8Array; digest: Digest }> | null { const canonical = canonicalJsonBytes(value); if (!canonical.ok) return null; try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(canonical.value)) as JsonValue, bytes: copyBytes(canonical.value), digest: sha256Digest(canonical.value) }; } catch { return null; } }
export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator, pluginHost }: DomainApplicationDependencies): DomainApplication {
  return {
    async saveRevision(request) {
      if (!valid(request) || duplicate(request.assetVersions)) return fail("INVALID_SAVE_REVISION_REQUEST"); const initial = content(request.content); if (initial === null) return fail("INVALID_SAVE_REVISION_REQUEST");
      const schema = persistence.getSchemaVersion(request.schemaIdentity); if (!schema.ok) return schema.error.code === "SCHEMA_VERSION_NOT_FOUND" ? fail("INVALID_SAVE_REVISION_REQUEST", "Content", [request.schemaIdentity.schemaId]) : fail("SAVE_REVISION_FAILED");
      try { if (!schemaValidator.validate({ schema: schema.value, contentBytes: initial.bytes, contentDigest: initial.digest }).ok) return fail("SCHEMA_INVALID", "Content", [request.schemaIdentity.schemaId]); } catch { return fail("SAVE_REVISION_FAILED"); }
      const claim = siteDefinition.prepareCurrentClaim({ owner: request.entryId, route: request.route, sourceRevisionId: request.revisionId }); if (!claim.ok) return route(claim.error.code, request.entryId);
      if (!dataMedia.requireReadyAssetVersions(request.assetVersions).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", request.assetVersions.map((item) => item.assetId));
      const prepared = await pluginHost.prepareSaveRevisionValidators({ entryId: request.entryId }); if (!prepared.ok) return plugin(prepared.error as PluginHostFailure);
      const result = persistence.runTransaction<SaveRevisionSuccess, DomainApplicationFailure>((transaction) => {
        const token = siteDefinition.validateCurrentClaimInTransaction(claim.value, transaction); if (!token.ok) return route(token.error.code, request.entryId);
        for (const item of request.assetVersions) if (!transaction.getReadyAssetVersion(item).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [item.assetId]);
        const prior = transaction.getEntryPointers(request.entryId); if (!prior.ok && prior.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("SAVE_REVISION_FAILED");
        const validated = pluginHost.runPreparedSaveRevisionValidators(prepared.value, { contract: "save-revision-validator-input/v1", entryId: request.entryId, revisionId: request.revisionId, schemaIdentity: request.schemaIdentity, content: initial.value }, (next) => { try { return schemaValidator.validate({ schema: schema.value, contentBytes: next.contentBytes, contentDigest: next.contentDigest }); } catch { throw new Error("guard"); } });
        if (!validated.ok) return plugin(validated.error as PluginHostFailure);
        const created = transaction.createRevisionWithReferences({ revision: { identity: { entryId: request.entryId, revisionId: request.revisionId }, schemaIdentity: request.schemaIdentity, contentBytes: validated.value.contentBytes, contentDigest: validated.value.contentDigest, lineage: { operationId: request.operationId, operationKind: "SaveRevision" } }, assetVersions: request.assetVersions }); if (!created.ok) return fail("SAVE_REVISION_FAILED");
        const pointer = transaction.setEntryPointers({ entryId: request.entryId, currentRevisionId: request.revisionId, ...(prior.ok && prior.value.publishedRevisionId !== undefined ? { publishedRevisionId: prior.value.publishedRevisionId } : {}), lineage: { revisionId: request.revisionId, operationId: request.operationId, operationKind: "SaveRevision" } }); if (!pointer.ok) return fail("SAVE_REVISION_FAILED");
        const applied = siteDefinition.applyValidatedCurrentClaimInTransaction(token.value, transaction); if (!applied.ok) return fail("SAVE_REVISION_FAILED");
        const state = transaction.canonicalState(); return !state.ok ? fail("SAVE_REVISION_FAILED") : { ok: true, value: { revision: created.value.revision, references: created.value.references, currentPointer: pointer.value, currentClaim: applied.value, lineageIdentity: { entryId: request.entryId, revisionId: request.revisionId, operationId: request.operationId }, stateDigest: state.value.digest, activePluginStateDigest: validated.value.activeStateDigest } };
      });
      return result.ok ? result : result.error.owner === "Persistence" ? fail("SAVE_REVISION_FAILED") : result.error.owner === "PluginHost" ? plugin(result.error) : { ok: false, error: result.error };
    },
    async publishRevision(request) {
      if (!validPublish(request)) return fail("INVALID_PUBLISH_REVISION_REQUEST");
      const pointer = persistence.getEntryPointers(request.entryId);
      if (!pointer.ok) return pointer.error.code === "ENTRY_POINTER_NOT_FOUND" ? fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]) : fail("PUBLISH_REVISION_FAILED");
      if (pointer.value.currentRevisionId !== request.expectedCurrentRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
      const revision = persistence.getRevision({ entryId: request.entryId, revisionId: request.expectedCurrentRevisionId });
      if (!revision.ok) return fail("PUBLISH_REVISION_FAILED");
      const schema = persistence.getSchemaVersion(revision.value.schemaIdentity); if (!schema.ok) return fail("PUBLISH_REVISION_FAILED");
      try { if (!schemaValidator.validate({ schema: schema.value, contentBytes: revision.value.contentBytes, contentDigest: revision.value.contentDigest }).ok) return fail("SCHEMA_INVALID", "Content", [request.entryId]); } catch { return fail("PUBLISH_REVISION_FAILED"); }
      const references = persistence.getRevisionReferences(revision.value.identity); if (!references.ok) return fail("PUBLISH_REVISION_FAILED");
      const assetVersions = references.value.map((reference) => reference.assetVersion);
      if (!dataMedia.requireReadyAssetVersions(assetVersions).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", assetVersions.map((item) => item.assetId));
      const current = siteDefinition.snapshot("current"); if (!current.ok) return fail("PUBLISH_REVISION_FAILED");
      const currentClaim = current.value.claims.find((claim) => claim.owner === request.entryId && claim.sourceRevisionId === request.expectedCurrentRevisionId);
      if (currentClaim === undefined) return fail("PUBLISH_REVISION_FAILED", "SiteDefinition", [request.entryId]);
      const claim = siteDefinition.preparePublishedClaim({ owner: request.entryId, route: currentClaim.normalizedRoute, sourceRevisionId: request.expectedCurrentRevisionId }); if (!claim.ok) return route(claim.error.code, request.entryId);
      const result = persistence.runTransaction<PublishRevisionSuccess, DomainApplicationFailure>((transaction) => {
        const latest = transaction.getEntryPointers(request.entryId);
        if (!latest.ok || latest.value.currentRevisionId !== request.expectedCurrentRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
        for (const item of assetVersions) if (!transaction.getReadyAssetVersion(item).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [item.assetId]);
        const token = siteDefinition.validatePublishedClaimInTransaction(claim.value, transaction); if (!token.ok) return route(token.error.code, request.entryId);
        const publishedPointer = transaction.setEntryPointers({ entryId: request.entryId, currentRevisionId: latest.value.currentRevisionId, publishedRevisionId: request.expectedCurrentRevisionId, lineage: { revisionId: request.expectedCurrentRevisionId, operationId: request.operationId, operationKind: "PublishRevision" } }); if (!publishedPointer.ok) return fail("PUBLISH_REVISION_FAILED");
        const publishedClaim = siteDefinition.applyValidatedPublishedClaimInTransaction(token.value, transaction); if (!publishedClaim.ok) return fail("PUBLISH_REVISION_FAILED");
        const state = transaction.canonicalState(); return !state.ok ? fail("PUBLISH_REVISION_FAILED") : { ok: true, value: { revision: revision.value, publishedPointer: publishedPointer.value, publishedClaim: publishedClaim.value, lineageIdentity: { entryId: request.entryId, revisionId: request.expectedCurrentRevisionId, operationId: request.operationId }, stateDigest: state.value.digest } };
      });
      return result.ok ? result : result.error.owner === "Persistence" ? fail("PUBLISH_REVISION_FAILED") : { ok: false, error: result.error };
    }
    ,
    async replaceMediaReference(request) {
      if (!validReplace(request)) return fail("INVALID_REPLACE_MEDIA_REFERENCE_REQUEST");
      const pointers = persistence.getEntryPointers(request.entryId);
      if (!pointers.ok || pointers.value.currentRevisionId !== request.sourceRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
      const source = persistence.getRevision({ entryId: request.entryId, revisionId: request.sourceRevisionId }); if (!source.ok) return fail("REPLACE_MEDIA_REFERENCE_FAILED");
      const references = persistence.getRevisionReferences(source.value.identity); if (!references.ok) return fail("REPLACE_MEDIA_REFERENCE_FAILED");
      const target = `${request.targetAssetVersion.assetId}\0${request.targetAssetVersion.assetVersionId}`;
      let replaced = false;
      const assetVersions = references.value.map((reference) => {
        if (`${reference.assetVersion.assetId}\0${reference.assetVersion.assetVersionId}` !== target) return reference.assetVersion;
        replaced = true; return request.newAssetVersion;
      });
      if (!replaced) return fail("MEDIA_REFERENCE_NOT_FOUND", "DataMedia", [request.targetAssetVersion.assetId]);
      const current = siteDefinition.snapshot("current"); if (!current.ok) return fail("REPLACE_MEDIA_REFERENCE_FAILED");
      const claim = current.value.claims.find((item) => item.owner === request.entryId && item.sourceRevisionId === request.sourceRevisionId);
      if (claim === undefined) return fail("REPLACE_MEDIA_REFERENCE_FAILED", "SiteDefinition", [request.entryId]);
      try {
        const content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source.value.contentBytes)) as JsonValue;
        return this.saveRevision({ entryId: request.entryId, revisionId: request.newRevisionId, operationId: request.operationId, schemaIdentity: source.value.schemaIdentity, content, route: claim.normalizedRoute, assetVersions });
      } catch { return fail("REPLACE_MEDIA_REFERENCE_FAILED"); }
    }
  };
}
function valid(value: SaveRevisionRequest): boolean { return typeof value.entryId === "string" && value.entryId.length > 0 && typeof value.revisionId === "string" && value.revisionId.length > 0 && typeof value.operationId === "string" && value.operationId.length > 0 && Array.isArray(value.assetVersions); }
function duplicate(values: readonly { assetId: string; assetVersionId: string }[]): boolean { const seen = new Set<string>(); for (const value of values) { const key = `${value.assetId}\0${value.assetVersionId}`; if (seen.has(key)) return true; seen.add(key); } return false; }
function route<T>(code: string, entryId: string): DomainApplicationResult<T> { return code === "ROUTE_CONFLICT" || code === "ROUTE_CHANGE_REQUIRED" || code === "STALE_ROUTE_PROPOSAL" ? fail(code, "SiteDefinition", [entryId]) : fail("SAVE_REVISION_FAILED"); }
function validPublish(value: unknown): value is PublishRevisionRequest { return typeof value === "object" && value !== null && typeof (value as PublishRevisionRequest).entryId === "string" && (value as PublishRevisionRequest).entryId.length > 0 && typeof (value as PublishRevisionRequest).expectedCurrentRevisionId === "string" && (value as PublishRevisionRequest).expectedCurrentRevisionId.length > 0 && typeof (value as PublishRevisionRequest).operationId === "string" && (value as PublishRevisionRequest).operationId.length > 0; }
function validReplace(value: unknown): value is ReplaceMediaReferenceRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as ReplaceMediaReferenceRequest;
  const validIdentity = (identity: { assetId: string; assetVersionId: string }) => typeof identity?.assetId === "string" && identity.assetId.length > 0 && typeof identity.assetVersionId === "string" && identity.assetVersionId.length > 0;
  return typeof request.entryId === "string" && request.entryId.length > 0 && typeof request.sourceRevisionId === "string" && request.sourceRevisionId.length > 0 && typeof request.newRevisionId === "string" && request.newRevisionId.length > 0 && typeof request.operationId === "string" && request.operationId.length > 0 && validIdentity(request.targetAssetVersion) && validIdentity(request.newAssetVersion) && (request.targetAssetVersion.assetId !== request.newAssetVersion.assetId || request.targetAssetVersion.assetVersionId !== request.newAssetVersion.assetVersionId);
}
