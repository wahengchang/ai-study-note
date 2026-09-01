import { closeSync, constants, copyFileSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest } from "../foundation/index.js";
import type { DataMediaResult, MediaEvidence, MediaFinalCandidate, MediaFinalToken, MediaHardlinkPairToken, MediaObjectStore, MediaStageCandidate, MediaStageToken, MediaStorageSnapshot } from "./contracts.js";

const failures = { MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。", MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。", MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。", MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。" } as const;
type Kind = "stage" | "final";
type DirectoryIdentity = Readonly<{ dev: number; ino: number }>;
type StoredToken = { kind: Kind; key: Digest; path: string; evidence: MediaEvidence; dev: number; ino: number; nlink: number; mtimeMs: number; pair?: object; orphanable: boolean };
type Inspected = Readonly<{ evidence: MediaEvidence; dev: number; ino: number; nlink: number; mtimeMs: number }>;

export function createLocalMediaObjectStore({ objectsRoot }: Readonly<{ objectsRoot: string }>): DataMediaResult<MediaObjectStore> {
  const fail = <T>(code: keyof typeof failures): DataMediaResult<T> => ({ ok: false, error: { code, owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: failures[code] } } });
  try {
    if (!path.isAbsolute(objectsRoot)) return fail("MEDIA_ROOT_FAILURE");
    mkdirSync(objectsRoot, { recursive: true, mode: 0o700 });
    const root = realpathSync(objectsRoot);
    const staging = path.join(root, "staging"), objects = path.join(root, "objects");
    mkdirSync(staging, { recursive: true, mode: 0o700 }); mkdirSync(objects, { recursive: true, mode: 0o700 });
    const pinned = pinDirectories(root, staging, objects); if (pinned === undefined) return fail("MEDIA_ROOT_FAILURE");
    const stages = new WeakMap<object, StoredToken>(), finals = new WeakMap<object, StoredToken>();
    const healthyRoot = (): boolean => sameDirectory(root, pinned.root) && sameDirectory(staging, pinned.staging) && sameDirectory(objects, pinned.objects);
    const tokenFor = (record: StoredToken): MediaStageToken | MediaFinalToken => { const token = {} as MediaStageToken & MediaFinalToken; (record.kind === "stage" ? stages : finals).set(token, record); return token; };
    const validate = (record: StoredToken, evidence: MediaEvidence): boolean => {
      if (!healthyRoot() || !sameEvidence(record.evidence, evidence)) return false;
      const inspected = inspectFile(record.path, record.kind, record.key); if (inspected === undefined) return false;
      return inspected.dev === record.dev && inspected.ino === record.ino && inspected.nlink === record.nlink && inspected.mtimeMs === record.mtimeMs && sameEvidence(inspected.evidence, evidence) && healthyRoot();
    };
    return { ok: true, value: {
      stage(input) {
        if (!healthyRoot() || typeof input.importId !== "string" || input.importId.length === 0 || !(input.bytes instanceof Uint8Array) || !validEvidence(input.evidence) || sha256Digest(input.bytes) !== input.evidence.objectDigest || input.bytes.byteLength !== input.evidence.byteLength) return fail("MEDIA_STAGING_FAILURE");
        const key = sha256Digest(new TextEncoder().encode(input.importId)); const file = stagePath(staging, key);
        try {
          const handle = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try { writeFileSync(handle, copyBytes(input.bytes)); } finally { closeSync(handle); }
          const inspected = inspectFile(file, "stage", key); if (inspected === undefined || inspected.nlink !== 1 || !sameEvidence(inspected.evidence, input.evidence) || !healthyRoot()) return fail("MEDIA_STAGING_FAILURE");
          const token = tokenFor({ kind: "stage", key, path: file, evidence: cloneEvidence(input.evidence), dev: inspected.dev, ino: inspected.ino, nlink: 1, mtimeMs: inspected.mtimeMs, orphanable: false }) as MediaStageToken;
          return { ok: true, value: token };
        } catch { return fail("MEDIA_STAGING_FAILURE"); }
      },
      promote(token, evidence) {
        const stage = stages.get(token); if (stage === undefined || !validEvidence(evidence) || !validate(stage, evidence)) return fail("MEDIA_PROMOTION_FAILURE");
        const file = finalPath(objects, evidence.objectDigest); let paired = false;
        try {
          try { linkSync(stage.path, file); paired = true; }
          catch (error) {
            const code = errorCode(error);
            if (code === "EEXIST") { /* content-addressed reuse is verified below. */ }
            else if (code === "EPERM" || code === "ENOSYS" || code === "EXDEV") copyFileSync(stage.path, file, constants.COPYFILE_EXCL);
            else throw error;
          }
          const inspected = inspectFile(file, "final", evidence.objectDigest); if (inspected === undefined || !sameEvidence(inspected.evidence, evidence) || !healthyRoot()) return fail("MEDIA_PROMOTION_FAILURE");
          if (paired) {
            const stageNow = inspectFile(stage.path, "stage", stage.key); if (stageNow === undefined || stageNow.nlink !== 2 || inspected.nlink !== 2 || stageNow.dev !== inspected.dev || stageNow.ino !== inspected.ino) return fail("MEDIA_PROMOTION_FAILURE");
            const pair = {}; stage.pair = pair; stage.nlink = 2; stage.mtimeMs = stageNow.mtimeMs;
            const final = tokenFor({ kind: "final", key: evidence.objectDigest, path: file, evidence: cloneEvidence(evidence), dev: inspected.dev, ino: inspected.ino, nlink: 2, mtimeMs: inspected.mtimeMs, pair, orphanable: false }) as MediaFinalToken;
            return { ok: true, value: final };
          }
          if (inspected.nlink !== 1) return fail("MEDIA_PROMOTION_FAILURE");
          const final = tokenFor({ kind: "final", key: evidence.objectDigest, path: file, evidence: cloneEvidence(evidence), dev: inspected.dev, ino: inspected.ino, nlink: 1, mtimeMs: inspected.mtimeMs, orphanable: false }) as MediaFinalToken;
          return { ok: true, value: final };
        } catch { return fail("MEDIA_PROMOTION_FAILURE"); }
      },
      verifyFinal(token, evidence) { const final = finals.get(token); return final !== undefined && validEvidence(evidence) && validate(final, evidence) ? { ok: true, value: undefined } : fail("MEDIA_FINAL_VERIFICATION_FAILURE"); },
      releaseStage(stageToken, finalToken) {
        const stage = stages.get(stageToken), final = finals.get(finalToken);
        if (stage === undefined || final === undefined || !sameEvidence(stage.evidence, final.evidence) || !validate(stage, stage.evidence) || !validate(final, final.evidence) || stage.pair !== final.pair) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
        try {
          unlinkSync(stage.path); stages.delete(stageToken);
          const survivor = inspectFile(final.path, "final", final.key); if (survivor === undefined || survivor.nlink !== 1 || !sameEvidence(survivor.evidence, final.evidence) || !healthyRoot()) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
          final.nlink = 1; final.mtimeMs = survivor.mtimeMs; delete final.pair; return { ok: true, value: undefined };
        } catch { return fail("MEDIA_FINAL_VERIFICATION_FAILURE"); }
      },
      verifyEvidence(evidence) { if (!validEvidence(evidence) || !healthyRoot()) return fail("MEDIA_FINAL_VERIFICATION_FAILURE"); const inspected = inspectFile(finalPath(objects, evidence.objectDigest), "final", evidence.objectDigest); return inspected !== undefined && sameEvidence(inspected.evidence, evidence) && (inspected.nlink === 1 || inspected.nlink === 2) && healthyRoot() ? { ok: true, value: undefined } : fail("MEDIA_FINAL_VERIFICATION_FAILURE"); },
      readStartupSnapshot() {
        if (!healthyRoot()) return fail("MEDIA_ROOT_FAILURE");
        const scanned = scanSnapshot(staging, objects, tokenFor); if (scanned === undefined || !healthyRoot()) return fail("MEDIA_ROOT_FAILURE");
        return { ok: true, value: scanned };
      },
      removeOrphan(token) {
        const record = stages.get(token) ?? finals.get(token);
        if (record === undefined || !record.orphanable || record.nlink !== 1 || !validate(record, record.evidence)) return fail("MEDIA_ROOT_FAILURE");
        try { unlinkSync(record.path); (record.kind === "stage" ? stages : finals).delete(token); return healthyRoot() ? { ok: true, value: undefined } : fail("MEDIA_ROOT_FAILURE"); } catch { return fail("MEDIA_ROOT_FAILURE"); }
      },
    } };
  } catch { return fail("MEDIA_ROOT_FAILURE"); }
}

function scanSnapshot(staging: string, objects: string, tokenFor: (record: StoredToken) => MediaStageToken | MediaFinalToken): MediaStorageSnapshot | undefined {
  const first = scanNames(staging, objects); if (first === undefined) return undefined;
  const records: StoredToken[] = [];
  for (const item of first) { const inspected = inspectFile(item.path, item.kind, item.key); if (inspected === undefined) return undefined; records.push({ kind: item.kind, key: item.key, path: item.path, evidence: cloneEvidence(inspected.evidence), dev: inspected.dev, ino: inspected.ino, nlink: inspected.nlink, mtimeMs: inspected.mtimeMs, orphanable: inspected.nlink === 1 }); }
  const second = scanNames(staging, objects); if (second === undefined || second.length !== first.length || second.some((item, index) => item.path !== first[index]?.path)) return undefined;
  for (const [index, item] of second.entries()) { const inspected = inspectFile(item.path,item.kind,item.key), original = records[index]; if (inspected === undefined || original === undefined || inspected.dev !== original.dev || inspected.ino !== original.ino || inspected.nlink !== original.nlink || inspected.mtimeMs !== original.mtimeMs || !sameEvidence(inspected.evidence,original.evidence)) return undefined; }
  const groups = new Map<string, StoredToken[]>(); for (const record of records) { const key = `${record.dev}:${record.ino}`; const group = groups.get(key) ?? []; group.push(record); groups.set(key, group); }
  for (const group of groups.values()) {
    if (group.length === 1) { if (group[0]?.nlink !== 1) return undefined; continue; }
    const stage = group.find((record) => record.kind === "stage"), final = group.find((record) => record.kind === "final");
    if (group.length !== 2 || stage === undefined || final === undefined || stage.nlink !== 2 || final.nlink !== 2 || !sameEvidence(stage.evidence, final.evidence) || final.key !== final.evidence.objectDigest) return undefined;
    const pair = {}; stage.pair = pair; final.pair = pair; stage.orphanable = false; final.orphanable = false;
  }
  const stages: MediaStageCandidate[] = [], finals: MediaFinalCandidate[] = [];
  for (const record of records) {
    const token = tokenFor(record);
    const candidate = { key: record.key, evidence: cloneEvidence(record.evidence), token, ...(record.pair === undefined ? {} : { hardlinkPair: record.pair as MediaHardlinkPairToken }) };
    if (record.kind === "stage") stages.push(candidate as MediaStageCandidate); else finals.push(candidate as MediaFinalCandidate);
  }
  stages.sort((a,b) => compareCodeUnits(a.key,b.key)); finals.sort((a,b) => compareCodeUnits(a.key,b.key));
  const bytes = canonicalJsonBytes({ contract: "media-storage-snapshot/v1", stages: stages.map((candidate) => ({ key: candidate.key, objectDigest: candidate.evidence.objectDigest, byteLength: candidate.evidence.byteLength, pair: candidate.hardlinkPair === undefined ? null : finalKeyForPair(candidate.hardlinkPair, finals) })), finals: finals.map((candidate) => ({ key: candidate.key, objectDigest: candidate.evidence.objectDigest, byteLength: candidate.evidence.byteLength, pair: candidate.hardlinkPair === undefined ? null : stageKeyForPair(candidate.hardlinkPair, stages) })) });
  return bytes.ok ? { contract: "media-storage-snapshot/v1", digest: sha256Digest(bytes.value), stages, finals } : undefined;
}
function scanNames(staging: string, objects: string): readonly Readonly<{ kind: Kind; key: Digest; path: string }>[] | undefined { try { const entries = [...readdirSync(staging), ...readdirSync(objects)].sort(compareCodeUnits); const result: Array<Readonly<{ kind: Kind; key: Digest; path: string }>> = []; for (const name of entries) { const stage = /^[a-f0-9]{64}\.partial$/.exec(name), final = /^[a-f0-9]{64}$/.exec(name); if (stage === null && final === null) return undefined; const kind: Kind = stage === null ? "final" : "stage"; const key = `sha256:${(stage?.[0] ?? final?.[0] ?? "").replace(".partial", "")}` as Digest; result.push({ kind, key, path: kind === "stage" ? stagePath(staging,key) : finalPath(objects,key) }); } return result; } catch { return undefined; } }
function inspectFile(file: string, kind: Kind, key: Digest): Inspected | undefined { try { const expected = kind === "stage" ? /^[a-f0-9]{64}\.partial$/ : /^[a-f0-9]{64}$/; if (!expected.test(path.basename(file))) return undefined; const before = lstatSync(file); if (!before.isFile() || before.isSymbolicLink() || !Number.isSafeInteger(before.size) || !Number.isSafeInteger(before.nlink)) return undefined; const handle = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW); try { const opened = fstatSync(handle); if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== before.nlink || opened.mtimeMs !== before.mtimeMs) return undefined; const hash = createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024); let offset = 0; for (;;) { const count = readSync(handle, buffer, 0, buffer.length, offset); if (count === 0) break; hash.update(buffer.subarray(0,count)); offset += count; } const after = fstatSync(handle), lstatAfter = lstatSync(file); if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== opened.nlink || after.mtimeMs !== opened.mtimeMs || lstatAfter.dev !== opened.dev || lstatAfter.ino !== opened.ino || lstatAfter.size !== opened.size || lstatAfter.nlink !== opened.nlink || lstatAfter.mtimeMs !== opened.mtimeMs || !lstatAfter.isFile() || lstatAfter.isSymbolicLink()) return undefined; const evidence = { objectDigest: `sha256:${hash.digest("hex")}` as Digest, byteLength: after.size }; if (!validEvidence(evidence) || (kind === "final" && evidence.objectDigest !== key)) return undefined; return { evidence, dev: after.dev, ino: after.ino, nlink: after.nlink, mtimeMs: after.mtimeMs }; } finally { closeSync(handle); } } catch { return undefined; } }
function pinDirectories(root: string, staging: string, objects: string): Readonly<{ root: DirectoryIdentity; staging: DirectoryIdentity; objects: DirectoryIdentity }> | undefined { const rootId = directoryIdentity(root), stagingId = directoryIdentity(staging), objectsId = directoryIdentity(objects); return rootId === undefined || stagingId === undefined || objectsId === undefined ? undefined : { root: rootId, staging: stagingId, objects: objectsId }; }
function directoryIdentity(directory: string): DirectoryIdentity | undefined { try { const stat = lstatSync(directory); return stat.isDirectory() && !stat.isSymbolicLink() ? { dev: stat.dev, ino: stat.ino } : undefined; } catch { return undefined; } }
function sameDirectory(directory: string, expected: DirectoryIdentity): boolean { const current = directoryIdentity(directory); return current !== undefined && current.dev === expected.dev && current.ino === expected.ino; }
function stagePath(staging: string, key: Digest): string { return path.join(staging, `${key.slice(7)}.partial`); }
function finalPath(objects: string, key: Digest): string { return path.join(objects, key.slice(7)); }
function validEvidence(value: MediaEvidence): value is MediaEvidence { return typeof value?.objectDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(value.objectDigest) && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0; }
function cloneEvidence(value: MediaEvidence): MediaEvidence { return { objectDigest: value.objectDigest, byteLength: value.byteLength }; }
function sameEvidence(left: MediaEvidence, right: MediaEvidence): boolean { return left.objectDigest === right.objectDigest && left.byteLength === right.byteLength; }
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function finalKeyForPair(pair: MediaHardlinkPairToken, finals: readonly MediaFinalCandidate[]): string | null { return finals.find((candidate) => candidate.hardlinkPair === pair)?.key ?? null; }
function stageKeyForPair(pair: MediaHardlinkPairToken, stages: readonly MediaStageCandidate[]): string | null { return stages.find((candidate) => candidate.hardlinkPair === pair)?.key ?? null; }
function errorCode(error: unknown): string { return error !== null && typeof error === "object" && "code" in error ? String(error.code) : ""; }
