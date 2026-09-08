import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";

import { canonicalJsonBytes, sha256Digest } from "../../core/foundation/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const callbacks = Object.freeze([
  Object.freeze({ hook: "cms/seo/analyze", exportName: "analyzeCmsSeo", priority: 10 }),
  Object.freeze({ hook: "public/seo/page", exportName: "contributePublicSeoPage", priority: 10 }),
  Object.freeze({ hook: "public/seo/site", exportName: "contributePublicSeoSite", priority: 10 }),
]);
const capabilities = Object.freeze(["cms-seo-analysis", "public-seo-page-contribution", "public-seo-site-contribution"]);

export type PluginPackageResult = Readonly<{ ok: true; destination: string; changed: boolean }> | Readonly<{ ok: false; code: "INVALID_ARGUMENTS" | "PACKAGE_SOURCE_INVALID" | "PACKAGE_DESTINATION_CONFLICT" | "PACKAGE_WRITE_FAILED" }>;

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
    for (const [file, content] of expected) { const actual = await readFile(join(destination, file)); if (actual.byteLength !== content.byteLength || !actual.every((value, index) => value === content[index])) return false; }
    return true;
  } catch { return false; }
}

export async function packagePlugin(input: Readonly<{ id: string; installedPluginsRoot: string }>): Promise<PluginPackageResult> {
  if (input.id !== "seo-basics" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.id) || input.installedPluginsRoot.trim() === "") return { ok: false, code: "INVALID_ARGUMENTS" };
  const source = join(repositoryRoot, "extensions", "plugins", input.id, "index.ts");
  let sourceText: string;
  try { sourceText = await readFile(source, "utf8"); } catch { return { ok: false, code: "PACKAGE_SOURCE_INVALID" }; }
  const compiled = ts.transpileModule(sourceText, { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText;
  const entry = new TextEncoder().encode(compiled);
  const manifest = Object.freeze({ manifestVersion: "plugin-manifest/v1" as const, id: input.id, version: "1.0.0", trustedLocal: true as const, hookContract: "plugin-hooks/v1" as const, capabilities, entry: Object.freeze({ file: "index.mjs", digest: sha256Digest(entry) }), callbacks, resources: Object.freeze([]) });
  const encodedManifest = canonicalJsonBytes(manifest);
  if (!encodedManifest.ok) return { ok: false, code: "PACKAGE_SOURCE_INVALID" };
  const manifestBytes = encodedManifest.value;
  const expected = new Map<string, Uint8Array>([["index.mjs", entry], ["plugin-manifest.json", manifestBytes]]);
  const destination = join(resolve(input.installedPluginsRoot), input.id);
  if (await identical(destination, expected)) return { ok: true, destination, changed: false };
  try {
    try { await stat(destination); return { ok: false, code: "PACKAGE_DESTINATION_CONFLICT" }; } catch {}
    await mkdir(dirname(destination), { recursive: true });
    const staging = await mkdtemp(join(dirname(destination), `.${basename(destination)}-`));
    try {
      for (const [file, content] of expected) await writeFile(join(staging, file), content, { flag: "wx" });
      await rename(staging, destination);
    } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
    return { ok: true, destination, changed: true };
  } catch { return { ok: false, code: "PACKAGE_WRITE_FAILED" }; }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let id: string | undefined; let installedPluginsRoot: string | undefined;
  try { const parsed = parseArgs({ args: argv, options: { id: { type: "string" }, "installed-plugins-root": { type: "string" } }, strict: true }); id = parsed.values.id; installedPluginsRoot = parsed.values["installed-plugins-root"]; } catch { process.stderr.write("PLUGIN_PACKAGE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  const result = await packagePlugin({ id: id ?? "", installedPluginsRoot: installedPluginsRoot ?? "" });
  if (!result.ok) { process.stderr.write(`PLUGIN_PACKAGE_FAILED code=${result.code}\n`); process.exitCode = result.code === "INVALID_ARGUMENTS" ? 2 : 1; return; }
  process.stdout.write(`PLUGIN_PACKAGE_OK id=${id} changed=${result.changed}\n`);
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
