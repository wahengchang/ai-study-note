import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";
import { isArtifactFilePath } from "../renderer/index.js";
import type { ArtifactManifest, CreatePublicDeliveryInput, DeliveryFailure, DeliveryResult, PublicDelivery, VerifiedDeliveredArtifact } from "./contracts.js";

const manifestFile = "artifact-manifest.json";

function fail(code: DeliveryFailure["code"]): DeliveryResult<never> { return { ok: false, error: { code, owner: "Delivery", subjectIds: [], remediation: { kind: "message", message: "Static artifact 無法交付。" } } }; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(value).length === keys.length && keys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor !== undefined && "value" in descriptor && descriptor.enumerable;
    });
  } catch { return false; }
}
function record(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== keys.length) return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch { return null; }
}
function safe(file: unknown): file is string { return isArtifactFilePath(file) && file !== manifestFile; }
function sortedUnique(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || compare(values[index - 1] ?? "", value) < 0); }
function values(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const length = Object.getOwnPropertyDescriptor(value, "length");
    if (length === undefined || !("value" in length) || typeof length.value !== "number" || Reflect.ownKeys(value).length !== length.value + 1) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch { return null; }
}
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

function route(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.includes("\\") && !value.includes("%") && !value.includes("//") && (value === "/" || !value.endsWith("/")) && !value.split("/").some((segment) => segment === "." || segment === "..");
}
function provenance(value: unknown): boolean {
  if (!exact(value, ["publishedRevisionIds", "routeGraphDigest", "mediaSelectionDigest", "theme", "plugins"]) || !Array.isArray(value.publishedRevisionIds) || typeof value.routeGraphDigest !== "string" || !isDigest(value.routeGraphDigest) || typeof value.mediaSelectionDigest !== "string" || !isDigest(value.mediaSelectionDigest) || !exact(value.theme, ["id", "version", "manifestHash"]) || !Array.isArray(value.plugins)) return false;
  const theme = value.theme as Readonly<{ id: unknown; version: unknown; manifestHash: unknown }>;
  if (typeof theme.id !== "string" || typeof theme.version !== "string" || typeof theme.manifestHash !== "string" || !isDigest(theme.manifestHash)) return false;
  const revisions = value.publishedRevisionIds as readonly Readonly<{ entryId: unknown; revisionId: unknown }>[];
  if (!revisions.every((item) => typeof item.entryId === "string" && typeof item.revisionId === "string") || !sortedUnique(revisions.map((item) => `${item.entryId as string}\u0000${item.revisionId as string}`))) return false;
  const plugins = value.plugins as readonly Readonly<{ id: unknown; version: unknown; manifestHash: unknown }>[];
  return plugins.every((item) => typeof item.id === "string" && typeof item.version === "string" && typeof item.manifestHash === "string" && isDigest(item.manifestHash)) && sortedUnique(plugins.map((item) => item.id as string));
}
function validManifest(value: unknown, expectedDigest: Digest): value is ArtifactManifest {
  const input = value as { contract: unknown; rendererInputDigest: unknown; provenance: unknown; totalDigest: unknown; files: unknown; routes: unknown };
  if (!exact(value, ["contract", "rendererInputDigest", "provenance", "routes", "files", "totalDigest"]) || input.contract !== "artifact-manifest/v1" || typeof input.rendererInputDigest !== "string" || !isDigest(input.rendererInputDigest) || typeof input.totalDigest !== "string" || !isDigest(input.totalDigest) || input.totalDigest !== expectedDigest || !provenance(input.provenance) || !Array.isArray(input.files) || !Array.isArray(input.routes)) return false;
  const files = input.files;
  const routes = input.routes;
  if (!files.every((candidate) => { if (!exact(candidate, ["path", "digest", "byteLength"])) return false; const file = candidate as { path: unknown; digest: unknown; byteLength: unknown }; return typeof file.path === "string" && safe(file.path) && typeof file.digest === "string" && isDigest(file.digest) && Number.isSafeInteger(file.byteLength) && (file.byteLength as number) >= 0; }) || !sortedUnique(files.map((file) => (file as { path: string }).path))) return false;
  const filePaths = new Set(files.map((file) => (file as { path: string }).path));
  return routes.every((candidate) => { if (!exact(candidate, ["route", "filePath"])) return false; const item = candidate as { route: unknown; filePath: unknown }; return route(item.route) && typeof item.filePath === "string" && safe(item.filePath) && item.filePath.endsWith(".html") && filePaths.has(item.filePath); }) && sortedUnique(routes.map((item) => (item as { route: string }).route));
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
    const actual = [...found].sort(compare);
    if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) return null;
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

type RendererDeliveryOutput = Readonly<{ contract: "renderer-output/v1"; rendererInputDigest: Digest; provenance: Parameters<PublicDelivery["deliver"]>[0]["provenance"]; routes: readonly Readonly<{ route: string; filePath: string }>[]; files: readonly Readonly<{ path: string; bytes: Uint8Array; digest: Digest }>[]; outputDigest: Digest }>;
function rendererOutput(value: unknown): RendererDeliveryOutput | null {
  try {
    const root = record(value, ["contract", "rendererInputDigest", "provenance", "routes", "files", "outputDigest"]);
    if (root === null || root.contract !== "renderer-output/v1" || typeof root.rendererInputDigest !== "string" || !isDigest(root.rendererInputDigest) || typeof root.outputDigest !== "string" || !isDigest(root.outputDigest)) return null;
    const provenanceBytes = canonicalJsonBytes(root.provenance);
    if (!provenanceBytes.ok) return null;
    const provenanceValue: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(provenanceBytes.value));
    if (!provenance(provenanceValue)) return null;
    const rawFiles = values(root.files);
    const rawRoutes = values(root.routes);
    if (rawFiles === null || rawRoutes === null) return null;
    const files: Readonly<{ path: string; bytes: Uint8Array; digest: Digest }>[] = [];
    for (const candidate of rawFiles) {
      const file = record(candidate, ["path", "bytes", "digest"]);
      if (file === null || typeof file.path !== "string" || !safe(file.path) || !(file.bytes instanceof Uint8Array) || typeof file.digest !== "string" || !isDigest(file.digest) || sha256Digest(file.bytes) !== file.digest) return null;
      files.push(Object.freeze({ path: file.path, bytes: copyBytes(file.bytes), digest: file.digest }));
    }
    const routes: Readonly<{ route: string; filePath: string }>[] = [];
    for (const candidate of rawRoutes) {
      const routeValue = record(candidate, ["route", "filePath"]);
      if (routeValue === null || !route(routeValue.route) || typeof routeValue.filePath !== "string" || !safe(routeValue.filePath) || !routeValue.filePath.endsWith(".html")) return null;
      routes.push(Object.freeze({ route: routeValue.route, filePath: routeValue.filePath }));
    }
    if (!sortedUnique(files.map((file) => file.path)) || !sortedUnique(routes.map((item) => item.route)) || !routes.every((item) => files.some((file) => file.path === item.filePath))) return null;
    const evidence = canonicalJsonBytes({ provenance: provenanceValue, routes, files: files.map((file) => ({ path: file.path, digest: file.digest })) });
    return !evidence.ok || sha256Digest(evidence.value) !== root.outputDigest ? null : Object.freeze({ contract: "renderer-output/v1", rendererInputDigest: root.rendererInputDigest, provenance: provenanceValue as RendererDeliveryOutput["provenance"], routes: Object.freeze(routes), files: Object.freeze(files), outputDigest: root.outputDigest });
  } catch { return null; }
}

class Delivery implements PublicDelivery {
  public constructor(private readonly root: string) {}

  public deliver(output: Parameters<PublicDelivery["deliver"]>[0]): DeliveryResult<Readonly<{ artifactDigest: Digest; directory: string; manifest: ArtifactManifest }>> {
    const accepted = rendererOutput(output);
    if (accepted === null) return fail("INVALID_RENDERER_OUTPUT");
    const files = [...accepted.files];
    const routes = [...accepted.routes];
    const payload = { contract: "artifact-manifest/v1" as const, rendererInputDigest: accepted.rendererInputDigest, provenance: accepted.provenance, routes: routes.map((route) => ({ ...route })), files: files.map((file) => ({ path: file.path, digest: file.digest, byteLength: file.bytes.byteLength })) };
    const payloadBytes = canonicalJsonBytes(payload);
    if (!payloadBytes.ok) return fail("INVALID_RENDERER_OUTPUT");
    const manifest: ArtifactManifest = { ...payload, totalDigest: sha256Digest(payloadBytes.value) };
    const bytes = manifestBytes(manifest);
    if (bytes === null) return fail("INVALID_RENDERER_OUTPUT");
    const directory = path.join(this.root, manifest.totalDigest);
    const existing = snapshot(directory, manifest.totalDigest);
    if (existing !== null) return { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } };
    if (existsSync(directory)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT");
    let temporary: string;
    try { temporary = mkdtempSync(path.join(this.root, ".staging-")); } catch { return fail("ARTIFACT_WRITE_FAILED"); }
    try {
      for (const file of files) { const target = path.join(temporary, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); }
      writeFileSync(path.join(temporary, manifestFile), bytes, { flag: "wx" });
      renameSync(temporary, directory);
    } catch {
      rmSync(temporary, { recursive: true, force: true });
      return snapshot(directory, manifest.totalDigest) === null ? fail("ARTIFACT_IMMUTABILITY_CONFLICT") : { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } };
    }
    return { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } };
  }

  public loadVerifiedArtifact(input: Readonly<{ artifactDigest: Digest }>): DeliveryResult<VerifiedDeliveredArtifact> {
    if (input === null || typeof input !== "object" || !isDigest(input.artifactDigest)) return fail("REDELIVERY_SOURCE_INVALID");
    const loaded = snapshot(path.join(this.root, input.artifactDigest), input.artifactDigest);
    return loaded === null ? fail("REDELIVERY_SOURCE_INVALID") : { ok: true, value: loaded };
  }

  public redeliver(input: Readonly<{ artifactDigest: Digest; destination: string }>): DeliveryResult<void> {
    if (input === null || typeof input !== "object" || !isDigest(input.artifactDigest) || typeof input.destination !== "string" || !path.isAbsolute(input.destination)) return fail("REDELIVERY_SOURCE_INVALID");
    const requested = path.resolve(input.destination);
    const leaf = path.basename(requested);
    if (leaf === "." || leaf === path.sep) return fail("REDELIVERY_SOURCE_INVALID");
    let destination = "";
    let parent = "";
    try {
      parent = realpathSync(path.dirname(requested));
      if (!lstatSync(parent).isDirectory()) return fail("REDELIVERY_SOURCE_INVALID");
      destination = path.join(parent, leaf);
      lstatSync(destination);
      return fail("REDELIVERY_SOURCE_INVALID");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fail("REDELIVERY_SOURCE_INVALID");
    }
    const relation = path.relative(this.root, destination);
    if (destination === this.root || (relation !== "" && !relation.startsWith(`..${path.sep}`) && relation !== ".." && !path.isAbsolute(relation))) return fail("REDELIVERY_SOURCE_INVALID");
    const loaded = this.loadVerifiedArtifact({ artifactDigest: input.artifactDigest });
    if (!loaded.ok) return loaded;
    const manifest = manifestBytes(loaded.value.manifest);
    if (manifest === null) return fail("REDELIVERY_SOURCE_INVALID");
    let temporary: string;
    try { temporary = mkdtempSync(path.join(parent, ".redelivery-")); } catch { return fail("ARTIFACT_WRITE_FAILED"); }
    try {
      for (const file of loaded.value.files) { const target = path.join(temporary, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); }
      writeFileSync(path.join(temporary, manifestFile), manifest, { flag: "wx" });
      renameSync(temporary, destination);
      return { ok: true, value: undefined };
    } catch {
      rmSync(temporary, { recursive: true, force: true });
      return fail("ARTIFACT_WRITE_FAILED");
    }
  }
}

export function createPublicDelivery(input: CreatePublicDeliveryInput): DeliveryResult<PublicDelivery> {
  if (input === null || typeof input !== "object" || !path.isAbsolute(input.artifactsRoot)) return fail("ARTIFACT_WRITE_FAILED");
  try { mkdirSync(input.artifactsRoot, { recursive: true }); return { ok: true, value: new Delivery(realpathSync(input.artifactsRoot)) }; } catch { return fail("ARTIFACT_WRITE_FAILED"); }
}
