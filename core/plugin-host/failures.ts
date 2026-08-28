import type { CommandRemediation, MessageRemediation } from "../foundation/index.js";

export const pluginHostFailureCodes = [
  "INVALID_PLUGIN_HOST_INPUT",
  "INVALID_TRUSTED_ROOT",
  "PLUGIN_DISCOVERY_FAILED",
  "PLUGIN_NOT_FOUND",
  "INVALID_PLUGIN_MANIFEST",
  "UNSUPPORTED_HOOK_CONTRACT",
  "UNSUPPORTED_CAPABILITY",
  "PLUGIN_EVIDENCE_MISMATCH",
  "PLUGIN_IDENTITY_CONFLICT",
  "PLUGIN_MODULE_INVALID",
  "PLUGIN_NOT_ACTIVE",
  "ACTIVE_PLUGIN_IDENTITY_MISMATCH",
  "ACTIVATION_STATE_CONFLICT",
  "ACTIVATION_STATE_FAILURE",
] as const;

export type PluginHostFailureCode = (typeof pluginHostFailureCodes)[number];

export type PluginHostFailure = Readonly<{
  code: PluginHostFailureCode;
  owner: "PluginHost";
  subjectIds: readonly string[];
  remediation: MessageRemediation | CommandRemediation;
}>;

const messages: Readonly<Record<PluginHostFailureCode, string>> = {
  INVALID_PLUGIN_HOST_INPUT: "請提供有效的 Plugin Host 輸入。",
  INVALID_TRUSTED_ROOT: "請提供有效的 trusted Plugin root。",
  PLUGIN_DISCOVERY_FAILED: "Plugin discovery 未完成。",
  PLUGIN_NOT_FOUND: "找不到指定的 Plugin。",
  INVALID_PLUGIN_MANIFEST: "Plugin manifest 無效。",
  UNSUPPORTED_HOOK_CONTRACT: "Plugin hook contract 不受支援。",
  UNSUPPORTED_CAPABILITY: "Plugin capability 不受支援。",
  PLUGIN_EVIDENCE_MISMATCH: "Plugin executable 或 resource evidence 不一致。",
  PLUGIN_IDENTITY_CONFLICT: "同一 Plugin ID 已綁定不同 identity。",
  PLUGIN_MODULE_INVALID: "Plugin module 不符合 manifest 宣告。",
  PLUGIN_NOT_ACTIVE: "指定的 Plugin 尚未啟用。",
  ACTIVE_PLUGIN_IDENTITY_MISMATCH: "Active Plugin identity 與 installed evidence 不一致。",
  ACTIVATION_STATE_CONFLICT: "Plugin activation state 已變更。",
  ACTIVATION_STATE_FAILURE: "Plugin activation state 操作未完成。",
};

export function isCanonicalPluginId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function pluginHostFailure(code: PluginHostFailureCode, subjectId?: unknown): PluginHostFailure {
  return Object.freeze({
    code,
    owner: "PluginHost",
    subjectIds: Object.freeze(isCanonicalPluginId(subjectId) ? [subjectId] : []),
    remediation: Object.freeze({ kind: "message", message: messages[code] }),
  });
}

export function pluginHostError(code: PluginHostFailureCode, subjectId?: unknown): Readonly<{ ok: false; error: PluginHostFailure }> {
  return Object.freeze({ ok: false, error: pluginHostFailure(code, subjectId) });
}
