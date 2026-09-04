import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { ArtifactManifest, CreatePublicDeliveryInput, DeliveryFailure, DeliveryResult, PublicDelivery } from "./contracts.js";

function fail(code: DeliveryFailure["code"]): DeliveryResult<never> { return { ok: false, error: { code, owner: "Delivery", subjectIds: [], remediation: { kind: "message", message: "Static artifact 無法交付。" } } }; }
function safe(file: string): boolean { return /^[a-z0-9][a-z0-9/-]*\.html$/u.test(file) && !file.includes("//"); }
function manifestBytes(manifest: ArtifactManifest): Uint8Array | null { const { totalDigest, ...payload } = manifest; const payloadBytes = canonicalJsonBytes(payload); const full = canonicalJsonBytes(manifest); return !payloadBytes.ok || !full.ok || sha256Digest(payloadBytes.value) !== totalDigest ? null : full.value; }
function verified(directory: string, digest: `sha256:${string}`): ArtifactManifest | null { try { const raw = new Uint8Array(readFileSync(path.join(directory, "artifact-manifest.json"))); const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as ArtifactManifest; const canonical = manifestBytes(manifest); if (canonical === null || manifest.totalDigest !== digest || canonical.byteLength !== raw.byteLength || canonical.some((byte, index) => byte !== raw[index])) return null; for (const file of manifest.files) { if (!safe(file.path)) return null; const bytes = new Uint8Array(readFileSync(path.join(directory, file.path))); if (bytes.byteLength !== file.byteLength || sha256Digest(bytes) !== file.digest) return null; } return manifest; } catch { return null; } }
class Delivery implements PublicDelivery {
  constructor(private readonly root: string) {}
  public deliver(output: Parameters<PublicDelivery["deliver"]>[0]): DeliveryResult<Readonly<{ artifactDigest: `sha256:${string}`; directory: string; manifest: ArtifactManifest }>> {
    if (output.contract !== "renderer-output/v1" || output.files.some((file) => !safe(file.path) || sha256Digest(file.bytes) !== file.digest)) return fail("INVALID_RENDERER_OUTPUT");
    const files = [...output.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (new Set(files.map((file) => file.path)).size !== files.length) return fail("INVALID_RENDERER_OUTPUT");
    const payload = { contract: "artifact-manifest/v1" as const, rendererInputDigest: output.rendererInputDigest, provenance: output.provenance, files: files.map((file) => ({ path: file.path, digest: file.digest, byteLength: file.bytes.byteLength })) };
    const payloadBytes = canonicalJsonBytes(payload); if (!payloadBytes.ok) return fail("INVALID_RENDERER_OUTPUT");
    const manifest: ArtifactManifest = { ...payload, totalDigest: sha256Digest(payloadBytes.value) }; const bytes = manifestBytes(manifest); if (bytes === null) return fail("INVALID_RENDERER_OUTPUT");
    const directory = path.join(this.root, manifest.totalDigest); if (existsSync(directory)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT"); const temporary = `${directory}.tmp`;
    try { mkdirSync(temporary, { recursive: true }); for (const file of files) { const target = path.join(temporary, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.bytes, { flag: "wx" }); } writeFileSync(path.join(temporary, "artifact-manifest.json"), bytes, { flag: "wx" }); renameSync(temporary, directory); return { ok: true, value: { artifactDigest: manifest.totalDigest, directory, manifest } }; } catch { rmSync(temporary, { recursive: true, force: true }); return fail("ARTIFACT_WRITE_FAILED"); }
  }
  public redeliver(input: Readonly<{ artifactDigest: `sha256:${string}`; destination: string }>): DeliveryResult<void> { const source = path.join(this.root, input.artifactDigest); if (verified(source, input.artifactDigest) === null) return fail("REDELIVERY_SOURCE_INVALID"); try { if (existsSync(input.destination)) return fail("ARTIFACT_IMMUTABILITY_CONFLICT"); cpSync(source, input.destination, { recursive: true, errorOnExist: true }); return { ok: true, value: undefined }; } catch { return fail("ARTIFACT_WRITE_FAILED"); } }
}
export function createPublicDelivery(input: CreatePublicDeliveryInput): DeliveryResult<PublicDelivery> { if (input === null || typeof input !== "object" || !path.isAbsolute(input.artifactsRoot)) return fail("ARTIFACT_WRITE_FAILED"); try { mkdirSync(input.artifactsRoot, { recursive: true }); return { ok: true, value: new Delivery(input.artifactsRoot) }; } catch { return fail("ARTIFACT_WRITE_FAILED"); } }
