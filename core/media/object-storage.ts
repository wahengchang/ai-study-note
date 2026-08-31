import {
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { sha256Digest } from "../foundation/index.js";
import type { DataMediaResult, MediaEvidence, MediaFinalToken, MediaObjectStore, MediaStageToken } from "./contracts.js";

const failures = {
  MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。",
  MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。",
  MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。",
  MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。",
} as const;
const digestKey = /^[a-f0-9]{64}$/;
type RootIdentity = Readonly<{ path: string; dev: number; ino: number }>;
type Stage = Readonly<{ name: string; evidence: MediaEvidence }>;
type Final = Readonly<{ name: string; evidence: MediaEvidence }>;

export function createLocalMediaObjectStore({ objectsRoot }: Readonly<{ objectsRoot: string }>): DataMediaResult<MediaObjectStore> {
  const fail = <T>(code: keyof typeof failures): DataMediaResult<T> => ({
    ok: false,
    error: { code, owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: failures[code] } },
  });
  if (!path.isAbsolute(objectsRoot)) return fail("MEDIA_ROOT_FAILURE");

  let roots: Readonly<{ root: RootIdentity; staging: RootIdentity; objects: RootIdentity }>;
  try {
    mkdirSync(objectsRoot, { recursive: true, mode: 0o700 });
    const root = captureDirectory(objectsRoot);
    const staging = captureDirectory(path.join(root.path, "staging"));
    const objects = captureDirectory(path.join(root.path, "objects"));
    roots = { root, staging, objects };
  } catch {
    return fail("MEDIA_ROOT_FAILURE");
  }

  const stages = new WeakMap<object, Stage>();
  const finals = new WeakMap<object, Final>();
  const usable = (): boolean => sameDirectory(roots.root) && sameDirectory(roots.staging) && sameDirectory(roots.objects);
  const stagePath = (name: string): string => path.join(roots.staging.path, name);
  const finalPath = (name: string): string => path.join(roots.objects.path, name);
  const inspect = (file: string, evidence: MediaEvidence): "healthy" | "absent" | "unhealthy" => {
    try {
      return safeRead(file, evidence) ? "healthy" : "unhealthy";
    } catch (error) {
      return errorCode(error) === "ENOENT" ? "absent" : "unhealthy";
    }
  };

  return {
    ok: true,
    value: {
      stage(input) {
        if (!usable() || !validEvidence(input.evidence) || typeof input.importId !== "string" || input.importId.length === 0) return fail("MEDIA_ROOT_FAILURE");
        const name = `${sha256Digest(new TextEncoder().encode(input.importId)).slice(7)}.partial`;
        const target = stagePath(name);
        const existing = inspect(target, input.evidence);
        if (existing === "healthy") {
          const token = {} as MediaStageToken;
          stages.set(token, { name, evidence: input.evidence });
          return { ok: true, value: token };
        }
        if (existing === "unhealthy") return fail("MEDIA_STAGING_FAILURE");
        try {
          const handle = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try {
            writeFileSync(handle, input.bytes);
          } finally {
            closeSync(handle);
          }
          if (!usable() || inspect(target, input.evidence) !== "healthy") return fail("MEDIA_STAGING_FAILURE");
          const token = {} as MediaStageToken;
          stages.set(token, { name, evidence: input.evidence });
          return { ok: true, value: token };
        } catch {
          return fail("MEDIA_STAGING_FAILURE");
        }
      },
      promote(token, evidence) {
        const stage = stages.get(token);
        if (!usable() || stage === undefined || !same(stage.evidence, evidence) || inspect(stagePath(stage.name), evidence) !== "healthy") return fail("MEDIA_PROMOTION_FAILURE");
        const name = evidence.objectDigest.slice(7);
        if (!digestKey.test(name)) return fail("MEDIA_PROMOTION_FAILURE");
        const target = finalPath(name);
        try {
          if (inspect(target, evidence) === "unhealthy") return fail("MEDIA_PROMOTION_FAILURE");
          if (inspect(target, evidence) === "absent") promoteBytes(stagePath(stage.name), target);
          if (!usable() || inspect(target, evidence) !== "healthy") return fail("MEDIA_PROMOTION_FAILURE");
          const final = {} as MediaFinalToken;
          finals.set(final, { name, evidence });
          return { ok: true, value: final };
        } catch {
          return fail("MEDIA_PROMOTION_FAILURE");
        }
      },
      verifyFinal(token, evidence) {
        const final = finals.get(token);
        return usable() && final !== undefined && same(final.evidence, evidence) && inspect(finalPath(final.name), evidence) === "healthy"
          ? { ok: true, value: undefined }
          : fail("MEDIA_FINAL_VERIFICATION_FAILURE");
      },
      releaseStage(token, final) {
        const stage = stages.get(token);
        const completed = finals.get(final);
        if (!usable() || stage === undefined || completed === undefined || !same(stage.evidence, completed.evidence)) return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
        try {
          if (inspect(finalPath(completed.name), completed.evidence) !== "healthy") return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
          unlinkSync(stagePath(stage.name));
          stages.delete(token);
          return { ok: true, value: undefined };
        } catch {
          return fail("MEDIA_FINAL_VERIFICATION_FAILURE");
        }
      },
      verifyEvidence(evidence) {
        return usable() && validEvidence(evidence) && inspect(finalPath(evidence.objectDigest.slice(7)), evidence) === "healthy"
          ? { ok: true, value: undefined }
          : fail("MEDIA_FINAL_VERIFICATION_FAILURE");
      },
      inspectFinal(evidence) {
        if (!usable() || !validEvidence(evidence)) return fail("MEDIA_ROOT_FAILURE");
        return { ok: true, value: inspect(finalPath(evidence.objectDigest.slice(7)), evidence) };
      },
    },
  };
}

function captureDirectory(candidate: string): RootIdentity {
  mkdirSync(candidate, { recursive: true, mode: 0o700 });
  const stat = lstatSync(candidate);
  const resolved = realpathSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) throw new Error("unsafe media root");
  return { path: resolved, dev: stat.dev, ino: stat.ino };
}
function sameDirectory(root: RootIdentity): boolean {
  try {
    const stat = lstatSync(root.path);
    return stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0 && stat.dev === root.dev && stat.ino === root.ino && realpathSync(root.path) === root.path;
  } catch {
    return false;
  }
}
function safeRead(file: string, evidence: MediaEvidence): boolean {
  const handle = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(handle);
    if (!before.isFile() || before.uid !== process.getuid?.() || before.size !== evidence.byteLength) return false;
    const bytes = readFileSync(handle);
    const after = fstatSync(handle);
    return after.isFile() && after.dev === before.dev && after.ino === before.ino && after.size === before.size && sha256Digest(bytes) === evidence.objectDigest;
  } finally {
    closeSync(handle);
  }
}
function promoteBytes(stage: string, final: string): void {
  try {
    linkSync(stage, final);
    return;
  } catch (error) {
    const code = errorCode(error);
    if (code === "EEXIST") return;
    if (code !== "EPERM" && code !== "ENOSYS" && code !== "EXDEV") throw error;
  }
  try {
    copyFileSync(stage, final, constants.COPYFILE_EXCL);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
}
function validEvidence(value: MediaEvidence): boolean {
  return typeof value.byteLength === "number" && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0 && digestKey.test(value.objectDigest.slice(7));
}
function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error ? String(error.code) : "";
}
function same(left: MediaEvidence, right: MediaEvidence): boolean {
  return left.objectDigest === right.objectDigest && left.byteLength === right.byteLength;
}
