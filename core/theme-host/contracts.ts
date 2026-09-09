import type { CoreResult, Digest } from "../foundation/index.js";
import type { ThemeHostFailure } from "./failures.js";

export type ThemeManifestFile = Readonly<{ file: string; digest: Digest }>;

export type ThemeManifestV1 = Readonly<{
  contract: "theme-manifest/v1";
  id: string;
  version: string;
  runtime: ThemeManifestFile;
  resources: readonly ThemeManifestFile[];
}>;

export type ThemeIdentity = Readonly<{ id: string; version: string; manifestHash: Digest }>;
export type ThemeActivationStateRecord = Readonly<{ bytes: Uint8Array; digest: Digest }>;
export type ThemeActivationStatePort = Readonly<{
  read(): Promise<ThemeActivationStateRecord>;
  compareAndReplace(input: Readonly<{ expectedDigest: Digest; next: ThemeActivationStateRecord }>): Promise<boolean>;
}>;
export type ThemeActivationSnapshot = Readonly<{ active?: ThemeIdentity; stateDigest: Digest }>;
export type CreateThemeHostInput = Readonly<{
  repositoryRoot: string;
  installedThemesRoot: string;
  activationState: ThemeActivationStatePort;
}>;

export type ThemeCandidate = ThemeIdentity;
export type ThemeDiscoveryReport = Readonly<{
  candidates: readonly ThemeCandidate[];
  rejections: readonly ThemeHostFailure[];
}>;
export type VerifiedThemePackage = Readonly<{ identity: ThemeIdentity; manifest: ThemeManifestV1 }>;
export type ThemeHostResult<T> = CoreResult<T> | Readonly<{ ok: false; error: ThemeHostFailure }>;

export type ThemeHost = Readonly<{
  discover(): Promise<ThemeHostResult<ThemeDiscoveryReport>>;
  resolveExact(input: Readonly<{ identity: ThemeIdentity }>): Promise<ThemeHostResult<VerifiedThemePackage>>;
  readVerifiedFile(input: Readonly<{ identity: ThemeIdentity; file: string }>): Promise<ThemeHostResult<Uint8Array>>;
  getActivationSnapshot(): Promise<ThemeHostResult<ThemeActivationSnapshot>>;
  activate(input: Readonly<{ identity: ThemeIdentity; expectedActivationStateDigest: Digest }>): Promise<ThemeHostResult<ThemeActivationSnapshot>>;
  resolveActive(): Promise<ThemeHostResult<Readonly<{ identity: ThemeIdentity; activationStateDigest: Digest; theme: VerifiedThemePackage }>>>;
}>;
