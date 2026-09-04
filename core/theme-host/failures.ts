import type { MessageRemediation } from "../foundation/index.js";

export const themeHostFailureCodes = [
  "INVALID_THEME_HOST_INPUT",
  "INVALID_TRUSTED_ROOT",
  "THEME_DISCOVERY_FAILED",
  "THEME_NOT_FOUND",
  "INVALID_THEME_MANIFEST",
  "THEME_EVIDENCE_MISMATCH",
  "THEME_IDENTITY_CONFLICT",
  "THEME_RUNTIME_INVALID",
  "THEME_FILE_NOT_DECLARED",
] as const;

export type ThemeHostFailureCode = (typeof themeHostFailureCodes)[number];
export type ThemeHostFailure = Readonly<{
  code: ThemeHostFailureCode;
  owner: "ThemeHost";
  subjectIds: readonly string[];
  remediation: MessageRemediation;
}>;

const messages: Readonly<Record<ThemeHostFailureCode, string>> = {
  INVALID_THEME_HOST_INPUT: "請提供有效的 Theme Host 輸入。",
  INVALID_TRUSTED_ROOT: "請提供有效且安全的 trusted Theme root。",
  THEME_DISCOVERY_FAILED: "Theme discovery 未完成。",
  THEME_NOT_FOUND: "找不到指定的 Theme identity。",
  INVALID_THEME_MANIFEST: "Theme manifest 無效。",
  THEME_EVIDENCE_MISMATCH: "Theme evidence 與 manifest 不一致。",
  THEME_IDENTITY_CONFLICT: "同一 Theme id/version 出現多個 installed slots。",
  THEME_RUNTIME_INVALID: "Theme runtime 不符合 self-contained module 要求。",
  THEME_FILE_NOT_DECLARED: "要求的 Theme file 未在 manifest 宣告。",
};

export function isCanonicalThemeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function themeHostFailure(code: ThemeHostFailureCode, subjectId?: unknown): ThemeHostFailure {
  return Object.freeze({
    code,
    owner: "ThemeHost",
    subjectIds: Object.freeze(isCanonicalThemeId(subjectId) ? [subjectId] : []),
    remediation: Object.freeze({ kind: "message", message: messages[code] }),
  });
}

export function themeHostError(code: ThemeHostFailureCode, subjectId?: unknown): Readonly<{ ok: false; error: ThemeHostFailure }> {
  return Object.freeze({ ok: false, error: themeHostFailure(code, subjectId) });
}
