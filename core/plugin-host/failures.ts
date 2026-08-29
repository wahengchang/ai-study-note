import type { CommandRemediation, MessageRemediation } from "../foundation/index.js";
import type { PluginCapability, PluginHookId } from "./contracts.js";

export const pluginHostFailureCodes = [
  "INVALID_PLUGIN_HOST_INPUT", "INVALID_TRUSTED_ROOT", "PLUGIN_DISCOVERY_FAILED", "PLUGIN_NOT_FOUND",
  "INVALID_PLUGIN_MANIFEST", "UNSUPPORTED_HOOK_CONTRACT", "UNSUPPORTED_CAPABILITY", "PLUGIN_EVIDENCE_MISMATCH",
  "PLUGIN_IDENTITY_CONFLICT", "PLUGIN_MODULE_INVALID", "PLUGIN_NOT_ACTIVE", "ACTIVE_PLUGIN_IDENTITY_MISMATCH",
  "ACTIVATION_STATE_CONFLICT", "ACTIVATION_STATE_FAILURE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING",
  "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CALLBACK_RESULT_INVALID",
  "PLUGIN_CALLBACK_FAILED", "PLUGIN_CAPABILITY_DENIED", "INVALID_PLUGIN_OPERATION_SNAPSHOT",
  "PLUGIN_VALIDATION_SERVICE_FAILED", "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED",
] as const;
export type PluginHostFailureCode = (typeof pluginHostFailureCodes)[number];
export type PluginDiagnosticDetail = Readonly<{
  pluginId: string;
  hook: PluginHookId;
  capability: PluginCapability;
  entryId: string;
  cause: "inactive" | "missing" | "identity-changed" | "rejected" | "invalid-result" | "callback-fault" | "capability-denied" | "reactivation-required";
}>;
export type PluginHostFailure = Readonly<{
  code: PluginHostFailureCode;
  owner: "PluginHost";
  subjectIds: readonly string[];
  remediation: MessageRemediation | CommandRemediation;
  detail?: PluginDiagnosticDetail;
}>;
const messages: Readonly<Record<PluginHostFailureCode, string>> = {
  INVALID_PLUGIN_HOST_INPUT: "請提供有效的 Plugin Host 輸入。", INVALID_TRUSTED_ROOT: "請提供有效的 trusted Plugin root。",
  PLUGIN_DISCOVERY_FAILED: "Plugin discovery 未完成。", PLUGIN_NOT_FOUND: "找不到指定的 Plugin。", INVALID_PLUGIN_MANIFEST: "Plugin manifest 無效。",
  UNSUPPORTED_HOOK_CONTRACT: "Plugin hook contract 不受支援。", UNSUPPORTED_CAPABILITY: "Plugin capability 不受支援。",
  PLUGIN_EVIDENCE_MISMATCH: "Plugin executable 或 resource evidence 不一致。", PLUGIN_IDENTITY_CONFLICT: "同一 Plugin ID 已綁定不同 identity。",
  PLUGIN_MODULE_INVALID: "Plugin module 不符合 manifest 宣告。", PLUGIN_NOT_ACTIVE: "指定的 Plugin 尚未啟用。",
  ACTIVE_PLUGIN_IDENTITY_MISMATCH: "Active Plugin identity 與 installed evidence 不一致。", ACTIVATION_STATE_CONFLICT: "Plugin activation state 已變更。",
  ACTIVATION_STATE_FAILURE: "Plugin activation state 操作未完成。", PLUGIN_BLOCK_INACTIVE: "請重新啟用此內容所需的 exact Plugin identity。",
  PLUGIN_BLOCK_MISSING: "請安裝並啟用此內容所需的 exact Plugin identity。", PLUGIN_BLOCK_IDENTITY_CHANGED: "目前安裝的 Plugin identity 與此內容不相符。",
  PLUGIN_VALIDATION_REJECTED: "Plugin validator 拒絕儲存此內容。", PLUGIN_CALLBACK_RESULT_INVALID: "Plugin callback 回傳不符合 plugin-hooks/v1 contract。",
  PLUGIN_CALLBACK_FAILED: "Plugin callback 執行失敗。", PLUGIN_CAPABILITY_DENIED: "Plugin 未獲授權使用此 capability。",
  INVALID_PLUGIN_OPERATION_SNAPSHOT: "Plugin operation snapshot 無效或已使用。", PLUGIN_VALIDATION_SERVICE_FAILED: "Plugin replacement 驗證未完成。",
  ACTIVE_PLUGIN_SOURCE_MISSING: "Active Plugin 的 installed source 不可用。", ACTIVE_PLUGIN_REACTIVATION_REQUIRED: "請重新啟用受影響的 exact Plugin identity。",
};
export function isCanonicalPluginId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
export function pluginHostFailure(code: PluginHostFailureCode, subjectId?: unknown, detail?: PluginDiagnosticDetail): PluginHostFailure {
  return Object.freeze({ code, owner: "PluginHost", subjectIds: Object.freeze(isCanonicalPluginId(subjectId) ? [subjectId] : []), remediation: Object.freeze({ kind: "message", message: messages[code] }), ...(detail === undefined ? {} : { detail: Object.freeze({ ...detail }) }) });
}
export function pluginHostError(code: PluginHostFailureCode, subjectId?: unknown, detail?: PluginDiagnosticDetail): Readonly<{ ok: false; error: PluginHostFailure }> { return Object.freeze({ ok: false, error: pluginHostFailure(code, subjectId, detail) }); }
