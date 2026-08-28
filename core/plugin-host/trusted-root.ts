import { realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { compareCodeUnits } from "./ordering.js";

export type TrustedRootIdentity = Readonly<{ path: string; dev: number; ino: number; uid: number; mode: number }>;
export type TrustedRoots = Readonly<{ repositoryRoot: string; installedPluginsRoot: string; installedIdentity: TrustedRootIdentity }>;
export function isInside(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }

async function absoluteDirectory(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  try { const resolved = await realpath(value); return (await stat(resolved)).isDirectory() ? resolved : null; } catch { return null; }
}
async function installedIdentity(value: string): Promise<TrustedRootIdentity | null> {
  try {
    const metadata = await stat(value);
    const processUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!metadata.isDirectory() || processUid === undefined || (metadata.uid !== processUid && metadata.uid !== 0) || (metadata.mode & 0o022) !== 0) return null;
    return Object.freeze({ path: value, dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode });
  } catch { return null; }
}
export async function validateTrustedRoots(input: Readonly<{ repositoryRoot: unknown; installedPluginsRoot: unknown }>): Promise<TrustedRoots | null> {
  const repositoryRoot = await absoluteDirectory(input.repositoryRoot); const installedPluginsRoot = await absoluteDirectory(input.installedPluginsRoot);
  if (repositoryRoot === null || installedPluginsRoot === null || repositoryRoot === installedPluginsRoot || isInside(repositoryRoot, installedPluginsRoot) || isInside(installedPluginsRoot, repositoryRoot)) return null;
  const identity = await installedIdentity(installedPluginsRoot); return identity === null ? null : Object.freeze({ repositoryRoot, installedPluginsRoot, installedIdentity: identity });
}
export async function revalidateTrustedRoots(root: TrustedRoots): Promise<boolean> {
  try {
    if (await realpath(root.installedPluginsRoot) !== root.installedPluginsRoot) return false;
    const identity = await installedIdentity(root.installedPluginsRoot);
    return identity !== null && identity.dev === root.installedIdentity.dev && identity.ino === root.installedIdentity.ino && identity.uid === root.installedIdentity.uid && identity.mode === root.installedIdentity.mode;
  } catch { return false; }
}
export function isSafeRelativeFile(value: unknown): value is string { return typeof value === "string" && value.length > 0 && !value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."); }
export async function installedPluginDirectories(root: TrustedRoots): Promise<readonly string[]> { const entries = await readdir(root.installedPluginsRoot, { withFileTypes: true }); return Object.freeze(entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name).sort(compareCodeUnits)); }
export async function resolvePluginDirectory(root: TrustedRoots, pluginId: string): Promise<string | null> { if (pluginId.length === 0 || pluginId.includes("/") || pluginId.includes("\\") || pluginId.includes("\0")) return null; try { const resolved = await realpath(path.join(root.installedPluginsRoot, pluginId)); return isInside(root.installedPluginsRoot, resolved) && (await stat(resolved)).isDirectory() ? resolved : null; } catch { return null; } }
export async function resolvePluginFile(pluginDirectory: string, file: string): Promise<string | null> { if (!isSafeRelativeFile(file)) return null; try { const resolved = await realpath(path.join(pluginDirectory, file)); return isInside(pluginDirectory, resolved) && (await stat(resolved)).isFile() ? resolved : null; } catch { return null; } }
