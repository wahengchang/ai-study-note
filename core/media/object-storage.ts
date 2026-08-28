import { closeSync, constants, copyFileSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sha256Digest } from "../foundation/index.js";
import type { DataMediaResult, MediaEvidence, MediaFinalToken, MediaObjectStore, MediaStageToken } from "./contracts.js";

const failures = { MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。", MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。", MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。", MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。" } as const;
type Stage = { path: string; evidence: MediaEvidence }; type Final = { path: string; evidence: MediaEvidence };

export function createLocalMediaObjectStore({ objectsRoot }: Readonly<{ objectsRoot: string }>): DataMediaResult<MediaObjectStore> {
  const fail = <T>(code: keyof typeof failures): DataMediaResult<T> => ({ ok: false, error: { code, owner: "DataMedia", subjectIds: [], remediation: { kind: "message", message: failures[code] } } });
  try {
    if (!path.isAbsolute(objectsRoot)) return fail("MEDIA_ROOT_FAILURE");
    mkdirSync(objectsRoot, { recursive: true, mode: 0o700 }); const root = realpathSync(objectsRoot); const staging = path.join(root, "staging"); const objects = path.join(root, "objects"); mkdirSync(staging, { recursive: true, mode: 0o700 }); mkdirSync(objects, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory() || !lstatSync(staging).isDirectory() || !lstatSync(objects).isDirectory()) return fail("MEDIA_ROOT_FAILURE");
    const stages = new WeakMap<object, Stage>(); const finals = new WeakMap<object, Final>();
    const verify = (file: string, evidence: MediaEvidence): boolean => { try { const stats = lstatSync(file); return stats.isFile() && !stats.isSymbolicLink() && stats.size === evidence.byteLength && sha256Digest(readFileSync(file)) === evidence.objectDigest; } catch { return false; } };
    return { ok: true, value: {
      stage(input) { try { const stagePath = path.join(staging, sha256Digest(new TextEncoder().encode(input.importId)).slice(7) + ".partial"); const handle = openSync(stagePath, "wx", 0o600); try { writeFileSync(handle, input.bytes); } finally { try { closeSync(handle); } catch {} } if (!verify(stagePath, input.evidence)) return fail("MEDIA_STAGING_FAILURE"); const token = {} as MediaStageToken; stages.set(token, { path: stagePath, evidence: input.evidence }); return { ok: true, value: token }; } catch { return fail("MEDIA_STAGING_FAILURE"); } },
      promote(token, evidence) { const stage = stages.get(token); if (stage === undefined || !same(stage.evidence, evidence)) return fail("MEDIA_PROMOTION_FAILURE"); const finalPath = path.join(objects, evidence.objectDigest.slice(7)); try { promoteBytes(stage.path, finalPath); const final = {} as MediaFinalToken; finals.set(final, { path: finalPath, evidence }); return { ok: true, value: final }; } catch { return fail("MEDIA_PROMOTION_FAILURE"); } },
      verifyFinal(token, evidence) { const final = finals.get(token); return final !== undefined && same(final.evidence, evidence) && verify(final.path, evidence) ? { ok: true, value: undefined } : fail("MEDIA_FINAL_VERIFICATION_FAILURE"); },
      releaseStage(token, final) { const stage = stages.get(token); if (stage === undefined || finals.get(final) === undefined) return fail("MEDIA_FINAL_VERIFICATION_FAILURE"); try { rmSync(stage.path, { force: true }); stages.delete(token); return { ok: true, value: undefined }; } catch { return fail("MEDIA_FINAL_VERIFICATION_FAILURE"); } },
      verifyEvidence(evidence) { return verify(path.join(objects, evidence.objectDigest.slice(7)), evidence) ? { ok: true, value: undefined } : fail("MEDIA_FINAL_VERIFICATION_FAILURE"); },
    } }; 
  } catch { return fail("MEDIA_ROOT_FAILURE"); }
}
/**
 * 先試 hard link，不支援 link 的檔案系統退回 copy。object path 是內容定址的，
 * 因此兩條路徑都把 EEXIST 視為「相同 bytes 已 promote 過」；呼叫端的 verifyFinal 仍會重新驗證。
 */
function promoteBytes(stagePath: string, finalPath: string): void {
  try {
    linkSync(stagePath, finalPath);
    return;
  } catch (error) {
    const code = errorCode(error);
    if (code === "EEXIST") return;
    if (code !== "EPERM" && code !== "ENOSYS" && code !== "EXDEV") throw error;
  }
  try {
    copyFileSync(stagePath, finalPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
}
function errorCode(error: unknown): string { return error !== null && typeof error === "object" && "code" in error ? String(error.code) : ""; }
function same(left: MediaEvidence, right: MediaEvidence): boolean { return left.objectDigest === right.objectDigest && left.byteLength === right.byteLength; }
