import type { CreateThemeHostInput, ThemeHost, ThemeHostResult } from "./contracts.js";
import { themeHost } from "./host.js";
import { themeHostFailure } from "./failures.js";
import { validateTrustedRoots } from "./trusted-root.js";
export { parseThemeManifest } from "./manifest.js";

export type {
  CreateThemeHostInput,
  ThemeActivationSnapshot,
  ThemeActivationStatePort,
  ThemeActivationStateRecord,
  ThemeCandidate,
  ThemeDiscoveryReport,
  ThemeHost,
  ThemeHostResult,
  ThemeIdentity,
  ThemeManifestFile,
  ThemeManifestV1,
  VerifiedThemePackage,
} from "./contracts.js";
export { themeHostFailureCodes } from "./failures.js";
export type { ThemeHostFailure, ThemeHostFailureCode } from "./failures.js";

export async function createThemeHost(input: CreateThemeHostInput): Promise<ThemeHostResult<ThemeHost>> {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.keys(input).length !== 3
    || !Object.hasOwn(input, "repositoryRoot")
    || !Object.hasOwn(input, "installedThemesRoot")
    || !Object.hasOwn(input, "activationState")
    || typeof input.activationState?.read !== "function"
    || typeof input.activationState?.compareAndReplace !== "function"
  ) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
  const roots = await validateTrustedRoots(input);
  return roots === null
    ? Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") })
    : Object.freeze({ ok: true, value: themeHost(roots, input.activationState) });
}
