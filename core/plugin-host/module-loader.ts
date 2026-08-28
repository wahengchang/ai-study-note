import { init, parse } from "es-module-lexer";

import type { PluginManifestCallback } from "./contracts.js";
import { pluginHostFailure, type PluginHostFailure } from "./failures.js";

export type LoadedPluginModule = Readonly<{ namespace: Readonly<Record<string, unknown>> }>;
export type ModuleLoadResult = Readonly<{ ok: true; value: LoadedPluginModule }> | Readonly<{ ok: false; error: PluginHostFailure }>;

export async function loadVerifiedPluginModule(input: Readonly<{
  entryBytes: Uint8Array;
  manifestHash: string;
  callbacks: readonly PluginManifestCallback[];
  pluginId: string;
}>): Promise<ModuleLoadResult> {
  if (new Set(input.callbacks.map((callback) => callback.exportName)).size !== input.callbacks.length) return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
  try {
    await init;
    const source = new TextDecoder("utf-8", { fatal: true }).decode(input.entryBytes);
    const [imports] = parse(source);
    // `d === -2` 是不載入 module 的 import.meta；其餘 lexer record 都會建立 executable dependency graph。
    if (imports.some((item) => item.d !== -2)) return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
    const url = `data:text/javascript;base64,${Buffer.from(input.entryBytes).toString("base64")}#manifest=${encodeURIComponent(input.manifestHash)}`;
    // Plugin entry bytes與 manifest hash只在 runtime 決定；靜態 import 無法保留這個 verified-byte boundary。
    const namespace = (await import(url)) as Readonly<Record<string, unknown>>;
    if (input.callbacks.some((callback) => typeof namespace[callback.exportName] !== "function")) return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) };
    return Object.freeze({ ok: true, value: Object.freeze({ namespace }) });
  } catch { return { ok: false, error: pluginHostFailure("PLUGIN_MODULE_INVALID", input.pluginId) }; }
}
