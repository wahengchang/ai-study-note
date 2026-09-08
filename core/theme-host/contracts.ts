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
}>;
