import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJsonBytes, isDigest, sha256Digest } from "../foundation/index.js";
import { isArtifactFilePath } from "../renderer/index.js";
import type { ArtifactManifest, CreatePublicDeliveryInput, DeliveryFailure, DeliveryResult, PublicDelivery } from "./contracts.js";

function fail(code: DeliveryFailure["code"]): DeliveryResult<never> { return { ok: false, error: { code, owner: "Delivery", subjectIds: [], remediation: { kind: "message", message: "Static artifact 無法交付。" } } }; }
const manifestFile = "artifact-manifest.json";
/** 與 Renderer 的 staged output profile 同一判斷：Delivery 不得比 Renderer 可產出的檔案更窄。 */
function safe(file: unknown): file is string { return isArtifactFilePath(file); }
/** 交付後目錄只能存在 manifest 列舉的檔案；多出的 bytes 不可經 re-delivery 散佈。 */
function deliveredFiles(directory: string): readonly string[] | null {
  try {
    const found: string[] = [];
    for (const item of readdirSync(directory, { recursive: true, withFileTypes: true })) {
      const relative = path.relative(directory, path.join(item.parentPath, item.name));
      if (item.isDirectory()) continue;
      if (!item.isFile()) return null;
      found.push(relative.split(path.sep).join("/"));
    }
    return found;
  } catch { return null; }
}
function manifestBytes(manifest: ArtifactManifest): Uint8Array | null { const { totalDigest, ...payload } = manifest; const payloadBytes = canonicalJsonBytes(payload); const full = canonicalJsonBytes(manifest); return !payloadBytes.ok || !full.ok || sha256Digest(payloadBytes.value) !== totalDigest ? null : full.value; }
function verified(directory: string, digest: `sha256:${string}`): ArtifactManifest | null {
  try {
    const raw = new Uint8Array(readFileSync(path.join(directory, manifestFile)));
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as ArtifactManifest;
    const canonical = manifestBytes(manifest);
    if (canonical === null || manifest.totalDigest !== digest || canonical.byteLength !== raw.byteLength || canonical.some((byte, index) => byte !== raw[index])) return null;
    const expected = new Set<string>([manifestFile]);
    for (const file of manifest.files) {
      if (!safe(file.path) || expected.has(file.path)) return null;
      expected.add(file.path);
      const bytes = new Uint8Array(readFileSync(path.join(directory, file.path)));
      if (bytes.byteLength !== file.byteLength || sha256Digest(bytes) !== file.digest) return null;
    }
    const found = deliveredFiles(directory);
    if (found === null || found.length !== expected.size || found.some((item) => !expected.has(item))) return null;
    return manifest;
  } catch { return null; }
}

class Delivery implements PublicDelivery {
  constructor(private readonly root: string) {}
  public deliver(output: Parameters<PublicDelivery["deliver"]>[0]): DeliveryResult<Readonly<{ artifactDigest: `sha256:${string}`; directory: string; manifest: ArtifactManifest }>> {
    if (output.contract !== "renderer-output/v1" || output.files.some((file) => !safe(file.path) || file.path === manifestFile || sha256Digest(file.bytes) !== file.digest)) return fail("INVALID_RENDERER_OUTPUT");
    const files = [...output.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (new Set(files.map((file) => file.path)).size !== files.length) return fail("INVALID_RENDERER_OUTPUT");
    const payload = { contract: "artifact-manifest/v1" as const, rendererInputDigest: output.rendererInputDigest, provenance: output.provenance, files: files.map((file) => ({ path: file.path, digest: file.digest, byteLength: file.bytes.byteLength })) };
    const payloadBytes = canonicalJsonBytes(payload); if (!payloadBytes.ok) return fail("INVALID_RENDERER_OUTPUT");
    const manifest: ArtifactManifest = { ...payload, totalDigest: sha256Digest(payloadBytes.value) }; const bytes = manifestBytes(manifest); if (bytes === null) return fail("INVALID_RENDERER_OUTPUT");
    const directory = path.join(this.root, manifest.totalDigest);
    if (existsSync(directory)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT");
    // staging 目錄必須每次唯一：固定名稱會讓同 digest 的並行交付互相寫入並在 rollback 時刪除對方的 bytes。
    let temporary: string;
    try { temporary = mkdtempSync(path.join(this.root, ".staging-")); } catch { return fail("ARTIFACT_WRITE_FAILED"); }
    try {
      for (const file of files) { const target = path.join(temporary, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); }
      writeFileSync(path.join(temporary, manifestFile), bytes, { flag: "wx" });
    } catch { rmSync(temporary, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
    // 以 non-recursive mkdir 原子取得 digest 目錄，避免 existsSync 與 rename 之間的並行覆蓋。
    try { mkdirSync(directory); } catch { rmSync(temporary, { recursive: true, force: true }); return fail("ARTIFACT_IMMUTABILITY_CONFLICT"); }
    try { renameSync(temporary, directory); } catch { rmSync(temporary, { recursive: true, force: true }); rmSync(directory, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
    return { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } };
  }

  public redeliver(input: Readonly<{ artifactDigest: `sha256:${string}`; destination: string }>): DeliveryResult<void> {
    if (input === null || typeof input !== "object" || !isDigest(input.artifactDigest) || typeof input.destination !== "string" || !path.isAbsolute(input.destination)) return fail("REDELIVERY_SOURCE_INVALID");
    const source = path.join(this.root, input.artifactDigest);
    if (verified(source, input.artifactDigest) === null) return fail("REDELIVERY_SOURCE_INVALID");
    try {
      if (existsSync(input.destination)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT");
      cpSync(source, input.destination, { recursive: true, errorOnExist: true, dereference: false, verbatimSymlinks: true });
      return { ok: true, value: undefined };
    } catch { return fail("ARTIFACT_WRITE_FAILED"); }
  }
}
export function createPublicDelivery(input: CreatePublicDeliveryInput): DeliveryResult<PublicDelivery> { if (input === null || typeof input !== "object" || !path.isAbsolute(input.artifactsRoot)) return fail("ARTIFACT_WRITE_FAILED"); try { mkdirSync(input.artifactsRoot, { recursive: true }); return { ok: true, value: new Delivery(input.artifactsRoot) }; } catch { return fail("ARTIFACT_WRITE_FAILED"); } }
