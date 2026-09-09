import type { CoreResult, Digest, JsonValue } from "../foundation/index.js";

import type { PluginHostFailure } from "./failures.js";

export const PluginHookContract = "plugin-hooks/v1";
export type PluginHookContract = typeof PluginHookContract;

export type PluginPublicHookId = "public/block/render" | "public/assets/emit";
export type PluginSeoHookId = "cms/seo/analyze" | "public/seo/page" | "public/seo/site";
export type PluginHookId = "save-revision/validate" | "cms/editor-block/resolve" | PluginPublicHookId | PluginSeoHookId;
export type PluginCapability = "save-revision-validator" | "cms-editor-block-resolution" | "public-block-renderer" | "public-assets-emitter" | "cms-seo-analysis" | "public-seo-page-contribution" | "public-seo-site-contribution";

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

export type PluginActivationIdentity = Readonly<{ id: string; version: string; hookContract: PluginHookContract; manifestHash: Digest; capabilities: readonly PluginCapability[] }>;
export type PluginCandidate = PluginActivationIdentity;
export type PluginDiscoveryReport = Readonly<{ candidates: readonly PluginCandidate[]; rejections: readonly PluginHostFailure[] }>;
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
export type PluginActivationSnapshot = Readonly<{ active: readonly PluginActivationIdentity[]; reactivationRequired: readonly PluginActivationIdentity[]; digest: Digest }>;

export type SeoPluginSettingsV1 = Readonly<{ contract: "seo-plugin-settings/v1"; publicSiteUrl: string; indexing: "allow" | "disallow" }>;
export type PluginSettingsRecord = Readonly<{ identity: PluginActivationIdentity; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1; settingsDigest: Digest }>;
export type PluginSettingsState = Readonly<{ contract: "plugin-settings-state/v1"; records: readonly PluginSettingsRecord[] }>;
export type PluginSettingsStatePort = Readonly<{
  read(): Promise<PluginSettingsState>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginSettingsState }>): Promise<boolean>;
}>;
export type PluginSettingsSnapshot = Readonly<{ stateDigest: Digest; records: readonly PluginSettingsRecord[] }>;

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

export type SaveRevisionValidatorInput = Readonly<{ contract: "save-revision-validator-input/v1"; entryId: string; revisionId: string; schemaIdentity: Readonly<{ schemaId: string; version: number }>; content: JsonValue }>;
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
export type ActivePublicPluginRenderer = Readonly<{ identity: PluginActivationIdentity; manifest: PluginManifestV1; entryBytes: Uint8Array; entryDigest: Digest; resources: readonly VerifiedPluginResource[]; callbacks: readonly Readonly<{ hook: PluginPublicHookId; exportName: string; priority: number }>[] }>;

export type CmsSeoAnalysisInputV1 = Readonly<{ contract: "cms-seo-analysis-input/v1"; entryId: string; inputDigest: Digest; schemaIdentity: Readonly<{ schemaId: string; version: number }>; content: JsonValue; route: string; settings: SeoPluginSettingsV1 }>;
export type CmsSeoSuggestionV1 = Readonly<{ code: string }>;
export type CmsSeoAnalysisOutputV1 = Readonly<{ contract: "cms-seo-analysis-output/v1"; preview: Readonly<{ title: string; description?: string; canonicalPath?: string }>; suggestions: readonly CmsSeoSuggestionV1[] }>;
export type CmsSeoAnalysisResult = Readonly<{ status: "available" | "unavailable"; preview?: CmsSeoAnalysisOutputV1["preview"]; suggestions: readonly CmsSeoSuggestionV1[]; diagnostics: readonly PluginHostFailure[] }>;

export type PublicPluginBuildRequestV1 = Readonly<{ contract: "public-plugin-build-request/v1"; published: JsonValue }>;
export type SeoPageContributionV1 = Readonly<{ contract: "public-seo-page-contribution/v1"; contribution: JsonValue }>;
export type SeoSiteContributionV1 = Readonly<{ contract: "public-seo-site-contribution/v1"; contribution: JsonValue }>;
export type PublicSeoSnapshot = Readonly<{ status: "available"; page: readonly Readonly<{ identity: PluginActivationIdentity; contribution: SeoPageContributionV1 }>[]; site: readonly Readonly<{ identity: PluginActivationIdentity; contribution: SeoSiteContributionV1 }>[]; omissionDigest: Digest }> | Readonly<{ status: "omitted"; page: readonly never[]; site: readonly never[]; omissions: readonly PluginHostFailure[]; omissionDigest: Digest }>;
export type PublicBuildSnapshot = Readonly<{ contract: "prepared-public-build-snapshot/v1"; activationStateDigest: Digest; settingsStateDigest: Digest; published: JsonValue; renderers: readonly ActivePublicPluginRenderer[]; seo: PublicSeoSnapshot }>;
declare const publicBuildToken: unique symbol;
export type PreparedPublicBuildSnapshot = Readonly<{ snapshot: PublicBuildSnapshot; readonly token: typeof publicBuildToken }>;

export type PluginHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PluginHostFailure }>;
export type PluginHost = Readonly<{
  discover(): Promise<PluginHostResult<PluginDiscoveryReport>>;
  activate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  deactivate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActivationSnapshot(): Promise<PluginHostResult<PluginActivationSnapshot>>;
  inspectActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getSettingsSnapshot(): Promise<PluginHostResult<PluginSettingsSnapshot>>;
  replaceSettings(input: Readonly<{ identity: PluginActivationIdentity; expectedSettingsStateDigest: Digest; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1 }>): Promise<PluginHostResult<PluginSettingsSnapshot>>;
  analyzeCmsSeo(input: CmsSeoAnalysisInputV1): Promise<PluginHostResult<CmsSeoAnalysisResult>>;
  resolvePublicBuildSnapshot(input: PublicPluginBuildRequestV1): Promise<PluginHostResult<PreparedPublicBuildSnapshot>>;
  validatePublicBuildSnapshot(token: PreparedPublicBuildSnapshot): Promise<PluginHostResult<PublicBuildSnapshot>>;
  resolveCmsEditorBlock(input: CmsEditorBlockSource): Promise<PluginHostResult<CmsEditorBlockResolution>>;
  prepareSaveRevisionValidators(input: Readonly<{ entryId: string }>): Promise<PluginHostResult<PreparedSaveRevisionValidators>>;
  runPreparedSaveRevisionValidators(token: PreparedSaveRevisionValidators, input: SaveRevisionValidatorInput, guard: SaveRevisionContentGuard): PluginHostResult<ValidatedSaveRevisionContent>;
}>;
export type CreatePluginHostInput = Readonly<{ repositoryRoot: string; installedPluginsRoot: string; activationState: PluginActivationStatePort; settingsState: PluginSettingsStatePort }>;
