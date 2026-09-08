import { valid as semverValid } from "semver";

import { canonicalJsonBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";
import type { ThemeHostResult, ThemeManifestFile, VerifiedThemePackage } from "./contracts.js";
import { isCanonicalThemeId, themeHostFailure } from "./failures.js";
import { compareCodeUnits } from "./ordering.js";
import { isSafeRelativeFile } from "./trusted-root.js";

const manifestKeys = ["contract", "id", "version", "runtime", "resources"];


function byteEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function manifestFile(value: unknown): ThemeManifestFile | null {
  const item = record(value);
  if (item === null || !exactKeys(item, ["file", "digest"]) || !isSafeRelativeFile(item.file) || typeof item.digest !== "string" || !isDigest(item.digest)) return null;
  return Object.freeze({ file: item.file, digest: item.digest });
}

function invalid(subjectId?: unknown): ThemeHostResult<VerifiedThemePackage> {
  return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_MANIFEST", subjectId) });
}

export function parseThemeManifest(bytes: Uint8Array): ThemeHostResult<VerifiedThemePackage> {
  let source: unknown;
  try {
    source = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  const canonical = canonicalJsonBytes(source);
  if (!canonical.ok || !byteEqual(bytes, canonical.value)) return invalid();
  const value = record(source);
  if (value === null || !exactKeys(value, manifestKeys) || value.contract !== "theme-manifest/v1") return invalid();
  if (!isCanonicalThemeId(value.id) || typeof value.version !== "string" || semverValid(value.version) !== value.version) return invalid(value.id);
  const runtime = manifestFile(value.runtime);
  if (runtime === null || !runtime.file.endsWith(".mjs") || !Array.isArray(value.resources)) return invalid(value.id);
  const resources = value.resources.map(manifestFile);
  if (resources.some((resource) => resource === null)) return invalid(value.id);
  const declaredResources = resources as ThemeManifestFile[];
  const files = [runtime.file, ...declaredResources.map((resource) => resource.file)];
  if (new Set(files).size !== files.length || declaredResources.some((resource, index) => index > 0 && compareCodeUnits(declaredResources[index - 1]!.file, resource.file) >= 0)) return invalid(value.id);
  const manifest = Object.freeze({
    contract: "theme-manifest/v1" as const,
    id: value.id,
    version: value.version,
    runtime,
    resources: Object.freeze(declaredResources.map((resource) => Object.freeze({ ...resource }))),
  });
  const identity = Object.freeze({ id: manifest.id, version: manifest.version, manifestHash: sha256Digest(bytes) as Digest });
  return Object.freeze({ ok: true, value: Object.freeze({ manifest, identity }) });
}
