import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { AssetVersionIdentity, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { PluginHostFailure } from "../plugin-host/index.js";
import type { PublishedRouteClaimProposal, RouteClaim, RouteClaimReplacementProposal } from "../site-definition/index.js";

import type {
  DomainApplication,
  DomainApplicationCommandFailure,
  DomainApplicationDependencies,
  DomainApplicationFailure,
  DomainApplicationFailureCode,
  DomainApplicationResult,
  PublishRevisionRequest,
  PublishRevisionSuccess,
  RestoreRevisionRequest,
  RestoreRevisionSuccess,
  SaveRevisionCommandRequest,
  SaveRevisionMediaReferenceReplacementRequest,
  SaveRevisionRequest,
  SaveRevisionSuccess,
} from "./contracts.js";

const messages: Readonly<Record<DomainApplicationFailureCode, string>> = {
  INVALID_SAVE_REVISION_REQUEST: "請修正 SaveRevision request。",
  INVALID_PUBLISH_REVISION_REQUEST: "請修正 PublishRevision request。",
  INVALID_RESTORE_REVISION_REQUEST: "請修正 RestoreRevision request。",
  CURRENT_REVISION_MISMATCH: "目前 revision 已變更，請重新確認後再發布。",
  MEDIA_REFERENCE_NOT_FOUND: "找不到 current revision 的指定媒體引用。",
  MEDIA_REFERENCE_CONFLICT: "current revision 已引用該 asset version；請先移除重複引用再替換。",
  SCHEMA_INVALID: "草稿不符合選定的 schema version。",
  MEDIA_UNAVAILABLE: "請先完成所有引用媒體的匯入或復原。",
  BLOCKED_ARCHIVED_MEDIA_RESTORE: "請先復原所有不可用的 media asset version。",
  ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。",
  ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。",
  STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。",
  SAVE_REVISION_FAILED: "草稿未儲存；canonical state 未變更。",
  PUBLISH_REVISION_FAILED: "發布未完成；canonical state 未變更。",
  RESTORE_REVISION_FAILED: "Revision 尚未完成還原；canonical state 未變更。",
};

type PreparedPublishedClaim =
  | Readonly<{ kind: "claim"; proposal: PublishedRouteClaimProposal }>
  | Readonly<{ kind: "replacement"; proposal: RouteClaimReplacementProposal }>;

type NormalizedSaveRevisionCommand =
  | Readonly<{ kind: "save"; request: SaveRevisionRequest }>
  | Readonly<{ kind: "media-reference-replacement"; request: SaveRevisionMediaReferenceReplacementRequest }>;

type CanonicalContent = Readonly<{ value: JsonValue; bytes: Uint8Array; digest: Digest }>;
type SelectedCurrentClaim = Readonly<{ claim: RouteClaim; snapshotDigest: Digest }>;
type CommandOperation = "SaveRevision" | "PublishRevision" | "RestoreRevision";

function fail<T>(
  code: DomainApplicationFailureCode,
  owner: DomainApplicationCommandFailure["owner"] = "DomainApplication",
  subjectIds: readonly string[] = [],
  restoreCommands?: readonly RestoreAssetCommandDescriptor[],
): DomainApplicationResult<T> {
  return { ok: false, error: { code, owner, subjectIds, remediation: { kind: "message", message: messages[code] }, ...(restoreCommands === undefined ? {} : { restoreCommands }) } };
}

function plugin(error: PluginHostFailure): DomainApplicationResult<never> {
  return error.code === "PLUGIN_VALIDATION_SERVICE_FAILED" ? fail("SAVE_REVISION_FAILED") : { ok: false, error };
}

function canonicalContent(value: JsonValue): CanonicalContent | null {
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok) return null;
  try {
    return {
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(canonical.value)) as JsonValue,
      bytes: copyBytes(canonical.value),
      digest: sha256Digest(canonical.value),
    };
  } catch {
    return null;
  }
}

function verifiedSourceContent(bytes: Uint8Array, digest: Digest): CanonicalContent | null {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as JsonValue;
    const canonical = canonicalContent(value);
    if (canonical === null || !sameBytes(canonical.bytes, bytes) || sha256Digest(bytes) !== digest) return null;
    return canonical;
  } catch {
    return null;
  }
}

export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator, pluginHost }: DomainApplicationDependencies): DomainApplication {
  const mediaUnavailable = <T>(assetVersions: readonly AssetVersionIdentity[]): DomainApplicationResult<T> => {
    const unavailable = assetVersions.filter((assetVersion) => !dataMedia.getReadyAssetVersion(assetVersion).ok);
    return fail("MEDIA_UNAVAILABLE", "DataMedia", (unavailable.length > 0 ? unavailable : assetVersions).map((item) => item.assetId));
  };

  const selectCurrentClaim = (entryId: string, expectedCurrentRevisionId: string, operation: CommandOperation): DomainApplicationResult<SelectedCurrentClaim> => {
    const current = siteDefinition.snapshot("current");
    if (!current.ok) return fail(operationFailure[operation]);
    const claim = current.value.claims.find((item) => item.owner === entryId && item.sourceRevisionId === expectedCurrentRevisionId);
    if (claim !== undefined) return { ok: true, value: { claim, snapshotDigest: current.value.digest } };
    const latest = persistence.getEntryPointers(entryId);
    if (latest.ok ? latest.value.currentRevisionId !== expectedCurrentRevisionId : latest.error.code === "ENTRY_POINTER_NOT_FOUND") {
      return fail("CURRENT_REVISION_MISMATCH", "Content", [entryId]);
    }
    return fail(operationFailure[operation], "SiteDefinition", [entryId]);
  };

  const executeSaveRevision = async (request: SaveRevisionRequest, expectedCurrentRevisionId?: string): Promise<DomainApplicationResult<SaveRevisionSuccess>> => {
    if (!validSave(request) || duplicate(request.assetVersions)) return fail("INVALID_SAVE_REVISION_REQUEST");
    const initial = canonicalContent(request.content);
    if (initial === null) return fail("INVALID_SAVE_REVISION_REQUEST");

    const schema = persistence.getSchemaVersion(request.schemaIdentity);
    if (!schema.ok) return schema.error.code === "SCHEMA_VERSION_NOT_FOUND"
      ? fail("INVALID_SAVE_REVISION_REQUEST", "Content", [request.schemaIdentity.schemaId])
      : fail("SAVE_REVISION_FAILED");
    try {
      if (!schemaValidator.validate({ schema: schema.value, contentBytes: initial.bytes, contentDigest: initial.digest }).ok) {
        return fail("SCHEMA_INVALID", "Content", [request.schemaIdentity.schemaId]);
      }
    } catch {
      return fail("SAVE_REVISION_FAILED");
    }

    const claim = siteDefinition.prepareCurrentClaim({ owner: request.entryId, route: request.route, sourceRevisionId: request.revisionId });
    if (!claim.ok) return route(claim.error.code, request.entryId, "SaveRevision");
    if (!dataMedia.requireReadyAssetVersions(request.assetVersions).ok) return mediaUnavailable(request.assetVersions);

    const prepared = await pluginHost.prepareSaveRevisionValidators({ entryId: request.entryId });
    if (!prepared.ok) return plugin(prepared.error as PluginHostFailure);

    const result = persistence.runTransaction<SaveRevisionSuccess, DomainApplicationFailure>((transaction) => {
      const prior = transaction.getEntryPointers(request.entryId);
      if (expectedCurrentRevisionId !== undefined) {
        if (!prior.ok || prior.value.currentRevisionId !== expectedCurrentRevisionId) {
          return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
        }
      } else if (!prior.ok && prior.error.code !== "ENTRY_POINTER_NOT_FOUND") {
        return fail("SAVE_REVISION_FAILED");
      }

      const token = siteDefinition.validateCurrentClaimInTransaction(claim.value, transaction);
      if (!token.ok) return route(token.error.code, request.entryId, "SaveRevision");
      for (const assetVersion of request.assetVersions) {
        if (!transaction.getReadyAssetVersion(assetVersion).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [assetVersion.assetId]);
      }

      const validated = pluginHost.runPreparedSaveRevisionValidators(
        prepared.value,
        {
          contract: "save-revision-validator-input/v1",
          entryId: request.entryId,
          revisionId: request.revisionId,
          schemaIdentity: request.schemaIdentity,
          content: initial.value,
        },
        (next) => {
          try {
            return schemaValidator.validate({ schema: schema.value, contentBytes: next.contentBytes, contentDigest: next.contentDigest });
          } catch {
            throw new Error("guard");
          }
        },
      );
      if (!validated.ok) return plugin(validated.error as PluginHostFailure);

      const created = transaction.createRevisionWithReferences({
        revision: {
          identity: { entryId: request.entryId, revisionId: request.revisionId },
          schemaIdentity: request.schemaIdentity,
          contentBytes: validated.value.contentBytes,
          contentDigest: validated.value.contentDigest,
          lineage: { operationId: request.operationId, operationKind: "SaveRevision" },
        },
        assetVersions: request.assetVersions,
      });
      if (!created.ok) return fail("SAVE_REVISION_FAILED");

      const pointer = transaction.setEntryPointers({
        entryId: request.entryId,
        currentRevisionId: request.revisionId,
        ...(prior.ok && prior.value.publishedRevisionId !== undefined ? { publishedRevisionId: prior.value.publishedRevisionId } : {}),
        lineage: { revisionId: request.revisionId, operationId: request.operationId, operationKind: "SaveRevision" },
      });
      if (!pointer.ok) return fail("SAVE_REVISION_FAILED");

      const applied = siteDefinition.applyValidatedCurrentClaimInTransaction(token.value, transaction);
      if (!applied.ok) return fail("SAVE_REVISION_FAILED");
      const state = transaction.canonicalState();
      return !state.ok
        ? fail("SAVE_REVISION_FAILED")
        : {
            ok: true,
            value: {
              revision: created.value.revision,
              references: created.value.references,
              currentPointer: pointer.value,
              currentClaim: applied.value,
              lineageIdentity: { entryId: request.entryId, revisionId: request.revisionId, operationId: request.operationId },
              stateDigest: state.value.digest,
              activePluginStateDigest: validated.value.activeStateDigest,
            },
          };
    });
    return result.ok
      ? result
      : result.error.owner === "Persistence"
        ? fail("SAVE_REVISION_FAILED")
        : result.error.owner === "PluginHost"
          ? plugin(result.error)
          : { ok: false, error: result.error };
  };

  const executeMediaReferenceReplacement = async (request: SaveRevisionMediaReferenceReplacementRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>> => {
    const pointers = persistence.getEntryPointers(request.entryId);
    if (!pointers.ok) {
      return pointers.error.code === "ENTRY_POINTER_NOT_FOUND"
        ? fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId])
        : fail("SAVE_REVISION_FAILED");
    }
    if (pointers.value.currentRevisionId !== request.expectedCurrentRevisionId) {
      return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
    }

    const source = persistence.getRevision({ entryId: request.entryId, revisionId: request.expectedCurrentRevisionId });
    if (!source.ok) return fail("SAVE_REVISION_FAILED");
    const sourceContent = verifiedSourceContent(source.value.contentBytes, source.value.contentDigest);
    if (sourceContent === null) return fail("SAVE_REVISION_FAILED");
    const references = persistence.getRevisionReferences(source.value.identity);
    if (!references.ok) return fail("SAVE_REVISION_FAILED");

    const target = identityKey(request.targetAssetVersion);
    const replacement = identityKey(request.replacementAssetVersion);
    let found = false;
    const assetVersions = references.value.map((reference) => {
      if (identityKey(reference.assetVersion) !== target) return reference.assetVersion;
      found = true;
      return request.replacementAssetVersion;
    });
    if (!found) {
      return fail("MEDIA_REFERENCE_NOT_FOUND", "DataMedia", [request.targetAssetVersion.assetId, request.targetAssetVersion.assetVersionId]);
    }
    if (references.value.some((reference) => identityKey(reference.assetVersion) === replacement)) {
      return fail("MEDIA_REFERENCE_CONFLICT", "DataMedia", [request.replacementAssetVersion.assetId, request.replacementAssetVersion.assetVersionId]);
    }
    if (!dataMedia.requireReadyAssetVersions(assetVersions).ok) return mediaUnavailable(assetVersions);

    const selected = selectCurrentClaim(request.entryId, request.expectedCurrentRevisionId, "SaveRevision");
    if (!selected.ok) return selected;

    return executeSaveRevision(
      {
        entryId: request.entryId,
        revisionId: request.revisionId,
        operationId: request.operationId,
        schemaIdentity: source.value.schemaIdentity,
        content: sourceContent.value,
        route: selected.value.claim.normalizedRoute,
        assetVersions,
      },
      request.expectedCurrentRevisionId,
    );
  };

  return {
    async saveRevision(request: SaveRevisionCommandRequest) {
      const command = normalizeSaveRevisionCommand(request);
      if (command === null) return fail("INVALID_SAVE_REVISION_REQUEST");
      return command.kind === "save"
        ? executeSaveRevision(command.request)
        : executeMediaReferenceReplacement(command.request);
    },

    async restoreRevision(request: RestoreRevisionRequest): Promise<DomainApplicationResult<RestoreRevisionSuccess>> {
      const restored = normalizeRestoreRevisionRequest(request);
      if (restored === null) return fail("INVALID_RESTORE_REVISION_REQUEST");
      const sourceIdentity = { entryId: restored.entryId, revisionId: restored.sourceRevisionId };
      const source = persistence.getRevision(sourceIdentity);
      if (!source.ok) return fail(source.error.code === "REVISION_NOT_FOUND" ? "INVALID_RESTORE_REVISION_REQUEST" : "RESTORE_REVISION_FAILED", "Content", [restored.entryId, restored.sourceRevisionId]);
      const content = verifiedSourceContent(source.value.contentBytes, source.value.contentDigest);
      if (content === null) return fail("RESTORE_REVISION_FAILED", "Content", [restored.entryId, restored.sourceRevisionId]);
      const schema = persistence.getSchemaVersion(source.value.schemaIdentity);
      if (!schema.ok) return fail("RESTORE_REVISION_FAILED", "Content", [source.value.schemaIdentity.schemaId]);
      try {
        if (!schemaValidator.validate({ schema: schema.value, contentBytes: content.bytes, contentDigest: content.digest }).ok) {
          return fail("SCHEMA_INVALID", "Content", [source.value.schemaIdentity.schemaId]);
        }
      } catch {
        return fail("RESTORE_REVISION_FAILED");
      }
      const references = persistence.getRevisionReferences(sourceIdentity);
      if (!references.ok) return fail("RESTORE_REVISION_FAILED", "Content", [restored.entryId, restored.sourceRevisionId]);
      const assetVersions = references.value.map((reference) => reference.assetVersion);
      const availability = dataMedia.inspectRestoreAvailability(assetVersions);
      if (!availability.ok) return fail("RESTORE_REVISION_FAILED", "DataMedia", availability.error.subjectIds);
      if (availability.value.status === "blocked") {
        return fail("BLOCKED_ARCHIVED_MEDIA_RESTORE", "DataMedia", restoreCommandSubjects(availability.value.commands), availability.value.commands);
      }
      const pointer = persistence.getEntryPointers(restored.entryId);
      if (!pointer.ok) return fail("RESTORE_REVISION_FAILED", "Content", [restored.entryId]);
      const current = siteDefinition.snapshot("current");
      if (!current.ok) return fail("RESTORE_REVISION_FAILED", "SiteDefinition", [restored.entryId]);
      const currentClaim = current.value.claims.find((claim) => claim.owner === restored.entryId && claim.sourceRevisionId === pointer.value.currentRevisionId);
      if (currentClaim === undefined) return fail("RESTORE_REVISION_FAILED", "SiteDefinition", [restored.entryId]);
      const proposal = siteDefinition.prepareRouteClaimReplacement({
        graph: "current",
        owner: restored.entryId,
        route: currentClaim.normalizedRoute,
        sourceRevisionId: restored.revisionId,
      });
      if (!proposal.ok) return route(proposal.error.code, restored.entryId, "RestoreRevision");
      if (proposal.value.baselineDigests.current !== current.value.digest) return fail("STALE_ROUTE_PROPOSAL", "SiteDefinition", [restored.entryId]);

      const result = persistence.runTransaction<RestoreRevisionSuccess, DomainApplicationFailure>((transaction) => {
        const latest = transaction.getEntryPointers(restored.entryId);
        if (!latest.ok) return fail(latest.error.code === "ENTRY_POINTER_NOT_FOUND" ? "CURRENT_REVISION_MISMATCH" : "RESTORE_REVISION_FAILED", "Content", [restored.entryId]);
        if (latest.value.currentRevisionId !== pointer.value.currentRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [restored.entryId]);
        for (const assetVersion of assetVersions) {
          if (!transaction.getReadyAssetVersion(assetVersion).ok) return fail("RESTORE_REVISION_FAILED", "DataMedia", [assetVersion.assetId, assetVersion.assetVersionId]);
        }
        const token = siteDefinition.validateRouteClaimReplacementInTransaction(proposal.value, transaction);
        if (!token.ok) return route(token.error.code, restored.entryId, "RestoreRevision");
        const created = transaction.createRevisionWithReferences({
          revision: {
            identity: { entryId: restored.entryId, revisionId: restored.revisionId },
            schemaIdentity: source.value.schemaIdentity,
            contentBytes: content.bytes,
            contentDigest: content.digest,
            restoredFromRevisionId: restored.sourceRevisionId,
            lineage: { operationId: restored.operationId, operationKind: "RestoreRevision" },
          },
          assetVersions,
        });
        if (!created.ok) return fail("RESTORE_REVISION_FAILED");
        const updated = transaction.setEntryPointers({
          entryId: restored.entryId,
          currentRevisionId: restored.revisionId,
          ...(latest.value.publishedRevisionId === undefined ? {} : { publishedRevisionId: latest.value.publishedRevisionId }),
          lineage: { revisionId: restored.revisionId, operationId: restored.operationId, operationKind: "RestoreRevision" },
        });
        if (!updated.ok) return fail("RESTORE_REVISION_FAILED");
        const applied = siteDefinition.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
        if (!applied.ok) return fail("RESTORE_REVISION_FAILED", "SiteDefinition", [restored.entryId]);
        const state = transaction.canonicalState();
        return !state.ok
          ? fail("RESTORE_REVISION_FAILED")
          : {
              ok: true,
              value: {
                revision: created.value.revision,
                references: created.value.references,
                currentPointer: updated.value,
                currentClaim: applied.value.claim,
                lineageIdentity: { entryId: restored.entryId, revisionId: restored.revisionId, operationId: restored.operationId },
                stateDigest: state.value.digest,
              },
            };
      });
      return result.ok ? result : result.error.owner === "Persistence" ? fail("RESTORE_REVISION_FAILED", "DomainApplication", [restored.entryId, restored.sourceRevisionId]) : { ok: false, error: result.error };
    },

    async publishRevision(request) {
      if (!validPublish(request)) return fail("INVALID_PUBLISH_REVISION_REQUEST");
      const pointer = persistence.getEntryPointers(request.entryId);
      if (!pointer.ok) {
        return pointer.error.code === "ENTRY_POINTER_NOT_FOUND"
          ? fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId])
          : fail("PUBLISH_REVISION_FAILED");
      }
      if (pointer.value.currentRevisionId !== request.expectedCurrentRevisionId) {
        return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
      }

      const revision = persistence.getRevision({ entryId: request.entryId, revisionId: request.expectedCurrentRevisionId });
      if (!revision.ok) return fail("PUBLISH_REVISION_FAILED");
      const schema = persistence.getSchemaVersion(revision.value.schemaIdentity);
      if (!schema.ok) return fail("PUBLISH_REVISION_FAILED");
      try {
        if (!schemaValidator.validate({ schema: schema.value, contentBytes: revision.value.contentBytes, contentDigest: revision.value.contentDigest }).ok) {
          return fail("SCHEMA_INVALID", "Content", [request.entryId]);
        }
      } catch {
        return fail("PUBLISH_REVISION_FAILED");
      }

      const references = persistence.getRevisionReferences(revision.value.identity);
      if (!references.ok) return fail("PUBLISH_REVISION_FAILED");
      const assetVersions = references.value.map((reference) => reference.assetVersion);
      if (!dataMedia.requireReadyAssetVersions(assetVersions).ok) return mediaUnavailable(assetVersions);

      const selected = selectCurrentClaim(request.entryId, request.expectedCurrentRevisionId, "PublishRevision");
      if (!selected.ok) return selected;
      const currentClaim = selected.value.claim;

      const direct = siteDefinition.preparePublishedClaim({
        owner: request.entryId,
        route: currentClaim.normalizedRoute,
        sourceRevisionId: request.expectedCurrentRevisionId,
      });
      let preparedClaim: PreparedPublishedClaim;
      if (direct.ok) {
        preparedClaim = { kind: "claim", proposal: direct.value };
      } else if (direct.error.code === "ROUTE_CHANGE_REQUIRED") {
        const replacement = siteDefinition.prepareRouteClaimReplacement({
          graph: "published",
          owner: request.entryId,
          route: currentClaim.normalizedRoute,
          sourceRevisionId: request.expectedCurrentRevisionId,
        });
        if (!replacement.ok) return route(replacement.error.code, request.entryId, "PublishRevision");
        preparedClaim = { kind: "replacement", proposal: replacement.value };
      } else {
        return route(direct.error.code, request.entryId, "PublishRevision");
      }
      if (preparedClaim.proposal.baselineDigests.current !== selected.value.snapshotDigest) {
        return fail("STALE_ROUTE_PROPOSAL", "SiteDefinition", [request.entryId]);
      }

      const result = persistence.runTransaction<PublishRevisionSuccess, DomainApplicationFailure>((transaction) => {
        const latest = transaction.getEntryPointers(request.entryId);
        if (!latest.ok || latest.value.currentRevisionId !== request.expectedCurrentRevisionId) {
          return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
        }
        for (const assetVersion of assetVersions) {
          if (!transaction.getReadyAssetVersion(assetVersion).ok) return fail("MEDIA_UNAVAILABLE", "DataMedia", [assetVersion.assetId]);
        }

        let publishedClaim: RouteClaim;
        if (preparedClaim.kind === "claim") {
          const token = siteDefinition.validatePublishedClaimInTransaction(preparedClaim.proposal, transaction);
          if (!token.ok) return route(token.error.code, request.entryId, "PublishRevision");
          const pointerResult = transaction.setEntryPointers({
            entryId: request.entryId,
            currentRevisionId: latest.value.currentRevisionId,
            publishedRevisionId: request.expectedCurrentRevisionId,
            lineage: { revisionId: request.expectedCurrentRevisionId, operationId: request.operationId, operationKind: "PublishRevision" },
          });
          if (!pointerResult.ok) return fail("PUBLISH_REVISION_FAILED");
          const applied = siteDefinition.applyValidatedPublishedClaimInTransaction(token.value, transaction);
          if (!applied.ok) return fail("PUBLISH_REVISION_FAILED");
          publishedClaim = applied.value;
          const state = transaction.canonicalState();
          return !state.ok
            ? fail("PUBLISH_REVISION_FAILED")
            : {
                ok: true,
                value: {
                  revision: revision.value,
                  publishedPointer: pointerResult.value,
                  publishedClaim,
                  lineageIdentity: { entryId: request.entryId, revisionId: request.expectedCurrentRevisionId, operationId: request.operationId },
                  stateDigest: state.value.digest,
                },
              };
        }

        const token = siteDefinition.validateRouteClaimReplacementInTransaction(preparedClaim.proposal, transaction);
        if (!token.ok) return route(token.error.code, request.entryId, "PublishRevision");
        const pointerResult = transaction.setEntryPointers({
          entryId: request.entryId,
          currentRevisionId: latest.value.currentRevisionId,
          publishedRevisionId: request.expectedCurrentRevisionId,
          lineage: { revisionId: request.expectedCurrentRevisionId, operationId: request.operationId, operationKind: "PublishRevision" },
        });
        if (!pointerResult.ok) return fail("PUBLISH_REVISION_FAILED");
        const applied = siteDefinition.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
        if (!applied.ok) return fail("PUBLISH_REVISION_FAILED");
        publishedClaim = applied.value.claim;
        const state = transaction.canonicalState();
        return !state.ok
          ? fail("PUBLISH_REVISION_FAILED")
          : {
              ok: true,
              value: {
                revision: revision.value,
                publishedPointer: pointerResult.value,
                publishedClaim,
                lineageIdentity: { entryId: request.entryId, revisionId: request.expectedCurrentRevisionId, operationId: request.operationId },
                stateDigest: state.value.digest,
              },
            };
      });
      return result.ok
        ? result
        : result.error.owner === "Persistence"
          ? fail("PUBLISH_REVISION_FAILED")
          : { ok: false, error: result.error };
    },
  };
}

function validSave(value: SaveRevisionRequest): boolean {
  return typeof value.entryId === "string"
    && value.entryId.length > 0
    && typeof value.revisionId === "string"
    && value.revisionId.length > 0
    && typeof value.operationId === "string"
    && value.operationId.length > 0
    && Array.isArray(value.assetVersions);
}

function duplicate(values: readonly { assetId: string; assetVersionId: string }[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = identityKey(value);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

const operationFailure: Readonly<Record<CommandOperation, DomainApplicationFailureCode>> = {
  SaveRevision: "SAVE_REVISION_FAILED",
  PublishRevision: "PUBLISH_REVISION_FAILED",
  RestoreRevision: "RESTORE_REVISION_FAILED",
};

function route<T>(code: string, entryId: string, operation: CommandOperation): DomainApplicationResult<T> {
  return code === "ROUTE_CONFLICT" || code === "ROUTE_CHANGE_REQUIRED" || code === "STALE_ROUTE_PROPOSAL"
    ? fail(code, "SiteDefinition", [entryId])
    : fail(operationFailure[operation]);
}

function validPublish(value: unknown): value is PublishRevisionRequest {
  return typeof value === "object"
    && value !== null
    && typeof (value as PublishRevisionRequest).entryId === "string"
    && (value as PublishRevisionRequest).entryId.length > 0
    && typeof (value as PublishRevisionRequest).expectedCurrentRevisionId === "string"
    && (value as PublishRevisionRequest).expectedCurrentRevisionId.length > 0
    && typeof (value as PublishRevisionRequest).operationId === "string"
    && (value as PublishRevisionRequest).operationId.length > 0;
}

function normalizeSaveRevisionCommand(value: unknown): NormalizedSaveRevisionCommand | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const kind = Object.getOwnPropertyDescriptor(value, "kind");
    if (kind === undefined) return { kind: "save", request: value as SaveRevisionRequest };
    if (!("value" in kind)) return null;
    if (kind.value !== "media-reference-replacement") return { kind: "save", request: value as SaveRevisionRequest };

    const request = ownEnumerableFields(value, [
      "kind",
      "entryId",
      "revisionId",
      "operationId",
      "expectedCurrentRevisionId",
      "targetAssetVersion",
      "replacementAssetVersion",
    ]);
    if (request === null || request.kind !== "media-reference-replacement") return null;
    const targetAssetVersion = identity(request.targetAssetVersion);
    const replacementAssetVersion = identity(request.replacementAssetVersion);
    if (
      !text(request.entryId)
      || !text(request.revisionId)
      || !text(request.operationId)
      || !text(request.expectedCurrentRevisionId)
      || request.revisionId === request.expectedCurrentRevisionId
      || targetAssetVersion === null
      || replacementAssetVersion === null
      || targetAssetVersion.assetId !== replacementAssetVersion.assetId
      || targetAssetVersion.assetVersionId === replacementAssetVersion.assetVersionId
    ) {
      return null;
    }
    return {
      kind: "media-reference-replacement",
      request: {
        kind: "media-reference-replacement",
        entryId: request.entryId,
        revisionId: request.revisionId,
        operationId: request.operationId,
        expectedCurrentRevisionId: request.expectedCurrentRevisionId,
        targetAssetVersion,
        replacementAssetVersion,
      },
    };
  } catch {
    return null;
  }
}

function normalizeRestoreRevisionRequest(value: unknown): RestoreRevisionRequest | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const fields = ownEnumerableFields(value, ["entryId", "sourceRevisionId", "revisionId", "operationId"]);
    if (fields === null || !text(fields.entryId) || !text(fields.sourceRevisionId) || !text(fields.revisionId) || !text(fields.operationId) || fields.revisionId === fields.sourceRevisionId) return null;
    return {
      entryId: fields.entryId,
      sourceRevisionId: fields.sourceRevisionId,
      revisionId: fields.revisionId,
      operationId: fields.operationId,
    };
  } catch {
    return null;
  }
}

function restoreCommandSubjects(commands: readonly RestoreAssetCommandDescriptor[]): readonly string[] {
  return commands.flatMap((command) => [command.assetVersion.assetId, command.assetVersion.assetVersionId]);
}

function ownEnumerableFields(value: object, expected: readonly string[]): Record<string, unknown> | null {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== "string" || !expected.includes(key))) return null;
  const copied: Record<string, unknown> = {};
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
    copied[key] = descriptor.value;
  }
  return copied;
}

function identity(value: unknown): Readonly<{ assetId: string; assetVersionId: string }> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const copied = ownEnumerableFields(value, ["assetId", "assetVersionId"]);
  return copied !== null && text(copied.assetId) && text(copied.assetVersionId)
    ? { assetId: copied.assetId, assetVersionId: copied.assetVersionId }
    : null;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}

function identityKey(value: Readonly<{ assetId: string; assetVersionId: string }>): string {
  return `${value.assetId}\0${value.assetVersionId}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}
