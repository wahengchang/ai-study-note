import type { ThemeHost, ThemeHostResult } from "./contracts.js";
import { themeHost } from "./host.js";
import { themeHostFailure } from "./failures.js";
import { validateTrustedRoots } from "./trusted-root.js";

export type {
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

export async function createThemeHost(input: Readonly<{ repositoryRoot: string; installedThemesRoot: string }>): Promise<ThemeHostResult<ThemeHost>> {
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 2 || !("repositoryRoot" in input) || !("installedThemesRoot" in input)) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
  const roots = await validateTrustedRoots(input);
  return roots === null ? Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") }) : Object.freeze({ ok: true, value: themeHost(roots) });
}
