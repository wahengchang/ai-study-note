import { canonicalJsonBytes, copyBytes, sha256Digest, type JsonValue } from "../foundation/index.js";

import type { CreateProjectionInput, Projection, ProjectionFailure, ProjectionResult, RendererInputArtifact, RendererInputV1 } from "./contracts.js";

function failure(code: ProjectionFailure["code"], subjectIds: readonly string[] = []): Readonly<{ ok: false; error: ProjectionFailure }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, owner: "Projection", subjectIds: Object.freeze([...subjectIds]), remediation: Object.freeze({ kind: "message", message: "Published projection 無法建立 renderer input。" }) }) });
}
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function json(bytes: Uint8Array): JsonValue | null {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as JsonValue;
    const canonical = canonicalJsonBytes(value);
    return !canonical.ok || canonical.value.byteLength !== bytes.byteLength || canonical.value.some((item, index) => item !== bytes[index]) ? null : value;
  } catch { return null; }
}
function base64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }

class Producer implements Projection {
  public constructor(private readonly input: CreateProjectionInput) {}

  public async producePublishedRendererInput(): Promise<ProjectionResult<RendererInputArtifact>> {
    const routes = this.input.siteDefinition.snapshot("published");
    if (!routes.ok) return failure("PUBLISHED_SELECTION_UNRESOLVED");
    const theme = await this.input.themeHost.resolveActiveRendererSource();
    const plugins = await this.input.pluginHost.resolveActivePublicRenderers();
    if (!theme.ok || !plugins.ok) return failure("PUBLISHED_SELECTION_UNRESOLVED");
    const entries: RendererInputV1["entries"][number][] = [];
    const selectedRoutes: RendererInputV1["routes"][number][] = [];
    const media: RendererInputV1["media"][number][] = [];
    for (const claim of routes.value.claims) {
      const pointer = this.input.persistence.getEntryPointers(claim.owner);
      if (!pointer.ok || pointer.value.publishedRevisionId !== claim.sourceRevisionId) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      const revision = this.input.persistence.getRevision({ entryId: claim.owner, revisionId: claim.sourceRevisionId });
      if (!revision.ok || revision.value.contentDigest !== sha256Digest(revision.value.contentBytes)) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      const content = json(revision.value.contentBytes);
      if (content === null) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      entries.push(Object.freeze({ entryId: claim.owner, revisionId: claim.sourceRevisionId, content, contentDigest: revision.value.contentDigest }));
      selectedRoutes.push(Object.freeze({ route: claim.normalizedRoute, entryId: claim.owner, revisionId: claim.sourceRevisionId }));
      const selection = this.input.dataMedia.resolvePublishedSelection(claim.owner);
      if (!selection.ok || selection.value.revisionId !== claim.sourceRevisionId) return failure("PUBLISHED_SELECTION_UNRESOLVED", [claim.owner]);
      for (const asset of selection.value.assets) media.push(Object.freeze({ entryId: claim.owner, revisionId: claim.sourceRevisionId, assetId: asset.identity.assetId, assetVersionId: asset.identity.assetVersionId, objectDigest: asset.objectDigest, byteLength: asset.byteLength, metadataDigest: asset.metadataDigest, publicPath: `/media/${asset.objectDigest}` }));
    }
    entries.sort((left, right) => compare(left.entryId, right.entryId) || compare(left.revisionId, right.revisionId));
    selectedRoutes.sort((left, right) => compare(left.route, right.route));
    media.sort((left, right) => compare(left.assetId, right.assetId) || compare(left.assetVersionId, right.assetVersionId) || compare(left.entryId, right.entryId));
    const routeAfter = this.input.siteDefinition.snapshot("published");
    const themeAfter = await this.input.themeHost.getActiveSnapshot();
    const pluginsAfter = await this.input.pluginHost.getActiveSnapshot();
    const mediaBytes = canonicalJsonBytes(media);
    if (!mediaBytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    if (!routeAfter.ok || !themeAfter.ok || !pluginsAfter.ok || routeAfter.value.digest !== routes.value.digest || themeAfter.value.digest !== theme.value.activeStateDigest || pluginsAfter.value.digest !== (plugins.value[0]?.activeStateDigest ?? pluginsAfter.value.digest)) return failure("PUBLISHED_SELECTION_STALE");
    const selection = Object.freeze({ publishedRevisionIds: Object.freeze(entries.map((entry) => Object.freeze({ entryId: entry.entryId, revisionId: entry.revisionId }))), routeGraphDigest: routes.value.digest, mediaSelectionDigest: sha256Digest(mediaBytes.value) });
    const payload = Object.freeze({
      contract: "renderer-input/v1" as const,
      selection,
      entries: Object.freeze(entries),
      routes: Object.freeze(selectedRoutes),
      media: Object.freeze(media),
      theme: Object.freeze({
        identity: theme.value.identity,
        entrySourceBase64: base64(theme.value.entryBytes),
        entryDigest: theme.value.entryDigest,
        resources: Object.freeze(theme.value.resources.map((resource) => Object.freeze({ file: resource.file, bytesBase64: base64(resource.bytes), digest: resource.digest }))),
      }),
      plugins: Object.freeze(plugins.value.map((plugin) => Object.freeze({
        identity: plugin.identity,
        entrySourceBase64: base64(plugin.entryBytes),
        entryDigest: sha256Digest(plugin.entryBytes),
        resources: Object.freeze(plugin.resources.map((resource) => Object.freeze({ file: resource.file, bytesBase64: base64(resource.bytes), digest: resource.digest }))),
        callbacks: Object.freeze(plugin.callbacks.map((callback) => Object.freeze({ ...callback }))),
      }))),
    });
    const payloadBytes = canonicalJsonBytes(payload);
    if (!payloadBytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    const input: RendererInputV1 = Object.freeze({ ...payload, inputDigest: sha256Digest(payloadBytes.value) });
    const bytes = canonicalJsonBytes(input);
    if (!bytes.ok) return failure("PROJECTION_CANONICALIZATION_FAILED");
    return Object.freeze({ ok: true, value: Object.freeze({ contract: "renderer-input-artifact/v1", bytes: copyBytes(bytes.value), inputDigest: input.inputDigest }) });
  }
}

export function createProjection(input: CreateProjectionInput): ProjectionResult<Projection> {
  if (input === null || typeof input !== "object" || input.persistence === null || input.siteDefinition === null || input.dataMedia === null || input.themeHost === null || input.pluginHost === null) return failure("INVALID_PROJECTION_INPUT");
  return Object.freeze({ ok: true, value: new Producer(input) });
}
