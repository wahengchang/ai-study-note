import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import path from "node:path";
import { canonicalJsonBytes, sha256Digest, type Digest } from "../../core/foundation/index.js";


export type PackageKind = "plugin" | "theme";

type SourceFile = Readonly<{ source: string; target: string }>;
type PackageDefinition = Readonly<{
  kind: PackageKind;
  id: string;
  version: "1.0.0";
  files: readonly SourceFile[];
  callbacks?: readonly Readonly<{ hook: string; exportName: string; priority: number }>[];
  capabilities?: readonly string[];
}>;

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const definitions: Readonly<Record<PackageKind, PackageDefinition>> = Object.freeze({
  plugin: Object.freeze({
    kind: "plugin",
    id: "seo-basics",
    version: "1.0.0",
    files: Object.freeze([{ source: "extensions/plugins/seo-basics/runtime.mjs", target: "runtime.mjs" }]),
    capabilities: Object.freeze(["cms-seo-analysis", "public-seo-page-contribution", "public-seo-site-contribution"]),
    callbacks: Object.freeze([
      Object.freeze({ hook: "cms/seo/analyze", exportName: "analyzeCmsSeo", priority: 0 }),
      Object.freeze({ hook: "public/seo/page", exportName: "contributePageSeo", priority: 0 }),
      Object.freeze({ hook: "public/seo/site", exportName: "contributeSiteSeo", priority: 0 }),
    ]),
  }),
  theme: Object.freeze({
    kind: "theme",
    id: "study-notes",
    version: "1.0.0",
    files: Object.freeze([
      { source: "extensions/themes/study-notes/runtime.mjs", target: "runtime.mjs" },
      { source: "extensions/themes/study-notes/assets/study-notes.css", target: "assets/study-notes.css" },
    ]),
  }),
});

function safeMetadata(value: Stats, kind: "file" | "directory"): boolean {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid !== undefined && (value.uid === uid || value.uid === 0) && (value.mode & 0o022) === 0 && (kind === "file" ? value.isFile() : value.isDirectory());
}

async function readSource(relative: string): Promise<Uint8Array | null> {
  const candidate = path.join(repositoryRoot, relative);
  try {
    const before = await lstat(candidate);
    if (!safeMetadata(before, "file") || before.isSymbolicLink()) return null;
    const bytes = await readFile(candidate);
    const after = await stat(candidate);
    return after.dev === before.dev && after.ino === before.ino && after.size === before.size ? bytes : null;
  } catch {
    return null;
  }
}

function manifest(definition: PackageDefinition, files: ReadonlyMap<string, Uint8Array>): Uint8Array | null {
  if (definition.kind === "plugin") {
    const entry = files.get("runtime.mjs");
    if (entry === undefined || definition.callbacks === undefined || definition.capabilities === undefined) return null;
    const value = {
      manifestVersion: "plugin-manifest/v1" as const,
      id: definition.id,
      version: definition.version,
      trustedLocal: true as const,
      hookContract: "plugin-hooks/v1" as const,
      capabilities: definition.capabilities,
      entry: { file: "runtime.mjs", digest: sha256Digest(entry) },
      callbacks: definition.callbacks,
      resources: [],
    };
    const encoded = canonicalJsonBytes(value);
    return encoded.ok ? encoded.value : null;
  }
  const runtime = files.get("runtime.mjs");
  const stylesheet = files.get("assets/study-notes.css");
  if (runtime === undefined || stylesheet === undefined) return null;
  const value = {
    contract: "theme-manifest/v1" as const,
    id: definition.id,
    version: definition.version,
    runtime: { file: "runtime.mjs", digest: sha256Digest(runtime) },
    resources: [{ file: "assets/study-notes.css", digest: sha256Digest(stylesheet) }],
  };
  const encoded = canonicalJsonBytes(value);
  return encoded.ok ? encoded.value : null;
}

async function packageFiles(directory: string): Promise<ReadonlyMap<string, Uint8Array> | null> {
  const files = new Map<string, Uint8Array>();
  const visit = async (current: string, prefix: string): Promise<boolean> => {
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const target = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const details = await lstat(candidate);
        if (!safeMetadata(details, "directory") || details.isSymbolicLink() || !(await visit(candidate, target))) return false;
        continue;
      }
      const details = await lstat(candidate);
      if (!entry.isFile() || !safeMetadata(details, "file") || details.isSymbolicLink()) return false;
      const bytes = await readFile(candidate);
      const repeated = await stat(candidate);
      if (repeated.dev !== details.dev || repeated.ino !== details.ino || repeated.size !== details.size) return false;
      files.set(target, bytes);
    }
    return true;
  };
  return await visit(directory, "") ? files : null;
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

async function destinationMatches(destination: string, expected: ReadonlyMap<string, Uint8Array>): Promise<"missing" | "equal" | "invalid"> {
  try {
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !safeMetadata(metadata, "directory")) return "invalid";
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT" ? "missing" : "invalid";
  }
  const actual = await packageFiles(destination);
  if (actual === null || actual.size !== expected.size || [...expected].some(([file, bytes]) => {
    const present = actual.get(file);
    return present === undefined || !equal(present, bytes);
  })) return "invalid";
  return "equal";
}

async function unchangedSources(definition: PackageDefinition, expected: ReadonlyMap<string, Uint8Array>): Promise<boolean> {
  for (const file of definition.files) {
    const current = await readSource(file.source);
    const previous = expected.get(file.target);
    if (current === null || previous === undefined || !equal(current, previous)) return false;
  }
  return true;
}

export async function packageExtension(input: Readonly<{ kind: PackageKind; id: string; installedRoot: string }>): Promise<Readonly<{ ok: true; manifestHash: Digest }> | Readonly<{ ok: false; code: string }>> {
  const definition = definitions[input.kind];
  if (input.id !== definition.id || !path.isAbsolute(input.installedRoot) || path.resolve(input.installedRoot) !== input.installedRoot || path.relative(repositoryRoot, input.installedRoot) === "" || !path.relative(repositoryRoot, input.installedRoot).startsWith("..")) return { ok: false, code: "INVALID_ARGUMENTS" };
  let root: Stats;
  try { root = await stat(input.installedRoot); } catch { return { ok: false, code: "INVALID_DESTINATION" }; }
  if (!safeMetadata(root, "directory")) return { ok: false, code: "INVALID_DESTINATION" };
  const files = new Map<string, Uint8Array>();
  for (const file of definition.files) {
    const bytes = await readSource(file.source);
    if (bytes === null) return { ok: false, code: "SOURCE_DRIFT" };
    files.set(file.target, bytes);
  }
  const manifestBytes = manifest(definition, files);
  if (manifestBytes === null) return { ok: false, code: "PACKAGE_ENCODING_FAILED" };
  files.set(input.kind === "plugin" ? "plugin.json" : "theme.json", manifestBytes);
  const destination = path.join(input.installedRoot, definition.id);
  const current = await destinationMatches(destination, files);
  if (current === "equal") return { ok: true, manifestHash: sha256Digest(manifestBytes) };
  if (current === "invalid") return { ok: false, code: "DESTINATION_CONFLICT" };

  const staging = path.join(input.installedRoot, `.${definition.id}.staging-${process.pid}-${randomBytes(12).toString("hex")}`);
  try {
    await mkdir(staging, { mode: 0o700 });
    for (const [file, bytes] of files) {
      const target = path.join(staging, file);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
    }
    if (!(await unchangedSources(definition, files))) return { ok: false, code: "SOURCE_DRIFT" };
    await rename(staging, destination);
    return { ok: true, manifestHash: sha256Digest(manifestBytes) };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") return { ok: false, code: "DESTINATION_CONFLICT" };
    return { ok: false, code: "PACKAGE_FAILED" };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
