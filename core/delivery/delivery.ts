import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";
import { isArtifactFilePath } from "../renderer/index.js";
import type { ArtifactManifest, CreatePublicDeliveryInput, DeliveryFailure, DeliveryResult, PublicDelivery, VerifiedDeliveredArtifact } from "./contracts.js";

const manifestFile = "artifact-manifest.json";

function fail(code: DeliveryFailure["code"]): DeliveryResult<never> { return { ok: false, error: { code, owner: "Delivery", subjectIds: [], remediation: { kind: "message", message: "Static artifact 無法交付。" } } }; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safe(file: unknown): file is string { return isArtifactFilePath(file) && file !== manifestFile; }
function sortedUnique(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || compare(values[index - 1] ?? "", value) < 0); }
function manifestBytes(manifest: ArtifactManifest): Uint8Array | null { const { totalDigest, ...payload } = manifest; const payloadBytes = canonicalJsonBytes(payload); const full = canonicalJsonBytes(manifest); return !payloadBytes.ok || !full.ok || sha256Digest(payloadBytes.value) !== totalDigest ? null : full.value; }

function filesIn(directory: string, relative = ""): readonly string[] | null {
  try {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const nested = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const target = path.join(directory, entry.name);
      const metadata = lstatSync(target);
      if (metadata.isSymbolicLink()) return null;
      if (metadata.isDirectory()) {
        const child = filesIn(target, nested);
        if (child === null) return null;
        files.push(...child);
      } else if (metadata.isFile()) files.push(nested);
      else return null;
    }
    return files;
  } catch { return null; }
}

function validManifest(value: unknown, expectedDigest: Digest): value is ArtifactManifest {
  const input = value as { contract: unknown; rendererInputDigest: unknown; totalDigest: unknown; files: unknown; routes: unknown };
  if (!exact(value, ["contract", "rendererInputDigest", "provenance", "routes", "files", "totalDigest"]) || input.contract !== "artifact-manifest/v1" || typeof input.rendererInputDigest !== "string" || !isDigest(input.rendererInputDigest) || typeof input.totalDigest !== "string" || !isDigest(input.totalDigest) || input.totalDigest !== expectedDigest || !Array.isArray(input.files) || !Array.isArray(input.routes)) return false;
  const files = input.files;
  const routes = input.routes;
  if (!files.every((candidate) => { if (!exact(candidate, ["path", "digest", "byteLength"])) return false; const file = candidate as { path: unknown; digest: unknown; byteLength: unknown }; return typeof file.path === "string" && safe(file.path) && typeof file.digest === "string" && isDigest(file.digest) && Number.isSafeInteger(file.byteLength) && (file.byteLength as number) >= 0; }) || !sortedUnique(files.map((file) => (file as { path: string }).path))) return false;
  const filePaths = new Set(files.map((file) => (file as { path: string }).path));
  return routes.every((candidate) => { if (!exact(candidate, ["route", "filePath"])) return false; const route = candidate as { route: unknown; filePath: unknown }; return typeof route.route === "string" && typeof route.filePath === "string" && route.route.startsWith("/") && !route.route.includes("\\") && !route.route.includes("%") && !route.route.includes("//") && (route.route === "/" || !route.route.endsWith("/")) && safe(route.filePath) && route.filePath.endsWith(".html") && filePaths.has(route.filePath); }) && sortedUnique(routes.map((route) => (route as { route: string }).route));
}

function snapshot(directory: string, artifactDigest: Digest): VerifiedDeliveredArtifact | null {
  try {
    const found = filesIn(directory);
    if (found === null) return null;
    const raw = new Uint8Array(readFileSync(path.join(directory, manifestFile)));
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!validManifest(parsed, artifactDigest)) return null;
    const manifest = parsed as ArtifactManifest;
    const canonical = manifestBytes(manifest);
    if (canonical === null || canonical.byteLength !== raw.byteLength || canonical.some((byte, index) => byte !== raw[index])) return null;
    const expected = [manifestFile, ...manifest.files.map((file) => file.path)].sort(compare);
    if (found.length !== expected.length || found.some((file, index) => file !== expected[index])) return null;
    const files = manifest.files.map((file) => {
      const target = path.join(directory, file.path);
      if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) throw new Error("invalid artifact file");
      const bytes = new Uint8Array(readFileSync(target));
      if (bytes.byteLength !== file.byteLength || sha256Digest(bytes) !== file.digest) throw new Error("invalid artifact bytes");
      return Object.freeze({ path: file.path, bytes: copyBytes(bytes), digest: file.digest });
    });
    return Object.freeze({ artifactDigest, manifest: Object.freeze(manifest), files: Object.freeze(files) });
  } catch { return null; }
}

function rendererOutput(value: unknown): value is Parameters<PublicDelivery["deliver"]>[0] {
  const input = value as { contract: unknown; rendererInputDigest: unknown; outputDigest: unknown; files: unknown; routes: unknown };
  if (!exact(value, ["contract", "rendererInputDigest", "provenance", "routes", "files", "outputDigest"]) || input.contract !== "renderer-output/v1" || typeof input.rendererInputDigest !== "string" || !isDigest(input.rendererInputDigest) || typeof input.outputDigest !== "string" || !isDigest(input.outputDigest) || !Array.isArray(input.files) || !Array.isArray(input.routes)) return false;
  const files = input.files;
  const routes = input.routes;
  return files.every((candidate) => { if (!exact(candidate, ["path", "bytes", "digest"])) return false; const file = candidate as { path: unknown; bytes: unknown; digest: unknown }; return typeof file.path === "string" && safe(file.path) && file.bytes instanceof Uint8Array && typeof file.digest === "string" && isDigest(file.digest) && sha256Digest(file.bytes) === file.digest; }) && new Set(files.map((file) => (file as { path: string }).path)).size === files.length && routes.every((candidate) => { if (!exact(candidate, ["route", "filePath"])) return false; const route = candidate as { route: unknown; filePath: unknown }; return typeof route.route === "string" && typeof route.filePath === "string" && safe(route.filePath) && route.filePath.endsWith(".html"); }) && sortedUnique(routes.map((route) => (route as { route: string }).route)) && new Set(routes.map((route) => (route as { filePath: string }).filePath)).size === routes.length;
}

class Delivery implements PublicDelivery {
  public constructor(private readonly root: string) {}

  public deliver(output: Parameters<PublicDelivery["deliver"]>[0]): DeliveryResult<Readonly<{ artifactDigest: Digest; directory: string; manifest: ArtifactManifest }>> {
    if (!rendererOutput(output)) return fail("INVALID_RENDERER_OUTPUT");
    const files = [...output.files].sort((left, right) => compare(left.path, right.path));
    const routes = [...output.routes].sort((left, right) => compare(left.route, right.route));
    if (!routes.every((route) => files.some((file) => file.path === route.filePath))) return fail("INVALID_RENDERER_OUTPUT");
    const payload = { contract: "artifact-manifest/v1" as const, rendererInputDigest: output.rendererInputDigest, provenance: output.provenance, routes: routes.map((route) => ({ ...route })), files: files.map((file) => ({ path: file.path, digest: file.digest, byteLength: file.bytes.byteLength })) };
    const payloadBytes = canonicalJsonBytes(payload);
    if (!payloadBytes.ok) return fail("INVALID_RENDERER_OUTPUT");
    const manifest: ArtifactManifest = { ...payload, totalDigest: sha256Digest(payloadBytes.value) };
    const bytes = manifestBytes(manifest);
    if (bytes === null) return fail("INVALID_RENDERER_OUTPUT");
    const directory = path.join(this.root, manifest.totalDigest);
    if (existsSync(directory)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT");
    let temporary: string;
    try { temporary = mkdtempSync(path.join(this.root, ".staging-")); } catch { return fail("ARTIFACT_WRITE_FAILED"); }
    try {
      for (const file of files) { const target = path.join(temporary, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); }
      writeFileSync(path.join(temporary, manifestFile), bytes, { flag: "wx" });
    } catch { rmSync(temporary, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
    // 以 non-recursive mkdir 原子取得 digest 目錄，避免 existsSync 與 rename 之間的並行覆蓋。
    // 落敗的並行交付只能清掉自己的 staging：一併刪除 digest 目錄會摧毀勝出者已回報成功的 immutable artifact。
    try { mkdirSync(directory); } catch { rmSync(temporary, { recursive: true, force: true }); return fail("ARTIFACT_IMMUTABILITY_CONFLICT"); }
    // rename 失敗時 digest 目錄由本次交付建立且仍為空，回收它不會動到其他交付的 bytes。
    try { renameSync(temporary, directory); } catch { rmSync(temporary, { recursive: true, force: true }); rmSync(directory, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
    return { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } };
  }

  public loadVerifiedArtifact(input: Readonly<{ artifactDigest: Digest }>): DeliveryResult<VerifiedDeliveredArtifact> {
    if (input === null || typeof input !== "object" || !isDigest(input.artifactDigest)) return fail("REDELIVERY_SOURCE_INVALID");
    const loaded = snapshot(path.join(this.root, input.artifactDigest), input.artifactDigest);
    return loaded === null ? fail("REDELIVERY_SOURCE_INVALID") : { ok: true, value: loaded };
  }

  public redeliver(input: Readonly<{ artifactDigest: Digest; destination: string }>): DeliveryResult<void> {
    if (input === null || typeof input !== "object" || !isDigest(input.artifactDigest) || typeof input.destination !== "string" || !path.isAbsolute(input.destination) || existsSync(input.destination)) return fail("REDELIVERY_SOURCE_INVALID");
    const loaded = this.loadVerifiedArtifact({ artifactDigest: input.artifactDigest });
    if (!loaded.ok) return loaded;
    const manifest = manifestBytes(loaded.value.manifest);
    if (manifest === null) return fail("REDELIVERY_SOURCE_INVALID");
    try {
      mkdirSync(input.destination);
      for (const file of loaded.value.files) { const target = path.join(input.destination, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); }
      writeFileSync(path.join(input.destination, manifestFile), manifest, { flag: "wx" });
      return { ok: true, value: undefined };
    } catch { rmSync(input.destination, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
  }
}

export function createPublicDelivery(input: CreatePublicDeliveryInput): DeliveryResult<PublicDelivery> {
  if (input === null || typeof input !== "object" || !path.isAbsolute(input.artifactsRoot)) return fail("ARTIFACT_WRITE_FAILED");
  try { mkdirSync(input.artifactsRoot, { recursive: true }); return { ok: true, value: new Delivery(input.artifactsRoot) }; } catch { return fail("ARTIFACT_WRITE_FAILED"); }
}
