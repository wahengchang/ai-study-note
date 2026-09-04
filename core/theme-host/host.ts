import { valid as semverValid } from "semver";
import { copyBytes, isDigest, sha256Digest } from "../foundation/index.js";
import type { ThemeHost, ThemeHostResult, ThemeIdentity, VerifiedThemePackage } from "./contracts.js";
import { themeHostFailure, type ThemeHostFailure } from "./failures.js";
import { parseThemeManifest } from "./manifest.js";
import { compareCodeUnits } from "./ordering.js";
import { runtimeIsSelfContained } from "./runtime-scan.js";
import {
  installedThemeSlots,
  readTrustedThemeFile,
  revalidateTrustedRoots,
  validateThemeSlot,
  type TrustedRoots,
} from "./trusted-root.js";

type ValidatedTheme = Readonly<{
  identity: ThemeIdentity;
  descriptor: VerifiedThemePackage;
  bytes: ReadonlyMap<string, Uint8Array>;
}>;
type Validation = Readonly<{ ok: true; value: ValidatedTheme }> | Readonly<{ ok: false; error: ThemeHostFailure; identity?: ThemeIdentity }>;
type Collected = Readonly<{ ok: true; values: readonly Validation[] }> | Readonly<{ ok: false; error: ThemeHostFailure }>;

type FailedValidation = Readonly<{ ok: false; error: ThemeHostFailure; identity?: ThemeIdentity }>;

const maximumSlots = 256;
const maximumResources = 128;
const maximumManifestBytes = 1_048_576;
const maximumEvidenceFileBytes = 16_777_216;
const maximumPackageBytes = 67_108_864;

function sameIdentity(left: ThemeIdentity, right: ThemeIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.manifestHash === right.manifestHash;
}

function validationIdentity(value: Validation): ThemeIdentity | undefined {
  return value.ok ? value.value.identity : value.identity;
}

function validIdentity(value: unknown): value is ThemeIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 3 && typeof input.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id) && typeof input.version === "string" && semverValid(input.version) === input.version && typeof input.manifestHash === "string" && isDigest(input.manifestHash);
}

async function validateSlot(roots: TrustedRoots, slot: string): Promise<Validation> {
  const slotIdentity = await validateThemeSlot(roots, slot);
  if (slotIdentity === null) return Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH") });
  const manifestBytes = await readTrustedThemeFile(roots, slot, slotIdentity, "theme.json", maximumManifestBytes);
  if (!manifestBytes.ok) return Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH") });
  const parsed = parseThemeManifest(manifestBytes.bytes);
  if (!parsed.ok) return parsed;
  if (parsed.value.manifest.resources.length > maximumResources) {
    return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_MANIFEST", parsed.value.identity.id), identity: parsed.value.identity });
  }
  const files = [parsed.value.manifest.runtime, ...parsed.value.manifest.resources];
  const bytes = new Map<string, Uint8Array>();
  let packageBytes = manifestBytes.bytes.byteLength;
  for (const file of files) {
    const remainingBytes = maximumPackageBytes - packageBytes;
    const evidence = await readTrustedThemeFile(roots, slot, slotIdentity, file.file, Math.min(maximumEvidenceFileBytes, remainingBytes));
    if (!evidence.ok || sha256Digest(evidence.ok ? evidence.bytes : new Uint8Array()) !== file.digest) {
      return Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH", parsed.value.identity.id), identity: parsed.value.identity });
    }
    packageBytes += evidence.bytes.byteLength;
    bytes.set(file.file, evidence.bytes);
  }
  const runtime = bytes.get(parsed.value.manifest.runtime.file);
  if (runtime === undefined || !(await runtimeIsSelfContained(runtime))) {
    return Object.freeze({ ok: false, error: themeHostFailure("THEME_RUNTIME_INVALID", parsed.value.identity.id), identity: parsed.value.identity });
  }
  const slotAfter = await validateThemeSlot(roots, slot);
  if (slotAfter === null || slotAfter.dev !== slotIdentity.dev || slotAfter.ino !== slotIdentity.ino || slotAfter.uid !== slotIdentity.uid || slotAfter.mode !== slotIdentity.mode) {
    return Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH", parsed.value.identity.id), identity: parsed.value.identity });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      identity: parsed.value.identity,
      descriptor: Object.freeze({ identity: parsed.value.identity, manifest: parsed.value.manifest }),
      bytes,
    }),
  });
}

async function collect(roots: TrustedRoots): Promise<Collected> {
  if (!(await revalidateTrustedRoots(roots))) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") });
  let slots: readonly string[];
  try {
    slots = await installedThemeSlots(roots);
  } catch {
    return Object.freeze({ ok: false, error: themeHostFailure("THEME_DISCOVERY_FAILED") });
  }
  if (slots.length > maximumSlots) return Object.freeze({ ok: false, error: themeHostFailure("THEME_DISCOVERY_FAILED") });
  const values = await Promise.all(slots.map((slot) => validateSlot(roots, slot)));
  if (!(await revalidateTrustedRoots(roots))) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") });
  return Object.freeze({ ok: true, values: Object.freeze(values) });
}

function conflicts(values: readonly Validation[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const identity = validationIdentity(value);
    if (identity === undefined) continue;
    const key = conflictKey(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function conflictKey(identity: ThemeIdentity): string {
  return `${identity.id}\0${identity.version}`;
}

function normalizedValues(values: readonly Validation[]): readonly Validation[] {
  const duplicateKeys = conflicts(values);
  return Object.freeze(values.map((value) => {
    const identity = validationIdentity(value);
    return identity !== undefined && duplicateKeys.has(conflictKey(identity))
      ? Object.freeze({ ok: false, error: themeHostFailure("THEME_IDENTITY_CONFLICT", identity.id), identity })
      : value;
  }));
}

function orderedRejections(values: readonly Validation[]): readonly ThemeHostFailure[] {
  const unique = new Map<string, ThemeHostFailure>();
  for (const value of values) {
    if (value.ok) continue;
    const key = `${value.error.code}\0${value.error.subjectIds[0] ?? ""}`;
    if (!unique.has(key)) unique.set(key, value.error);
  }
  return Object.freeze([...unique.values()].sort((left, right) => {
    const subject = compareCodeUnits(left.subjectIds[0] ?? "", right.subjectIds[0] ?? "");
    return subject !== 0 ? subject : compareCodeUnits(left.code, right.code);
  }));
}

function resolved(values: readonly Validation[], identity: ThemeIdentity): ThemeHostResult<ValidatedTheme> {
  const normalized = normalizedValues(values);
  const exact = normalized.find((value): value is Extract<Validation, { ok: true }> => value.ok && sameIdentity(value.value.identity, identity));
  if (exact !== undefined) return Object.freeze({ ok: true, value: exact.value });
  const conflict = normalized.find((value): value is FailedValidation => {
    if (value.ok) return false;
    return value.error.code === "THEME_IDENTITY_CONFLICT" && value.identity !== undefined && value.identity.id === identity.id && value.identity.version === identity.version;
  });
  if (conflict !== undefined) return Object.freeze({ ok: false, error: conflict.error });
  const drift = normalized.find((value) => {
    const candidate = validationIdentity(value);
    return candidate !== undefined && candidate.id === identity.id && candidate.version === identity.version;
  });
  return drift === undefined
    ? Object.freeze({ ok: false, error: themeHostFailure("THEME_NOT_FOUND", identity.id) })
    : Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH", identity.id) });
}

export function themeHost(roots: TrustedRoots): ThemeHost {
  return Object.freeze({
    async discover() {
      const result = await collect(roots);
      if (!result.ok) return result;
      const values = normalizedValues(result.values);
      const candidates = values.filter((value): value is Extract<Validation, { ok: true }> => value.ok).map((value) => value.value.identity).sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.version, right.version) || compareCodeUnits(left.manifestHash, right.manifestHash));
      return Object.freeze({ ok: true, value: Object.freeze({ candidates: Object.freeze(candidates), rejections: orderedRejections(values) }) });
    },
    async resolveExact(input) {
      if (!validIdentity(input?.identity)) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
      const collected = await collect(roots);
      if (!collected.ok) return collected;
      const result = resolved(collected.values, input.identity);
      return result.ok ? Object.freeze({ ok: true, value: result.value.descriptor }) : result;
    },
    async readVerifiedFile(input) {
      if (!validIdentity(input?.identity) || typeof input?.file !== "string") return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
      const collected = await collect(roots);
      if (!collected.ok) return collected;
      const result = resolved(collected.values, input.identity);
      if (!result.ok) return result;
      const bytes = result.value.bytes.get(input.file);
      return bytes === undefined
        ? Object.freeze({ ok: false, error: themeHostFailure("THEME_FILE_NOT_DECLARED", input.identity.id) })
        : Object.freeze({ ok: true, value: copyBytes(bytes) });
    },
  });
}
