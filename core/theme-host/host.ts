import { valid as semverValid } from "semver";
import { copyBytes, isDigest, sha256Digest } from "../foundation/index.js";
import type { ThemeHost, ThemeHostResult, ThemeIdentity, ThemeManifestV1, VerifiedThemePackage } from "./contracts.js";
import { isCanonicalThemeId, themeHostFailure, type ThemeHostFailure } from "./failures.js";
import { parseThemeManifest } from "./manifest.js";
import { compareCodeUnits } from "./ordering.js";
import { runtimeIsSelfContained } from "./runtime-scan.js";
import {
  installedThemeSlots,
  readTrustedThemeFile,
  revalidateTrustedRoots,
  validateThemeSlot,
  type TrustedIdentity,
  type TrustedRoots,
} from "./trusted-root.js";

/**
 * 每個 operation 都以兩階段收集 installed root：
 *
 *   slots ──▶ 階段一：slot identity + theme.json ──▶ ThemeIdentity 普查（conflict／drift 判定）
 *                                                   │
 *                                                   └─ select ──▶ 階段二：完整 evidence 位元組
 *                                                                （digest + self-contained runtime 掃描）
 *
 * identity 只來自 manifest，所以 conflict 與 drift 只需要階段一；只有真正要交付的 package
 * 才進入階段二。`resolveExact`／`readVerifiedFile` 因此不會為了單一 Theme 重新讀取並雜湊
 * installed root 內其他所有 package。
 */
type ValidatedTheme = Readonly<{
  identity: ThemeIdentity;
  descriptor: VerifiedThemePackage;
  bytes: ReadonlyMap<string, Uint8Array>;
}>;
type ParsedSlot = Readonly<{
  slot: string;
  slotIdentity: TrustedIdentity;
  identity: ThemeIdentity;
  manifest: ThemeManifestV1;
  manifestBytes: number;
}>;
type SlotOutcome =
  | Readonly<{ status: "validated"; identity: ThemeIdentity; theme: ValidatedTheme }>
  | Readonly<{ status: "unverified"; identity: ThemeIdentity }>
  | Readonly<{ status: "rejected"; identity: ThemeIdentity | null; error: ThemeHostFailure }>;
type Collected = Readonly<{ ok: true; values: readonly SlotOutcome[] }> | Readonly<{ ok: false; error: ThemeHostFailure }>;
type CollectOptions = Readonly<{ select: (identity: ThemeIdentity) => boolean; retainBytes: boolean }>;

const maximumSlots = 256;
const maximumResources = 128;
const maximumManifestBytes = 1_048_576;
const maximumEvidenceFileBytes = 16_777_216;
const maximumPackageBytes = 67_108_864;
/** 同時開啟的 package 數量上限，讓 peak memory 與 file descriptor 不隨 slot 數線性膨脹。 */
const maximumConcurrentSlots = 8;

function sameIdentity(left: ThemeIdentity, right: ThemeIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.manifestHash === right.manifestHash;
}

function outcomeIdentity(value: SlotOutcome): ThemeIdentity | null {
  return value.identity;
}

function isValidated(value: SlotOutcome): value is Extract<SlotOutcome, { status: "validated" }> {
  return value.status === "validated";
}

function isConflict(value: SlotOutcome, identity: ThemeIdentity): boolean {
  return value.status === "rejected" && value.error.code === "THEME_IDENTITY_CONFLICT" && value.identity !== null && value.identity.id === identity.id && value.identity.version === identity.version;
}

function rejected(error: ThemeHostFailure, identity: ThemeIdentity | null): SlotOutcome {
  return Object.freeze({ status: "rejected" as const, identity, error });
}

function validIdentity(value: unknown): value is ThemeIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 3 && isCanonicalThemeId(input.id) && typeof input.version === "string" && semverValid(input.version) === input.version && typeof input.manifestHash === "string" && isDigest(input.manifestHash);
}

async function mapBounded<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<readonly R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function parseSlot(roots: TrustedRoots, slot: string): Promise<Readonly<{ ok: true; value: ParsedSlot }> | Readonly<{ ok: false; outcome: SlotOutcome }>> {
  const slotIdentity = await validateThemeSlot(roots, slot);
  if (slotIdentity === null) return Object.freeze({ ok: false, outcome: rejected(themeHostFailure("THEME_EVIDENCE_MISMATCH"), null) });
  const manifestBytes = await readTrustedThemeFile(roots, slot, slotIdentity, "theme.json", maximumManifestBytes);
  if (!manifestBytes.ok) return Object.freeze({ ok: false, outcome: rejected(themeHostFailure("THEME_EVIDENCE_MISMATCH"), null) });
  const parsed = parseThemeManifest(manifestBytes.bytes);
  if (!parsed.ok) return Object.freeze({ ok: false, outcome: rejected(parsed.error.owner === "ThemeHost" ? parsed.error : themeHostFailure("INVALID_THEME_MANIFEST"), null) });
  const { identity, manifest } = parsed.value;
  if (manifest.resources.length > maximumResources) {
    return Object.freeze({ ok: false, outcome: rejected(themeHostFailure("INVALID_THEME_MANIFEST", identity.id), identity) });
  }
  return Object.freeze({ ok: true, value: Object.freeze({ slot, slotIdentity, identity, manifest, manifestBytes: manifestBytes.bytes.byteLength }) });
}

async function verifySlot(roots: TrustedRoots, parsed: ParsedSlot, retainBytes: boolean): Promise<SlotOutcome> {
  const { identity, manifest, slot, slotIdentity } = parsed;
  const files = [manifest.runtime, ...manifest.resources];
  const bytes = new Map<string, Uint8Array>();
  let runtimeBytes: Uint8Array | null = null;
  let packageBytes = parsed.manifestBytes;
  for (const file of files) {
    const evidence = await readTrustedThemeFile(roots, slot, slotIdentity, file.file, Math.min(maximumEvidenceFileBytes, maximumPackageBytes - packageBytes));
    if (!evidence.ok || sha256Digest(evidence.bytes) !== file.digest) {
      return rejected(themeHostFailure("THEME_EVIDENCE_MISMATCH", identity.id), identity);
    }
    packageBytes += evidence.bytes.byteLength;
    if (file.file === manifest.runtime.file) runtimeBytes = evidence.bytes;
    if (retainBytes) bytes.set(file.file, evidence.bytes);
  }
  if (runtimeBytes === null || !(await runtimeIsSelfContained(runtimeBytes))) {
    return rejected(themeHostFailure("THEME_RUNTIME_INVALID", identity.id), identity);
  }
  const slotAfter = await validateThemeSlot(roots, slot);
  if (slotAfter === null || slotAfter.dev !== slotIdentity.dev || slotAfter.ino !== slotIdentity.ino || slotAfter.uid !== slotIdentity.uid || slotAfter.mode !== slotIdentity.mode) {
    return rejected(themeHostFailure("THEME_EVIDENCE_MISMATCH", identity.id), identity);
  }
  return Object.freeze({
    status: "validated" as const,
    identity,
    theme: Object.freeze({
      identity,
      descriptor: Object.freeze({ identity, manifest }),
      bytes,
    }),
  });
}

async function collect(roots: TrustedRoots, options: CollectOptions): Promise<Collected> {
  if (!(await revalidateTrustedRoots(roots))) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") });
  let slots: readonly string[];
  try {
    slots = await installedThemeSlots(roots);
  } catch {
    return Object.freeze({ ok: false, error: themeHostFailure("THEME_DISCOVERY_FAILED") });
  }
  if (slots.length > maximumSlots) return Object.freeze({ ok: false, error: themeHostFailure("THEME_DISCOVERY_FAILED") });
  const values = await mapBounded(slots, maximumConcurrentSlots, async (slot) => {
    const parsed = await parseSlot(roots, slot);
    if (!parsed.ok) return parsed.outcome;
    return options.select(parsed.value.identity)
      ? await verifySlot(roots, parsed.value, options.retainBytes)
      : Object.freeze({ status: "unverified" as const, identity: parsed.value.identity });
  });
  if (!(await revalidateTrustedRoots(roots))) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_TRUSTED_ROOT") });
  return Object.freeze({ ok: true, values: Object.freeze(values) });
}

function conflictKey(identity: ThemeIdentity): string {
  return `${identity.id}\0${identity.version}`;
}

function conflicts(values: readonly SlotOutcome[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const identity = outcomeIdentity(value);
    if (identity === null) continue;
    const key = conflictKey(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function normalizedValues(values: readonly SlotOutcome[]): readonly SlotOutcome[] {
  const duplicateKeys = conflicts(values);
  return Object.freeze(values.map((value) => {
    const identity = outcomeIdentity(value);
    return identity !== null && duplicateKeys.has(conflictKey(identity))
      ? rejected(themeHostFailure("THEME_IDENTITY_CONFLICT", identity.id), identity)
      : value;
  }));
}

function orderedRejections(values: readonly SlotOutcome[]): readonly ThemeHostFailure[] {
  const unique = new Map<string, ThemeHostFailure>();
  for (const value of values) {
    if (value.status !== "rejected") continue;
    const key = `${value.error.code}\0${value.error.subjectIds[0] ?? ""}`;
    if (!unique.has(key)) unique.set(key, value.error);
  }
  return Object.freeze([...unique.values()].sort((left, right) => {
    const subject = compareCodeUnits(left.subjectIds[0] ?? "", right.subjectIds[0] ?? "");
    return subject !== 0 ? subject : compareCodeUnits(left.code, right.code);
  }));
}

function resolved(values: readonly SlotOutcome[], identity: ThemeIdentity): ThemeHostResult<ValidatedTheme> {
  const normalized = normalizedValues(values);
  const exact = normalized.find((value) => isValidated(value) && sameIdentity(value.identity, identity));
  if (exact !== undefined && isValidated(exact)) return Object.freeze({ ok: true, value: exact.theme });
  const conflict = normalized.find((value) => isConflict(value, identity));
  if (conflict !== undefined && conflict.status === "rejected") return Object.freeze({ ok: false, error: conflict.error });
  const drift = normalized.find((value) => {
    const candidate = outcomeIdentity(value);
    return candidate !== null && candidate.id === identity.id && candidate.version === identity.version;
  });
  return drift === undefined
    ? Object.freeze({ ok: false, error: themeHostFailure("THEME_NOT_FOUND", identity.id) })
    : Object.freeze({ ok: false, error: themeHostFailure("THEME_EVIDENCE_MISMATCH", identity.id) });
}

async function resolveIdentity(roots: TrustedRoots, identity: ThemeIdentity, retainBytes: boolean): Promise<ThemeHostResult<ValidatedTheme>> {
  const collected = await collect(roots, { select: (candidate) => sameIdentity(candidate, identity), retainBytes });
  return collected.ok ? resolved(collected.values, identity) : collected;
}

export function themeHost(roots: TrustedRoots): ThemeHost {
  return Object.freeze({
    async discover() {
      const collected = await collect(roots, { select: () => true, retainBytes: false });
      if (!collected.ok) return collected;
      const values = normalizedValues(collected.values);
      const candidates = values.filter(isValidated).map((value) => value.identity).sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.version, right.version) || compareCodeUnits(left.manifestHash, right.manifestHash));
      return Object.freeze({ ok: true, value: Object.freeze({ candidates: Object.freeze(candidates), rejections: orderedRejections(values) }) });
    },
    async resolveExact(input) {
      if (!validIdentity(input?.identity)) return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
      const result = await resolveIdentity(roots, input.identity, false);
      return result.ok ? Object.freeze({ ok: true, value: result.value.descriptor }) : result;
    },
    async readVerifiedFile(input) {
      if (!validIdentity(input?.identity) || typeof input?.file !== "string") return Object.freeze({ ok: false, error: themeHostFailure("INVALID_THEME_HOST_INPUT") });
      const result = await resolveIdentity(roots, input.identity, true);
      if (!result.ok) return result;
      const bytes = result.value.bytes.get(input.file);
      return bytes === undefined
        ? Object.freeze({ ok: false, error: themeHostFailure("THEME_FILE_NOT_DECLARED", input.identity.id) })
        : Object.freeze({ ok: true, value: copyBytes(bytes) });
    },
  });
}
