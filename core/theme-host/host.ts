import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import { ThemeRendererContract, type ActiveThemeRendererSource, type ActiveThemeSnapshot, type CreateThemeHostInput, type ThemeActivationIdentity, type ThemeActivationState, type ThemeCandidate, type ThemeDiscoveryReport, type ThemeHost, type ThemeHostResult, type ThemeManifestV1, type VerifiedThemeResource } from "./contracts.js";
import { isCanonicalThemeId, themeHostError, type ThemeHostFailure } from "./failures.js";

type TrustedRoot = Readonly<{ repositoryRoot: string; installedThemesRoot: string; dev: number; ino: number; uid: number; mode: number }>;
type InstalledTheme = Readonly<{ manifest: ThemeManifestV1; manifestHash: Digest; entryBytes: Uint8Array; resources: readonly VerifiedThemeResource[] }>;
type State = Readonly<{ value: ThemeActivationState; digest: Digest }>;

function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function inside(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safeFile(value: unknown): value is string { return typeof value === "string" && value.length > 0 && !value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."); }
function same(left: ThemeActivationIdentity, right: ThemeActivationIdentity): boolean { return left.id === right.id && left.version === right.version && left.rendererContract === right.rendererContract && left.manifestHash === right.manifestHash; }
function copyIdentity(value: ThemeActivationIdentity): ThemeActivationIdentity { return Object.freeze({ id: value.id, version: value.version, rendererContract: value.rendererContract, manifestHash: value.manifestHash }); }
function identity(value: unknown): ThemeActivationIdentity | null {
  if (!exact(value, ["id", "version", "rendererContract", "manifestHash"])) return null;
  const id = value.id as string;
  const version = value.version as string;
  const manifestHash = value.manifestHash as Digest;
  if (!isCanonicalThemeId(id) || version.length === 0 || value.rendererContract !== ThemeRendererContract || !isDigest(manifestHash)) return null;
  return Object.freeze({ id, version, rendererContract: ThemeRendererContract, manifestHash });
}
function parseState(value: unknown): ThemeActivationState | null {
  if (!exact(value, ["contract", "active"]) && !exact(value, ["contract"])) return null;
  if (value.contract !== "theme-activation-state/v1") return null;
  if (!Object.hasOwn(value, "active")) return Object.freeze({ contract: "theme-activation-state/v1" });
  const active = identity(value.active);
  return active === null ? null : Object.freeze({ contract: "theme-activation-state/v1", active });
}
function stateDigest(value: ThemeActivationState): Digest | null {
  const bytes = canonicalJsonBytes(value);
  return bytes.ok ? sha256Digest(bytes.value) : null;
}
function snapshot(state: State): ActiveThemeSnapshot { return Object.freeze(state.value.active === undefined ? { digest: state.digest } : { identity: copyIdentity(state.value.active), digest: state.digest }); }
function candidate(value: InstalledTheme): ThemeCandidate { return Object.freeze({ id: value.manifest.id, version: value.manifest.version, rendererContract: value.manifest.rendererContract, manifestHash: value.manifestHash }); }

async function absoluteDirectory(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  try { const resolved = await realpath(value); return (await stat(resolved)).isDirectory() ? resolved : null; } catch { return null; }
}
async function trustedRoot(input: CreateThemeHostInput): Promise<TrustedRoot | null> {
  const repositoryRoot = await absoluteDirectory(input.repositoryRoot);
  const installedThemesRoot = await absoluteDirectory(input.installedThemesRoot);
  if (repositoryRoot === null || installedThemesRoot === null || repositoryRoot === installedThemesRoot || inside(repositoryRoot, installedThemesRoot) || inside(installedThemesRoot, repositoryRoot)) return null;
  try {
    const metadata = await stat(installedThemesRoot);
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!metadata.isDirectory() || uid === undefined || (metadata.uid !== uid && metadata.uid !== 0) || (metadata.mode & 0o022) !== 0) return null;
    return Object.freeze({ repositoryRoot, installedThemesRoot, dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode });
  } catch { return null; }
}
async function validRoot(root: TrustedRoot): Promise<boolean> {
  try {
    if (await realpath(root.installedThemesRoot) !== root.installedThemesRoot) return false;
    const metadata = await stat(root.installedThemesRoot);
    return metadata.isDirectory() && metadata.dev === root.dev && metadata.ino === root.ino && metadata.uid === root.uid && metadata.mode === root.mode && (metadata.mode & 0o022) === 0;
  } catch { return false; }
}
async function resolvedFile(directory: string, file: string): Promise<string | null> {
  if (!safeFile(file)) return null;
  try { const resolved = await realpath(path.join(directory, file)); return inside(directory, resolved) && (await stat(resolved)).isFile() ? resolved : null; } catch { return null; }
}
type ParsedThemeManifest = Readonly<Omit<ThemeManifestV1, "rendererContract"> & { rendererContract: string }>;
/** rendererContract 只檢查型別，contract 不符由 `load` 以 `UNSUPPORTED_RENDERER_CONTRACT` 分開回報。 */
function manifest(bytes: Uint8Array): ParsedThemeManifest | null {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !Buffer.from(canonical.value).equals(Buffer.from(bytes))) return null;
  if (!exact(value, ["manifestVersion", "id", "version", "trustedLocal", "rendererContract", "entry", "resources"])) return null;
  const source = value as Readonly<Record<string, unknown>>;
  const id = source.id as string;
  const version = source.version as string;
  if (source.manifestVersion !== "theme-manifest/v1" || !isCanonicalThemeId(id) || version.length === 0 || source.trustedLocal !== true || typeof source.rendererContract !== "string" || source.rendererContract.length === 0 || !exact(source.entry, ["file", "digest"]) || !Array.isArray(source.resources)) return null;
  const entry = source.entry as Readonly<{ file: string; digest: Digest }>;
  if (!safeFile(entry.file) || !isDigest(entry.digest)) return null;
  const resources: Array<Readonly<{ file: string; digest: Digest }>> = [];
  const files = new Set<string>([entry.file]);
  for (const resource of source.resources) {
    if (!exact(resource, ["file", "digest"])) return null;
    const item = resource as Readonly<{ file: string; digest: Digest }>;
    if (!safeFile(item.file) || !isDigest(item.digest) || files.has(item.file)) return null;
    files.add(item.file);
    resources.push(Object.freeze({ file: item.file, digest: item.digest }));
  }
  resources.sort((left, right) => compareCodeUnits(left.file, right.file));
  return Object.freeze({ manifestVersion: "theme-manifest/v1", id, version, trustedLocal: true, rendererContract: source.rendererContract, entry: Object.freeze({ file: entry.file, digest: entry.digest }), resources: Object.freeze(resources) });
}

async function load(root: TrustedRoot, id: string): Promise<ThemeHostResult<InstalledTheme>> {
  if (!isCanonicalThemeId(id)) return themeHostError("THEME_NOT_FOUND", id);
  if (!(await validRoot(root))) return themeHostError("INVALID_TRUSTED_ROOT");
  let directory: string;
  try { directory = await realpath(path.join(root.installedThemesRoot, id)); if (!inside(root.installedThemesRoot, directory) || !(await stat(directory)).isDirectory()) return themeHostError("THEME_NOT_FOUND", id); } catch { return themeHostError("THEME_NOT_FOUND", id); }
  const manifestPath = await resolvedFile(directory, "theme-manifest.json");
  if (manifestPath === null) return themeHostError("INVALID_THEME_MANIFEST", id);
  let manifestBytes: Uint8Array;
  try { manifestBytes = new Uint8Array(await readFile(manifestPath)); } catch { return themeHostError("THEME_EVIDENCE_MISMATCH", id); }
  const declared = manifest(manifestBytes);
  if (declared === null || declared.id !== id) return themeHostError("INVALID_THEME_MANIFEST", id);
  if (declared.rendererContract !== ThemeRendererContract) return themeHostError("UNSUPPORTED_RENDERER_CONTRACT", id);
  const parsed: ThemeManifestV1 = Object.freeze({ ...declared, rendererContract: ThemeRendererContract });
  const entryPath = await resolvedFile(directory, parsed.entry.file);
  if (entryPath === null) return themeHostError("THEME_EVIDENCE_MISMATCH", id);
  let entryBytes: Uint8Array;
  try { entryBytes = new Uint8Array(await readFile(entryPath)); } catch { return themeHostError("THEME_EVIDENCE_MISMATCH", id); }
  if (sha256Digest(entryBytes) !== parsed.entry.digest) return themeHostError("THEME_EVIDENCE_MISMATCH", id);
  const resources: VerifiedThemeResource[] = [];
  for (const resource of parsed.resources) {
    const resourcePath = await resolvedFile(directory, resource.file);
    if (resourcePath === null) return themeHostError("THEME_EVIDENCE_MISMATCH", id);
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await readFile(resourcePath)); } catch { return themeHostError("THEME_EVIDENCE_MISMATCH", id); }
    if (sha256Digest(bytes) !== resource.digest) return themeHostError("THEME_EVIDENCE_MISMATCH", id);
    resources.push(Object.freeze({ file: resource.file, bytes: copyBytes(bytes), digest: resource.digest }));
  }
  if (!(await validRoot(root))) return themeHostError("INVALID_TRUSTED_ROOT");
  return Object.freeze({ ok: true, value: Object.freeze({ manifest: parsed, manifestHash: sha256Digest(manifestBytes), entryBytes: copyBytes(entryBytes), resources: Object.freeze(resources) }) });
}

class Host implements ThemeHost {
  public constructor(private readonly root: TrustedRoot, private readonly activationState: CreateThemeHostInput["activationState"]) {}

  private async state(): Promise<ThemeHostResult<State>> {
    try {
      const value = parseState(await this.activationState.read());
      const digest = value === null ? null : stateDigest(value);
      return value === null || digest === null ? themeHostError("ACTIVATION_STATE_FAILURE") : Object.freeze({ ok: true, value: Object.freeze({ value, digest }) });
    } catch { return themeHostError("ACTIVATION_STATE_FAILURE"); }
  }

  public async discover(): Promise<ThemeHostResult<ThemeDiscoveryReport>> {
    if (!(await validRoot(this.root))) return themeHostError("INVALID_TRUSTED_ROOT");
    let names: string[];
    try { names = (await readdir(this.root.installedThemesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name).sort(compareCodeUnits); } catch { return themeHostError("THEME_DISCOVERY_FAILED"); }
    const candidates: ThemeCandidate[] = [];
    const rejections: ThemeHostFailure[] = [];
    for (const name of names) {
      const result = await load(this.root, name);
      if (result.ok) candidates.push(candidate(result.value)); else rejections.push(result.error as ThemeHostFailure);
    }
    return Object.freeze({ ok: true, value: Object.freeze({ candidates: Object.freeze(candidates), rejections: Object.freeze(rejections) }) });
  }

  public async activate(input: Readonly<{ identity: ThemeActivationIdentity }>): Promise<ThemeHostResult<ActiveThemeSnapshot>> {
    const requested = identity(input.identity);
    if (requested === null) return themeHostError("INVALID_THEME_HOST_INPUT");
    const state = await this.state();
    if (!state.ok) return state;
    if (state.value.value.active !== undefined && !same(state.value.value.active, requested)) return themeHostError("THEME_IDENTITY_CONFLICT", requested.id);
    const installed = await load(this.root, requested.id);
    if (!installed.ok) return installed;
    if (!same(candidate(installed.value), requested)) return themeHostError("THEME_IDENTITY_CONFLICT", requested.id);
    const next: ThemeActivationState = Object.freeze({ contract: "theme-activation-state/v1", active: requested });
    try { if (!(await this.activationState.compareAndReplace({ expectedDigest: state.value.digest, nextState: next }))) return themeHostError("ACTIVATION_STATE_CONFLICT", requested.id); } catch { return themeHostError("ACTIVATION_STATE_FAILURE", requested.id); }
    const digest = stateDigest(next);
    return digest === null ? themeHostError("ACTIVATION_STATE_FAILURE", requested.id) : Object.freeze({ ok: true, value: snapshot(Object.freeze({ value: next, digest })) });
  }

  public async deactivate(input: Readonly<{ identity: ThemeActivationIdentity }>): Promise<ThemeHostResult<ActiveThemeSnapshot>> {
    const requested = identity(input.identity);
    if (requested === null) return themeHostError("INVALID_THEME_HOST_INPUT");
    const state = await this.state();
    if (!state.ok) return state;
    if (state.value.value.active === undefined || !same(state.value.value.active, requested)) return themeHostError("THEME_NOT_ACTIVE", requested.id);
    const next: ThemeActivationState = Object.freeze({ contract: "theme-activation-state/v1" });
    try { if (!(await this.activationState.compareAndReplace({ expectedDigest: state.value.digest, nextState: next }))) return themeHostError("ACTIVATION_STATE_CONFLICT", requested.id); } catch { return themeHostError("ACTIVATION_STATE_FAILURE", requested.id); }
    const digest = stateDigest(next);
    return digest === null ? themeHostError("ACTIVATION_STATE_FAILURE", requested.id) : Object.freeze({ ok: true, value: snapshot(Object.freeze({ value: next, digest })) });
  }

  public async getActiveSnapshot(): Promise<ThemeHostResult<ActiveThemeSnapshot>> { const state = await this.state(); return state.ok ? Object.freeze({ ok: true, value: snapshot(state.value) }) : state; }

  public async resolveActiveRendererSource(): Promise<ThemeHostResult<ActiveThemeRendererSource>> {
    const state = await this.state();
    if (!state.ok) return state;
    const active = state.value.value.active;
    if (active === undefined) return themeHostError("THEME_NOT_ACTIVE");
    const installed = await load(this.root, active.id);
    if (!installed.ok) return installed.error.code === "THEME_NOT_FOUND" ? themeHostError("ACTIVE_THEME_IDENTITY_MISMATCH", active.id) : installed;
    const found = candidate(installed.value);
    if (!same(found, active)) return themeHostError("ACTIVE_THEME_IDENTITY_MISMATCH", active.id);
    return Object.freeze({ ok: true, value: Object.freeze({ identity: copyIdentity(active), activeStateDigest: state.value.digest, entryBytes: copyBytes(installed.value.entryBytes), entryDigest: installed.value.manifest.entry.digest, resources: Object.freeze(installed.value.resources.map((resource) => Object.freeze({ file: resource.file, bytes: copyBytes(resource.bytes), digest: resource.digest }))) }) });
  }
}

export async function createThemeHost(input: CreateThemeHostInput): Promise<ThemeHostResult<ThemeHost>> {
  if (input === null || typeof input !== "object" || input.activationState === null || typeof input.activationState !== "object" || typeof input.activationState.read !== "function" || typeof input.activationState.compareAndReplace !== "function") return themeHostError("INVALID_THEME_HOST_INPUT");
  const root = await trustedRoot(input);
  return root === null ? themeHostError("INVALID_TRUSTED_ROOT") : Object.freeze({ ok: true, value: new Host(root, input.activationState) });
}
