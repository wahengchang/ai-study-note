import { spawnSync } from "node:child_process";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createLocalAuthoringCredentialAuthority } from "./credential-store.js";
import { runCmsServe, type CmsServeCliIo } from "./cms-serve-cli.js";

export type CmsLocalCliIo = CmsServeCliIo;
export type CmsLocalCliEnvironment = Readonly<{ homeDirectory: string; xdgConfigHome?: string }>;

type CmsLocalRuntime = Readonly<{
  root: string;
  databasePath: string;
  mediaRoot: string;
  pluginsRoot: string;
  themesRoot: string;
  cmsAssetsRoot: string;
}>;

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function runtimeOf(environment: CmsLocalCliEnvironment): Promise<CmsLocalRuntime | undefined> {
  if (!path.isAbsolute(environment.homeDirectory)) return undefined;
  try {
    const [homeDirectory, effectiveRepositoryRoot] = await Promise.all([realpath(environment.homeDirectory), realpath(repositoryRoot)]);
    const root = path.join(homeDirectory, ".local", "share", "ai-study-note-reset", "cms");
    const relative = path.relative(effectiveRepositoryRoot, root);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) return undefined;
    return {
      root,
      databasePath: path.join(root, "cms.sqlite"),
      mediaRoot: path.join(root, "media"),
      pluginsRoot: path.join(root, "plugins"),
      themesRoot: path.join(root, "themes"),
      cmsAssetsRoot: path.join(repositoryRoot, "dist", "cms"),
    };
  } catch {
    return undefined;
  }
}

function failure(io: CmsLocalCliIo, command: "CMS_INIT" | "CMS_START", code: string): number {
  io.stderr(`${command}_FAILED code=${code}\n`);
  return 1;
}

function invokeCli(script: string, argv: readonly string[], io: CmsLocalCliIo): number {
  const completed = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", script, ...argv], { cwd: repositoryRoot, encoding: "utf8" });
  if (completed.error !== undefined) {
    io.stderr("CMS_INIT_FAILED code=CLI_EXECUTION_FAILED\n");
    return 1;
  }
  if (completed.stdout !== undefined && completed.stdout.length > 0) io.stdout(completed.stdout);
  if (completed.stderr !== undefined && completed.stderr.length > 0) io.stderr(completed.stderr);
  return completed.status ?? 1;
}

async function provisionCredential(environment: CmsLocalCliEnvironment): Promise<string | undefined> {
  const authority = createLocalAuthoringCredentialAuthority({ homeDirectory: environment.homeDirectory, ...(environment.xdgConfigHome === undefined ? {} : { xdgConfigHome: environment.xdgConfigHome }) });
  const current = await authority.openAdmission();
  if (current.ok) {
    current.value.dispose();
    return undefined;
  }
  if (current.error.code !== "CREDENTIAL_NOT_PROVISIONED" && current.error.code !== "CREDENTIAL_REVOKED") return current.error.code;
  const provisioned = await authority.transition(current.error.code === "CREDENTIAL_REVOKED" ? "reprovision" : "provision");
  return provisioned.ok ? undefined : provisioned.error.code;
}

async function privateDirectory(directory: string): Promise<boolean> {
  try {
    await mkdir(directory, { recursive: false, mode: 0o700 });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") return false;
  }
  try {
    const metadata = await lstat(directory);
    return metadata.isDirectory() && !metadata.isSymbolicLink() && metadata.uid === process.getuid?.() && (metadata.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

async function privateDatabase(databasePath: string, required: boolean): Promise<boolean> {
  try {
    const metadata = await lstat(databasePath);
    return metadata.isFile() && !metadata.isSymbolicLink() && metadata.uid === process.getuid?.() && (metadata.mode & 0o022) === 0;
  } catch (error: unknown) {
    return !required && error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}

async function initialize(runtime: CmsLocalRuntime, environment: CmsLocalCliEnvironment, io: CmsLocalCliIo): Promise<number> {
  const projectRoot = path.dirname(runtime.root);
  const shareRoot = path.dirname(projectRoot);
  const localRoot = path.dirname(shareRoot);
  const directories = [
    localRoot,
    shareRoot,
    projectRoot,
    runtime.root,
    runtime.mediaRoot,
    runtime.pluginsRoot,
    runtime.themesRoot,
  ];
  for (const directory of directories) if (!(await privateDirectory(path.resolve(directory)))) return failure(io, "CMS_INIT", "RUNTIME_DIRECTORY_UNAVAILABLE");
  if (!(await privateDatabase(runtime.databasePath, false))) return failure(io, "CMS_INIT", "RUNTIME_DIRECTORY_UNAVAILABLE");
  if (invokeCli("apps/cli/db-migrate.ts", ["--database", runtime.databasePath], io) !== 0) return 1;
  if (!(await privateDatabase(runtime.databasePath, true))) return failure(io, "CMS_INIT", "RUNTIME_DIRECTORY_UNAVAILABLE");
  if (invokeCli("apps/cli/plugin-package.ts", ["--id", "seo-basics", "--installed-plugins-root", runtime.pluginsRoot], io) !== 0) return 1;
  if (invokeCli("apps/cli/theme-package.ts", ["--id", "study-notes", "--installed-themes-root", runtime.themesRoot], io) !== 0) return 1;
  if (invokeCli("apps/cli/theme-activate.ts", ["--database", runtime.databasePath, "--installed-themes-root", runtime.themesRoot, "--id", "study-notes"], io) !== 0) return 1;
  const credentialError = await provisionCredential(environment);
  if (credentialError !== undefined) return failure(io, "CMS_INIT", credentialError);
  io.stdout(`CMS_INIT_OK runtime=${runtime.root}\n`);
  return 0;
}

async function start(runtime: CmsLocalRuntime, environment: CmsLocalCliEnvironment, io: CmsLocalCliIo): Promise<number> {
  return runCmsServe([
    "--database", runtime.databasePath,
    "--media-root", runtime.mediaRoot,
    "--installed-plugins-root", runtime.pluginsRoot,
    "--installed-themes-root", runtime.themesRoot,
    "--cms-assets-root", runtime.cmsAssetsRoot,
  ], { HOME: environment.homeDirectory, ...(environment.xdgConfigHome === undefined ? {} : { XDG_CONFIG_HOME: environment.xdgConfigHome }) }, io);
}

export async function runCmsLocalCli(argv: readonly string[], environment: CmsLocalCliEnvironment, io: CmsLocalCliIo): Promise<number> {
  if (argv.length !== 1 || (argv[0] !== "init" && argv[0] !== "start")) {
    io.stderr("CMS_LOCAL_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }
  const runtime = await runtimeOf(environment);
  if (runtime === undefined) return failure(io, argv[0] === "init" ? "CMS_INIT" : "CMS_START", "INVALID_HOME");
  return argv[0] === "init" ? initialize(runtime, environment, io) : start(runtime, environment, io);
}

async function main(): Promise<void> {
  process.exitCode = await runCmsLocalCli(process.argv.slice(2), { homeDirectory: process.env.HOME ?? "", ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: process.env.XDG_CONFIG_HOME }) }, {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
