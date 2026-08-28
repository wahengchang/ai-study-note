import { readFile } from "node:fs/promises";
import { valid as semverValid } from "semver";


import { canonicalJsonBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import {
  PluginHookContract,
  type PluginCapability,
  type PluginHookId,
  type PluginManifestCallback,
  type PluginManifestEntry,
  type PluginManifestResource,
  type PluginManifestV1,
} from "./contracts.js";
import { isCanonicalPluginId, pluginHostFailure, type PluginHostFailure } from "./failures.js";
import { compareCodeUnits } from "./ordering.js";
import { isSafeRelativeFile } from "./trusted-root.js";

const manifestKeys = ["manifestVersion", "id", "version", "trustedLocal", "hookContract", "capabilities", "entry", "callbacks", "resources"];
const hookCapabilities: Readonly<Record<PluginHookId, PluginCapability>> = {
  "save-revision/validate": "save-revision-validator",
  "cms/editor-block/resolve": "cms-editor-block-resolution",
};
const hookIds = Object.keys(hookCapabilities) as PluginHookId[];
const capabilityCatalog: Readonly<Record<PluginCapability, true>> = {
  "save-revision-validator": true,
  "cms-editor-block-resolution": true,
};
const identifier = /^[$A-Z_a-z][$0-9A-Z_a-z]*$/;

type ParsedManifest = Readonly<{
  manifest: PluginManifestV1;
  manifestHash: Digest;
}>;

export type ManifestReadResult = Readonly<{ ok: true; value: ParsedManifest }> | Readonly<{ ok: false; error: PluginHostFailure }>;

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

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function readEntry(value: unknown): PluginManifestEntry | null {
  const item = record(value);
  if (item === null || !hasExactKeys(item, ["file", "digest"]) || !isSafeRelativeFile(item.file) || typeof item.digest !== "string" || !isDigest(item.digest)) return null;
  return Object.freeze({ file: item.file, digest: item.digest });
}

function readResource(value: unknown): PluginManifestResource | null {
  const item = record(value);
  if (item === null || !hasExactKeys(item, ["file", "digest"]) || !isSafeRelativeFile(item.file) || typeof item.digest !== "string" || !isDigest(item.digest)) return null;
  return Object.freeze({ file: item.file, digest: item.digest });
}

function readCallback(value: unknown): PluginManifestCallback | null {
  const item = record(value);
  if (item === null || !hasExactKeys(item, ["hook", "exportName", "priority"])) return null;
  if (!hookIds.includes(item.hook as PluginHookId) || typeof item.exportName !== "string" || !identifier.test(item.exportName) || !Number.isSafeInteger(item.priority)) return null;
  return Object.freeze({ hook: item.hook as PluginHookId, exportName: item.exportName, priority: item.priority as number });
}

function invalid(subjectId?: unknown): ManifestReadResult {
  return { ok: false, error: pluginHostFailure("INVALID_PLUGIN_MANIFEST", subjectId) };
}

function normalizeManifest(manifest: PluginManifestV1): PluginManifestV1 {
  const normalizedCapabilities = [...manifest.capabilities].sort(compareCodeUnits);
  const normalizedCallbacks = [...manifest.callbacks].sort((left, right) => compareCodeUnits(left.hook, right.hook));
  const normalizedResources = [...manifest.resources].sort((left, right) => compareCodeUnits(left.file, right.file));
  return Object.freeze({
    manifestVersion: "plugin-manifest/v1",
    id: manifest.id,
    version: manifest.version,
    trustedLocal: true,
    hookContract: PluginHookContract,
    capabilities: Object.freeze(normalizedCapabilities),
    entry: Object.freeze({ ...manifest.entry }),
    callbacks: Object.freeze(normalizedCallbacks.map((callback) => Object.freeze({ ...callback }))),
    resources: Object.freeze(normalizedResources.map((resource) => Object.freeze({ ...resource }))),
  });
}

export function parseManifestBytes(bytes: Uint8Array, directoryId: string): ManifestReadResult {
  let source: unknown;
  try {
    source = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalid(directoryId);
  }
  const canonical = canonicalJsonBytes(source);
  if (!canonical.ok || !byteEqual(bytes, canonical.value)) return invalid(directoryId);
  const value = record(source);
  if (value === null || !hasExactKeys(value, manifestKeys)) return invalid(directoryId);
  if (value.manifestVersion !== "plugin-manifest/v1" || value.trustedLocal !== true) return invalid(directoryId);
  if (typeof value.hookContract !== "string") return invalid(directoryId);
  if (value.hookContract !== PluginHookContract) return { ok: false, error: pluginHostFailure("UNSUPPORTED_HOOK_CONTRACT", directoryId) };
  if (!isCanonicalPluginId(value.id) || value.id !== directoryId || typeof value.version !== "string") return invalid(directoryId);

  const semver = isExactSemver(value.version);
  if (!semver) return invalid(directoryId);
  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0 || !value.capabilities.every((item) => typeof item === "string")) return invalid(directoryId);
  const declaredCapabilities = value.capabilities as string[];
  if (new Set(declaredCapabilities).size !== declaredCapabilities.length) return invalid(directoryId);
  if (declaredCapabilities.some((capability) => !Object.hasOwn(capabilityCatalog, capability))) return { ok: false, error: pluginHostFailure("UNSUPPORTED_CAPABILITY", directoryId) };

  const entry = readEntry(value.entry);
  if (entry === null || !entry.file.endsWith(".mjs") || !Array.isArray(value.callbacks) || value.callbacks.length === 0 || !Array.isArray(value.resources)) return invalid(directoryId);
  const parsedCallbacks = value.callbacks.map(readCallback);
  if (parsedCallbacks.some((callback) => callback === null)) return invalid(directoryId);
  const callbacks = parsedCallbacks as PluginManifestCallback[];
  if (new Set(callbacks.map((callback) => callback.hook)).size !== callbacks.length) return invalid(directoryId);
  if (new Set(callbacks.map((callback) => callback.exportName)).size !== callbacks.length) return invalid(directoryId);
  if (callbacks.some((callback) => !declaredCapabilities.includes(hookCapabilities[callback.hook]))) return invalid(directoryId);
  if (declaredCapabilities.some((capability) => !callbacks.some((callback) => hookCapabilities[callback.hook] === capability))) return invalid(directoryId);

  const parsedResources = value.resources.map(readResource);
  if (parsedResources.some((resource) => resource === null)) return invalid(directoryId);
  const resources = parsedResources as PluginManifestResource[];
  const files = [entry.file, ...resources.map((resource) => resource.file)];
  if (new Set(files).size !== files.length) return invalid(directoryId);

  const manifest = normalizeManifest({
    manifestVersion: "plugin-manifest/v1",
    id: value.id,
    version: value.version,
    trustedLocal: true,
    hookContract: PluginHookContract,
    capabilities: declaredCapabilities as PluginCapability[],
    entry,
    callbacks,
    resources,
  });
  const normalized = canonicalJsonBytes(manifest);
  if (!normalized.ok) return invalid(directoryId);
  return Object.freeze({ ok: true, value: Object.freeze({ manifest, manifestHash: sha256Digest(normalized.value) }) });
}

export function isExactSemver(value: string): boolean {
  // `semver.valid(value) === value` 拒絕 range、v prefix 與 surrounding whitespace。
  return semverValid(value) === value;
}

export async function readManifest(manifestRealpath: string, directoryId: string): Promise<ManifestReadResult> {
  try {
    return parseManifestBytes(await readFile(manifestRealpath), directoryId);
  } catch {
    return invalid(directoryId);
  }
}
