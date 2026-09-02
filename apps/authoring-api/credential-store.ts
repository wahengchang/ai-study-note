import { constants as fsConstants } from "node:fs";
import { chmod, link, lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { createHmac, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import { join, isAbsolute } from "node:path";

import type { MessageRemediation } from "../../core/foundation/index.js";

const CONTRACT = "local-authoring-credential/v1";
const ORIGIN = "http://127.0.0.1:43127";
const MAX_RECORD_BYTES = 4_096;
const KEY_PATTERN = /^asn_v1_[A-Za-z0-9_-]{43}$/u;

export type CredentialAction = "provision" | "rotate" | "revoke" | "reprovision";
export type CredentialSummary = Readonly<{ generation: number; status: "active" | "revoked" }>;
export type AuthoringCredentialFailureCode =
  | "INVALID_CREDENTIAL_LOCATION"
  | "CREDENTIAL_NOT_PROVISIONED"
  | "CREDENTIAL_REVOKED"
  | "CREDENTIAL_STORE_UNSAFE"
  | "CREDENTIAL_STORE_CORRUPT"
  | "CREDENTIAL_STORE_BUSY"
  | "CREDENTIAL_STORE_CONFLICT"
  | "CREDENTIAL_STORE_FAILURE"
  | "INVALID_CREDENTIAL_TRANSITION";
export type AuthoringCredentialResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: AuthoringCredentialFailureCode; owner: "AuthoringCredential"; subjectIds: readonly string[]; remediation: MessageRemediation }> }>;
export interface CredentialAdmission {
  readonly generation: number;
  verifyBearer(candidate: string): boolean;
  createServerProof(nonce: string): string;
  dispose(): void;
}
export interface AuthoringCredentialAuthority {
  openAdmission(): Promise<AuthoringCredentialResult<CredentialAdmission>>;
  transition(action: CredentialAction): Promise<AuthoringCredentialResult<CredentialSummary>>;
}
export type LocalAuthoringCredentialInput = Readonly<{ homeDirectory: string; xdgConfigHome?: string }>;

type ActiveRecord = Readonly<{ contract: typeof CONTRACT; origin: typeof ORIGIN; generation: number; status: "active"; apiKey: string }>;
type RevokedRecord = Readonly<{ contract: typeof CONTRACT; origin: typeof ORIGIN; generation: number; status: "revoked" }>;
type CredentialRecord = ActiveRecord | RevokedRecord;
type FileIdentity = Readonly<{ dev: number; ino: number; uid: number; mode: number; nlink: number; size: number }>;
type RecordSnapshot = Readonly<{ record: CredentialRecord; identity: FileIdentity; canonical: string }>;
type LockRecord = Readonly<{ pid: number; token: string }>;

export interface CredentialIo {
  mkdir(path: string, options: Readonly<{ recursive: boolean; mode: number }>): Promise<void>;
  lstat(path: string): Promise<Readonly<{ isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean; dev: number; ino: number; uid: number; mode: number; nlink: number; size: number }>>;
  realpath(path: string): Promise<string>;
  open(path: string, flags: number, mode?: number): Promise<Readonly<{ stat(): Promise<Readonly<{ isFile(): boolean; dev: number; ino: number; uid: number; mode: number; nlink: number; size: number }>>; read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<Readonly<{ bytesRead: number }>>; write(buffer: Uint8Array): Promise<unknown>; sync(): Promise<void>; close(): Promise<void> }>>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  isProcessAlive(pid: number): boolean;
}

const remediation = (code: AuthoringCredentialFailureCode): MessageRemediation => ({ kind: "message", message: ({
  INVALID_CREDENTIAL_LOCATION: "請提供 absolute XDG config home 與 home directory。",
  CREDENTIAL_NOT_PROVISIONED: "請先執行 cms:credential provision。",
  CREDENTIAL_REVOKED: "請執行 cms:credential reprovision。",
  CREDENTIAL_STORE_UNSAFE: "請修復 credential directory/file ownership、mode 與 link。",
  CREDENTIAL_STORE_CORRUPT: "請修復 local-authoring-v1 credential record。",
  CREDENTIAL_STORE_BUSY: "Credential transition 正由其他 process 執行，請稍後重試。",
  CREDENTIAL_STORE_CONFLICT: "Credential state 已變更，請重新讀取後重試。",
  CREDENTIAL_STORE_FAILURE: "Credential store 操作未完成，請檢查本機 filesystem。",
  INVALID_CREDENTIAL_TRANSITION: "目前 credential state 不允許此 transition。",
} satisfies Record<AuthoringCredentialFailureCode, string>)[code] });

function failure<T>(code: AuthoringCredentialFailureCode, subjectIds: readonly string[] = []): AuthoringCredentialResult<T> {
  return { ok: false, error: { code, owner: "AuthoringCredential", subjectIds, remediation: remediation(code) } };
}

function identity(stat: Readonly<{ dev: number; ino: number; uid: number; mode: number; nlink: number; size: number }>): FileIdentity {
  return { dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode & 0o777, nlink: stat.nlink, size: stat.size };
}
function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.mode === right.mode && left.nlink === right.nlink && left.size === right.size;
}
function isNotFound(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT"; }
function isExists(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EEXIST"; }
function encode(value: string): Uint8Array { return new TextEncoder().encode(value); }
function decode(bytes: Uint8Array): string | undefined { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return undefined; } }
function isPlainObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype; }
function safeGeneration(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function parseRecord(text: string): CredentialRecord | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return undefined; }
  if (!isPlainObject(parsed) || parsed.contract !== CONTRACT || parsed.origin !== ORIGIN || !safeGeneration(parsed.generation)) return undefined;
  const keys = Object.keys(parsed).sort();
  if (parsed.status === "active" && keys.join(",") === "apiKey,contract,generation,origin,status" && typeof parsed.apiKey === "string" && KEY_PATTERN.test(parsed.apiKey)) {
    return { contract: CONTRACT, origin: ORIGIN, generation: parsed.generation, status: "active", apiKey: parsed.apiKey };
  }
  if (parsed.status === "revoked" && keys.join(",") === "contract,generation,origin,status") return { contract: CONTRACT, origin: ORIGIN, generation: parsed.generation, status: "revoked" };
  return undefined;
}
function canonicalRecord(record: CredentialRecord): string {
  return record.status === "active"
    ? JSON.stringify({ contract: CONTRACT, origin: ORIGIN, generation: record.generation, status: "active", apiKey: record.apiKey })
    : JSON.stringify({ contract: CONTRACT, origin: ORIGIN, generation: record.generation, status: "revoked" });
}

function nodeIo(): CredentialIo {
  return {
    mkdir: async (path, options) => { await mkdir(path, options); },
    lstat,
    realpath,
    open: async (path, flags, mode) => open(path, flags, mode),
    link,
    rename,
    unlink,
    chmod,
    isProcessAlive: (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return !(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ESRCH"); } },
  };
}

export function createLocalAuthoringCredentialAuthority(input: LocalAuthoringCredentialInput): AuthoringCredentialAuthority {
  return createLocalAuthoringCredentialAuthorityWithIo(input, nodeIo(), (size) => nodeRandomBytes(size), process.getuid?.() ?? -1);
}

export function createLocalAuthoringCredentialAuthorityWithIo(input: LocalAuthoringCredentialInput, io: CredentialIo, randomBytes: (size: number) => Uint8Array, currentUid: number): AuthoringCredentialAuthority {
  const configHome = input.xdgConfigHome ?? join(input.homeDirectory, ".config");
  const validLocation = isAbsolute(input.homeDirectory) && isAbsolute(configHome);
  const directory = join(configHome, "ai-study-note");
  const target = join(directory, "local-authoring-v1.json");
  const fixedLock = join(directory, ".local-authoring-v1.lock");

  async function verifyDirectory(create: boolean): Promise<AuthoringCredentialFailureCode | undefined> {
    if (!validLocation) return "INVALID_CREDENTIAL_LOCATION";
    if (create) { try { await io.mkdir(directory, { recursive: true, mode: 0o700 }); await io.chmod(directory, 0o700); } catch { return "CREDENTIAL_STORE_FAILURE"; } }
    let stat: Awaited<ReturnType<CredentialIo["lstat"]>>;
    try { stat = await io.lstat(directory); } catch (error) { return isNotFound(error) ? "CREDENTIAL_NOT_PROVISIONED" : "CREDENTIAL_STORE_FAILURE"; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== currentUid || (stat.mode & 0o777) !== 0o700) return "CREDENTIAL_STORE_UNSAFE";
    try { await io.realpath(directory); } catch { return "CREDENTIAL_STORE_UNSAFE"; }
    return undefined;
  }

  async function readRecord(): Promise<AuthoringCredentialResult<RecordSnapshot | undefined>> {
    const directoryError = await verifyDirectory(false);
    if (directoryError !== undefined) return directoryError === "CREDENTIAL_NOT_PROVISIONED" ? { ok: true, value: undefined } : failure(directoryError);
    let handle: Awaited<ReturnType<CredentialIo["open"]>> | undefined;
    try {
      const beforeLink = await io.lstat(target);
      if (!beforeLink.isFile() || beforeLink.isSymbolicLink()) return failure("CREDENTIAL_STORE_UNSAFE");
      handle = await io.open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const before = identity(await handle.stat());
      if (before.uid !== currentUid || before.mode !== 0o600 || before.nlink !== 1 || before.size > MAX_RECORD_BYTES) return failure("CREDENTIAL_STORE_UNSAFE");
      const bytes = new Uint8Array(MAX_RECORD_BYTES + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      const after = identity(await handle.stat());
      if (!sameIdentity(before, after) || bytesRead > MAX_RECORD_BYTES) return failure("CREDENTIAL_STORE_UNSAFE");
      const text = decode(bytes.subarray(0, bytesRead));
      const record = text === undefined ? undefined : parseRecord(text);
      if (record === undefined) return failure("CREDENTIAL_STORE_CORRUPT");
      return { ok: true, value: { record, identity: before, canonical: canonicalRecord(record) } };
    } catch (error) {
      if (isNotFound(error)) return { ok: true, value: undefined };
      return failure("CREDENTIAL_STORE_UNSAFE");
    } finally { if (handle !== undefined) await handle.close().catch(() => undefined); }
  }

  async function writeFile(path: string, bytes: Uint8Array): Promise<AuthoringCredentialFailureCode | undefined> {
    let handle: Awaited<ReturnType<CredentialIo["open"]>> | undefined;
    try { handle = await io.open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600); await handle.write(bytes); await handle.sync(); return undefined; } catch { return "CREDENTIAL_STORE_FAILURE"; } finally { if (handle !== undefined) await handle.close().catch(() => undefined); }
  }
  async function removeVerified(path: string, expected: Readonly<{ dev: number; ino: number }>, token?: string): Promise<void> {
    try {
      const stat = await io.lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) return;
      if (token !== undefined) {
        const opened = await readText(path);
        if (opened === undefined || parseLock(opened) === undefined || parseLock(opened)?.token !== token) return;
      }
      await io.unlink(path);
    } catch { /* 安全清理僅盡力而為 */ }
  }
  async function readText(path: string): Promise<string | undefined> {
    let handle: Awaited<ReturnType<CredentialIo["open"]>> | undefined;
    try { handle = await io.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); const stat = await handle.stat(); if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) return undefined; const bytes = new Uint8Array(stat.size + 1); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0); return bytesRead > stat.size ? undefined : decode(bytes.subarray(0, bytesRead)); } catch { return undefined; } finally { if (handle !== undefined) await handle.close().catch(() => undefined); }
  }
  function parseLock(text: string): LockRecord | undefined {
    let value: unknown; try { value = JSON.parse(text); } catch { return undefined; }
    if (!isPlainObject(value) || Object.keys(value).sort().join(",") !== "pid,token" || !safeGeneration(value.pid) || typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value.token)) return undefined;
    return { pid: value.pid, token: value.token };
  }
  async function releaseLock(expected: Readonly<{ dev: number; ino: number }>, token: string): Promise<void> { await removeVerified(fixedLock, expected, token); }
  async function acquireLock(): Promise<AuthoringCredentialResult<Readonly<{ identity: Readonly<{ dev: number; ino: number }>; token: string }>>> {
    const directoryError = await verifyDirectory(true);
    if (directoryError !== undefined) return failure(directoryError);
    const token = Buffer.from(randomBytes(32)).toString("base64url");
    const prep = join(directory, `.local-authoring-v1.prep-${process.pid}-${token}`);
    const writeError = await writeFile(prep, encode(JSON.stringify({ pid: process.pid, token })));
    if (writeError !== undefined) return failure(writeError);
    let prepStat: Awaited<ReturnType<CredentialIo["lstat"]>>;
    try { prepStat = await io.lstat(prep); } catch { return failure("CREDENTIAL_STORE_FAILURE"); }
    try { await io.link(prep, fixedLock); } catch (error) {
      await removeVerified(prep, { dev: prepStat.dev, ino: prepStat.ino });
      if (!isExists(error)) return failure("CREDENTIAL_STORE_FAILURE");
      const existing = await readText(fixedLock);
      const lock = existing === undefined ? undefined : parseLock(existing);
      let existingStat: Awaited<ReturnType<CredentialIo["lstat"]>>;
      try { existingStat = await io.lstat(fixedLock); } catch { return failure("CREDENTIAL_STORE_BUSY"); }
      if (lock === undefined || !existingStat.isFile() || existingStat.isSymbolicLink() || existingStat.uid !== currentUid || (existingStat.mode & 0o777) !== 0o600 || existingStat.nlink !== 1 || io.isProcessAlive(lock.pid)) return failure("CREDENTIAL_STORE_BUSY");
      await removeVerified(fixedLock, { dev: existingStat.dev, ino: existingStat.ino }, lock.token);
      return failure("CREDENTIAL_STORE_BUSY");
    }
    await removeVerified(prep, { dev: prepStat.dev, ino: prepStat.ino });
    try {
      const claimed = await io.lstat(fixedLock);
      const value = await readText(fixedLock);
      if (!claimed.isFile() || claimed.isSymbolicLink() || claimed.uid !== currentUid || (claimed.mode & 0o777) !== 0o600 || claimed.nlink !== 1 || value === undefined || parseLock(value)?.token !== token) return failure("CREDENTIAL_STORE_BUSY");
      return { ok: true, value: { identity: { dev: claimed.dev, ino: claimed.ino }, token } };
    } catch { return failure("CREDENTIAL_STORE_FAILURE"); }
  }

  return {
    async openAdmission() {
      if (!validLocation) return failure("INVALID_CREDENTIAL_LOCATION");
      const read = await readRecord();
      if (!read.ok) return read;
      if (read.value === undefined) return failure("CREDENTIAL_NOT_PROVISIONED");
      if (read.value.record.status === "revoked") return failure("CREDENTIAL_REVOKED", [String(read.value.record.generation), "revoked"]);
      let key: Uint8Array | undefined = encode(read.value.record.apiKey);
      const generation = read.value.record.generation;
      return { ok: true, value: {
        generation,
        verifyBearer(candidate) { if (key === undefined) return false; const actual = encode(candidate); try { return actual.byteLength === key.byteLength && timingSafeEqual(actual, key); } finally { actual.fill(0); } },
        createServerProof(nonce) { if (key === undefined) return ""; const nonceBytes = encode(`authoring-server-proof/v1\0${ORIGIN}\0${generation}\0${nonce}`); try { return createHmac("sha256", key).update(nonceBytes).digest("base64url"); } finally { nonceBytes.fill(0); } },
        dispose() { if (key !== undefined) { key.fill(0); key = undefined; } },
      } };
    },
    async transition(action) {
      if (!validLocation) return failure("INVALID_CREDENTIAL_LOCATION");
      const lock = await acquireLock();
      if (!lock.ok) return lock;
      try {
        const source = await readRecord();
        if (!source.ok) return source;
        const current = source.value?.record;
        const allowed = (action === "provision" && current === undefined) || (action === "rotate" && current?.status === "active") || (action === "revoke" && current?.status === "active") || (action === "reprovision" && current?.status === "revoked");
        if (!allowed) return failure("INVALID_CREDENTIAL_TRANSITION", current === undefined ? [] : [String(current.generation), current.status]);
        const generation = current === undefined ? 1 : current.generation + 1;
        const next: CredentialRecord = action === "revoke" ? { contract: CONTRACT, origin: ORIGIN, generation, status: "revoked" } : { contract: CONTRACT, origin: ORIGIN, generation, status: "active", apiKey: `asn_v1_${Buffer.from(randomBytes(32)).toString("base64url")}` };
        const temp = join(directory, `.local-authoring-v1.tmp-${process.pid}-${Buffer.from(randomBytes(16)).toString("base64url")}`);
        const writeError = await writeFile(temp, encode(canonicalRecord(next)));
        if (writeError !== undefined) return failure(writeError);
        const beforeCommit = await readRecord();
        if (!beforeCommit.ok || (beforeCommit.value === undefined) !== (source.value === undefined) || (beforeCommit.value !== undefined && source.value !== undefined && (beforeCommit.value.identity.dev !== source.value.identity.dev || beforeCommit.value.identity.ino !== source.value.identity.ino || beforeCommit.value.canonical !== source.value.canonical))) { await removeVerified(temp, await tempIdentity(io, temp)); return failure(beforeCommit.ok ? "CREDENTIAL_STORE_CONFLICT" : beforeCommit.error.code); }
        try { await io.rename(temp, target); } catch { await removeVerified(temp, await tempIdentity(io, temp)); return failure("CREDENTIAL_STORE_FAILURE"); }
        const after = await readRecord();
        if (!after.ok || after.value === undefined || after.value.canonical !== canonicalRecord(next)) return failure("CREDENTIAL_STORE_FAILURE");
        return { ok: true, value: { generation, status: next.status } };
      } finally { await releaseLock(lock.value.identity, lock.value.token); }
    },
  };
}

async function tempIdentity(io: CredentialIo, path: string): Promise<Readonly<{ dev: number; ino: number }>> { try { const stat = await io.lstat(path); return { dev: stat.dev, ino: stat.ino }; } catch { return { dev: -1, ino: -1 }; } }
