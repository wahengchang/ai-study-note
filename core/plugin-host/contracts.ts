import type { CoreResult, Digest } from "../foundation/index.js";

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

export type PluginDiscoveryReport = Readonly<{
  candidates: readonly PluginCandidate[];
  rejections: readonly PluginHostFailure[];
}>;

export type PluginActivationIdentity = Readonly<{
  id: string;
  version: string;
  hookContract: PluginHookContract;
  manifestHash: Digest;
}>;

export type PluginActivationState = Readonly<{
  contract: "plugin-activation-state/v1";
  identities: readonly PluginActivationIdentity[];
}>;

export type PluginActivationStatePort = Readonly<{
  read(): Promise<PluginActivationState>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginActivationState }>): Promise<boolean>;
}>;

export type ActivePluginSnapshot = Readonly<{
  identities: readonly PluginActivationIdentity[];
  digest: Digest;
}>;

export type PluginHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: PluginHostFailure }>;

export type PluginHost = Readonly<{
  discover(): Promise<PluginHostResult<PluginDiscoveryReport>>;
  activate(input: Readonly<{ pluginId: string }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  deactivate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>>;
  getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>>;
}>;

export type CreatePluginHostInput = Readonly<{
  repositoryRoot: string;
  installedPluginsRoot: string;
  activationState: PluginActivationStatePort;
}>;
