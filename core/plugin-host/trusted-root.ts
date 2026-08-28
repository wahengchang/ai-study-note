import { realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { compareCodeUnits } from "./ordering.js";

export type TrustedRoots = Readonly<{
  repositoryRoot: string;
  installedPluginsRoot: string;
}>;

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

export async function validateTrustedRoots(input: Readonly<{ repositoryRoot: unknown; installedPluginsRoot: unknown }>): Promise<TrustedRoots | null> {
  const repositoryRoot = await absoluteDirectory(input.repositoryRoot);
  const installedPluginsRoot = await absoluteDirectory(input.installedPluginsRoot);
  if (repositoryRoot === null || installedPluginsRoot === null) return null;
  if (repositoryRoot === installedPluginsRoot || isInside(repositoryRoot, installedPluginsRoot)) return null;
  return Object.freeze({ repositoryRoot, installedPluginsRoot });
}

export function isSafeRelativeFile(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export async function installedPluginDirectories(root: TrustedRoots): Promise<readonly string[]> {
  const entries = await readdir(root.installedPluginsRoot, { withFileTypes: true });
  // 存在但逃逸、損壞或不可用的目錄一律保留。containment 由 `resolvePluginDirectory` 在
  // 讀取 manifest 前強制，discovery 才能為它們回傳固定 rejection 而非靜默省略。
  const directories = entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name);
  return Object.freeze(directories.sort(compareCodeUnits));
}

export async function resolvePluginDirectory(root: TrustedRoots, pluginId: string): Promise<string | null> {
  if (pluginId.length === 0 || pluginId.includes("/") || pluginId.includes("\\") || pluginId.includes("\0")) return null;
  try {
    const resolved = await realpath(path.join(root.installedPluginsRoot, pluginId));
    return isInside(root.installedPluginsRoot, resolved) && (await stat(resolved)).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

export async function resolvePluginFile(pluginDirectory: string, file: string): Promise<string | null> {
  if (!isSafeRelativeFile(file)) return null;
  try {
    const resolved = await realpath(path.join(pluginDirectory, file));
    return isInside(pluginDirectory, resolved) && (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}
