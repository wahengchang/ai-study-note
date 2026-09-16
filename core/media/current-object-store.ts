import { createHash } from "node:crypto";
import { closeSync, constants, copyFileSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

import type { Digest } from "../foundation/index.js";
import type { DataMediaFailureCode, DataMediaResult } from "./contracts.js";
import { mediaFailureMessages } from "./failures.js";

export type MediaByteEvidence = Readonly<{ checksum: Digest; byteLength: number }>;
export type CurrentMediaStageWriter = Readonly<{
  readonly stageId: string;
  /** 累計 checksum 與長度；超過 ceiling 時回 failure，且不寫入超出的 bytes。 */
  write(chunk: Uint8Array): DataMediaResult<void>;
  finish(): DataMediaResult<MediaByteEvidence>;
  abandon(): void;
}>;
export type CurrentMediaObjectStore = Readonly<{
  openStage(input: Readonly<{ stageId: string; ceiling: number }>): DataMediaResult<CurrentMediaStageWriter>;
  /** hardlink（必要時 copy）到 content-addressed object，並以重新雜湊驗證最終 bytes。 */
  promote(input: Readonly<{ stageId: string; evidence: MediaByteEvidence }>): DataMediaResult<void>;
  /** ENOENT 是 idempotent success；其他 unlink fault 必須讓呼叫端停止後續的 record commit。 */
  releaseStage(input: Readonly<{ stageId: string; evidence: MediaByteEvidence }>): DataMediaResult<void>;
  read(evidence: MediaByteEvidence): DataMediaResult<Uint8Array>;
  removeStage(stageId: string): DataMediaResult<void>;
  /**
   * 只在 in-process 影像解碼時使用：讓 raster pipeline 以串流方式讀取尚未 promote 的 bytes。
   * 這個路徑永不進入 response、diagnostic 或 log。
   */
  stageFilePath(stageId: string): string | undefined;
  /** 啟動時清除所有未完成的 staging 檔；它們從不是 durable state，失敗必須讓啟動 fail closed。 */
  sweepStages(): DataMediaResult<void>;
  /** 啟動時清除沒有任何 current media record 指向的 object bytes；回傳刪除數量。 */
  sweepObjects(referenced: readonly Digest[]): DataMediaResult<number>;
}>;

type DirectoryIdentity = Readonly<{ dev: number; ino: number }>;

function storeFailure<T>(code: DataMediaFailureCode, subjectIds: readonly string[] = []): DataMediaResult<T> {
  return { ok: false, error: { code, owner: "DataMedia", subjectIds: [...subjectIds], remediation: { kind: "message", message: mediaFailureMessages[code] } } };
}

export function createCurrentMediaObjectStore(input: Readonly<{ objectsRoot: string }>): DataMediaResult<CurrentMediaObjectStore> {
  try {
    if (!path.isAbsolute(input.objectsRoot)) return storeFailure("MEDIA_ROOT_FAILURE");
    const root = realpathSync(mkdirp(input.objectsRoot));
    const staging = realpathSync(mkdirp(path.join(root, "current", "staging")));
    const objects = realpathSync(mkdirp(path.join(root, "current", "objects")));
    const stagingIdentity = directoryIdentity(staging);
    const objectsIdentity = directoryIdentity(objects);
    if (stagingIdentity === undefined || objectsIdentity === undefined) return storeFailure("MEDIA_ROOT_FAILURE");
    const healthy = (): boolean => sameDirectory(staging, stagingIdentity) && sameDirectory(objects, objectsIdentity);
    const openStages = new Map<string, number>();
    const stagePathOf = (stageId: string): string => path.join(staging, `${stageKey(stageId)}.partial`);
    const objectPathOf = (checksum: Digest): string => path.join(objects, checksum.slice("sha256:".length));

    const openWriter = (stageId: string, ceiling: number): DataMediaResult<CurrentMediaStageWriter> => {
      if (!healthy() || !validStageId(stageId) || !Number.isSafeInteger(ceiling) || ceiling < 0) return storeFailure("MEDIA_STAGING_FAILURE");
      const file = stagePathOf(stageId);
      let handle: number;
      try { handle = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
      catch { return storeFailure("MEDIA_STAGING_FAILURE"); }
      openStages.set(stageId, handle);
      const hash = createHash("sha256");
      let byteLength = 0;
      let dead = false;
      const abandon = (): void => {
        dead = true;
        const open = openStages.get(stageId);
        if (open !== undefined) {
          try { closeSync(open); } catch { /* 已關閉或無法關閉都不影響 cleanup */ }
          openStages.delete(stageId);
        }
        try { unlinkSync(file); } catch { /* 檔案不存在時 cleanup 已完成 */ }
      };
      return { ok: true, value: Object.freeze({
        stageId,
        write(chunk: Uint8Array): DataMediaResult<void> {
          if (dead || !(chunk instanceof Uint8Array)) return storeFailure("MEDIA_STAGING_FAILURE");
          if (!Number.isSafeInteger(byteLength + chunk.byteLength) || byteLength + chunk.byteLength > ceiling) { abandon(); return storeFailure("MEDIA_SIZE_LIMIT_EXCEEDED"); }
          const open = openStages.get(stageId);
          if (open === undefined) return storeFailure("MEDIA_STAGING_FAILURE");
          try {
            writeSync(open, chunk, 0, chunk.byteLength);
            hash.update(chunk);
            byteLength += chunk.byteLength;
            return { ok: true, value: undefined };
          } catch { abandon(); return storeFailure("MEDIA_STAGING_FAILURE"); }
        },
        finish(): DataMediaResult<MediaByteEvidence> {
          const open = openStages.get(stageId);
          if (dead || open === undefined) return storeFailure("MEDIA_STAGING_FAILURE");
          try {
            fsyncSync(open);
            closeSync(open);
            openStages.delete(stageId);
            const stat = lstatSync(file);
            if (!ownedRegularFile(stat) || stat.size !== byteLength || stat.nlink !== 1 || !healthy()) { abandon(); return storeFailure("MEDIA_FINAL_VERIFICATION_FAILURE"); }
            return { ok: true, value: { checksum: `sha256:${hash.digest("hex")}` as Digest, byteLength } };
          } catch { abandon(); return storeFailure("MEDIA_STAGING_FAILURE"); }
        },
        abandon,
      }) };
    };

    return { ok: true, value: Object.freeze({
      openStage(request) { return openWriter(request.stageId, request.ceiling); },
      promote(request): DataMediaResult<void> {
        if (!healthy() || !validStageId(request.stageId) || !validEvidence(request.evidence)) return storeFailure("MEDIA_PROMOTION_FAILURE");
        const file = stagePathOf(request.stageId);
        const target = objectPathOf(request.evidence.checksum);
        // staging 完成後重新雜湊一次：bytes 在寫入與 promote 之間損壞時不得成為可選 object。
        if (!hashMatches(file, request.evidence)) return storeFailure("MEDIA_FINAL_VERIFICATION_FAILURE");
        try {
          // hardlink 的來源必須是已驗證的 staged 檔，目標才是 content-addressed object。
          try { linkSync(file, target); }
          catch (error) {
            const code = errorCode(error);
            if (code === "EEXIST") { /* content-addressed 重用；下面的雜湊驗證會確認既有 bytes 是否相符 */ }
            else if (code === "EPERM" || code === "ENOSYS" || code === "EXDEV") copyFileSync(file, target, constants.COPYFILE_EXCL);
            else throw error;
          }
        } catch { return storeFailure("MEDIA_PROMOTION_FAILURE"); }
        if (!hashMatches(target, request.evidence) || !healthy()) return storeFailure("MEDIA_FINAL_VERIFICATION_FAILURE");
        return { ok: true, value: undefined };
      },
      releaseStage(request) {
        if (!validStageId(request.stageId) || !validEvidence(request.evidence)) return storeFailure("MEDIA_STAGING_FAILURE");
        // 成功路徑一律在同一次請求內釋放 stage，避免留下 nlink=2 的 .partial。
        return removeFile(stagePathOf(request.stageId)) ? { ok: true, value: undefined } : storeFailure("MEDIA_STAGING_FAILURE");
      },
      read(evidence) {
        if (!healthy() || !validEvidence(evidence)) return storeFailure("MEDIA_FINAL_VERIFICATION_FAILURE");
        const bytes = readVerifiedBytes(objectPathOf(evidence.checksum), evidence);
        return bytes === undefined ? storeFailure("MEDIA_FINAL_VERIFICATION_FAILURE") : { ok: true, value: bytes };
      },
      stageFilePath(stageId) {
        if (!healthy() || !validStageId(stageId)) return undefined;
        const file = stagePathOf(stageId);
        try { return lstatSync(file).isFile() ? file : undefined; } catch { return undefined; }
      },
      removeStage(stageId) {
        if (!validStageId(stageId)) return storeFailure("MEDIA_STAGING_FAILURE");
        const open = openStages.get(stageId);
        if (open !== undefined) { try { closeSync(open); } catch { /* 關閉失敗仍需刪除 stage */ } openStages.delete(stageId); }
        return removeFile(stagePathOf(stageId)) ? { ok: true, value: undefined } : storeFailure("MEDIA_STAGING_FAILURE");
      },
      sweepStages() {
        if (!healthy()) return storeFailure("MEDIA_ROOT_FAILURE");
        try {
          for (const name of readdirSync(staging)) if (name.endsWith(".partial") && !removeFile(path.join(staging, name))) return storeFailure("MEDIA_STAGING_FAILURE");
        } catch { return storeFailure("MEDIA_STAGING_FAILURE"); }
        return { ok: true, value: undefined };
      },
      sweepObjects(referenced) {
        if (!healthy()) return storeFailure("MEDIA_ROOT_FAILURE");
        const keep = new Set<string>();
        for (const digest of referenced) if (typeof digest === "string" && /^sha256:[a-f0-9]{64}$/u.test(digest)) keep.add(digest.slice("sha256:".length));
        let removed = 0;
        try {
          for (const name of readdirSync(objects)) {
            if (!/^[a-f0-9]{64}$/u.test(name) || keep.has(name)) continue;
            try { unlinkSync(path.join(objects, name)); removed += 1; } catch { /* 競爭刪除不影響結果 */ }
          }
        } catch { return storeFailure("MEDIA_ROOT_FAILURE"); }
        return { ok: true, value: removed };
      },
    }) };
  } catch { return storeFailure("MEDIA_ROOT_FAILURE"); }
}

function mkdirp(directory: string): string { mkdirSync(directory, { recursive: true, mode: 0o700 }); return directory; }
function stageKey(stageId: string): string { return createHash("sha256").update(stageId).digest("hex"); }
function validStageId(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function validEvidence(value: MediaByteEvidence): boolean { return typeof value?.checksum === "string" && /^sha256:[a-f0-9]{64}$/u.test(value.checksum) && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0; }
function errorCode(error: unknown): string { return error !== null && typeof error === "object" && "code" in error ? String(error.code) : ""; }
function ownedRegularFile(stat: { isFile(): boolean; isSymbolicLink(): boolean; uid: number; size: number; nlink: number }): boolean { return stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid?.(); }
// group/other 可寫或非本使用者擁有的目錄會讓 content-addressed object 被他人替換，因此每次存取都重新確認。
function directoryIdentity(directory: string): DirectoryIdentity | undefined { try { const stat = lstatSync(directory); return stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0 && realpathSync(directory) === directory ? { dev: stat.dev, ino: stat.ino } : undefined; } catch { return undefined; } }
function sameDirectory(directory: string, expected: DirectoryIdentity): boolean { const current = directoryIdentity(directory); return current !== undefined && current.dev === expected.dev && current.ino === expected.ino; }
/** 只做雜湊驗證，不配置等同檔案大小的 buffer。 */
function hashMatches(file: string, evidence: MediaByteEvidence): boolean {
  try {
    const before = lstatSync(file);
    if (!ownedRegularFile(before) || before.size !== evidence.byteLength) return false;
    const handle = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const hash = createHash("sha256");
      const buffer = Buffer.allocUnsafe(256 * 1024);
      let offset = 0;
      for (;;) {
        const count = readSync(handle, buffer, 0, buffer.length, offset);
        if (count === 0) break;
        hash.update(buffer.subarray(0, count));
        offset += count;
      }
      const after = lstatSync(file);
      return after.dev === before.dev && after.ino === before.ino && after.size === before.size && `sha256:${hash.digest("hex")}` === evidence.checksum;
    } finally { closeSync(handle); }
  } catch { return false; }
}
function readVerifiedBytes(file: string, evidence: MediaByteEvidence): Uint8Array | undefined {
  try {
    const before = lstatSync(file);
    if (!ownedRegularFile(before) || before.size !== evidence.byteLength) return undefined;
    const handle = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const bytes = new Uint8Array(evidence.byteLength);
      let read = 0;
      while (read < bytes.byteLength) {
        const count = readSync(handle, bytes, read, bytes.byteLength - read, read);
        if (count <= 0) return undefined;
        read += count;
      }
      const after = lstatSync(file);
      if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) return undefined;
      const hash = createHash("sha256").update(bytes).digest("hex");
      return `sha256:${hash}` === evidence.checksum ? bytes : undefined;
    } finally { closeSync(handle); }
  } catch { return undefined; }
}
/** ENOENT 代表清理已完成；其他 unlink fault 必須被回報而不是吞掉。 */
function removeFile(file: string): boolean {
  try { unlinkSync(file); return true; } catch (error) { return errorCode(error) === "ENOENT"; }
}
