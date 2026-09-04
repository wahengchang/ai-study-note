import { init, parse } from "es-module-lexer";

export async function runtimeIsSelfContained(bytes: Uint8Array): Promise<boolean> {
  try {
    await init;
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const [imports] = parse(source);
    return imports.every((item) => item.d === -2);
  } catch {
    return false;
  }
}
