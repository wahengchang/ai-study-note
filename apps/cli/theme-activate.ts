import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { openPersistence } from "../../core/persistence/index.js";
import { createThemeHost, type ThemeActivationStatePort } from "../../core/theme-host/index.js";

import type { CliIo } from "./db-migrate.js";

type ThemeActivateArguments = Readonly<{ databasePath: string; installedThemesRoot: string; id: string }>;

function parseThemeActivateArguments(argv: readonly string[]): ThemeActivateArguments | undefined {
  const names = argv.filter((value) => value.startsWith("--")).map((value) => value.slice(2).split("=", 1)[0] ?? "");
  if (new Set(names).size !== names.length) return undefined;
  try {
    const values = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: { database: { type: "string" }, "installed-themes-root": { type: "string" }, id: { type: "string" } },
    }).values;
    const databasePath = values.database;
    const installedThemesRoot = values["installed-themes-root"];
    const id = values.id;
    return typeof databasePath === "string" && typeof installedThemesRoot === "string" && typeof id === "string"
      && path.isAbsolute(databasePath) && path.isAbsolute(installedThemesRoot) && id.length > 0
      ? { databasePath, installedThemesRoot, id }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function runThemeActivate(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseThemeActivateArguments(argv);
  if (parsed === undefined) {
    io.stderr("THEME_ACTIVATE_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }
  const persistence = openPersistence({ databasePath: parsed.databasePath });
  if (!persistence.ok) {
    io.stderr(`THEME_ACTIVATE_FAILED code=${persistence.error.code}\n`);
    return 1;
  }
  try {
    const activationState: ThemeActivationStatePort = {
      async read() {
        const state = persistence.value.readThemeActivationState();
        if (!state.ok) throw new Error(state.error.code);
        return state.value;
      },
      async compareAndReplace(input) {
        const result = persistence.value.compareAndReplaceThemeActivationState(input);
        if (!result.ok) throw new Error(result.error.code);
        return result.value;
      },
    };
    const created = await createThemeHost({ repositoryRoot: path.resolve(import.meta.dirname, "../.."), installedThemesRoot: parsed.installedThemesRoot, activationState });
    if (!created.ok) {
      io.stderr(`THEME_ACTIVATE_FAILED code=${created.error.code}\n`);
      return 1;
    }
    const discovered = await created.value.discover();
    if (!discovered.ok) {
      io.stderr(`THEME_ACTIVATE_FAILED code=${discovered.error.code}\n`);
      return 1;
    }
    const candidates = discovered.value.candidates.filter((candidate) => candidate.id === parsed.id);
    if (candidates.length === 0) {
      io.stderr("THEME_ACTIVATE_FAILED code=THEME_NOT_FOUND\n");
      return 1;
    }
    if (candidates.length !== 1) {
      io.stderr("THEME_ACTIVATE_FAILED code=THEME_AMBIGUOUS\n");
      return 1;
    }
    const snapshot = await created.value.getActivationSnapshot();
    if (!snapshot.ok) {
      io.stderr(`THEME_ACTIVATE_FAILED code=${snapshot.error.code}\n`);
      return 1;
    }
    const activated = await created.value.activate({ identity: candidates[0]!, expectedActivationStateDigest: snapshot.value.stateDigest });
    if (!activated.ok) {
      io.stderr(`THEME_ACTIVATE_FAILED code=${activated.error.code}\n`);
      return 1;
    }
    io.stdout(`THEME_ACTIVATE_OK id=${candidates[0]!.id} version=${candidates[0]!.version} manifest=${candidates[0]!.manifestHash}\n`);
    return 0;
  } finally {
    persistence.value.close();
  }
}

export async function themeActivateMain(): Promise<void> {
  process.exitCode = await runThemeActivate(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void themeActivateMain();
