import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { createPersistencePluginActivationStatePort, createPersistencePluginSettingsStatePort } from "../../core/application/index.js";
import { createPublishedContentReadModel } from "../../core/content/index.js";
import { createPublicDelivery } from "../../core/delivery/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../core/media/index.js";
import { openPersistence, type PersistenceStore } from "../../core/persistence/index.js";
import { createPluginHost } from "../../core/plugin-host/index.js";
import { createProjectionPreview } from "../../core/projection/index.js";
import { createStaticRenderer } from "../../core/renderer/index.js";
import { createSiteDefinition } from "../../core/site-definition/index.js";
import { createThemeHost, type ThemeActivationStatePort } from "../../core/theme-host/index.js";

import type { CliIo } from "./db-migrate.js";

type SiteBuildArguments = Readonly<{ databasePath: string; mediaRoot: string; installedPluginsRoot: string; installedThemesRoot: string; artifactsRoot: string }>;

function parseSiteBuildArguments(argv: readonly string[]): SiteBuildArguments | undefined {
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
        "artifacts-root": { type: "string" },
      },
    }).values;
    const databasePath = values.database;
    const mediaRoot = values["media-root"];
    const installedPluginsRoot = values["installed-plugins-root"];
    const installedThemesRoot = values["installed-themes-root"];
    const artifactsRoot = values["artifacts-root"];
    return typeof databasePath === "string" && typeof mediaRoot === "string" && typeof installedPluginsRoot === "string" && typeof installedThemesRoot === "string" && typeof artifactsRoot === "string"
      && [databasePath, mediaRoot, installedPluginsRoot, installedThemesRoot, artifactsRoot].every((value) => path.isAbsolute(value))
      ? { databasePath, mediaRoot, installedPluginsRoot, installedThemesRoot, artifactsRoot }
      : undefined;
  } catch {
    return undefined;
  }
}


function themeActivationStatePort(persistence: PersistenceStore): ThemeActivationStatePort {
  return {
    async read() {
      const state = persistence.readThemeActivationState();
      if (!state.ok) throw new Error(state.error.code);
      return state.value;
    },
    async compareAndReplace(input) {
      const result = persistence.compareAndReplaceThemeActivationState(input);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    },
  };
}

function failure(io: CliIo, code: string): number {
  io.stderr(`SITE_BUILD_FAILED code=${code}\n`);
  return 1;
}

export async function runSiteBuild(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseSiteBuildArguments(argv);
  if (parsed === undefined) {
    io.stderr("SITE_BUILD_FAILED code=INVALID_ARGUMENTS\n");
    return 2;
  }
  const persistence = openPersistence({ databasePath: parsed.databasePath });
  if (!persistence.ok) return failure(io, persistence.error.code);
  try {
    const objectStore = createLocalMediaObjectStore({ objectsRoot: parsed.mediaRoot });
    if (!objectStore.ok) return failure(io, objectStore.error.code);
    const dataMedia = startDataMedia({ persistence: persistence.value, objectStore: objectStore.value });
    if (!dataMedia.ok) return failure(io, dataMedia.error.code);
    const pluginHost = await createPluginHost({
      repositoryRoot: path.resolve(import.meta.dirname, "../.."),
      installedPluginsRoot: parsed.installedPluginsRoot,
      activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }),
      settingsState: createPersistencePluginSettingsStatePort({ persistence: persistence.value }),
    });
    if (!pluginHost.ok) return failure(io, pluginHost.error.code);
    const themeHost = await createThemeHost({
      repositoryRoot: path.resolve(import.meta.dirname, "../.."),
      installedThemesRoot: parsed.installedThemesRoot,
      activationState: themeActivationStatePort(persistence.value),
    });
    if (!themeHost.ok) return failure(io, themeHost.error.code);
    const contentReadModel = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
    if (!contentReadModel.ok) return failure(io, contentReadModel.error.code);
    const projection = createProjectionPreview({
      persistence: persistence.value,
      siteDefinition: createSiteDefinition({ persistence: persistence.value }),
      dataMedia: dataMedia.value,
      contentReadModel: contentReadModel.value,
      pluginHost: pluginHost.value,
      themeHost: themeHost.value,
    });
    const prepared = await projection.produceRendererInput({});
    if (!prepared.ok) return failure(io, prepared.error.code);
    const rendered = await createStaticRenderer().render(prepared.value.artifact);
    if (!rendered.ok) return failure(io, rendered.error.code);
    const delivery = createPublicDelivery({ artifactsRoot: parsed.artifactsRoot });
    if (!delivery.ok) return failure(io, delivery.error.code);
    const delivered = delivery.value.deliver(rendered.value);
    if (!delivered.ok) return failure(io, delivered.error.code);
    const diagnostics = prepared.value.diagnostics.map((diagnostic) => diagnostic.code).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    io.stdout(`SITE_BUILD_OK digest=${delivered.value.artifactDigest} directory=${delivered.value.directory} sidecar=${JSON.stringify(diagnostics)}\n`);
    return 0;
  } finally {
    persistence.value.close();
  }
}

export async function siteBuildMain(): Promise<void> {
  process.exitCode = await runSiteBuild(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void siteBuildMain();
