import type { MessageRemediation } from "../foundation/index.js";

import type { ThemeHostFailureCode, ThemeHostFailureShape } from "./contracts.js";

export type ThemeHostFailure = ThemeHostFailureShape;

const messages: Readonly<Record<ThemeHostFailureCode, string>> = {
  INVALID_THEME_HOST_INPUT: "請提供有效的 Theme Host 輸入。",
  INVALID_TRUSTED_ROOT: "請提供有效的 trusted Theme root。",
  THEME_DISCOVERY_FAILED: "Theme discovery 未完成。",
  THEME_NOT_FOUND: "找不到指定的 Theme。",
  INVALID_THEME_MANIFEST: "Theme manifest 無效。",
  UNSUPPORTED_RENDERER_CONTRACT: "Theme renderer contract 不受支援。",
  THEME_EVIDENCE_MISMATCH: "Theme executable 或 resource evidence 不一致。",
  THEME_IDENTITY_CONFLICT: "Theme identity 與目前啟用設定衝突。",
  THEME_NOT_ACTIVE: "目前沒有啟用的 Theme。",
  ACTIVE_THEME_IDENTITY_MISMATCH: "Active Theme identity 與 installed evidence 不一致。",
  ACTIVATION_STATE_CONFLICT: "Theme activation state 已變更。",
  ACTIVATION_STATE_FAILURE: "Theme activation state 操作未完成。",
};

export function isCanonicalThemeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function themeHostFailure(code: ThemeHostFailureCode, subjectId?: unknown): ThemeHostFailure {
  const remediation: MessageRemediation = Object.freeze({ kind: "message", message: messages[code] });
  return Object.freeze({ code, owner: "ThemeHost", subjectIds: Object.freeze(isCanonicalThemeId(subjectId) ? [subjectId] : []), remediation });
}

export function themeHostError(code: ThemeHostFailureCode, subjectId?: unknown): Readonly<{ ok: false; error: ThemeHostFailure }> {
  return Object.freeze({ ok: false, error: themeHostFailure(code, subjectId) });
}
