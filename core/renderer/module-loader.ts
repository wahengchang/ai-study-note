import { init, parse } from "es-module-lexer";

export type LoadedRendererModule = Readonly<{ namespace: Readonly<Record<string, unknown>> }>;

/** 只從 Projection 已封存且已驗證的 bytes 載入；不解析外部相依。 */
export async function loadVerifiedRendererModule(input: Readonly<{
  entryBytes: Uint8Array;
  manifestHash: string;
  requiredExports: readonly string[];
}>): Promise<LoadedRendererModule | null> {
  if (new Set(input.requiredExports).size !== input.requiredExports.length) return null;
  try {
    await init;
    const source = new TextDecoder("utf-8", { fatal: true }).decode(input.entryBytes);
    const [imports] = parse(source);
    // import.meta 不會建立依賴圖；其餘 import 一律使封存 bytes 邊界失效。
    if (imports.some((item) => item.d !== -2)) return null;
    const url = `data:text/javascript;base64,${Buffer.from(input.entryBytes).toString("base64")}#manifest=${encodeURIComponent(input.manifestHash)}`;
    const namespace = (await import(url)) as Readonly<Record<string, unknown>>;
    if (input.requiredExports.some((name) => typeof namespace[name] !== "function")) return null;
    return Object.freeze({ namespace });
  } catch {
    return null;
  }
}
