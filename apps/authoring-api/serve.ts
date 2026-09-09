import { dirname, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { valid as semverValid } from "semver";

import { isDigest } from "../../core/foundation/index.js";
import type { ThemeIdentity } from "../../core/theme-host/index.js";
import { startCmsRuntime } from "./cms-runtime.js";


type ServeIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
type ServeArguments = Readonly<{ databasePath: string; objectsRoot: string; installedPluginsRoot: string; installedThemesRoot: string; themeIdentity: ThemeIdentity }>;

function invalidArguments(io: ServeIo): number {
  io.stderr("CMS_SERVE_FAILED code=INVALID_ARGUMENTS\n");
  return 2;
}

function parse(argv: readonly string[]): ServeArguments | undefined {
  const names = argv.filter((argument) => argument.startsWith("--")).map((argument) => argument.slice(2).split("=", 1)[0] ?? "");
  if (new Set(names).size !== names.length) return undefined;
  try {
    const values = parseArgs({ args: argv, strict: true, allowPositionals: false, options: { database: { type: "string" }, "objects-root": { type: "string" }, "installed-plugins-root": { type: "string" }, "installed-themes-root": { type: "string" }, "theme-id": { type: "string" }, "theme-version": { type: "string" }, "theme-manifest-hash": { type: "string" } } }).values;
    const databasePath = values.database;
    const objectsRoot = values["objects-root"];
    const installedPluginsRoot = values["installed-plugins-root"];
    const installedThemesRoot = values["installed-themes-root"];
    const id = values["theme-id"];
    const version = values["theme-version"];
    const manifestHash = values["theme-manifest-hash"];
    if (typeof databasePath !== "string" || typeof objectsRoot !== "string" || typeof installedPluginsRoot !== "string" || typeof installedThemesRoot !== "string" || typeof id !== "string" || typeof version !== "string" || typeof manifestHash !== "string" || !isAbsolute(databasePath) || !isAbsolute(objectsRoot) || !isAbsolute(installedPluginsRoot) || !isAbsolute(installedThemesRoot) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || semverValid(version) !== version || !isDigest(manifestHash)) return undefined;
    return { databasePath, objectsRoot, installedPluginsRoot, installedThemesRoot, themeIdentity: { id, version, manifestHash } };
  } catch {
    return undefined;
  }
}

export async function runCmsServe(argv: readonly string[], environment: NodeJS.ProcessEnv, io: ServeIo): Promise<number> {
  const parsed = parse(argv);
  if (parsed === undefined) return invalidArguments(io);
  const homeDirectory = environment.HOME;
  if (homeDirectory === undefined || !isAbsolute(homeDirectory)) {
    io.stderr("CMS_SERVE_FAILED code=CMS_CREDENTIAL_UNAVAILABLE\n");
    return 1;
  }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const runtime = await startCmsRuntime({ repositoryRoot, databasePath: parsed.databasePath, mediaRoot: parsed.objectsRoot, installedPluginsRoot: parsed.installedPluginsRoot, installedThemesRoot: parsed.installedThemesRoot, cmsAssetsRoot: resolve(repositoryRoot, "dist", "cms"), credential: { homeDirectory, ...(environment.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: environment.XDG_CONFIG_HOME }) }, logger: () => undefined });
  if (!runtime.ok) {
    io.stderr(`CMS_SERVE_FAILED code=${runtime.error.code}\n`);
    return 1;
  }
  io.stdout(`CMS_SERVE_OK origin=${runtime.value.origin}\n`);
  await new Promise<void>((resolveClose) => {
    let closing = false;
    const close = (): void => {
      if (closing) return;
      closing = true;
      void runtime.value.close().finally(resolveClose);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
  return 0;
}

export async function cmsServeMain(): Promise<void> {
  process.exitCode = await runCmsServe(process.argv.slice(2), process.env, { stdout: (text) => { process.stdout.write(text); }, stderr: (text) => { process.stderr.write(text); } });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void cmsServeMain();
