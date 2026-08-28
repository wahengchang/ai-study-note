import type { CoreResult, Digest, JsonValue } from "../foundation/index.js";

import type { PluginHostFailure } from "./failures.js";

export const PluginHookContract = "plugin-hooks/v1";
export type PluginHookContract = typeof PluginHookContract;

export type PluginHookId = "save-revision/validate" | "cms/editor-block/resolve";
export type PluginCapability = "save-revision-validator" | "cms-editor-block-resolution";

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

export type PluginActivationIdentity = Readonly<{ id: string; version: string; hookContract: PluginHookContract; manifestHash: Digest }>;
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

export type PluginHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PluginHostFailure }>;
export type PluginHost = Readonly<{
  discover(): Promise<PluginHostResult<PluginDiscoveryReport>>;
  activate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  deactivate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>>;
  resolveCmsEditorBlock(input: CmsEditorBlockSource): Promise<PluginHostResult<CmsEditorBlockResolution>>;
  prepareSaveRevisionValidators(input: Readonly<{ entryId: string }>): Promise<PluginHostResult<PreparedSaveRevisionValidators>>;
  runPreparedSaveRevisionValidators(token: PreparedSaveRevisionValidators, input: SaveRevisionValidatorInput, guard: SaveRevisionContentGuard): PluginHostResult<ValidatedSaveRevisionContent>;
}>;
export type CreatePluginHostInput = Readonly<{ repositoryRoot: string; installedPluginsRoot: string; activationState: PluginActivationStatePort }>;
