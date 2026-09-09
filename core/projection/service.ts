import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { AssetVersionIdentity, ReadyAssetVersion } from "../media/index.js";
import type { PersistenceReadSnapshot, RevisionRecord } from "../persistence/index.js";
import type { ActivePluginSnapshot, PluginHostFailure, PublicBuildSnapshot, PublicSeoSnapshot } from "../plugin-host/index.js";
import type { RouteClaim } from "../site-definition/index.js";
import type { ThemeHostFailure } from "../theme-host/index.js";

import { equalBytes, exact, freeze, mediaSelectionDigest, routeSelectionDigest } from "./canonical.js";
import type { PreviewInput, PreviewInputArtifact, ProjectionDependencies, ProjectionPreview, ProjectionResult, PublishedProjectionResult, RendererEntry, RendererInput, RendererInputArtifact, RendererMedia, RendererMediaAsset, RendererMediaReference, RendererPluginRenderer, RendererSeo, RendererSeoPage, RendererTheme, RendererThemeFile } from "./contracts.js";
import { projectionFailure } from "./failures.js";

const maximumObjectBytes = 64 * 1024 * 1024;
const maximumEmbeddedBytes = 256 * 1024 * 1024;
type Selected = Readonly<{ entryId: string; revisionId: string }>;
type Captured = Readonly<{ selected: readonly Selected[]; entries: readonly RendererEntry[]; claims: readonly RouteClaim[]; references: readonly RendererMediaReference[]; assets: readonly RendererMediaAsset[]; routeGraphDigest: Digest; guard: Digest }>;
type Materialized = Readonly<{ media: RendererMedia; theme: RendererTheme; renderers: readonly RendererPluginRenderer[] }>;

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function validProducerInput(value: unknown): value is Record<string, never> { return exact(value, []); }
function validPreviewInput(value: unknown): value is Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }> }> { return exact(value, ["selection", "subject"]) && (value.selection === "current" || value.selection === "published") && exact(value.subject, ["entryId"]) && typeof value.subject.entryId === "string" && value.subject.entryId.length > 0; }
function decodeCanonical(bytes: Uint8Array, digest: Digest): JsonValue | null {
  try { const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); const canonical = canonicalJsonBytes(parsed); return !canonical.ok || !equalBytes(canonical.value, bytes) || sha256Digest(bytes) !== digest ? null : freeze(parsed as JsonValue); } catch { return null; }
}
function entry(record: RevisionRecord, dependencies: ProjectionDependencies): ProjectionResult<RendererEntry> {
  const content = dependencies.contentReadModel.read({ schemaIdentity: record.schemaIdentity, contentBytes: record.contentBytes, contentDigest: record.contentDigest });
  if (!content.ok) return { ok: false, error: content.error };
  return { ok: true, value: Object.freeze({ entryId: record.identity.entryId, revisionId: record.identity.revisionId, schemaIdentity: Object.freeze({ ...record.schemaIdentity }), content: content.value.content, contentDigest: content.value.digest }) };
}
function metadata(asset: ReadyAssetVersion): JsonValue | null { return decodeCanonical(asset.metadataBytes, asset.metadataDigest); }
function selectionKey(value: Selected): string { return `${value.entryId}\u0000${value.revisionId}`; }
function referenceKey(value: RendererMediaReference): string { return `${value.entryId}\u0000${value.revisionId}\u0000${value.assetVersion.assetId}\u0000${value.assetVersion.assetVersionId}`; }
function assetKey(value: AssetVersionIdentity): string { return `${value.assetId}\u0000${value.assetVersionId}`; }
function guardBody(captured: Omit<Captured, "guard">): unknown { return { contract: "projection-selection/v1", selected: captured.selected, entries: captured.entries.map((value) => ({ entryId: value.entryId, revisionId: value.revisionId, schemaIdentity: value.schemaIdentity, contentDigest: value.contentDigest })), claims: captured.claims.map((value) => ({ normalizedRoute: value.normalizedRoute, owner: value.owner, sourceRevisionId: value.sourceRevisionId })), references: captured.references, assets: captured.assets.map((value) => ({ identity: value.identity, objectDigest: value.objectDigest, byteLength: value.byteLength, metadataDigest: value.metadataDigest })), routeGraphDigest: captured.routeGraphDigest }; }
function externalFailure<T>(error: unknown): ProjectionResult<T> {
  if (error !== null && typeof error === "object" && "owner" in error && (error.owner === "PluginHost" || error.owner === "ThemeHost")) return { ok: false, error: error as PluginHostFailure | ThemeHostFailure };
  return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
}
function capture(input: Readonly<{ dependencies: ProjectionDependencies; mode: "current" | "published"; subject?: string }>): ProjectionResult<Captured> {
  const result = input.dependencies.persistence.runReadSnapshot((snapshot) => captureInSnapshot(input, snapshot));
  return result.ok ? { ok: true, value: result.value } : result.error.owner === "Persistence" ? { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") } : { ok: false, error: result.error };
}
function captureInSnapshot(input: Readonly<{ dependencies: ProjectionDependencies; mode: "current" | "published"; subject?: string }>, snapshot: PersistenceReadSnapshot): ProjectionResult<Captured> {
  const selected: Selected[] = [];
  if (input.subject === undefined) { const published = snapshot.listPublishedRevisionSelections(); if (!published.ok) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") }; selected.push(...published.value.map((value) => ({ ...value }))); }
  else {
    const pointers = snapshot.getEntryPointers(input.subject);
    if (!pointers.ok) return { ok: false, error: projectionFailure("SUBJECT_NOT_FOUND", [input.subject]) };
    const revisionId = input.mode === "current" ? pointers.value.currentRevisionId : pointers.value.publishedRevisionId;
    if (revisionId === undefined) return { ok: false, error: projectionFailure(input.mode === "current" ? "SUBJECT_NOT_FOUND" : "SUBJECT_NOT_PUBLISHED", [input.subject]) };
    selected.push({ entryId: input.subject, revisionId });
  }
  selected.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId));
  if (selected.some((value, index) => index > 0 && selectionKey(value) === selectionKey(selected[index - 1]!))) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
  const entries: RendererEntry[] = []; const references: RendererMediaReference[] = []; const assets = new Map<string, RendererMediaAsset>();
  for (const identity of selected) {
    const revision = snapshot.getRevision(identity); if (!revision.ok) return { ok: false, error: projectionFailure("INVALID_REVISION_EVIDENCE", [identity.entryId, identity.revisionId]) };
    const value = entry(revision.value, input.dependencies); if (!value.ok) return value; entries.push(value.value);
    const revisionReferences = snapshot.getRevisionReferences(identity); if (!revisionReferences.ok) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [identity.entryId, identity.revisionId]) };
    for (const reference of revisionReferences.value) {
      const ready = snapshot.getReadyAssetVersion(reference.assetVersion); if (!ready.ok) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [reference.assetVersion.assetId, reference.assetVersion.assetVersionId]) };
      const valueMetadata = metadata(ready.value); if (valueMetadata === null) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [reference.assetVersion.assetId, reference.assetVersion.assetVersionId]) };
      const asset: RendererMediaAsset = Object.freeze({ identity: Object.freeze({ ...ready.value.identity }), objectDigest: ready.value.objectDigest, byteLength: ready.value.byteLength, metadata: valueMetadata, metadataDigest: ready.value.metadataDigest });
      const key = assetKey(asset.identity); const prior = assets.get(key); if (prior !== undefined && (prior.objectDigest !== asset.objectDigest || prior.byteLength !== asset.byteLength || prior.metadataDigest !== asset.metadataDigest)) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
      assets.set(key, asset); references.push(Object.freeze({ entryId: identity.entryId, revisionId: identity.revisionId, assetVersion: Object.freeze({ ...reference.assetVersion }) }));
    }
  }
  const routes = input.dependencies.siteDefinition.snapshotInReadSnapshot(input.mode, snapshot); if (!routes.ok) return { ok: false, error: projectionFailure("PROJECTION_STORAGE_FAILURE") };
  const selectedByEntry = new Map(selected.map((value) => [value.entryId, value.revisionId]));
  if (input.subject === undefined) { if (routes.value.claims.length !== selected.length || routes.value.claims.some((claim) => selectedByEntry.get(claim.owner) !== claim.sourceRevisionId)) return { ok: false, error: projectionFailure("UNRESOLVED_ROUTE_REFERENCE") }; }
  else { const claim = routes.value.claims.find((value) => value.owner === input.subject); if (claim === undefined || claim.sourceRevisionId !== selected[0]!.revisionId) return { ok: false, error: projectionFailure("UNRESOLVED_ROUTE_REFERENCE", [input.subject]) }; }
  entries.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId)); references.sort((left, right) => compare(referenceKey(left), referenceKey(right)));
  const bare = { selected: Object.freeze(selected.map((value) => Object.freeze({ ...value }))), entries: Object.freeze(entries), claims: Object.freeze(routes.value.claims.map((value) => Object.freeze({ ...value }))), references: Object.freeze(references), assets: Object.freeze([...assets.values()].sort((left, right) => compare(assetKey(left.identity), assetKey(right.identity)))), routeGraphDigest: routes.value.digest };
  const bytes = canonicalJsonBytes(guardBody(bare)); return !bytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ ...bare, guard: sha256Digest(bytes.value) }) };
}
function published(captured: Captured): JsonValue {
  const routeByOwner = new Map(captured.claims.map((route) => [`${route.owner}\u0000${route.sourceRevisionId}`, route.normalizedRoute]));
  return freeze({ contract: "published-projection/v1", entries: captured.entries.map((entry) => ({ entryId: entry.entryId, revisionId: entry.revisionId, schemaIdentity: entry.schemaIdentity, route: routeByOwner.get(`${entry.entryId}\u0000${entry.revisionId}`), content: entry.content })) } as JsonValue);
}
function sameJson(left: JsonValue, right: JsonValue): boolean { const a = canonicalJsonBytes(left); const b = canonicalJsonBytes(right); return a.ok && b.ok && equalBytes(a.value, b.value); }
function seoText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && !/[\r\n\0]/u.test(value); }
function publicSeo(snapshot: PublicSeoSnapshot, dependencies: ProjectionDependencies): ProjectionResult<RendererSeo> {
  if (snapshot.status === "omitted") return { ok: true, value: Object.freeze({ status: "omitted", pages: Object.freeze([]), omissionDigest: snapshot.omissionDigest }) };
  let publicSiteUrl: string | undefined;
  if (snapshot.site.length > 1) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
  if (snapshot.site.length === 1) {
    const contribution = snapshot.site[0]!.contribution.contribution;
    if (!exact(contribution, ["publicSiteUrl"]) || !seoText(contribution.publicSiteUrl)) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
    publicSiteUrl = contribution.publicSiteUrl;
  }
  const pages: RendererSeoPage[] = [];
  for (const item of snapshot.page) {
    const contribution = item.contribution.contribution;
    if (!exact(contribution, ["pages"]) || !Array.isArray(contribution.pages)) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
    for (const candidate of contribution.pages) {
      if (!exact(candidate, ["route"], ["title", "description", "canonicalPath", "jsonLd"]) || !seoText(candidate.route)) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      const title = Object.hasOwn(candidate, "title") ? candidate.title : undefined;
      const description = Object.hasOwn(candidate, "description") ? candidate.description : undefined;
      const canonicalPath = Object.hasOwn(candidate, "canonicalPath") ? candidate.canonicalPath : candidate.route;
      const jsonLd = Object.hasOwn(candidate, "jsonLd") ? candidate.jsonLd : undefined;
      if ((title !== undefined && !seoText(title)) || (description !== undefined && !seoText(description)) || !seoText(canonicalPath) || (jsonLd !== undefined && !canonicalJsonBytes(jsonLd as JsonValue).ok) || publicSiteUrl === undefined) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      const canonical = dependencies.siteDefinition.resolvePublicRouteUrl({ publicSiteUrl, normalizedRoute: canonicalPath });
      if (!canonical.ok) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      pages.push(Object.freeze({ route: candidate.route, ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }), canonicalUrl: canonical.value, ...(jsonLd === undefined ? {} : { jsonLd: jsonLd as JsonValue }) }));
    }
  }
  pages.sort((left, right) => compare(left.route, right.route));
  return { ok: true, value: Object.freeze({ status: "available", pages: Object.freeze(pages), ...(publicSiteUrl === undefined ? {} : { publicSiteUrl }), omissionDigest: snapshot.omissionDigest }) };
}
async function materialize(input: Readonly<{ dependencies: ProjectionDependencies; captured: Captured; snapshot: PublicBuildSnapshot }>): Promise<ProjectionResult<Materialized>> {
  let total = 0; const objects = new Map<string, Readonly<{ objectDigest: Digest; byteLength: number; bytesBase64url: string }>>();
  for (const asset of input.captured.assets) {
    if (asset.byteLength > maximumObjectBytes || total > maximumEmbeddedBytes - asset.byteLength) return { ok: false, error: projectionFailure("PROJECTION_PAYLOAD_TOO_LARGE") };
    const object = await Promise.resolve(input.dependencies.dataMedia.readReadyObject(asset.identity));
    if (!object.ok || object.value.asset.objectDigest !== asset.objectDigest || object.value.asset.byteLength !== asset.byteLength || object.value.asset.metadataDigest !== asset.metadataDigest || sha256Digest(object.value.bytes) !== asset.objectDigest || object.value.bytes.byteLength !== asset.byteLength) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
    total += asset.byteLength; const prior = objects.get(asset.objectDigest); if (prior === undefined) objects.set(asset.objectDigest, Object.freeze({ objectDigest: asset.objectDigest, byteLength: asset.byteLength, bytesBase64url: Buffer.from(object.value.bytes).toString("base64url") })); else if (prior.byteLength !== asset.byteLength) return { ok: false, error: projectionFailure("UNRESOLVED_MEDIA_REFERENCE", [asset.identity.assetId, asset.identity.assetVersionId]) };
  }
  const resolved = await input.dependencies.themeHost.resolveActive(); if (!resolved.ok) return externalFailure(resolved.error);
  const files: RendererThemeFile[] = [];
  for (const [role, file] of [["runtime", resolved.value.theme.manifest.runtime], ...resolved.value.theme.manifest.resources.map((value) => ["resource", value] as const)] as const) {
    const bytes = await input.dependencies.themeHost.readVerifiedFile({ identity: resolved.value.identity, file: file.file });
    if (!bytes.ok || sha256Digest(bytes.value) !== file.digest || total > maximumEmbeddedBytes - bytes.value.byteLength) return !bytes.ok ? externalFailure(bytes.error) : { ok: false, error: projectionFailure("PROJECTION_PAYLOAD_TOO_LARGE") };
    total += bytes.value.byteLength; files.push(Object.freeze({ role, file: file.file, digest: file.digest, bytesBase64url: Buffer.from(bytes.value).toString("base64url") }));
  }
  const renderers: RendererPluginRenderer[] = [];
  for (const renderer of input.snapshot.renderers) {
    if (sha256Digest(renderer.entryBytes) !== renderer.entryDigest || total > maximumEmbeddedBytes - renderer.entryBytes.byteLength) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
    total += renderer.entryBytes.byteLength; const resources = [];
    for (const resource of renderer.resources) { if (sha256Digest(resource.bytes) !== resource.digest || total > maximumEmbeddedBytes - resource.bytes.byteLength) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") }; total += resource.bytes.byteLength; resources.push(Object.freeze({ file: resource.file, digest: resource.digest, bytesBase64url: Buffer.from(resource.bytes).toString("base64url") })); }
    renderers.push(Object.freeze({ identity: Object.freeze({ ...renderer.identity, capabilities: Object.freeze([...renderer.identity.capabilities]) }), manifest: freeze(renderer.manifest), entryBytesBase64url: Buffer.from(renderer.entryBytes).toString("base64url"), entryDigest: renderer.entryDigest, resources: Object.freeze(resources), callbacks: Object.freeze(renderer.callbacks.map((callback) => Object.freeze({ ...callback }))) }));
  }
  const media: RendererMedia = Object.freeze({ contract: "renderer-media/v1", references: input.captured.references, assets: input.captured.assets, objects: Object.freeze([...objects.values()].sort((left, right) => compare(left.objectDigest, right.objectDigest))) });
  const theme: RendererTheme = Object.freeze({ identity: Object.freeze({ ...resolved.value.identity }), manifest: freeze(resolved.value.theme.manifest), files: Object.freeze(files), activationStateDigest: resolved.value.activationStateDigest });
  return { ok: true, value: Object.freeze({ media, theme, renderers: Object.freeze(renderers) }) };
}
function rendererArtifact(input: Omit<RendererInput, "inputDigest">): ProjectionResult<RendererInputArtifact> { const unsigned = canonicalJsonBytes(input); if (!unsigned.ok) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") }; const value: RendererInput = Object.freeze({ ...input, inputDigest: sha256Digest(unsigned.value) }); const bytes = canonicalJsonBytes(value); return !bytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ bytes: copyBytes(bytes.value), inputDigest: value.inputDigest, bytesDigest: sha256Digest(bytes.value) }) }; }
function previewArtifact(input: Omit<PreviewInput, "previewDigest">): ProjectionResult<PreviewInputArtifact> { const unsigned = canonicalJsonBytes(input); if (!unsigned.ok) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") }; const value: PreviewInput = Object.freeze({ ...input, previewDigest: sha256Digest(unsigned.value) }); const bytes = canonicalJsonBytes(value); return !bytes.ok ? { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") } : { ok: true, value: Object.freeze({ bytes: copyBytes(bytes.value), previewDigest: value.previewDigest, bytesDigest: sha256Digest(bytes.value) }) }; }
function previewPlugins(snapshot: ActivePluginSnapshot): PreviewInput["plugins"] { return Object.freeze({ activationStateDigest: snapshot.digest, identities: snapshot.identities, renderers: Object.freeze([]), seo: Object.freeze({ status: "omitted", pages: Object.freeze([]), omissionDigest: sha256Digest(new Uint8Array()) }) }); }

export function createProjectionPreview(dependencies: ProjectionDependencies): ProjectionPreview {
  return Object.freeze({
    async produceRendererInput(input: Record<string, never>): Promise<ProjectionResult<PublishedProjectionResult>> {
      if (!validProducerInput(input)) return { ok: false, error: projectionFailure("INVALID_PROJECTION_INPUT") };
      const first = capture({ dependencies, mode: "published" }); if (!first.ok) return first;
      const requestPublished = published(first.value);
      const prepared = await dependencies.pluginHost.resolvePublicBuildSnapshot(Object.freeze({ contract: "public-plugin-build-request/v1", published: requestPublished })); if (!prepared.ok) return externalFailure(prepared.error);
      if (!sameJson(prepared.value.snapshot.published, requestPublished)) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const materialized = await materialize({ dependencies, captured: first.value, snapshot: prepared.value.snapshot }); if (!materialized.ok) return materialized;
      const validated = await dependencies.pluginHost.validatePublicBuildSnapshot(prepared.value); if (!validated.ok) return externalFailure(validated.error);
      if (!sameJson(validated.value.published, requestPublished)) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const second = capture({ dependencies, mode: "published" }); if (!second.ok || second.value.guard !== first.value.guard) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const activeTheme = await dependencies.themeHost.resolveActive(); if (!activeTheme.ok) return externalFailure(activeTheme.error);
      if (activeTheme.value.activationStateDigest !== materialized.value.theme.activationStateDigest || activeTheme.value.identity.id !== materialized.value.theme.identity.id || activeTheme.value.identity.version !== materialized.value.theme.identity.version || activeTheme.value.identity.manifestHash !== materialized.value.theme.identity.manifestHash) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const digest = mediaSelectionDigest(materialized.value.media); if (digest === null) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      const resolvedSeo = publicSeo(validated.value.seo, dependencies); if (!resolvedSeo.ok) return resolvedSeo;
      const artifact = rendererArtifact({ contract: "renderer-input/v1", selection: Object.freeze({ publishedRevisionIds: first.value.selected, routeGraphDigest: first.value.routeGraphDigest, mediaSelectionDigest: digest }), entries: first.value.entries, routes: Object.freeze({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "published", claims: first.value.claims.map(({ normalizedRoute, owner, sourceRevisionId }) => Object.freeze({ normalizedRoute, owner, sourceRevisionId })) }), media: materialized.value.media, theme: materialized.value.theme, plugins: Object.freeze({ activationStateDigest: validated.value.activationStateDigest, settingsStateDigest: validated.value.settingsStateDigest, identities: Object.freeze(validated.value.renderers.map((renderer) => Object.freeze({ ...renderer.identity, capabilities: Object.freeze([...renderer.identity.capabilities]) }))), renderers: materialized.value.renderers, seo: resolvedSeo.value }) });
      if (!artifact.ok) return artifact;
      return { ok: true, value: Object.freeze({ artifact: artifact.value, diagnostics: validated.value.seo.status === "omitted" ? validated.value.seo.omissions : Object.freeze([]) }) };
    },
    async preview(input: Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }> }>): Promise<ProjectionResult<PreviewInputArtifact>> {
      if (!validPreviewInput(input)) return { ok: false, error: projectionFailure("INVALID_PROJECTION_INPUT") };
      const first = capture({ dependencies, mode: input.selection, subject: input.subject.entryId }); if (!first.ok) return first;
      const snapshot = await dependencies.pluginHost.getActiveSnapshot(); if (!snapshot.ok) return externalFailure(snapshot.error);
      const theme = await dependencies.themeHost.resolveActive(); if (!theme.ok) return externalFailure(theme.error);
      const materialized = await materialize({ dependencies, captured: first.value, snapshot: Object.freeze({ contract: "prepared-public-build-snapshot/v1", activationStateDigest: snapshot.value.digest, settingsStateDigest: sha256Digest(new Uint8Array()), published: freeze({}) as JsonValue, renderers: Object.freeze([]), seo: Object.freeze({ status: "omitted", page: Object.freeze([]), site: Object.freeze([]), omissions: Object.freeze([]), omissionDigest: sha256Digest(new Uint8Array()) }) }) }); if (!materialized.ok) return materialized;
      const second = capture({ dependencies, mode: input.selection, subject: input.subject.entryId }); if (!second.ok || second.value.guard !== first.value.guard) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const afterTheme = await dependencies.themeHost.resolveActive(); if (!afterTheme.ok || afterTheme.value.activationStateDigest !== theme.value.activationStateDigest) return { ok: false, error: projectionFailure("PROJECTION_STATE_CHANGED") };
      const route = first.value.claims.find((value) => value.owner === input.subject.entryId); const digest = mediaSelectionDigest(materialized.value.media); if (route === undefined || digest === null) return { ok: false, error: projectionFailure(route === undefined ? "UNRESOLVED_ROUTE_REFERENCE" : "PROJECTION_ENCODING_FAILED") };
      const routeSelection = routeSelectionDigest(input.selection, route); if (routeSelection === null) return { ok: false, error: projectionFailure("PROJECTION_ENCODING_FAILED") };
      return previewArtifact({ contract: "preview-input/v1", subject: Object.freeze({ entryId: input.subject.entryId }), selection: Object.freeze({ mode: input.selection, selectedRevision: first.value.selected[0]!, routeSelectionDigest: routeSelection, mediaSelectionDigest: digest }), entry: first.value.entries[0]!, route: Object.freeze({ normalizedRoute: route.normalizedRoute, owner: route.owner, sourceRevisionId: route.sourceRevisionId }), media: materialized.value.media, theme: materialized.value.theme, plugins: previewPlugins(snapshot.value) });
    },
  });
}
