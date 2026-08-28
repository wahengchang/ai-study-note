import { pathToFileURL } from "node:url";

import type { PluginManifestCallback } from "./contracts.js";
import { pluginHostFailure, type PluginHostFailure } from "./failures.js";

export type LoadedPluginModule = Readonly<{ namespace: Readonly<Record<string, unknown>> }>;
export type ModuleLoadResult = Readonly<{ ok: true; value: LoadedPluginModule }> | Readonly<{ ok: false; error: PluginHostFailure }>;

export async function loadVerifiedPluginModule(input: Readonly<{
  entryRealpath: string;
  manifestHash: string;
  callbacks: readonly PluginManifestCallback[];
  pluginId: string;
}>): Promise<ModuleLoadResult> {
  if (new Set(input.callbacks.map((callback) => callback.exportName)).size !== input.callbacks.length) {
    return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
  }
  const entryUrl = pathToFileURL(input.entryRealpath);
  entryUrl.searchParams.set("manifest", input.manifestHash);
  let namespace: Readonly<Record<string, unknown>>;
  try {
    // entry URL 是已完成 containment 與 digest 驗證的 runtime module；靜態 import 無法載入 operator 注入的檔案。
    namespace = (await import(entryUrl.href)) as Readonly<Record<string, unknown>>;
  } catch {
    return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
  }
  if (input.callbacks.some((callback) => typeof namespace[callback.exportName] !== "function")) {
    return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
  }
  return Object.freeze({ ok: true, value: Object.freeze({ namespace }) });
}
