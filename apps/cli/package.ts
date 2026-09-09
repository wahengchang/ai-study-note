import { parseArgs } from "node:util";

import type { CliIo } from "./db-migrate.js";
import { packageExtension, type PackageKind } from "./package-extension.js";

type PackageArguments = Readonly<{ id: string; installedRoot: string }>;

function parsePackageArguments(argv: readonly string[], option: "installed-plugins-root" | "installed-themes-root"): PackageArguments | undefined {
  const names = argv.filter((value) => value.startsWith("--")).map((value) => value.slice(2).split("=", 1)[0] ?? "");
  if (new Set(names).size !== names.length) return undefined;
  try {
    const parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: { id: { type: "string" }, [option]: { type: "string" } },
    }).values;
    const id = parsed.id;
    const installedRoot = parsed[option];
    return typeof id === "string" && typeof installedRoot === "string" && id.length > 0 && installedRoot.length > 0
      ? { id, installedRoot }
      : undefined;
  } catch {
    return undefined;
  }
}

async function runPackage(kind: PackageKind, argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parsePackageArguments(argv, kind === "plugin" ? "installed-plugins-root" : "installed-themes-root");
  const prefix = kind === "plugin" ? "PLUGIN_PACKAGE" : "THEME_PACKAGE";
  if (parsed === undefined) {
    io.stderr(`${prefix}_FAILED code=INVALID_ARGUMENTS\n`);
    return 2;
  }
  const result = await packageExtension({ kind, id: parsed.id, installedRoot: parsed.installedRoot });
  if (!result.ok) {
    io.stderr(`${prefix}_FAILED code=${result.code}\n`);
    return result.code === "INVALID_ARGUMENTS" ? 2 : 1;
  }
  io.stdout(`${prefix}_OK id=${parsed.id} version=1.0.0 manifest=${result.manifestHash}\n`);
  return 0;
}

export function runPluginPackage(argv: readonly string[], io: CliIo): Promise<number> {
  return runPackage("plugin", argv, io);
}

export function runThemePackage(argv: readonly string[], io: CliIo): Promise<number> {
  return runPackage("theme", argv, io);
}
