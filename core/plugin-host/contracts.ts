import type { CoreResult, Digest, JsonValue } from "../foundation/index.js";

import type { PluginHostFailure } from "./failures.js";

export const PluginHookContract = "plugin-hooks/v1";
export type PluginHookContract = typeof PluginHookContract;

export type PluginPublicHookId = "public/block/render" | "public/assets/emit" | "public/seo/page" | "public/seo/site";
export type PluginHookId = "save-revision/validate" | "cms/editor-block/resolve" | "cms/seo/analyze" | PluginPublicHookId;
export type PluginCapability =
  | "save-revision-validator"
  | "cms-editor-block-resolution"
  | "cms-seo-analysis"
  | "public-block-renderer"
  | "public-assets-emitter"
  | "public-seo-page-contribution"
  | "public-seo-site-contribution";

export type PluginManifestEntry = Readonly<{ file: string; digest: Digest }>;
export type PluginManifestResource = Readonly<{ file: string; digest: Digest }>;
export type PluginManifestCallback = Readonly<{ hook: PluginHookId; exportName: string; priority: number }>;

export type PluginManifestV1 = Readonly<{
  manifestVersion: "plugin-manifest/v1";
  id: string;
  version: string;
  trustedLocal: true;
  hookContract: PluginHookContract;
  capabilities: readonly PluginCapability[];
  entry: PluginManifestEntry;
  callbacks: readonly PluginManifestCallback[];
  resources: readonly PluginManifestResource[];
}>;

export type PluginCandidate = Readonly<{
  id: string;
  version: string;
  hookContract: PluginHookContract;
  capabilities: readonly PluginCapability[];
  manifestHash: Digest;
}>;
export type PluginDiscoveryReport = Readonly<{ candidates: readonly PluginCandidate[]; rejections: readonly PluginHostFailure[] }>;

export type PluginActivationIdentity = Readonly<{ id: string; version: string; hookContract: PluginHookContract; manifestHash: Digest; capabilities: readonly PluginCapability[] }>;
export type PluginActivationState = Readonly<{
  contract: "plugin-activation-state/v2";
  active: readonly PluginActivationIdentity[];
  reactivationRequired: readonly PluginActivationIdentity[];
}>;
export type PluginActivationStatePort = Readonly<{
  read(): Promise<PluginActivationState>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginActivationState }>): Promise<boolean>;
}>;
export type ActivePluginSnapshot = Readonly<{ identities: readonly PluginActivationIdentity[]; digest: Digest }>;
export type PluginActivationManagementSnapshot = Readonly<{
  activationStateDigest: Digest;
  active: readonly PluginActivationIdentity[];
  reactivationRequired: readonly PluginActivationIdentity[];
}>;

export type CmsEditorBlockSource = Readonly<{
  contract: "cms-editor-block-source/v1";
  entryId: string;
  revisionId: string;
  pluginIdentity: PluginActivationIdentity;
  source: JsonValue;
}>;
export type CmsEditorBlockSourceEvidence = Readonly<CmsEditorBlockSource & { sourceBytes: Uint8Array; sourceDigest: Digest }>;
export type CmsEditorBlockResolverInput = Readonly<{ contract: "cms-editor-block-resolver-input/v1"; entryId: string; revisionId: string; source: JsonValue }>;
export type CmsEditorBlockResolverOutput = Readonly<{ contract: "cms-editor-block-output/v1"; block: JsonValue }>;
export type CmsEditorBlockResolverFacade = Readonly<{ capability: "cms-editor-block-resolution" }>;
export type CmsEditorBlockResolverCallback = (input: CmsEditorBlockResolverInput, facade: CmsEditorBlockResolverFacade) => CmsEditorBlockResolverOutput;
export type CmsEditorBlockResolution =
  | Readonly<{ status: "active"; source: CmsEditorBlockSourceEvidence; output: JsonValue; outputBytes: Uint8Array; outputDigest: Digest; activeStateDigest: Digest }>
  | Readonly<{ status: "inactive" | "missing" | "identity-changed"; source: CmsEditorBlockSourceEvidence; diagnostic: PluginHostFailure; activeStateDigest: Digest }>;

export type SaveRevisionValidatorInput = Readonly<{
  contract: "save-revision-validator-input/v1";
  entryId: string;
  revisionId: string;
  schemaIdentity: Readonly<{ schemaId: string; version: number }>;
  content: JsonValue;
}>;
export type SaveRevisionValidatorOutput =
  | Readonly<{ contract: "save-revision-validator-output/v1"; decision: "accept"; replacement: Readonly<{ content: JsonValue }> }>
  | Readonly<{ contract: "save-revision-validator-output/v1"; decision: "reject" }>;
export type SaveRevisionValidatorFacade = Readonly<{ capability: "save-revision-validator" }>;
export type SaveRevisionValidatorCallback = (input: SaveRevisionValidatorInput, facade: SaveRevisionValidatorFacade) => SaveRevisionValidatorOutput;
export type SaveRevisionContentGuard = (input: Readonly<{ contentBytes: Uint8Array; contentDigest: Digest }>) => Readonly<{ ok: true }> | Readonly<{ ok: false }>;
declare const pluginOperationToken: unique symbol;
export type PreparedSaveRevisionValidators = Readonly<{ activeStateDigest: Digest; readonly __pluginOperationToken: typeof pluginOperationToken }>;
export type ValidatedSaveRevisionContent = Readonly<{ content: JsonValue; contentBytes: Uint8Array; contentDigest: Digest; activeStateDigest: Digest }>;
export type VerifiedPluginResource = Readonly<{ file: string; bytes: Uint8Array; digest: Digest }>;
export type ActivePublicPluginRenderer = Readonly<{
  identity: PluginActivationIdentity;
  activeStateDigest: Digest;
  entryBytes: Uint8Array;
  resources: readonly VerifiedPluginResource[];
  callbacks: readonly Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }>[];
}>;

export type PluginHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PluginHostFailure }>;
export type SeoPluginSettingsV1 = Readonly<{ contract: "seo-plugin-settings/v1"; publicSiteUrl: string; indexing: "allow" | "disallow" }>;
export type PluginSettingsRecord = Readonly<{ identity: PluginActivationIdentity; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1; settingsDigest: Digest }>;
export type PluginSettingsState = Readonly<{ contract: "plugin-settings-state/v1"; records: readonly PluginSettingsRecord[] }>;
export type PluginSettingsStatePort = Readonly<{
  read(): Promise<PluginSettingsState>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginSettingsState }>): Promise<boolean>;
}>;
export type CmsSeoAnalysisInputV1 = Readonly<{
  contract: "cms-seo-analysis-input/v1";
  entryId: string;
  inputDigest: Digest;
  schemaIdentity: Readonly<{ schemaId: string; version: number }>;
  content: JsonValue;
  route: string;
  settings: SeoPluginSettingsV1;
}>;
export type CmsSeoAnalysisOutputV1 = Readonly<{
  contract: "cms-seo-analysis-output/v1";
  preview: Readonly<{ title: string; description?: string; canonicalPath: string }>;
  suggestions: readonly Readonly<{ code: "SEO_TITLE_MISSING" | "SEO_DESCRIPTION_MISSING"; field: "title" | "description" }>[];
}>;
export type PluginSeoAnalysisResult =
  | Readonly<{ status: "available"; preview: CmsSeoAnalysisOutputV1["preview"]; suggestions: CmsSeoAnalysisOutputV1["suggestions"]; producers: readonly Readonly<{ identity: PluginActivationIdentity; hook: "cms/seo/analyze"; priority: number; inputDigest: Digest; outputDigest: Digest; settingsDigest: Digest }>[]; settings: SeoPluginSettingsV1; settingsDigest: Digest }>
  | Readonly<{ status: "unavailable"; diagnostics: readonly PluginHostFailure[] }>;
export type PublicSeoPageContributionV1 = Readonly<{
  contract: "public-seo-page-contribution/v1"; entryId: string; revisionId: string; route: string; title: string; description?: string; canonicalPath: string;
  openGraph: Readonly<{ title: string; description?: string; urlPath: string; type: "article" }>;
  jsonLd: Readonly<{ type: "WebPage"; name: string; description?: string; urlPath: string }>;
}>;
export type PublicSeoSiteContributionV1 = Readonly<{ contract: "public-seo-site-contribution/v1"; sitemap: Readonly<{ include: "all-published" }>; robots: Readonly<{ indexing: "allow" | "disallow" }> }>;
export type ResolvePublicBuildSnapshotInput = Readonly<{ contract: "public-plugin-build-request/v1"; published: readonly Readonly<{ entryId: string; revisionId: string; schemaIdentity: Readonly<{ schemaId: string; version: number }>; route: string; content: JsonValue }>[] }>;
export type PublicSeoEvidence = Readonly<{ identity: PluginActivationIdentity; hook: "public/seo/page" | "public/seo/site"; priority: number; inputDigest: Digest; outputDigest: Digest; settingsContract: "seo-plugin-settings/v1"; settingsDigest: Digest }>;
export type PublicSeoContributionRecord<T> = Readonly<{ evidence: PublicSeoEvidence; contribution: T }>;
export type PublicPluginBuildSnapshotV1 = Readonly<{
  contract: "public-plugin-build-snapshot/v1"; activationStateDigest: Digest; settingsStateDigest: Digest; publicRenderers: readonly ActivePublicPluginRenderer[];
  publicRendererEvidence: readonly JsonValue[]; pageContributions: readonly PublicSeoContributionRecord<PublicSeoPageContributionV1>[]; siteContributions: readonly PublicSeoContributionRecord<PublicSeoSiteContributionV1>[];
  diagnostics: readonly PluginHostFailure[]; snapshotDigest: Digest;
}>;
declare const publicSnapshotToken: unique symbol;
export type PreparedPublicBuildSnapshot = Readonly<{ snapshot: PublicPluginBuildSnapshotV1; readonly __publicSnapshotToken: typeof publicSnapshotToken }>;
export type PluginHost = Readonly<{
  discover(): Promise<PluginHostResult<PluginDiscoveryReport>>;
  activate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  deactivate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActivationManagementSnapshot(): Promise<PluginHostResult<PluginActivationManagementSnapshot>>;
  resolveCmsEditorBlock(input: CmsEditorBlockSource): Promise<PluginHostResult<CmsEditorBlockResolution>>;
  prepareSaveRevisionValidators(input: Readonly<{ entryId: string }>): Promise<PluginHostResult<PreparedSaveRevisionValidators>>;
  runPreparedSaveRevisionValidators(token: PreparedSaveRevisionValidators, input: SaveRevisionValidatorInput, guard: SaveRevisionContentGuard): PluginHostResult<ValidatedSaveRevisionContent>;
  getSettingsSnapshot(): Promise<PluginHostResult<Readonly<{ state: PluginSettingsState; digest: Digest }>>>;
  replaceSettings(input: Readonly<{ identity: PluginActivationIdentity; expectedSettingsStateDigest: Digest; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1 }>): Promise<PluginHostResult<Readonly<{ state: PluginSettingsState; digest: Digest }>>>;
  analyzeCmsSeo(input: Readonly<{ entryId: string; schemaIdentity: Readonly<{ schemaId: string; version: number }>; content: JsonValue; route: string }>): Promise<PluginHostResult<PluginSeoAnalysisResult>>;
  resolveActivePublicRenderers(): Promise<PluginHostResult<readonly ActivePublicPluginRenderer[]>>;
  resolvePublicBuildSnapshot(input: ResolvePublicBuildSnapshotInput): Promise<PluginHostResult<PreparedPublicBuildSnapshot>>;
  validatePublicBuildSnapshot(token: PreparedPublicBuildSnapshot): Promise<PluginHostResult<true>>;
}>;
export type CreatePluginHostInput = Readonly<{ repositoryRoot: string; installedPluginsRoot: string; activationState: PluginActivationStatePort; settingsState: PluginSettingsStatePort }>;
