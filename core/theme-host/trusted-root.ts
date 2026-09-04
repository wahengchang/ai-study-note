import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, realpath, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";

import { compareCodeUnits } from "./ordering.js";

export type TrustedIdentity = Readonly<{ path: string; dev: number; ino: number; uid: number; mode: number }>;
export type TrustedRoots = Readonly<{ repositoryRoot: string; installedThemesRoot: string; installedIdentity: TrustedIdentity }>;
export type TrustedRead = Readonly<{ ok: true; bytes: Uint8Array }> | Readonly<{ ok: false; reason: "missing" | "unsafe" | "too-large" }>;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sameIdentity(left: TrustedIdentity, right: TrustedIdentity): boolean {
  return left.path === right.path && left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.mode === right.mode;
}

export function isSafeOwnedMetadata(metadata: Pick<Stats, "isDirectory" | "isFile" | "dev" | "ino" | "uid" | "mode">, kind: "directory" | "file"): boolean {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid !== undefined && metadata.uid === uid && (metadata.mode & 0o022) === 0 && (kind === "directory" ? metadata.isDirectory() : metadata.isFile());
}

async function directoryIdentity(value: string): Promise<TrustedIdentity | null> {
  try {
    const metadata = await stat(value);
    return isSafeOwnedMetadata(metadata, "directory")
      ? Object.freeze({ path: value, dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode })
      : null;
  } catch {
    return null;
  }
}

async function absoluteDirectory(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  try {
    const resolved = await realpath(value);
    return (await stat(resolved)).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

export async function validateTrustedRoots(input: Readonly<{ repositoryRoot: unknown; installedThemesRoot: unknown }>): Promise<TrustedRoots | null> {
  const repositoryRoot = await absoluteDirectory(input.repositoryRoot);
  const installedThemesRoot = await absoluteDirectory(input.installedThemesRoot);
  if (repositoryRoot === null || installedThemesRoot === null || isInside(repositoryRoot, installedThemesRoot) || isInside(installedThemesRoot, repositoryRoot)) return null;
  const installedIdentity = await directoryIdentity(installedThemesRoot);
  return installedIdentity === null ? null : Object.freeze({ repositoryRoot, installedThemesRoot, installedIdentity });
}

export async function revalidateTrustedRoots(roots: TrustedRoots): Promise<boolean> {
  try {
    if (await realpath(roots.installedThemesRoot) !== roots.installedThemesRoot) return false;
    const identity = await directoryIdentity(roots.installedThemesRoot);
    return identity !== null && sameIdentity(identity, roots.installedIdentity);
  } catch {
    return false;
  }
}

export function isSafeRelativeFile(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export async function installedThemeSlots(roots: TrustedRoots): Promise<readonly string[]> {
  const entries = await readdir(roots.installedThemesRoot, { withFileTypes: true });
  return Object.freeze(entries.map((entry) => entry.name).sort(compareCodeUnits));
}

async function packageSlot(roots: TrustedRoots, slot: string): Promise<TrustedIdentity | null> {
  if (slot.length === 0 || slot.includes("/") || slot.includes("\\") || slot.includes("\0")) return null;
  const candidate = path.join(roots.installedThemesRoot, slot);
  try {
    const linked = await lstat(candidate);
    if (linked.isSymbolicLink()) return null;
    const resolved = await realpath(candidate);
    if (resolved !== candidate || !isInside(roots.installedThemesRoot, resolved)) return null;
    return await directoryIdentity(candidate);
  } catch {
    return null;
  }
}

export async function validateThemeSlot(roots: TrustedRoots, slot: string): Promise<TrustedIdentity | null> {
  const identity = await packageSlot(roots, slot);
  return identity;
}

async function safeFilePath(directory: string, file: string): Promise<string | null> {
  if (!isSafeRelativeFile(file)) return null;
  let current = directory;
  for (const segment of file.split("/")) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) return null;
    } catch {
      return null;
    }
  }
  try {
    const resolved = await realpath(current);
    return resolved === current && isInside(directory, resolved) ? current : null;
  } catch {
    return null;
  }
}

async function readBounded(handle: FileHandle, maximum: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = new Uint8Array(Math.min(65_536, maximum - size + 1));
    const { bytesRead } = await handle.read(chunk);
    if (bytesRead === 0) break;
    if (size + bytesRead > maximum) return null;
    chunks.push(chunk.subarray(0, bytesRead));
    size += bytesRead;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readTrustedThemeFile(roots: TrustedRoots, slot: string, slotIdentity: TrustedIdentity, file: string, maximumBytes: number): Promise<TrustedRead> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) return Object.freeze({ ok: false, reason: "too-large" });
  const directory = path.join(roots.installedThemesRoot, slot);
  const candidate = await safeFilePath(directory, file);
  if (candidate === null) return Object.freeze({ ok: false, reason: "unsafe" });
  let before: Stats;
  try {
    before = await lstat(candidate);
    if (before.isSymbolicLink() || !isSafeOwnedMetadata(before, "file")) return Object.freeze({ ok: false, reason: "unsafe" });
  } catch {
    return Object.freeze({ ok: false, reason: "missing" });
  }
  try {
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!isSafeOwnedMetadata(opened, "file") || opened.dev !== before.dev || opened.ino !== before.ino) return Object.freeze({ ok: false, reason: "unsafe" });
      const pathname = await stat(candidate);
      if (pathname.dev !== opened.dev || pathname.ino !== opened.ino) return Object.freeze({ ok: false, reason: "unsafe" });
      if (opened.size > maximumBytes) return Object.freeze({ ok: false, reason: "too-large" });
      const bytes = await readBounded(handle, maximumBytes);
      if (bytes === null) return Object.freeze({ ok: false, reason: "too-large" });
      const after = await handle.stat();
      const slotAfter = await packageSlot(roots, slot);
      if (!isSafeOwnedMetadata(after, "file") || after.dev !== opened.dev || after.ino !== opened.ino || slotAfter === null || !sameIdentity(slotIdentity, slotAfter)) return Object.freeze({ ok: false, reason: "unsafe" });
      return Object.freeze({ ok: true, bytes });
    } finally {
      await handle.close();
    }
  } catch {
    return Object.freeze({ ok: false, reason: "missing" });
  }
}
