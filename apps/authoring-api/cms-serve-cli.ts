import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { startCmsRuntime } from "./cms-runtime.js";

export type CmsServeCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

type CmsServeArguments = Readonly<{ databasePath: string; mediaRoot: string; installedPluginsRoot: string; installedThemesRoot: string; cmsAssetsRoot: string }>;

function parseCmsServeArguments(argv: readonly string[]): CmsServeArguments | undefined {
  const names = argv.filter((value) => value.startsWith("--")).map((value) => value.slice(2).split("=", 1)[0] ?? "");
  if (new Set(names).size !== names.length) return undefined;
  try {
    const values = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        database: { type: "string" },
        "media-root": { type: "string" },
        "installed-plugins-root": { type: "string" },
        "installed-themes-root": { type: "string" },
        "cms-assets-root": { type: "string" },
      },
    }).values;
    const databasePath = values.database;
    const mediaRoot = values["media-root"];
    const installedPluginsRoot = values["installed-plugins-root"];
    const installedThemesRoot = values["installed-themes-root"];
    const cmsAssetsRoot = values["cms-assets-root"];
    return typeof databasePath === "string" && typeof mediaRoot === "string" && typeof installedPluginsRoot === "string" && typeof installedThemesRoot === "string" && typeof cmsAssetsRoot === "string"
      && [databasePath, mediaRoot, installedPluginsRoot, installedThemesRoot, cmsAssetsRoot].every((value) => path.isAbsolute(value))
      ? { databasePath, mediaRoot, installedPluginsRoot, installedThemesRoot, cmsAssetsRoot }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function runCmsServe(argv: readonly string[], environment: NodeJS.ProcessEnv, io: CmsServeCliIo): Promise<number> {
  const parsed = parseCmsServeArguments(argv);
  if (parsed === undefined) {
    io.stderr("CMS_SERVE_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }
  const homeDirectory = environment.HOME;
  if (homeDirectory === undefined || !path.isAbsolute(homeDirectory)) {
    io.stderr("CMS_SERVE_FAILED code=CMS_CREDENTIAL_UNAVAILABLE\n");
    return 1;
  }
  const runtime = await startCmsRuntime({
    repositoryRoot: path.resolve(import.meta.dirname, "../.."),
    databasePath: parsed.databasePath,
    mediaRoot: parsed.mediaRoot,
    installedPluginsRoot: parsed.installedPluginsRoot,
    installedThemesRoot: parsed.installedThemesRoot,
    cmsAssetsRoot: parsed.cmsAssetsRoot,
    credential: { homeDirectory, ...(environment.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: environment.XDG_CONFIG_HOME }) },
    logger: () => undefined,
  });
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
  process.exitCode = await runCmsServe(process.argv.slice(2), process.env, {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void cmsServeMain();
