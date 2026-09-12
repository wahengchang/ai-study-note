import { timingSafeEqual } from "node:crypto";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type CoreFailure, type Digest, type JsonValue } from "../foundation/index.js";
import type { ArchiveAssetImpact, AssetVersionIdentity, MediaAssetDetailView, MediaAssetView, RestoreAssetCommandDescriptor } from "../media/index.js";
import type { CmsEditorBlockSource, PluginActivationIdentity, PluginHostFailure } from "../plugin-host/index.js";
import { normalizeRoute, type PublishedRouteClaimProposal, type RouteClaim, type RouteClaimReplacementProposal, type RouteGraph } from "../site-definition/index.js";

import type {
  AuthoringEntryV1,
  ChangeRouteRequest,
  ChangeRouteSuccess,
  PrepareChangeRouteRequest,
  SiteRouteGraph,
  CmsEditorBlockResolutions,
  CmsEditorBlockResolutionsRequest,
  CmsEditorBlockResolutionItem,
  CmsSeoAnalysisRequest,
  CmsSeoAnalysisResponse,
  DomainApplication,
  DomainApplicationCommandFailure,
  DomainApplicationDependencies,
  DomainApplicationFailure,
  DomainApplicationFailureCode,
  DomainApplicationResult,
  ArchiveMediaVersionRequest,
  GetMediaRequest,
  CreateMediaVersionRequest,
  ImportMediaRequest,
  MediaAssetDetailV1,
  MediaAssetV1,
  MediaVersionReplacementReceiptV1,
  MediaCatalogV1,
  PluginActivationRequest,
  PluginManagementSnapshotV1,
  PluginSettingsReplaceRequest,
  PublishRevisionRequest,
  PublishRevisionSuccess,
  RestoreRevisionRequest,
  RestoreMediaVersionRequest,
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
  INVALID_PLUGIN_ACTIVATION_REQUEST: "請修正 Plugin activation request。",
  INVALID_PLUGIN_SETTINGS_REQUEST: "請修正 Plugin settings request。",
  INVALID_SEO_ANALYSIS_REQUEST: "請修正 CMS SEO analysis request。",
  CMS_SEO_ANALYSIS_FAILED: "CMS SEO analysis 目前無法完成；canonical state 未變更。",
  INVALID_CMS_EDITOR_BLOCK_RESOLUTIONS_REQUEST: "請修正 CMS editor block resolution request。",
  CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED: "CMS editor block 目前無法解析；原始內容未變更。",
  ENTRY_NOT_FOUND: "找不到指定文章。",
  CURRENT_REVISION_MISMATCH: "目前 revision 已變更，請重新確認後再執行命令。",
  MEDIA_REFERENCE_NOT_FOUND: "找不到 current revision 的指定媒體引用。",
  MEDIA_REFERENCE_CONFLICT: "current revision 已引用該 asset version；請先移除重複引用再替換。",
  MEDIA_VERSION_CREATED_REPLACEMENT_FAILED: "Replacement media version 已建立；請以同一 replacement identity 重新執行 revision replacement。",
  MEDIA_IMPORT_CONFLICT: "Media import identity 與既有紀錄衝突。",
  MEDIA_IMPORT_FAILED: "Media import 尚未完成。",
  MEDIA_ASSET_NOT_FOUND: "找不到指定的 media asset。",
  MEDIA_ARCHIVE_BLOCKED_PUBLISHED: "仍被已發布內容引用，無法封存此媒體版本。",
  MEDIA_ARCHIVE_FAILED: "Media asset version 尚未完成封存。",
  MEDIA_RESTORE_REQUIRED: "請提供符合既有 evidence 的 recovery bytes 與 metadata。",
  MEDIA_RESTORE_MISMATCH: "Recovery bytes 或 metadata 與既有 asset version 不一致。",
  MEDIA_RESTORE_FAILED: "Media asset version 尚未完成復原。",
  MEDIA_READ_STATE_STALE: "Media 讀取期間狀態已變更，請重試。",
  MEDIA_READ_FAILED: "Media 讀取無法驗證。",
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
  archiveImpact?: ArchiveAssetImpact,
): DomainApplicationResult<T> {
  return { ok: false, error: { code, owner, subjectIds, remediation: { kind: "message", message: messages[code] }, ...(restoreCommands === undefined ? {} : { restoreCommands }), ...(archiveImpact === undefined ? {} : { archiveImpact }) } };
}

function plugin<T>(error: PluginHostFailure | CoreFailure): DomainApplicationResult<T> {
  return error.owner === "PluginHost" && error.code !== "PLUGIN_VALIDATION_SERVICE_FAILED" ? { ok: false, error } : fail("SAVE_REVISION_FAILED");
}

function pluginEditorBlocks<T>(error: PluginHostFailure | CoreFailure): DomainApplicationResult<T> {
  return error.owner === "PluginHost" ? { ok: false, error } : fail("CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED");
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

function sameSchemaIdentity(left: Readonly<{ schemaId: string; version: number }>, right: Readonly<{ schemaId: string; version: number }>): boolean {
  return left.schemaId === right.schemaId && left.version === right.version;
}

function sameDigest(left: Digest, right: unknown): boolean {
  return typeof right === "string" && isDigest(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
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

function editorBlockSources(content: JsonValue, entryId: string, revisionId: string): readonly Readonly<{ blockIndex: number; source: CmsEditorBlockSource }>[] | null {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return null;
  const document = ownEnumerableFields(content, ["contract", "title", "blocks", "seo"]);
  if (document === null || document.contract !== "site-content/v1" || !Array.isArray(document.blocks)) return null;
  const sources: Readonly<{ blockIndex: number; source: CmsEditorBlockSource }>[] = [];
  for (const [blockIndex, block] of document.blocks.entries()) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) return null;
    const kind = Object.getOwnPropertyDescriptor(block, "kind");
    if (kind === undefined || !("value" in kind)) return null;
    if (kind.value !== "interactive-demo") continue;
    const demo = ownEnumerableFields(block, ["kind", "identity", "hook", "manifestHash", "source", "staticFallback"]);
    if (demo === null || demo.kind !== "interactive-demo" || demo.hook !== "cms/editor-block/resolve" || typeof demo.manifestHash !== "string" || !isDigest(demo.manifestHash) || !text(demo.staticFallback) || typeof demo.identity !== "object" || demo.identity === null || Array.isArray(demo.identity) || typeof demo.source !== "object" || demo.source === null || Array.isArray(demo.source)) return null;
    const identity = ownEnumerableFields(demo.identity, ["id", "version"]);
    const source = ownEnumerableFields(demo.source, ["html", "css", "javascript"]);
    if (identity === null || source === null || !text(identity.id) || !text(identity.version) || !Object.values(source).every((value) => typeof value === "string")) return null;
    sources.push(Object.freeze({
      blockIndex,
      source: Object.freeze({
        contract: "cms-editor-block-source/v1",
        entryId,
        revisionId,
        pluginIdentity: Object.freeze({ id: identity.id, version: identity.version, hook: "cms/editor-block/resolve", manifestHash: demo.manifestHash as Digest }),
        source: Object.freeze({ html: source.html as string, css: source.css as string, javascript: source.javascript as string }),
      }),
    }));
  }
  return Object.freeze(sources);
}


export function createDomainApplication({ persistence, siteDefinition, dataMedia, schemaValidator, pluginHost, taxonomy }: DomainApplicationDependencies): DomainApplication {
  const routeGraphState = (): DomainApplicationResult<Readonly<{ current: Readonly<{ claims: readonly RouteClaim[]; digest: Digest }>; published: Readonly<{ claims: readonly RouteClaim[]; digest: Digest }> }>> => {
    const read = persistence.runReadSnapshot<Readonly<{ current: Readonly<{ claims: readonly RouteClaim[]; digest: Digest }>; published: Readonly<{ claims: readonly RouteClaim[]; digest: Digest }> }>, DomainApplicationFailure>((snapshot) => {
      const current = siteDefinition.snapshotInReadSnapshot("current", snapshot);
      const published = siteDefinition.snapshotInReadSnapshot("published", snapshot);
      if (!current.ok || !published.ok) return fail("CHANGE_ROUTE_FAILED", "SiteDefinition");
      return {
        ok: true,
        value: {
          current: { claims: current.value.claims.map((claim) => ({ ...claim })), digest: current.value.digest },
          published: { claims: published.value.claims.map((claim) => ({ ...claim })), digest: published.value.digest },
        },
      };
    });
    return read.ok ? read : fail("CHANGE_ROUTE_FAILED", "SiteDefinition");
  };

  const prepareChangeRoute = (request: unknown): DomainApplicationResult<RouteClaimReplacementProposal> => {
    const input = normalizePrepareChangeRouteRequest(request);
    if (input === null) return fail("INVALID_CHANGE_ROUTE_REQUEST");
    const before = routeGraphState();
    if (!before.ok) return before;
    if (!sameRouteDigests(input.baselineDigests, { current: before.value.current.digest, published: before.value.published.digest })) {
      return fail("STALE_ROUTE_PROPOSAL", "SiteDefinition", [input.target.owner]);
    }
    const prepared = siteDefinition.prepareRouteClaimReplacement(input.target);
    if (!prepared.ok) return prepareRouteFailure(prepared.error.code, input.target.owner);
    if (!sameRouteDigests(input.baselineDigests, prepared.value.baselineDigests)) {
      return fail("STALE_ROUTE_PROPOSAL", "SiteDefinition", [input.target.owner]);
    }
    return prepared;
  };
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

  const executeSaveRevision = async (request: SaveRevisionRequest, expectedCurrentRevisionId: string | null): Promise<DomainApplicationResult<SaveRevisionSuccess>> => {
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

    const current = persistence.getEntryPointers(request.entryId);
    if (expectedCurrentRevisionId === null) {
      if (current.ok) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
      if (current.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("SAVE_REVISION_FAILED");
    } else if (!current.ok || current.value.currentRevisionId !== expectedCurrentRevisionId) {
      return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
    }

    const prepared = await pluginHost.prepareSaveRevisionValidators({ entryId: request.entryId });
    if (!prepared.ok) return plugin(prepared.error as PluginHostFailure);

    const result = persistence.runTransaction<SaveRevisionSuccess, DomainApplicationFailure>((transaction) => {
      const prior = transaction.getEntryPointers(request.entryId);
      if (expectedCurrentRevisionId === null) {
        if (prior.ok) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
        if (prior.error.code !== "ENTRY_POINTER_NOT_FOUND") return fail("SAVE_REVISION_FAILED");
      } else if (!prior.ok || prior.value.currentRevisionId !== expectedCurrentRevisionId) {
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
        taxonomyTerms: request.taxonomyTerms,
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
    const taxonomyBindings = persistence.getRevisionTaxonomyBindings(source.value.identity);
    if (!references.ok || !taxonomyBindings.ok) return fail("SAVE_REVISION_FAILED");

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
        expectedCurrentRevisionId: request.expectedCurrentRevisionId,
        schemaIdentity: source.value.schemaIdentity,
        content: sourceContent.value,
        route: selected.value.claim.normalizedRoute,
        assetVersions,
        taxonomyTerms: taxonomyBindings.value.map(({ taxonomyId, termId }) => ({ taxonomyId, termId })),
      },
      request.expectedCurrentRevisionId,
    );
  };
  // Media failure 的 archive impact 與 RestoreAsset descriptor 是 transport 必須投影的安全 remediation evidence，
  // 不得在 Application 邊界被丟棄；否則 CMS 只會看到一句無法行動的訊息。
  const mediaFailure = <T>(error: Readonly<{ code: string; subjectIds: readonly string[]; restoreCommands?: readonly RestoreAssetCommandDescriptor[]; archiveImpact?: ArchiveAssetImpact }>): DomainApplicationResult<T> => {
    const code = error.code === "MEDIA_IMPORT_CONFLICT" ? "MEDIA_IMPORT_CONFLICT" : error.code === "MEDIA_ASSET_NOT_FOUND" ? "MEDIA_ASSET_NOT_FOUND" : error.code === "MEDIA_ARCHIVE_BLOCKED_PUBLISHED" ? "MEDIA_ARCHIVE_BLOCKED_PUBLISHED" : error.code === "MEDIA_ARCHIVE_FAILURE" ? "MEDIA_ARCHIVE_FAILED" : error.code === "MEDIA_RESTORE_REQUIRED" ? "MEDIA_RESTORE_REQUIRED" : error.code === "MEDIA_RESTORE_MISMATCH" ? "MEDIA_RESTORE_MISMATCH" : error.code === "MEDIA_RESTORE_FAILURE" ? "MEDIA_RESTORE_FAILED" : error.code === "MEDIA_READ_STATE_STALE" ? "MEDIA_READ_STATE_STALE" : error.code === "MEDIA_READ_FAILED" ? "MEDIA_READ_FAILED" : "MEDIA_IMPORT_FAILED";
    return fail(code, "DataMedia", error.subjectIds, error.restoreCommands, error.archiveImpact);
  };
  const mediaAsset = (asset: MediaAssetView): MediaAssetV1 => ({
    contract: "media-asset/v1",
    assetId: asset.assetId,
    versions: asset.versions.map((version) => ({
      ...version,
      identity: { ...version.identity },
      evidence: { ...version.evidence },
      ...(version.restoreCommand === undefined ? {} : { restoreCommand: { ...version.restoreCommand, assetVersion: { ...version.restoreCommand.assetVersion } } }),
    })),
  });
  const mediaCatalog = (assets: readonly MediaAssetView[]): MediaCatalogV1 | undefined => {
    const items = assets.map(mediaAsset);
    const bytes = canonicalJsonBytes({ contract: "media-catalog/v1", items });
    return bytes.ok ? { contract: "media-catalog/v1", items, stateDigest: sha256Digest(bytes.value) } : undefined;
  };
  const mediaDetail = (detail: MediaAssetDetailView): MediaAssetDetailV1 | undefined => {
    const asset = mediaAsset(detail.asset);
    const references = { current: detail.references.current.map((reference) => ({ entryId: reference.entryId, revisionId: reference.revisionId, assetVersion: { ...reference.assetVersion } })), published: detail.references.published.map((reference) => ({ entryId: reference.entryId, revisionId: reference.revisionId, assetVersion: { ...reference.assetVersion } })) };
    const bytes = canonicalJsonBytes({ contract: "media-asset-detail/v1", asset, references });
    return bytes.ok ? { contract: "media-asset-detail/v1", asset, references, stateDigest: sha256Digest(bytes.value) } : undefined;
  };


  return {
    async listMedia(): Promise<DomainApplicationResult<MediaCatalogV1>> {
      const assets = dataMedia.listAssets();
      if (!assets.ok) return mediaFailure(assets.error);
      const catalog = mediaCatalog(assets.value);
      return catalog === undefined ? fail("MEDIA_READ_FAILED", "DataMedia") : { ok: true, value: catalog };
    },
    async importMedia(request: ImportMediaRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>> {
      const imported = dataMedia.importLocal(request);
      if (!imported.ok) return mediaFailure(imported.error);
      const detail = dataMedia.getAssetDetail(request.assetId);
      if (!detail.ok) return mediaFailure(detail.error);
      const projected = mediaDetail(detail.value);
      return projected === undefined ? fail("MEDIA_READ_FAILED", "DataMedia", [request.assetId]) : { ok: true, value: projected };
    },
    async getMedia(request: GetMediaRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>> {
      const detail = dataMedia.getAssetDetail(request.assetId);
      if (!detail.ok) return mediaFailure(detail.error);
      const projected = mediaDetail(detail.value);
      return projected === undefined ? fail("MEDIA_READ_FAILED", "DataMedia", [request.assetId]) : { ok: true, value: projected };
    },
    async archiveMediaVersion(request: ArchiveMediaVersionRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>> {
      const archived = dataMedia.archiveAsset(request);
      if (!archived.ok) return mediaFailure(archived.error);
      return this.getMedia({ assetId: request.assetId });
    },
    async createMediaVersion(request: CreateMediaVersionRequest): Promise<DomainApplicationResult<MediaVersionReplacementReceiptV1>> {
      const { replacement } = request;
      if (request.assetVersionId === replacement.targetAssetVersionId) return fail("MEDIA_REFERENCE_CONFLICT", "DataMedia", [request.assetId, request.assetVersionId]);
      const pointers = persistence.getEntryPointers(replacement.entryId);
      if (!pointers.ok || pointers.value.currentRevisionId !== replacement.expectedCurrentRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [replacement.entryId]);
      const references = persistence.getRevisionReferences({ entryId: replacement.entryId, revisionId: replacement.expectedCurrentRevisionId });
      if (!references.ok) return fail("SAVE_REVISION_FAILED");
      if (!references.value.some((reference) => reference.assetVersion.assetId === request.assetId && reference.assetVersion.assetVersionId === replacement.targetAssetVersionId)) return fail("MEDIA_REFERENCE_NOT_FOUND", "DataMedia", [request.assetId, replacement.targetAssetVersionId]);
      if (references.value.some((reference) => reference.assetVersion.assetId === request.assetId && reference.assetVersion.assetVersionId === request.assetVersionId)) return fail("MEDIA_REFERENCE_CONFLICT", "DataMedia", [request.assetId, request.assetVersionId]);
      const imported = dataMedia.importLocal({ importId: request.importId, assetId: request.assetId, assetVersionId: request.assetVersionId, bytes: request.bytes, metadata: request.metadata });
      if (!imported.ok) return mediaFailure(imported.error);
      const saved = await this.saveRevision({ kind: "media-reference-replacement", entryId: replacement.entryId, revisionId: replacement.revisionId, operationId: replacement.operationId, expectedCurrentRevisionId: replacement.expectedCurrentRevisionId, targetAssetVersion: { assetId: request.assetId, assetVersionId: replacement.targetAssetVersionId }, replacementAssetVersion: { assetId: request.assetId, assetVersionId: request.assetVersionId } });
      if (!saved.ok) return fail("MEDIA_VERSION_CREATED_REPLACEMENT_FAILED", "DomainApplication", [request.assetId, request.assetVersionId, replacement.entryId, replacement.revisionId]);
      const detail = dataMedia.getAssetDetail(request.assetId);
      if (!detail.ok) return mediaFailure(detail.error);
      const asset = mediaDetail(detail.value);
      const version = asset?.asset.versions.find((item) => item.identity.assetVersionId === request.assetVersionId);
      return asset === undefined || version === undefined ? fail("MEDIA_READ_FAILED", "DataMedia", [request.assetId, request.assetVersionId]) : { ok: true, value: { contract: "media-version-replacement-receipt/v1", version, save: saved.value, asset } };
    },
    async restoreMediaVersion(request: RestoreMediaVersionRequest): Promise<DomainApplicationResult<MediaAssetDetailV1>> {
      const restored = dataMedia.restoreAsset(request);
      if (!restored.ok) return mediaFailure(restored.error);
      return this.getMedia({ assetId: request.assetId });
    },
    async listPlugins(): Promise<DomainApplicationResult<PluginManagementSnapshotV1>> {
      const [discovery, activation, settings] = await Promise.all([pluginHost.discover(), pluginHost.getActivationSnapshot(), pluginHost.getSettingsSnapshot()]);
      if (!discovery.ok) return plugin<PluginManagementSnapshotV1>(discovery.error);
      if (!activation.ok) return plugin<PluginManagementSnapshotV1>(activation.error);
      if (!settings.ok) return plugin<PluginManagementSnapshotV1>(settings.error);
      const active = new Set(activation.value.active.map((identity) => pluginKey(identity)));
      return {
        ok: true,
        value: {
          contract: "plugin-management-snapshot/v1",
          activationStateDigest: activation.value.digest,
          settingsStateDigest: settings.value.stateDigest,
          plugins: [...discovery.value.candidates].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map((identity) => {
            const key = pluginKey(identity);
            const setting = settings.value.records.find((record) => pluginKey(record.identity) === key);
            return {
              identity,
              status: active.has(key) ? "active" as const : activation.value.reactivationRequired.some((item) => pluginKey(item) === key) ? "reactivation-required" as const : "inactive" as const,
              ...(setting === undefined ? {} : { settings: { settingsContract: setting.settingsContract, settings: setting.settings, settingsDigest: setting.settingsDigest } }),
            };
          }),
          diagnostics: [...discovery.value.rejections],
        },
      };
    },

    async activatePlugin(request: PluginActivationRequest): Promise<DomainApplicationResult<PluginManagementSnapshotV1>> {
      if (request.contract !== "plugin-activation-request/v1") return fail("INVALID_PLUGIN_ACTIVATION_REQUEST");
      const activated = await pluginHost.activate(request);
      return activated.ok ? this.listPlugins() : plugin<PluginManagementSnapshotV1>(activated.error);
    },

    async replacePluginSettings(request: PluginSettingsReplaceRequest): Promise<DomainApplicationResult<PluginManagementSnapshotV1>> {
      if (request.contract !== "plugin-settings-replace-request/v1" || request.settingsContract !== "seo-plugin-settings/v1") return fail("INVALID_PLUGIN_SETTINGS_REQUEST");
      const replaced = await pluginHost.replaceSettings(request);
      return replaced.ok ? this.listPlugins() : plugin<PluginManagementSnapshotV1>(replaced.error);
    },

    async readCurrentEntry(entryId: string): Promise<DomainApplicationResult<AuthoringEntryV1>> {
      const pointer = persistence.getEntryPointers(entryId);
      if (!pointer.ok) return fail(pointer.error.code === "ENTRY_POINTER_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "SAVE_REVISION_FAILED", "Content", [entryId]);
      const revision = persistence.getRevision({ entryId, revisionId: pointer.value.currentRevisionId });
      const routes = siteDefinition.snapshot("current");
      const state = persistence.canonicalState();
      if (!revision.ok || !routes.ok || !state.ok) return fail("SAVE_REVISION_FAILED", "Content", [entryId]);
      const content = verifiedSourceContent(revision.value.contentBytes, revision.value.contentDigest);

      const route = routes.value.claims.find((claim) => claim.owner === entryId && claim.sourceRevisionId === revision.value.identity.revisionId);
      const references = persistence.getRevisionReferences(revision.value.identity);
      const taxonomyBindings = persistence.getRevisionTaxonomyBindings(revision.value.identity);
      if (content === null || route === undefined || !references.ok || !taxonomyBindings.ok) return fail("SAVE_REVISION_FAILED", "Content", [entryId]);
      return { ok: true, value: { contract: "authoring-entry/v1", entryId, current: { revisionId: revision.value.identity.revisionId, schemaIdentity: revision.value.schemaIdentity, content: content.value, contentDigest: revision.value.contentDigest, route: route.normalizedRoute, assets: references.value.map((reference) => reference.assetVersion).sort((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : left.assetVersionId < right.assetVersionId ? -1 : left.assetVersionId > right.assetVersionId ? 1 : 0), taxonomyBindings: taxonomyBindings.value }, stateDigest: state.value.digest } };
    },
    async listTaxonomies() {
      return taxonomy.listTaxonomies();
    },

    async getTaxonomy(taxonomyId) {
      return taxonomy.getTaxonomy(taxonomyId);
    },

    async createTaxonomy(request) {
      return taxonomy.createTaxonomy(request);
    },

    async executeTaxonomyCommand(taxonomyId, command) {
      return taxonomy.executeCommand(taxonomyId, command);
    },

    async resolveCurrentCmsEditorBlocks(request: CmsEditorBlockResolutionsRequest): Promise<DomainApplicationResult<CmsEditorBlockResolutions>> {
      if (request.contract !== "cms-editor-block-resolutions-request/v1" || !text(request.entryId)) return fail("INVALID_CMS_EDITOR_BLOCK_RESOLUTIONS_REQUEST");
      const pointer = persistence.getEntryPointers(request.entryId);
      if (!pointer.ok) return fail(pointer.error.code === "ENTRY_POINTER_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED", "Content", [request.entryId]);
      const revision = persistence.getRevision({ entryId: request.entryId, revisionId: pointer.value.currentRevisionId });
      const state = persistence.canonicalState();
      if (!revision.ok || !state.ok) return fail("CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED", "Content", [request.entryId]);
      const content = verifiedSourceContent(revision.value.contentBytes, revision.value.contentDigest);
      const sources = content === null ? null : editorBlockSources(content.value, request.entryId, revision.value.identity.revisionId);
      if (sources === null) return fail("CMS_EDITOR_BLOCK_RESOLUTIONS_FAILED", "Content", [request.entryId]);
      const items: CmsEditorBlockResolutionItem[] = [];
      for (const item of sources) {
        const resolved = await pluginHost.resolveCmsEditorBlock(item.source);
        if (!resolved.ok) return pluginEditorBlocks(resolved.error);
        const common = {
          blockIndex: item.blockIndex,
          pluginIdentity: resolved.value.source.pluginIdentity,
          source: resolved.value.source.source,
          sourceDigest: resolved.value.source.sourceDigest,
          activeStateDigest: resolved.value.activeStateDigest,
        };
        items.push(resolved.value.status === "active"
          ? { ...common, status: "active", output: resolved.value.output, outputDigest: resolved.value.outputDigest }
          : { ...common, status: resolved.value.status, diagnostic: resolved.value.diagnostic });
      }
      return { ok: true, value: { contract: "cms-editor-block-resolutions/v1", entryId: request.entryId, revisionId: revision.value.identity.revisionId, contentDigest: revision.value.contentDigest, stateDigest: state.value.digest, items } };
    },

    async analyzeCmsSeo(request: CmsSeoAnalysisRequest): Promise<DomainApplicationResult<CmsSeoAnalysisResponse>> {
      const route = normalizeRoute(request.route);
      const content = canonicalContent(request.content);
      const bytes = canonicalJsonBytes({ entryId: request.entryId, expectedCurrentRevisionId: request.expectedCurrentRevisionId, schemaIdentity: request.schemaIdentity, content: request.content, route: request.route });
      if (request.contract !== "cms-seo-analysis-request/v1" || !text(request.entryId) || route === null || route.normalizedRoute !== request.route || content === null || !bytes.ok || !sameDigest(sha256Digest(bytes.value), request.documentDigest)) return fail("INVALID_SEO_ANALYSIS_REQUEST");

      const pointer = persistence.getEntryPointers(request.entryId);
      if (!pointer.ok) return pointer.error.code === "ENTRY_POINTER_NOT_FOUND" ? fail("ENTRY_NOT_FOUND", "Content", [request.entryId]) : fail("CMS_SEO_ANALYSIS_FAILED");
      if (pointer.value.currentRevisionId !== request.expectedCurrentRevisionId) return fail("CURRENT_REVISION_MISMATCH", "Content", [request.entryId]);
      const revision = persistence.getRevision({ entryId: request.entryId, revisionId: pointer.value.currentRevisionId });
      const routes = siteDefinition.snapshot("current");
      if (!revision.ok || !routes.ok) return fail("CMS_SEO_ANALYSIS_FAILED");
      const currentRoute = routes.value.claims.find((claim) => claim.owner === request.entryId && claim.sourceRevisionId === pointer.value.currentRevisionId);
      if (!sameSchemaIdentity(revision.value.schemaIdentity, request.schemaIdentity) || currentRoute === undefined || currentRoute.normalizedRoute !== route.normalizedRoute) return fail("INVALID_SEO_ANALYSIS_REQUEST");
      const schema = persistence.getSchemaVersion(request.schemaIdentity);
      if (!schema.ok) return schema.error.code === "SCHEMA_VERSION_NOT_FOUND" ? fail("INVALID_SEO_ANALYSIS_REQUEST") : fail("CMS_SEO_ANALYSIS_FAILED");
      try {
        if (!schemaValidator.validate({ schema: schema.value, contentBytes: content.bytes, contentDigest: content.digest }).ok) return fail("SCHEMA_INVALID", "Content", [request.schemaIdentity.schemaId]);
      } catch {
        return fail("CMS_SEO_ANALYSIS_FAILED");
      }

      const settings = await pluginHost.getSettingsSnapshot();
      if (!settings.ok) return plugin<CmsSeoAnalysisResponse>(settings.error);
      const record = settings.value.records.find((item) => item.identity.id === "seo-basics");
      if (record === undefined) return { ok: true, value: { contract: "cms-seo-analysis-response/v1", documentDigest: request.documentDigest, status: "unavailable", suggestions: [], diagnostics: [] } };
      const input = { contract: "cms-seo-analysis-input/v1" as const, entryId: request.entryId, schemaIdentity: request.schemaIdentity, content: content.value, route: route.normalizedRoute, settings: record.settings };
      const inputBytes = canonicalJsonBytes(input);
      if (!inputBytes.ok) return fail("INVALID_SEO_ANALYSIS_REQUEST");
      const result = await pluginHost.analyzeCmsSeo({ ...input, inputDigest: sha256Digest(inputBytes.value) });
      if (!result.ok) return plugin<CmsSeoAnalysisResponse>(result.error);
      const preview = result.value.preview;
      const canonical = preview?.canonicalPath === undefined ? undefined : siteDefinition.resolvePublicRouteUrl({ publicSiteUrl: record.settings.publicSiteUrl, normalizedRoute: preview.canonicalPath });
      if (canonical !== undefined && !canonical.ok) return fail("CMS_SEO_ANALYSIS_FAILED");
      return { ok: true, value: { contract: "cms-seo-analysis-response/v1", documentDigest: request.documentDigest, status: result.value.status, ...(preview === undefined ? {} : { preview: { title: preview.title, ...(preview.description === undefined ? {} : { description: preview.description }), ...(canonical === undefined ? {} : { canonicalUrl: canonical.value }) } }), suggestions: result.value.suggestions, diagnostics: result.value.diagnostics } };
    },
    async saveRevision(request: SaveRevisionCommandRequest) {
      const command = normalizeSaveRevisionCommand(request);
      if (command === null) return fail("INVALID_SAVE_REVISION_REQUEST");
      return command.kind === "save"
        ? executeSaveRevision(command.request, command.request.expectedCurrentRevisionId)
        : executeMediaReferenceReplacement(command.request);
    },

    async readSiteRouteGraph(selection: RouteGraph): Promise<DomainApplicationResult<SiteRouteGraph>> {
      if (selection !== "current" && selection !== "published") return fail("INVALID_CHANGE_ROUTE_REQUEST");
      const state = routeGraphState();
      if (!state.ok) return state;
      return {
        ok: true,
        value: {
          contract: "route-graph/v1",
          normalization: "route-normalization/v1",
          selection,
          claims: state.value[selection].claims.map((claim) => ({ ...claim })),
          graphDigests: { current: state.value.current.digest, published: state.value.published.digest },
        },
      };
    },

    async prepareChangeRoute(request: PrepareChangeRouteRequest): Promise<DomainApplicationResult<RouteClaimReplacementProposal>> {
      return prepareChangeRoute(request);
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
      const taxonomyBindings = persistence.getRevisionTaxonomyBindings(sourceIdentity);
      if (!references.ok || !taxonomyBindings.ok) return fail("RESTORE_REVISION_FAILED", "Content", [restored.entryId, restored.sourceRevisionId]);
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
          taxonomyTerms: taxonomyBindings.value.map(({ taxonomyId, termId }) => ({ taxonomyId, termId })),
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
    && Array.isArray(value.assetVersions)
    && Array.isArray(value.taxonomyTerms)
    && value.taxonomyTerms.every((term) => typeof term === "object" && term !== null && Object.getPrototypeOf(term) === Object.prototype && Object.keys(term).length === 2 && text(term.taxonomyId) && text(term.termId))
    && !duplicateTaxonomyTerms(value.taxonomyTerms);
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

function duplicateTaxonomyTerms(values: readonly Readonly<{ taxonomyId: string; termId: string }>[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = `${value.taxonomyId}\0${value.termId}`;
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

function prepareRouteFailure<T>(code: string, owner: string): DomainApplicationResult<T> {
  if (code === "ROUTE_CONFLICT") return fail("ROUTE_CONFLICT", "SiteDefinition", [owner]);
  if (
    code === "INVALID_SITE_DEFINITION_INPUT"
    || code === "INVALID_ROUTE"
    || code === "ROUTE_CLAIM_NOT_FOUND"
    || code === "ROUTE_REPLACEMENT_REQUIRED"
  ) {
    return fail("INVALID_CHANGE_ROUTE_REQUEST", "SiteDefinition", [owner]);
  }
  return fail("CHANGE_ROUTE_FAILED", "SiteDefinition", [owner]);
}

function sameRouteDigests(left: Readonly<{ current: Digest; published: Digest }>, right: unknown): boolean {
  if (typeof right !== "object" || right === null || Array.isArray(right)) return false;
  const fields = ownEnumerableFields(right, ["current", "published"]);
  return fields !== null && sameDigest(left.current, fields.current) && sameDigest(left.published, fields.published);
}

function normalizePrepareChangeRouteRequest(value: unknown): Readonly<{ baselineDigests: Readonly<{ current: Digest; published: Digest }>; target: PrepareChangeRouteRequest["target"] }> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const request = ownEnumerableFields(value, ["baselineDigests", "target"]);
    if (
      request === null
      || typeof request.baselineDigests !== "object"
      || request.baselineDigests === null
      || Array.isArray(request.baselineDigests)
      || typeof request.target !== "object"
      || request.target === null
      || Array.isArray(request.target)
    ) {
      return null;
    }
    const baselineDigests = ownEnumerableFields(request.baselineDigests, ["current", "published"]);
    const target = ownEnumerableFields(request.target, ["graph", "owner", "route", "sourceRevisionId"]);
    if (
      baselineDigests === null
      || typeof baselineDigests.current !== "string"
      || !isDigest(baselineDigests.current)
      || typeof baselineDigests.published !== "string"
      || !isDigest(baselineDigests.published)
      || target === null
      || (target.graph !== "current" && target.graph !== "published")
      || !text(target.owner)
      || !text(target.route)
      || !text(target.sourceRevisionId)
    ) {
      return null;
    }
    return {
      baselineDigests: { current: baselineDigests.current, published: baselineDigests.published },
      target: { graph: target.graph, owner: target.owner, route: target.route, sourceRevisionId: target.sourceRevisionId },
    };
  } catch {
    return null;
  }
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

function pluginKey(identity: PluginActivationIdentity): string {
  return `${identity.id}\0${identity.version}\0${identity.hookContract}\0${identity.manifestHash}\0${identity.capabilities.join("\0")}`;
}
