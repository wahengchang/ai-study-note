import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";

import { canonicalJsonBytes, sha256Digest } from "../../core/foundation/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export type ThemePackageResult = Readonly<{ ok: true; destination: string; changed: boolean }> | Readonly<{ ok: false; code: "INVALID_ARGUMENTS" | "PACKAGE_SOURCE_INVALID" | "PACKAGE_DESTINATION_CONFLICT" | "PACKAGE_WRITE_FAILED" }>;

async function files(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) for (const child of await files(path)) names.push(`${entry.name}/${child}`);
    else if (entry.isFile()) names.push(entry.name);
    else throw new Error("unsupported package entry");
  }
  return Object.freeze(names);
}

async function identical(destination: string, expected: ReadonlyMap<string, Uint8Array>): Promise<boolean> {
  try {
    if (!(await stat(destination)).isDirectory()) return false;
    const actual = await files(destination);
    if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) return false;
    for (const [file, content] of expected) {
      const actualBytes = await readFile(join(destination, file));
      if (actualBytes.byteLength !== content.byteLength || !actualBytes.every((value, index) => value === content[index])) return false;
    }
    return true;
  } catch { return false; }
}

export async function packageTheme(input: Readonly<{ id: string; installedThemesRoot: string }>): Promise<ThemePackageResult> {
  if (input.id !== "study-notes" || input.installedThemesRoot.trim() === "") return { ok: false, code: "INVALID_ARGUMENTS" };
  const sourceRoot = join(repositoryRoot, "extensions", "themes", input.id);
  let sourceText: string; let stylesheet: Uint8Array;
  try {
    [sourceText, stylesheet] = await Promise.all([readFile(join(sourceRoot, "index.ts"), "utf8"), readFile(join(sourceRoot, "style.css"))]);
  } catch { return { ok: false, code: "PACKAGE_SOURCE_INVALID" }; }
  const entry = new TextEncoder().encode(ts.transpileModule(sourceText, { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText);
  const manifest = Object.freeze({ manifestVersion: "theme-manifest/v1" as const, id: input.id, version: "1.0.0", trustedLocal: true as const, rendererContract: "theme-renderer/v1" as const, entry: Object.freeze({ file: "index.mjs", digest: sha256Digest(entry) }), resources: Object.freeze([Object.freeze({ file: "style.css", digest: sha256Digest(stylesheet) })]) });
  const manifestBytes = canonicalJsonBytes(manifest);
  if (!manifestBytes.ok) return { ok: false, code: "PACKAGE_SOURCE_INVALID" };
  const expected = new Map<string, Uint8Array>([["index.mjs", entry], ["style.css", stylesheet], ["theme-manifest.json", manifestBytes.value]]);
  const destination = join(resolve(input.installedThemesRoot), input.id);
  if (await identical(destination, expected)) return { ok: true, destination, changed: false };
  try {
    try { await stat(destination); return { ok: false, code: "PACKAGE_DESTINATION_CONFLICT" }; } catch {}
    await mkdir(dirname(destination), { recursive: true });
    const staging = await mkdtemp(join(dirname(destination), `.${basename(destination)}-`));
    try {
      for (const [file, bytes] of expected) await writeFile(join(staging, file), bytes, { flag: "wx" });
      await rename(staging, destination);
    } catch (cause) { await rm(staging, { recursive: true, force: true }); throw cause; }
    return { ok: true, destination, changed: true };
  } catch { return { ok: false, code: "PACKAGE_WRITE_FAILED" }; }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let id: string | undefined; let installedThemesRoot: string | undefined;
  try { const parsed = parseArgs({ args: argv, options: { id: { type: "string" }, "installed-themes-root": { type: "string" } }, strict: true }); id = parsed.values.id; installedThemesRoot = parsed.values["installed-themes-root"]; } catch { process.stderr.write("THEME_PACKAGE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  const result = await packageTheme({ id: id ?? "", installedThemesRoot: installedThemesRoot ?? "" });
  if (!result.ok) { process.stderr.write(`THEME_PACKAGE_FAILED code=${result.code}\n`); process.exitCode = result.code === "INVALID_ARGUMENTS" ? 2 : 1; return; }
  process.stdout.write(`THEME_PACKAGE_OK id=${id} changed=${result.changed}\n`);
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
