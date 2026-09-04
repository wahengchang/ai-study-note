import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { AssetVersionIdentity, ReadyAssetVersion } from "../media/index.js";
import type { PersistenceReadSnapshot, RevisionRecord } from "../persistence/index.js";
import type { PluginActivationIdentity, PluginHostFailure } from "../plugin-host/index.js";
import type { RouteClaim } from "../site-definition/index.js";
import type { ThemeHostFailure, ThemeIdentity } from "../theme-host/index.js";

import { equalBytes, exact, freeze, mediaSelectionDigest, routeSelectionDigest } from "./canonical.js";
import type { PreviewInput, PreviewInputArtifact, ProjectionDependencies, ProjectionPreview, ProjectionResult, RendererEntry, RendererInput, RendererInputArtifact, RendererMedia, RendererMediaAsset, RendererMediaReference, RendererTheme, RendererThemeFile } from "./contracts.js";
import { projectionFailure } from "./failures.js";

const maximumObjectBytes = 64 * 1024 * 1024;
const maximumEmbeddedBytes = 256 * 1024 * 1024;

type Selected = Readonly<{ entryId: string; revisionId: string }>;
type Captured = Readonly<{
  selected: readonly Selected[];
  entries: readonly RendererEntry[];
  claims: readonly RouteClaim[];
  references: readonly RendererMediaReference[];
  assets: readonly RendererMediaAsset[];
  routeGraphDigest: Digest;
  pluginDigest: Digest;
  guard: Digest;
}>;

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function validThemeIdentity(value: unknown): value is ThemeIdentity {
  return exact(value, ["id", "version", "manifestHash"]) && typeof value.id === "string" && typeof value.version === "string" && typeof value.manifestHash === "string";
}
function validProducerInput(value: unknown): value is Readonly<{ themeIdentity: ThemeIdentity }> { return exact(value, ["themeIdentity"]) && validThemeIdentity(value.themeIdentity); }
function validPreviewInput(value: unknown): value is Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }>; themeIdentity: ThemeIdentity }> {
  return exact(value, ["selection", "subject", "themeIdentity"]) && (value.selection === "current" || value.selection === "published") && exact(value.subject, ["entryId"]) && typeof value.subject.entryId === "string" && value.subject.entryId.length > 0 && validThemeIdentity(value.themeIdentity);
}
function decodeCanonical(bytes: Uint8Array, digest: Digest): JsonValue | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const canonical = canonicalJsonBytes(parsed);
    if (!canonical.ok || !equalBytes(canonical.value, bytes) || sha256Digest(bytes) !== digest) return null;
    return freeze(parsed as JsonValue);
  } catch { return null; }
}
function entry(record: RevisionRecord): RendererEntry | null {
  const content = decodeCanonical(record.contentBytes, record.contentDigest);
  return content === null ? null : Object.freeze({ entryId: record.identity.entryId, revisionId: record.identity.revisionId, schemaIdentity: Object.freeze({ ...record.schemaIdentity }), content, contentDigest: record.contentDigest });
}
function metadata(asset: ReadyAssetVersion): JsonValue | null { return decodeCanonical(asset.metadataBytes, asset.metadataDigest); }
function selectionKey(value: Selected): string { return `${value.entryId}\u0000${value.revisionId}`; }
function referenceKey(value: RendererMediaReference): string { return `${value.entryId}\u0000${value.revisionId}\u0000${value.assetVersion.assetId}\u0000${value.assetVersion.assetVersionId}`; }
function assetKey(value: AssetVersionIdentity): string { return `${value.assetId}\u0000${value.assetVersionId}`; }
function guardBody(captured: Omit<Captured, "guard">): unknown {
  return {
    contract: "projection-selection/v1",
    selected: captured.selected,
    entries: captured.entries.map((value) => ({ entryId: value.entryId, revisionId: value.revisionId, schemaIdentity: value.schemaIdentity, contentDigest: value.contentDigest })),
    claims: captured.claims.map((value) => ({ normalizedRoute: value.normalizedRoute, owner: value.owner, sourceRevisionId: value.sourceRevisionId })),
    references: captured.references,
    assets: captured.assets.map((value) => ({ identity: value.identity, objectDigest: value.objectDigest, byteLength: value.byteLength, metadataDigest: value.metadataDigest })),
    routeGraphDigest: captured.routeGraphDigest,
    pluginDigest: captured.pluginDigest,
  };
}
function externalFailure<T>(error: unknown): ProjectionResult<T> {
  if (error !== null && typeof error === "object" && "owner" in error && (error.owner === "PluginHost" || error.owner === "ThemeHost")) {
    // owner 已由 Host public seam 驗證；Projection 只保留其既有安全 failure。
    const hostError = error as PluginHostFailure | ThemeHostFailure;
    return { ok: false, error: hostError };
  }
  return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
}
function capture(input: Readonly<{ dependencies: ProjectionDependencies; mode: "current" | "published"; subject?: string }>): ProjectionResult<Captured> {
  const result = input.dependencies.persistence.runReadSnapshot((snapshot) => captureInSnapshot(input, snapshot));
  if (result.ok) return { ok: true, value: result.value };
  // PersistenceFailure 不屬於 Projection 的 public failure 聯集，只有它需要改寫成 storage failure；
  // Projection 自己的 failure 必須原樣傳出，否則 SUBJECT_NOT_FOUND 這類 caller-actionable 診斷
  // 與 subjectIds 都會被壓成無法區分的 PROJECTION_STORAGE_FAILURE。
  return result.error.owner === "Persistence" ? { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") } : { ok: false, error: result.error };
}
function captureInSnapshot(input: Readonly<{ dependencies: ProjectionDependencies; mode: "current" | "published"; subject?: string }>, snapshot: PersistenceReadSnapshot): ProjectionResult<Captured> {
  const selected: Selected[] = [];
  if (input.subject === undefined) {
    const published = snapshot.listPublishedRevisionSelections();
    if (!published.ok) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
    selected.push(...published.value.map((value) => ({ ...value })));
  } else {
    const pointers = snapshot.getEntryPointers(input.subject);
    if (!pointers.ok) return { ok: false, error: projectionFailure("SUBJECT_NOT_FOUND", [input.subject]) };
    const revisionId = input.mode === "current" ? pointers.value.currentRevisionId : pointers.value.publishedRevisionId;
    // current 模式缺少 current pointer 代表 subject 沒有可預覽的 revision，與「尚未發布」是不同診斷。
    if (revisionId === undefined) return { ok: false, error: projectionFailure(input.mode === "current" ? "SUBJECT_NOT_FOUND" : "SUBJECT_NOT_PUBLISHED", [input.subject]) };
    selected.push({ entryId: input.subject, revisionId });
  }
  selected.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId));
  if (selected.some((value, index) => index > 0 && selectionKey(value) === selectionKey(selected[index - 1]!))) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
  const entries: RendererEntry[] = [];
  const references: RendererMediaReference[] = [];
  const assets = new Map<string, RendererMediaAsset>();
  for (const identity of selected) {
    const revision = snapshot.getRevision(identity);
    if (!revision.ok) return { ok: false, error: projectionFailure("INVALID_REVISION_EVIDENCE", [identity.entryId, identity.revisionId]) };
    const value = entry(revision.value);
    if (value === null) return { ok: false, error: projectionFailure("INVALID_REVISION_EVIDENCE", [identity.entryId, identity.revisionId]) };
    entries.push(value);
    const revisionReferences = snapshot.getRevisionReferences(identity);
    if (!revisionReferences.ok) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [identity.entryId, identity.revisionId]) };
    for (const reference of revisionReferences.value) {
      const ready = snapshot.getReadyAssetVersion(reference.assetVersion);
      if (!ready.ok) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [reference.assetVersion.assetId, reference.assetVersion.assetVersionId]) };
      const valueMetadata = metadata(ready.value);
      if (valueMetadata === null) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [reference.assetVersion.assetId, reference.assetVersion.assetVersionId]) };
      const asset: RendererMediaAsset = Object.freeze({ identity: Object.freeze({ ...ready.value.identity }), objectDigest: ready.value.objectDigest, byteLength: ready.value.byteLength, metadata: valueMetadata, metadataDigest: ready.value.metadataDigest });
      const key = assetKey(asset.identity);
      const prior = assets.get(key);
      if (prior !== undefined && (prior.objectDigest !== asset.objectDigest || prior.byteLength !== asset.byteLength || prior.metadataDigest !== asset.metadataDigest)) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
      assets.set(key, asset);
      references.push(Object.freeze({ entryId: identity.entryId, revisionId: identity.revisionId, assetVersion: Object.freeze({ ...reference.assetVersion }) }));
    }
  }
  const routes = input.dependencies.siteDefinition.snapshotInReadSnapshot(input.mode, snapshot);
  if (!routes.ok) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
  const selectedByEntry = new Map(selected.map((value) => [value.entryId, value.revisionId]));
  if (input.subject === undefined) {
    if (routes.value.claims.length !== selected.length || routes.value.claims.some((claim) => selectedByEntry.get(claim.owner) !== claim.sourceRevisionId)) return { ok: false, error: projectionFailure("UNRESOLVED_ROUTE_REFERENCE") };
  } else {
    const claim = routes.value.claims.find((value) => value.owner === input.subject);
    if (claim === undefined || claim.sourceRevisionId !== selected[0]!.revisionId) return { ok: false, error: projectionFailure("UNRESOLVED_ROUTE_REFERENCE", [input.subject]) };
  }
  const activation = snapshot.readPluginActivationState();
  if (!activation.ok) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
  entries.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId));
  references.sort((left, right) => compare(referenceKey(left), referenceKey(right)));
  const sortedAssets = [...assets.values()].sort((left, right) => compare(assetKey(left.identity), assetKey(right.identity)));
  const bare = { selected: Object.freeze(selected.map((value) => Object.freeze({ ...value }))), entries: Object.freeze(entries), claims: Object.freeze(routes.value.claims.map((value) => Object.freeze({ ...value }))), references: Object.freeze(references), assets: Object.freeze(sortedAssets), routeGraphDigest: routes.value.digest, pluginDigest: activation.value.digest };
  const guardBytes = canonicalJsonBytes(guardBody(bare));
  return !guardBytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ ...bare, guard: sha256Digest(guardBytes.value) }) };
}
async function materialize(input: Readonly<{ dependencies: ProjectionDependencies; captured: Captured; themeIdentity: ThemeIdentity }>): Promise<ProjectionResult<Readonly<{ media: RendererMedia; theme: RendererTheme; identities: readonly PluginActivationIdentity[] }>>> {
  const inspected = await input.dependencies.pluginHost.inspectActiveSnapshot();
  if (!inspected.ok) return externalFailure<Readonly<{ media: RendererMedia; theme: RendererTheme; identities: readonly PluginActivationIdentity[] }>>(inspected.error);
  if (inspected.value.digest !== input.captured.pluginDigest) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
  let total = 0;
  const objects = new Map<string, Readonly<{ objectDigest: Digest; byteLength: number; bytesBase64url: string }>>();
  for (const asset of input.captured.assets) {
    if (asset.byteLength > maximumObjectBytes || total > maximumEmbeddedBytes - asset.byteLength) return { ok: false, error: projectionFailure("PROJECTION_PAYLOAD_TOO_LARGE") };
    const object = await Promise.resolve(input.dependencies.dataMedia.readReadyObject(asset.identity));
    if (!object.ok || object.value.asset.objectDigest !== asset.objectDigest || object.value.asset.byteLength !== asset.byteLength || object.value.asset.metadataDigest !== asset.metadataDigest) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
    const prior = objects.get(asset.objectDigest);
    if (prior === undefined) {
      if (sha256Digest(object.value.bytes) !== asset.objectDigest || object.value.bytes.byteLength !== asset.byteLength) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
      total += asset.byteLength;
      objects.set(asset.objectDigest, Object.freeze({ objectDigest: asset.objectDigest, byteLength: asset.byteLength, bytesBase64url: Buffer.from(object.value.bytes).toString("base64url") }));
    } else if (prior.byteLength !== asset.byteLength) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
  }
  const resolved = await input.dependencies.themeHost.resolveExact({ identity: Object.freeze({ ...input.themeIdentity }) });
  if (!resolved.ok) return externalFailure<Readonly<{ media: RendererMedia; theme: RendererTheme; identities: readonly PluginActivationIdentity[] }>>(resolved.error);
  const files: RendererThemeFile[] = [];
  for (const [role, file] of [["runtime", resolved.value.manifest.runtime], ...resolved.value.manifest.resources.map((value) => ["resource", value] as const)] as const) {
    const bytes = await input.dependencies.themeHost.readVerifiedFile({ identity: resolved.value.identity, file: file.file });
    if (!bytes.ok) return externalFailure<Readonly<{ media: RendererMedia; theme: RendererTheme; identities: readonly PluginActivationIdentity[] }>>(bytes.error);
    if (total > maximumEmbeddedBytes - bytes.value.byteLength || sha256Digest(bytes.value) !== file.digest) return { ok: false, error: projectionFailure(total > maximumEmbeddedBytes - bytes.value.byteLength ? "PROJECTION_PAYLOAD_TOO_LARGE" : "PROJECTION_STATE_CHANGED") };
    total += bytes.value.byteLength;
    files.push(Object.freeze({ role, file: file.file, digest: file.digest, bytesBase64url: Buffer.from(bytes.value).toString("base64url") }));
  }
  const media: RendererMedia = Object.freeze({ contract: "renderer-media/v1", references: input.captured.references, assets: input.captured.assets, objects: Object.freeze([...objects.values()].sort((left, right) => compare(left.objectDigest, right.objectDigest))) });
  const theme: RendererTheme = Object.freeze({ identity: Object.freeze({ ...resolved.value.identity }), manifest: freeze(resolved.value.manifest), files: Object.freeze(files) });
  return { ok: true, value: Object.freeze({ media, theme, identities: Object.freeze(inspected.value.identities.map((value) => Object.freeze({ ...value }))) }) };
}
function rendererArtifact(input: Omit<RendererInput, "inputDigest">): ProjectionResult<RendererInputArtifact> {
  const unsigned = canonicalJsonBytes(input);
  if (!unsigned.ok) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
  const value: RendererInput = Object.freeze({ ...input, inputDigest: sha256Digest(unsigned.value) });
  const bytes = canonicalJsonBytes(value);
  return !bytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ bytes: copyBytes(bytes.value), inputDigest: value.inputDigest, bytesDigest: sha256Digest(bytes.value) }) };
}
function previewArtifact(input: Omit<PreviewInput, "previewDigest">): ProjectionResult<PreviewInputArtifact> {
  const unsigned = canonicalJsonBytes(input);
  if (!unsigned.ok) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
  const value: PreviewInput = Object.freeze({ ...input, previewDigest: sha256Digest(unsigned.value) });
  const bytes = canonicalJsonBytes(value);
  return !bytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ bytes: copyBytes(bytes.value), previewDigest: value.previewDigest, bytesDigest: sha256Digest(bytes.value) }) };
}

// read snapshot A -> materialize exact external bytes -> read snapshot B -> encode
export function createProjectionPreview(dependencies: ProjectionDependencies): ProjectionPreview {
  return Object.freeze({
    async produceRendererInput(input: Readonly<{ themeIdentity: ThemeIdentity }>): Promise<ProjectionResult<RendererInputArtifact>> {
      if (!validProducerInput(input)) return { ok: false, error: projectionFailure("INVALID_PROJECTION_INPUT") };
      const themeIdentity = Object.freeze({ ...input.themeIdentity });
      const first = capture({ dependencies, mode: "published" });
      if (!first.ok) return first;
      const materialized = await materialize({ dependencies, captured: first.value, themeIdentity });
      if (!materialized.ok) return materialized;
      const inspected = await dependencies.pluginHost.inspectActiveSnapshot();
      if (!inspected.ok) return externalFailure<RendererInputArtifact>(inspected.error);
      if (inspected.value.digest !== first.value.pluginDigest) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const second = capture({ dependencies, mode: "published" });
      if (!second.ok) return second;
      if (second.value.guard !== first.value.guard) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const digest = mediaSelectionDigest(materialized.value.media);
      if (digest === null) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      // routeGraphDigest 取自 snapshot A 的同一次 route 讀取；另外再讀一次 route graph 會落在 guard 之外，
      // 讓 artifact 內的 claims 與 digest 可能來自兩個不同的 canonical state。
      return rendererArtifact({ contract: "renderer-input/v1", selection: Object.freeze({ publishedRevisionIds: first.value.selected, routeGraphDigest: first.value.routeGraphDigest, mediaSelectionDigest: digest }), entries: first.value.entries, routes: Object.freeze({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: first.value.claims.map(({ normalizedRoute, owner, sourceRevisionId }) => Object.freeze({ normalizedRoute, owner, sourceRevisionId })) }), media: materialized.value.media, theme: materialized.value.theme, plugins: Object.freeze({ activeStateDigest: first.value.pluginDigest, identities: materialized.value.identities }) });
    },
    async preview(input: Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }>; themeIdentity: ThemeIdentity }>): Promise<ProjectionResult<PreviewInputArtifact>> {
      if (!validPreviewInput(input)) return { ok: false, error: projectionFailure("INVALID_PROJECTION_INPUT") };
      const themeIdentity = Object.freeze({ ...input.themeIdentity });
      const first = capture({ dependencies, mode: input.selection, subject: input.subject.entryId });
      if (!first.ok) return first;
      const materialized = await materialize({ dependencies, captured: first.value, themeIdentity });
      if (!materialized.ok) return materialized;
      const inspected = await dependencies.pluginHost.inspectActiveSnapshot();
      if (!inspected.ok) return externalFailure<PreviewInputArtifact>(inspected.error);
      const second = capture({ dependencies, mode: input.selection, subject: input.subject.entryId });
      if (!second.ok || inspected.value.digest !== first.value.pluginDigest || second.value.guard !== first.value.guard) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const route = first.value.claims.find((value) => value.owner === input.subject.entryId);
      const digest = mediaSelectionDigest(materialized.value.media);
      if (route === undefined || digest === null) return { ok: false, error: projectionFailure(route === undefined ? "UNRESOLVED_ROUTE_REFERENCE" : "PROJECTION_ENCODING_FAILED") };
      const routeSelection = routeSelectionDigest(input.selection, route);
      if (routeSelection === null) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      return previewArtifact({ contract: "preview-input/v1", subject: Object.freeze({ entryId: input.subject.entryId }), selection: Object.freeze({ mode: input.selection, selectedRevision: first.value.selected[0]!, routeSelectionDigest: routeSelection, mediaSelectionDigest: digest }), entry: first.value.entries[0]!, route: Object.freeze({ normalizedRoute: route.normalizedRoute, owner: route.owner, sourceRevisionId: route.sourceRevisionId }), media: materialized.value.media, theme: materialized.value.theme, plugins: Object.freeze({ activeStateDigest: first.value.pluginDigest, identities: materialized.value.identities }) });
    },
  });
}
