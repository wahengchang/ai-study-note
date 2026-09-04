import type { CoreResult, Digest, MessageRemediation } from "../foundation/index.js";

import type { ThemeHostFailure } from "./failures.js";

export const ThemeRendererContract = "theme-renderer/v1";
export type ThemeRendererContract = typeof ThemeRendererContract;

export type ThemeManifestFile = Readonly<{ file: string; digest: Digest }>;
export type ThemeManifestV1 = Readonly<{
  manifestVersion: "theme-manifest/v1";
  id: string;
  version: string;
  trustedLocal: true;
  rendererContract: ThemeRendererContract;
  entry: ThemeManifestFile;
  resources: readonly ThemeManifestFile[];
}>;
export type ThemeActivationIdentity = Readonly<{
  id: string;
  version: string;
  rendererContract: ThemeRendererContract;
  manifestHash: Digest;
}>;
export type ThemeCandidate = ThemeActivationIdentity;
export type ThemeDiscoveryReport = Readonly<{ candidates: readonly ThemeCandidate[]; rejections: readonly ThemeHostFailure[] }>;
export type ThemeActivationState = Readonly<{ contract: "theme-activation-state/v1"; active?: ThemeActivationIdentity }>;
export type ThemeActivationStatePort = Readonly<{
  read(): Promise<ThemeActivationState>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: ThemeActivationState }>): Promise<boolean>;
}>;
export type ActiveThemeSnapshot = Readonly<{ identity?: ThemeActivationIdentity; digest: Digest }>;
export type VerifiedThemeResource = Readonly<{ file: string; bytes: Uint8Array; digest: Digest }>;
export type ActiveThemeRendererSource = Readonly<{
  identity: ThemeActivationIdentity;
  activeStateDigest: Digest;
  entryBytes: Uint8Array;
  entryDigest: Digest;
  resources: readonly VerifiedThemeResource[];
}>;
export type ThemeHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: ThemeHostFailure }>;
export type ThemeHost = Readonly<{
  discover(): Promise<ThemeHostResult<ThemeDiscoveryReport>>;
  activate(input: Readonly<{ identity: ThemeActivationIdentity }>): Promise<ThemeHostResult<ActiveThemeSnapshot>>;
  deactivate(input: Readonly<{ identity: ThemeActivationIdentity }>): Promise<ThemeHostResult<ActiveThemeSnapshot>>;
  getActiveSnapshot(): Promise<ThemeHostResult<ActiveThemeSnapshot>>;
  resolveActiveRendererSource(): Promise<ThemeHostResult<ActiveThemeRendererSource>>;
}>;
export type CreateThemeHostInput = Readonly<{
  repositoryRoot: string;
  installedThemesRoot: string;
  activationState: ThemeActivationStatePort;
}>;
export type ThemeHostFailureCode =
  | "INVALID_THEME_HOST_INPUT"
  | "INVALID_TRUSTED_ROOT"
  | "THEME_DISCOVERY_FAILED"
  | "THEME_NOT_FOUND"
  | "INVALID_THEME_MANIFEST"
  | "UNSUPPORTED_RENDERER_CONTRACT"
  | "THEME_EVIDENCE_MISMATCH"
  | "THEME_IDENTITY_CONFLICT"
  | "THEME_NOT_ACTIVE"
  | "ACTIVE_THEME_IDENTITY_MISMATCH"
  | "ACTIVATION_STATE_CONFLICT"
  | "ACTIVATION_STATE_FAILURE";
export type ThemeHostFailureShape = Readonly<{
  code: ThemeHostFailureCode;
  owner: "ThemeHost";
  subjectIds: readonly string[];
  remediation: MessageRemediation;
}>;
