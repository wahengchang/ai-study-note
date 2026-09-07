import type { CoreResult, Digest, MessageRemediation } from "../foundation/index.js";
import type { PublishedContentReadModel, StructuredContent } from "../content/index.js";
import type { DataMedia } from "../media/index.js";
import type { PersistenceStore } from "../persistence/index.js";
import type { PluginHost } from "../plugin-host/index.js";
import type { SiteDefinition } from "../site-definition/index.js";
import type { ThemeHost } from "../theme-host/index.js";

export type RendererInputV1 = Readonly<{
  contract: "renderer-input/v1";
  inputDigest: Digest;
  selection: Readonly<{ publishedRevisionIds: readonly Readonly<{ entryId: string; revisionId: string }>[]; routeGraphDigest: Digest; mediaSelectionDigest: Digest }>;
  entries: readonly Readonly<{ entryId: string; revisionId: string; content: StructuredContent; contentDigest: Digest }>[];
  routes: readonly Readonly<{ route: string; entryId: string; revisionId: string }>[];
  media: readonly Readonly<{ entryId: string; revisionId: string; assetId: string; assetVersionId: string; objectDigest: Digest; byteLength: number; metadataDigest: Digest; publicPath: string }>[];
  theme: Readonly<{ identity: Readonly<{ id: string; version: string; rendererContract: "theme-renderer/v1"; manifestHash: Digest }>; entrySourceBase64: string; entryDigest: Digest; resources: readonly Readonly<{ file: string; bytesBase64: string; digest: Digest }>[] }>;
  plugins: readonly Readonly<{ identity: Readonly<{ id: string; version: string; hookContract: "plugin-hooks/v1"; manifestHash: Digest }>; entrySourceBase64: string; entryDigest: Digest; resources: readonly Readonly<{ file: string; bytesBase64: string; digest: Digest }>[]; callbacks: readonly Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }>[] }>[];
}>;
export type RendererInputArtifact = Readonly<{ contract: "renderer-input-artifact/v1"; bytes: Uint8Array; inputDigest: Digest }>;
export type PreviewSelection = "current" | "published";
export type PreviewSubject = Readonly<{ entryId: string }>;
export type PreviewDocument = Readonly<{
  contract: "preview-document/v1";
  selection: PreviewSelection;
  subject: PreviewSubject;
  revisionId: string;
  contentDigest: Digest;
  document: string;
}>;
export type ProjectionFailureCode = "INVALID_PROJECTION_INPUT" | "INVALID_PREVIEW_INPUT" | "PUBLISHED_SELECTION_UNRESOLVED" | "PUBLISHED_SELECTION_STALE" | "PREVIEW_SELECTION_UNRESOLVED" | "PREVIEW_STATE_STALE" | "PROJECTION_CANONICALIZATION_FAILED";
export type ProjectionFailure = Readonly<{ code: ProjectionFailureCode; owner: "Projection"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type ProjectionResult<T> = CoreResult<T> | Readonly<{ ok: false; error: ProjectionFailure }>;
export type CreateProjectionInput = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; contentReadModel: PublishedContentReadModel; themeHost: ThemeHost; pluginHost: PluginHost }>;
export type Projection = Readonly<{ producePublishedRendererInput(): Promise<ProjectionResult<RendererInputArtifact>>; preview(input: Readonly<{ selection: PreviewSelection; subject: PreviewSubject }>): ProjectionResult<PreviewDocument> }>;
