import type { JsonValue, Digest } from "../foundation/index.js";
import type { DataMedia } from "../media/index.js";
import type { PersistenceStore } from "../persistence/index.js";
import type { PluginHost, PluginActivationIdentity, PluginHostFailure } from "../plugin-host/index.js";
import type { RouteClaim, SiteDefinition } from "../site-definition/index.js";
import type { ThemeHost, ThemeHostFailure, ThemeIdentity, ThemeManifestV1 } from "../theme-host/index.js";

export type ProjectionFailureCode =
  | "INVALID_PROJECTION_INPUT"
  | "SUBJECT_NOT_FOUND"
  | "SUBJECT_NOT_PUBLISHED"
  | "PROJECTION_STORAGE_FAILURE"
  | "INVALID_REVISION_EVIDENCE"
  | "UNRESOLVED_ROUTE_REFERENCE"
  | "UNRESOLVED_MEDIA_REFERENCE"
  | "PROJECTION_STATE_CHANGED"
  | "PROJECTION_PAYLOAD_TOO_LARGE"
  | "PROJECTION_ENCODING_FAILED"
  | "INVALID_RENDERER_INPUT"
  | "INVALID_PREVIEW_INPUT";

export type ProjectionFailure = Readonly<{
  code: ProjectionFailureCode;
  owner: "Projection";
  subjectIds: readonly string[];
  remediation: Readonly<{ kind: "message"; message: string }>;
}>;

export type ProjectionResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: ProjectionFailure | PluginHostFailure | ThemeHostFailure }>;
export type RendererInputArtifact = Readonly<{ bytes: Uint8Array; inputDigest: Digest; bytesDigest: Digest }>;
export type PreviewInputArtifact = Readonly<{ bytes: Uint8Array; previewDigest: Digest; bytesDigest: Digest }>;

export type RendererEntry = Readonly<{
  entryId: string;
  revisionId: string;
  schemaIdentity: Readonly<{ schemaId: string; version: number }>;
  content: JsonValue;
  contentDigest: Digest;
}>;
export type RendererMediaReference = Readonly<{ entryId: string; revisionId: string; assetVersion: Readonly<{ assetId: string; assetVersionId: string }> }>;
export type RendererMediaAsset = Readonly<{
  identity: Readonly<{ assetId: string; assetVersionId: string }>;
  objectDigest: Digest;
  byteLength: number;
  metadata: JsonValue;
  metadataDigest: Digest;
}>;
export type RendererMediaObject = Readonly<{ objectDigest: Digest; byteLength: number; bytesBase64url: string }>;
export type RendererMedia = Readonly<{ contract: "renderer-media/v1"; references: readonly RendererMediaReference[]; assets: readonly RendererMediaAsset[]; objects: readonly RendererMediaObject[] }>;
export type RendererThemeFile = Readonly<{ role: "runtime" | "resource"; file: string; digest: Digest; bytesBase64url: string }>;
export type RendererTheme = Readonly<{ identity: ThemeIdentity; manifest: ThemeManifestV1; files: readonly RendererThemeFile[] }>;
export type RendererPlugins = Readonly<{ activeStateDigest: Digest; identities: readonly PluginActivationIdentity[] }>;
export type RendererRoutes = Readonly<{ contract: "route-graph-snapshot/v1"; normalization: "route-normalization/v1"; graph: "published"; claims: readonly Omit<RouteClaim, "graph">[] }>;
export type RendererInput = Readonly<{
  contract: "renderer-input/v1";
  inputDigest: Digest;
  selection: Readonly<{ publishedRevisionIds: readonly Readonly<{ entryId: string; revisionId: string }>[]; routeGraphDigest: Digest; mediaSelectionDigest: Digest }>;
  entries: readonly RendererEntry[];
  routes: RendererRoutes;
  media: RendererMedia;
  theme: RendererTheme;
  plugins: RendererPlugins;
}>;
export type PreviewInput = Readonly<{
  contract: "preview-input/v1";
  previewDigest: Digest;
  subject: Readonly<{ entryId: string }>;
  selection: Readonly<{ mode: "current" | "published"; selectedRevision: Readonly<{ entryId: string; revisionId: string }>; routeSelectionDigest: Digest; mediaSelectionDigest: Digest }>;
  entry: RendererEntry;
  route: Omit<RouteClaim, "graph">;
  media: RendererMedia;
  theme: RendererTheme;
  plugins: RendererPlugins;
}>;
export type ParsedRendererInput = Readonly<{ input: RendererInput; bytesDigest: Digest }>;
export type ParsedPreviewInput = Readonly<{ input: PreviewInput; bytesDigest: Digest }>;

export interface ProjectionPreview {
  produceRendererInput(input: Readonly<{ themeIdentity: ThemeIdentity }>): Promise<ProjectionResult<RendererInputArtifact>>;
  preview(input: Readonly<{ selection: "current" | "published"; subject: Readonly<{ entryId: string }>; themeIdentity: ThemeIdentity }>): Promise<ProjectionResult<PreviewInputArtifact>>;
}
export type ProjectionDependencies = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; pluginHost: PluginHost; themeHost: ThemeHost }>;
