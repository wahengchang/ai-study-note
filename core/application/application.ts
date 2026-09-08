import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { AssetVersionIdentity, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { PluginActivationIdentity, PluginActivationManagementSnapshot, PluginCandidate, PluginHostFailure, PluginSettingsRecord, SeoPluginSettingsV1 } from "../plugin-host/index.js";
import { normalizeRoute, type PublishedRouteClaimProposal, type RouteClaim, type RouteClaimReplacementProposal } from "../site-definition/index.js";

import type {
  AuthoringEntryV1,
  ChangeRouteRequest,
  ChangeRouteSuccess,
  CmsSeoAnalysisRequest,
  CmsSeoAnalysisResultV1,
  CmsSeoAnalysisSuccess,
  DomainApplication,
  DomainApplicationCommandFailure,
  DomainApplicationDependencies,
  DomainApplicationFailure,
  DomainApplicationFailureCode,
  DomainApplicationResult,
  PluginActivationRequestV1,
  PluginManagementSnapshotV1,
  PluginSettingsReplaceRequestV1,
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
  INVALID_CHANGE_ROUTE_REQUEST: "請修正 ChangeRoute request。",
  INVALID_SEO_ANALYSIS_REQUEST: "請修正 CMS SEO analysis request。",
  ENTRY_NOT_FOUND: "找不到指定的 entry。",
  READ_CURRENT_ENTRY_FAILED: "無法讀取目前 entry。",
  CURRENT_REVISION_MISMATCH: "目前 revision 已變更，請重新確認後再執行命令。",
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
  CHANGE_ROUTE_FAILED: "Route 尚未完成變更；canonical state 未變更。",
};

type PreparedPublishedClaim =
  | Readonly<{ kind: "claim"; proposal: PublishedRouteClaimProposal }>
  | Readonly<{ kind: "replacement"; proposal: RouteClaimReplacementProposal }>;

type NormalizedSaveRevisionCommand =
  | Readonly<{ kind: "save"; request: SaveRevisionRequest }>
  | Readonly<{ kind: "media-reference-replacement"; request: SaveRevisionMediaReferenceReplacementRequest }>;

type CanonicalContent = Readonly<{ value: JsonValue; bytes: Uint8Array; digest: Digest }>;
type SelectedCurrentClaim = Readonly<{ claim: RouteClaim; snapshotDigest: Digest }>;
type CommandOperation = "SaveRevision" | "PublishRevision" | "RestoreRevision" | "ChangeRoute";

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

export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator, pluginHost, contentReadModel }: DomainApplicationDependencies): DomainApplication {
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

  const executeSaveRevision = async (request: SaveRevisionRequest): Promise<DomainApplicationResult<SaveRevisionSuccess>> => {
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
      if (request.expectedCurrentRevisionId === null) {
        if (prior.ok) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
        if (prior.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("SAVE_REVISION_FAILED");
      } else if (!prior.ok || prior.value.currentRevisionId !== request.expectedCurrentRevisionId) {
        return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
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
        expectedCurrentRevisionId: request.expectedCurrentRevisionId,
        assetVersions,
      },
    );
  };

  const readCurrentEntry = (input: Readonly<{ entryId: string }>): DomainApplicationResult<AuthoringEntryV1> => {
    if (!entryInput(input)) return fail("ENTRY_NOT_FOUND");
    const pointer = persistence.getEntryPointers(input.entryId);
    if (!pointer.ok) {
      return pointer.error.code === "ENTRY_POINTER_NOT_FOUND"
        ? fail("ENTRY_NOT_FOUND", "Content", [input.entryId])
        : fail("READ_CURRENT_ENTRY_FAILED", "Content", [input.entryId]);
    }
    const revision = persistence.getRevision({ entryId: input.entryId, revisionId: pointer.value.currentRevisionId });
    if (!revision.ok) return fail("READ_CURRENT_ENTRY_FAILED", "Content", [input.entryId, pointer.value.currentRevisionId]);
    const content = contentReadModel.read({
      schemaIdentity: revision.value.schemaIdentity,
      contentBytes: revision.value.contentBytes,
      contentDigest: revision.value.contentDigest,
    });
    if (!content.ok) return fail("READ_CURRENT_ENTRY_FAILED", "Content", [input.entryId, pointer.value.currentRevisionId]);
    const routeGraph = siteDefinition.snapshot("current");
    if (!routeGraph.ok) return fail("READ_CURRENT_ENTRY_FAILED", "SiteDefinition", [input.entryId]);
    const claim = routeGraph.value.claims.find((candidate) => candidate.owner === input.entryId && candidate.sourceRevisionId === pointer.value.currentRevisionId);
    if (claim === undefined) return fail("READ_CURRENT_ENTRY_FAILED", "SiteDefinition", [input.entryId]);
    const references = persistence.getRevisionReferences(revision.value.identity);
    if (!references.ok) return fail("READ_CURRENT_ENTRY_FAILED", "Content", [input.entryId, pointer.value.currentRevisionId]);
    const assetVersions = references.value
      .map((reference) => reference.assetVersion)
      .sort((left, right) => codeUnitCompare(identityKey(left), identityKey(right)));
    return {
      ok: true,
      value: {
        contract: "authoring-entry/v1",
        entryId: input.entryId,
        currentRevisionId: pointer.value.currentRevisionId,
        publishedRevisionId: pointer.value.publishedRevisionId ?? null,
        schemaIdentity: revision.value.schemaIdentity,
        content: content.value.content as AuthoringEntryV1["content"],
        route: claim.normalizedRoute,
        assetVersions,
      },
    };
  };

  const analyzeCmsSeo = async (request: CmsSeoAnalysisRequest): Promise<DomainApplicationResult<CmsSeoAnalysisSuccess>> => {
    const analysis = normalizeCmsSeoAnalysisRequest(request);
    if (analysis === null) return fail("INVALID_SEO_ANALYSIS_REQUEST");
    const document = canonicalContent(analysis.content);
    if (document === null || documentDigest(analysis, document.value) !== analysis.documentDigest) return fail("INVALID_SEO_ANALYSIS_REQUEST");
    const normalizedRoute = normalizeRoute(analysis.route);
    if (normalizedRoute === null || normalizedRoute.normalizedRoute !== analysis.route) return fail("INVALID_SEO_ANALYSIS_REQUEST");
    const schema = persistence.getSchemaVersion(analysis.schemaIdentity);
    if (!schema.ok) return fail("INVALID_SEO_ANALYSIS_REQUEST", "Content", [analysis.schemaIdentity.schemaId]);
    const content = contentReadModel.read({
      schemaIdentity: analysis.schemaIdentity,
      contentBytes: document.bytes,
      contentDigest: document.digest,
    });
    if (!content.ok) return fail("INVALID_SEO_ANALYSIS_REQUEST", "Content", [analysis.entryId]);
    const pointer = persistence.getEntryPointers(analysis.entryId);
    if (analysis.expectedCurrentRevisionId === null) {
      if (pointer.ok) return fail("CURRENT_REVISION_MISMATCH", "Content", [analysis.entryId]);
      if (pointer.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("READ_CURRENT_ENTRY_FAILED", "Content", [analysis.entryId]);
    } else {
      if (!pointer.ok || pointer.value.currentRevisionId !== analysis.expectedCurrentRevisionId) {
        return fail("CURRENT_REVISION_MISMATCH", "Content", [analysis.entryId]);
      }
      const current = persistence.getRevision({ entryId: analysis.entryId, revisionId: analysis.expectedCurrentRevisionId });
      if (!current.ok || current.value.schemaIdentity.schemaId !== analysis.schemaIdentity.schemaId || current.value.schemaIdentity.version !== analysis.schemaIdentity.version) {
        return fail("CURRENT_REVISION_MISMATCH", "Content", [analysis.entryId]);
      }
    }
    const resolved = await pluginHost.analyzeCmsSeo({
      entryId: analysis.entryId,
      schemaIdentity: analysis.schemaIdentity,
      content: content.value.content as JsonValue,
      route: normalizedRoute.normalizedRoute,
    });
    if (!resolved.ok) {
      return { ok: true, value: unavailableCmsSeoAnalysis(analysis.entryId, analysis.documentDigest, [resolved.error as PluginHostFailure]) };
    }
    if (resolved.value.status === "unavailable") {
      return { ok: true, value: unavailableCmsSeoAnalysis(analysis.entryId, analysis.documentDigest, resolved.value.diagnostics) };
    }
    const canonicalUrl = resolvePublicRouteUrl(resolved.value.settings.publicSiteUrl, resolved.value.preview.canonicalPath);
    if (canonicalUrl === null) {
      return { ok: true, value: unavailableCmsSeoAnalysis(analysis.entryId, analysis.documentDigest, [invalidSeoProducerDiagnostic()]) };
    }
    const result: CmsSeoAnalysisResultV1 = {
      contract: "cms-seo-analysis-result/v1",
      status: "available",
      documentDigest: analysis.documentDigest,
      preview: {
        title: resolved.value.preview.title,
        ...(resolved.value.preview.description === undefined ? {} : { description: resolved.value.preview.description }),
        canonicalUrl,
      },
      suggestions: resolved.value.suggestions,
      producers: resolved.value.producers,
    };
    return { ok: true, value: { contract: "cms-seo-analysis-success/v1", entryId: analysis.entryId, result } };
  };

  const replacePluginSettings = async (request: PluginSettingsReplaceRequestV1): Promise<DomainApplicationResult<Readonly<{ settingsStateDigest: Digest }>>> => {
    const settings = normalizePluginSettingsReplaceRequest(request);
    if (settings === null) return fail("INVALID_SEO_ANALYSIS_REQUEST");
    const replaced = await pluginHost.replaceSettings(settings);
    return replaced.ok
      ? { ok: true, value: { settingsStateDigest: replaced.value.digest } }
      : { ok: false, error: replaced.error as PluginHostFailure };
  };
  const listPlugins = async (): Promise<DomainApplicationResult<PluginManagementSnapshotV1>> => {
    const [discovery, activation, settings] = await Promise.all([
      pluginHost.discover(),
      pluginHost.getActivationManagementSnapshot(),
      pluginHost.getSettingsSnapshot(),
    ]);
    if (!discovery.ok) return { ok: false, error: discovery.error as PluginHostFailure };
    if (!activation.ok) return { ok: false, error: activation.error as PluginHostFailure };
    if (!settings.ok) return { ok: false, error: settings.error as PluginHostFailure };
    const plugins = [...discovery.value.candidates]
      .sort((left, right) => codeUnitCompare(left.id, right.id))
      .map((candidate) => pluginManagementCandidate(candidate, activation.value, settings.value.state.records));
    const diagnostics = discovery.value.rejections
      .flatMap((rejection) => rejection.detail === undefined ? [] : [rejection.detail])
      .sort((left, right) => codeUnitCompare(`${left.capability}\0${left.scope.kind === "entry" ? left.scope.entryId : ""}\0${left.hook}\0${left.pluginId}`, `${right.capability}\0${right.scope.kind === "entry" ? right.scope.entryId : ""}\0${right.hook}\0${right.pluginId}`));
    return {
      ok: true,
      value: {
        contract: "plugin-management-snapshot/v1",
        activationStateDigest: activation.value.activationStateDigest,
        settingsStateDigest: settings.value.digest,
        plugins,
        diagnostics,
      },
    };
  };

  const activatePlugin = async (request: PluginActivationRequestV1): Promise<DomainApplicationResult<Readonly<{ activationStateDigest: Digest }>>> => {
    const activation = normalizePluginActivationRequest(request);
    if (activation === null) return fail("INVALID_SEO_ANALYSIS_REQUEST");
    const activated = await pluginHost.activate(activation);
    return activated.ok
      ? { ok: true, value: { activationStateDigest: activated.value.digest } }
      : { ok: false, error: activated.error as PluginHostFailure };
  };


  return {
    async saveRevision(request: SaveRevisionCommandRequest) {
      const command = normalizeSaveRevisionCommand(request);
      if (command === null) return fail("INVALID_SAVE_REVISION_REQUEST");
      return command.kind === "save"
        ? executeSaveRevision(command.request)
        : executeMediaReferenceReplacement(command.request);
    },
    async readCurrentEntry(input) {
      return readCurrentEntry(input);
    },

    async analyzeCmsSeo(request) {
      return analyzeCmsSeo(request);
    },

    async replacePluginSettings(request) {
      return replacePluginSettings(request);
    },
    async listPlugins() {
      return listPlugins();
    },

    async activatePlugin(request) {
      return activatePlugin(request);
    },



    async changeRoute(request: ChangeRouteRequest): Promise<DomainApplicationResult<ChangeRouteSuccess>> {
      const change = normalizeChangeRouteRequest(request);
      if (change === null) return fail("INVALID_CHANGE_ROUTE_REQUEST");

      const result = persistence.runTransaction<ChangeRouteSuccess, DomainApplicationFailure>((transaction) => {
        const token = siteDefinition.validateRouteClaimReplacementInTransaction(change.proposal, transaction);
        if (!token.ok) return changeRouteFailure(token.error.code);

        // token 驗證後不可再讀取呼叫端 proposal；只使用 SiteDefinition apply 的權威 claim。
        const applied = siteDefinition.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
        if (!applied.ok) return changeRouteFailure(applied.error.code);
        const { claim } = applied.value;
        const pointer = transaction.getEntryPointers(claim.owner);
        if (!pointer.ok) {
          return pointer.error.code === "ENTRY_POINTER_NOT_FOUND"
            ? fail("CURRENT_REVISION_MISMATCH", "Content", [claim.owner])
            : fail("CHANGE_ROUTE_FAILED");
        }
        const selectedRevisionId = claim.graph === "current"
          ? pointer.value.currentRevisionId
          : pointer.value.publishedRevisionId;
        if (selectedRevisionId === undefined || selectedRevisionId !== claim.sourceRevisionId) {
          return fail("CURRENT_REVISION_MISMATCH", "Content", [claim.owner]);
        }
        const unchanged = transaction.setEntryPointers({
          entryId: claim.owner,
          currentRevisionId: pointer.value.currentRevisionId,
          ...(pointer.value.publishedRevisionId === undefined ? {} : { publishedRevisionId: pointer.value.publishedRevisionId }),
          lineage: { revisionId: claim.sourceRevisionId, operationId: change.operationId, operationKind: "ChangeRoute" },
        });
        if (!unchanged.ok) return fail("CHANGE_ROUTE_FAILED");
        const state = transaction.canonicalState();
        return !state.ok
          ? fail("CHANGE_ROUTE_FAILED")
          : {
              ok: true,
              value: {
                ...applied.value,
                entryPointer: unchanged.value,
                lineageIdentity: { entryId: claim.owner, revisionId: claim.sourceRevisionId, operationId: change.operationId },
                stateDigest: state.value.digest,
              },
            };
      });
      return result.ok
        ? result
        : result.error.owner === "Persistence"
          ? fail("CHANGE_ROUTE_FAILED")
          : { ok: false, error: result.error };
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
function normalizePluginActivationRequest(value: unknown): PluginActivationRequestV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["contract", "identity", "expectedActivationStateDigest"]);
  const identity = pluginIdentity(fields?.identity);
  if (
    fields === null
    || fields.contract !== "plugin-activation-request/v1"
    || identity === null
    || typeof fields.expectedActivationStateDigest !== "string"
    || !isDigest(fields.expectedActivationStateDigest)
  ) {
    return null;
  }
  return { contract: fields.contract, identity, expectedActivationStateDigest: fields.expectedActivationStateDigest };
}

function pluginManagementCandidate(
  candidate: PluginCandidate,
  activation: PluginActivationManagementSnapshot,
  records: readonly PluginSettingsRecord[],
): PluginManagementSnapshotV1["plugins"][number] {
  const identity = {
    id: candidate.id,
    version: candidate.version,
    hookContract: candidate.hookContract,
    manifestHash: candidate.manifestHash,
    capabilities: candidate.capabilities,
  };
  const active = activation.active.some((entry) => samePluginIdentity(entry, identity));
  const reactivationRequired = activation.reactivationRequired.some((entry) => samePluginIdentity(entry, identity));
  const record = records.find((entry) => entry.identity.id === candidate.id);
  const settings = record === undefined
    ? { status: "missing" as const }
    : !samePluginIdentity(record.identity, identity)
      ? { status: "identity-mismatch" as const, settingsDigest: record.settingsDigest }
      : record.settingsContract !== "seo-plugin-settings/v1" || record.settings.contract !== record.settingsContract
        ? { status: "contract-mismatch" as const, settingsDigest: record.settingsDigest }
        : seoSettings(record.settings) === null
          ? { status: "invalid" as const, settingsDigest: record.settingsDigest }
          : { status: "valid" as const, settingsContract: record.settingsContract, settings: record.settings, settingsDigest: record.settingsDigest };
  return {
    identity: candidate,
    activation: reactivationRequired ? "reactivation-required" : active ? "active" : "inactive",
    settings,
  };
}

function samePluginIdentity(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  if (left.id !== right.id || left.version !== right.version || left.hookContract !== right.hookContract || left.manifestHash !== right.manifestHash || left.capabilities.length !== right.capabilities.length) return false;
  return left.capabilities.every((capability, index) => capability === right.capabilities[index]);
}

function entryInput(value: unknown): value is Readonly<{ entryId: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fields = ownEnumerableFields(value, ["entryId"]);
  return fields !== null && text(fields.entryId);
}

function documentDigest(
  request: Readonly<{ entryId: string; expectedCurrentRevisionId: string | null; schemaIdentity: Readonly<{ schemaId: string; version: number }>; route: string }>,
  content: JsonValue,
): Digest | null {
  const canonical = canonicalJsonBytes({
    entryId: request.entryId,
    expectedCurrentRevisionId: request.expectedCurrentRevisionId,
    schemaIdentity: request.schemaIdentity,
    content,
    route: request.route,
  });
  return canonical.ok ? sha256Digest(canonical.value) : null;
}

function normalizeCmsSeoAnalysisRequest(value: unknown): CmsSeoAnalysisRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["contract", "entryId", "expectedCurrentRevisionId", "schemaIdentity", "content", "route", "documentDigest"]);
  const schemaIdentity = schema(fields?.schemaIdentity);
  if (
    fields === null
    || fields.contract !== "cms-seo-analysis-request/v1"
    || !text(fields.entryId)
    || (fields.expectedCurrentRevisionId !== null && !text(fields.expectedCurrentRevisionId))
    || schemaIdentity === null
    || !text(fields.route)
    || typeof fields.documentDigest !== "string"
    || !isDigest(fields.documentDigest)
  ) {
    return null;
  }
  return {
    contract: fields.contract,
    entryId: fields.entryId,
    expectedCurrentRevisionId: fields.expectedCurrentRevisionId,
    schemaIdentity,
    content: fields.content as unknown as CmsSeoAnalysisRequest["content"],
    route: fields.route,
    documentDigest: fields.documentDigest,
  };
}

function normalizePluginSettingsReplaceRequest(value: unknown): PluginSettingsReplaceRequestV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["contract", "identity", "expectedSettingsStateDigest", "settingsContract", "settings"]);
  const identity = pluginIdentity(fields?.identity);
  const settings = seoSettings(fields?.settings);
  if (
    fields === null
    || fields.contract !== "plugin-settings-replace-request/v1"
    || identity === null
    || typeof fields.expectedSettingsStateDigest !== "string"
    || !isDigest(fields.expectedSettingsStateDigest)
    || fields.settingsContract !== "seo-plugin-settings/v1"
    || settings === null
    || settings.contract !== fields.settingsContract
  ) {
    return null;
  }
  return {
    contract: fields.contract,
    identity,
    expectedSettingsStateDigest: fields.expectedSettingsStateDigest,
    settingsContract: fields.settingsContract,
    settings,
  };
}

function unavailableCmsSeoAnalysis(entryId: string, documentDigest: Digest, diagnostics: readonly PluginHostFailure[]): CmsSeoAnalysisSuccess {
  return {
    contract: "cms-seo-analysis-success/v1",
    entryId,
    result: {
      contract: "cms-seo-analysis-result/v1",
      status: "unavailable",
      documentDigest,
      diagnostics,
    },
  };
}

function invalidSeoProducerDiagnostic(): PluginHostFailure {
  return {
    code: "PLUGIN_CALLBACK_RESULT_INVALID",
    owner: "PluginHost",
    subjectIds: [],
    remediation: { kind: "message", message: "Plugin SEO output 無效。" },
  };
}

function resolvePublicRouteUrl(publicSiteUrl: string, route: string): string | null {
  const normalizedRoute = normalizeRoute(route);
  if (normalizedRoute === null || normalizedRoute.normalizedRoute !== route) return null;
  try {
    const base = new URL(publicSiteUrl);
    if (
      base.protocol !== "https:"
      || base.username !== ""
      || base.password !== ""
      || base.port !== ""
      || base.search !== ""
      || base.hash !== ""
      || base.href !== publicSiteUrl
      || !/^\/(?:[^/]+\/)*$/u.test(base.pathname)
    ) {
      return null;
    }
    const suffix = route === "/" ? "" : route.slice(1).replace(/\/?$/u, "/");
    return new URL(suffix, base).href;
  } catch {
    return null;
  }
}

function schema(value: unknown): Readonly<{ schemaId: string; version: number }> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["schemaId", "version"]);
  return fields !== null && text(fields.schemaId) && typeof fields.version === "number" && Number.isSafeInteger(fields.version) && fields.version > 0
    ? { schemaId: fields.schemaId, version: fields.version }
    : null;
}

function pluginIdentity(value: unknown): PluginActivationIdentity | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["id", "version", "hookContract", "manifestHash", "capabilities"]);
  if (
    fields === null
    || !text(fields.id)
    || !text(fields.version)
    || fields.hookContract !== "plugin-hooks/v1"
    || typeof fields.manifestHash !== "string"
    || !isDigest(fields.manifestHash)
    || !Array.isArray(fields.capabilities)
    || fields.capabilities.some((capability) => typeof capability !== "string")
  ) {
    return null;
  }
  return {
    id: fields.id,
    version: fields.version,
    hookContract: fields.hookContract,
    manifestHash: fields.manifestHash,
    capabilities: [...fields.capabilities] as PluginActivationIdentity["capabilities"],
  };
}

function seoSettings(value: unknown): SeoPluginSettingsV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = ownEnumerableFields(value, ["contract", "publicSiteUrl", "indexing"]);
  return fields !== null
    && fields.contract === "seo-plugin-settings/v1"
    && text(fields.publicSiteUrl)
    && (fields.indexing === "allow" || fields.indexing === "disallow")
    ? { contract: fields.contract, publicSiteUrl: fields.publicSiteUrl, indexing: fields.indexing }
    : null;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validSave(value: SaveRevisionRequest): boolean {
  return typeof value.entryId === "string"
    && value.entryId.length > 0
    && typeof value.revisionId === "string"
    && value.revisionId.length > 0
    && typeof value.operationId === "string"
    && value.operationId.length > 0
    && (value.expectedCurrentRevisionId === null || text(value.expectedCurrentRevisionId))
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
  ChangeRoute: "CHANGE_ROUTE_FAILED",
};

function changeRouteFailure<T>(code: string): DomainApplicationResult<T> {
  return code === "STALE_ROUTE_PROPOSAL"
    ? fail("STALE_ROUTE_PROPOSAL", "SiteDefinition")
    : fail("CHANGE_ROUTE_FAILED");
}

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

function normalizeChangeRouteRequest(value: unknown): ChangeRouteRequest | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const fields = ownEnumerableFields(value, ["operationId", "proposal"]);
    if (
      fields === null
      || !text(fields.operationId)
      || typeof fields.proposal !== "object"
      || fields.proposal === null
      || Array.isArray(fields.proposal)
    ) {
      return null;
    }
    return { operationId: fields.operationId, proposal: fields.proposal as RouteClaimReplacementProposal };
  } catch {
    return null;
  }
}

function normalizeSaveRevisionCommand(value: unknown): NormalizedSaveRevisionCommand | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const kind = Object.getOwnPropertyDescriptor(value, "kind");
    if (kind !== undefined && (!("value" in kind) || kind.value !== "media-reference-replacement")) return null;
    if (kind === undefined) {
      const request = ownEnumerableFields(value, ["entryId", "revisionId", "operationId", "expectedCurrentRevisionId", "schemaIdentity", "content", "route", "assetVersions"]);
      return request === null ? null : { kind: "save", request: request as SaveRevisionRequest };
    }

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
