import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createPersistencePluginActivationStatePort, createPersistencePluginSettingsStatePort, createPersistenceThemeActivationStatePort } from "../../core/application/index.js";
import { createContentReadModel } from "../../core/content/index.js";
import { createPublicDelivery } from "../../core/delivery/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../core/media/index.js";
import { openPersistence } from "../../core/persistence/index.js";
import { createPluginHost } from "../../core/plugin-host/index.js";
import { createProjection } from "../../core/projection/index.js";
import { createStaticRenderer } from "../../core/renderer/index.js";
import { createSiteDefinition } from "../../core/site-definition/index.js";
import { createThemeHost } from "../../core/theme-host/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let database: string | undefined; let mediaRoot: string | undefined; let installedPluginsRoot: string | undefined; let installedThemesRoot: string | undefined; let artifactsRoot: string | undefined;
  try {
    const parsed = parseArgs({ args: argv, options: { database: { type: "string" }, "media-root": { type: "string" }, "installed-plugins-root": { type: "string" }, "installed-themes-root": { type: "string" }, "artifacts-root": { type: "string" } }, strict: true });
    database = parsed.values.database; mediaRoot = parsed.values["media-root"]; installedPluginsRoot = parsed.values["installed-plugins-root"]; installedThemesRoot = parsed.values["installed-themes-root"]; artifactsRoot = parsed.values["artifacts-root"];
  } catch { process.stderr.write("SITE_BUILD_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  if ([database, mediaRoot, installedPluginsRoot, installedThemesRoot, artifactsRoot].some((value) => value === undefined || value.trim() === "")) { process.stderr.write("SITE_BUILD_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  const persistence = openPersistence({ databasePath: database! });
  if (!persistence.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${persistence.error.code}\n`); process.exitCode = 1; return; }
  const objects = createLocalMediaObjectStore({ objectsRoot: mediaRoot! });
  if (!objects.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${objects.error.code}\n`); process.exitCode = 1; return; }
  const media = startDataMedia({ persistence: persistence.value, objectStore: objects.value });
  if (!media.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${media.error.code}\n`); process.exitCode = 1; return; }
  const [plugins, theme] = await Promise.all([
    createPluginHost({ repositoryRoot, installedPluginsRoot: installedPluginsRoot!, activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }), settingsState: createPersistencePluginSettingsStatePort({ persistence: persistence.value }) }),
    createThemeHost({ repositoryRoot, installedThemesRoot: installedThemesRoot!, activationState: createPersistenceThemeActivationStatePort({ persistence: persistence.value }) }),
  ]);
  if (!plugins.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${plugins.error.code}\n`); process.exitCode = 1; return; }
  if (!theme.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${theme.error.code}\n`); process.exitCode = 1; return; }
  const content = createContentReadModel({ approvedRawFullPageSchemas: [] });
  if (!content.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${content.error.code}\n`); process.exitCode = 1; return; }
  const projection = createProjection({ persistence: persistence.value, siteDefinition: createSiteDefinition({ persistence: persistence.value }), dataMedia: media.value, contentReadModel: content.value, themeHost: theme.value, pluginHost: plugins.value });
  if (!projection.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${projection.error.code}\n`); process.exitCode = 1; return; }
  const artifact = await projection.value.producePublishedRendererInput();
  if (!artifact.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${artifact.error.code}\n`); process.exitCode = 1; return; }
  const rendered = await createStaticRenderer().render(artifact.value);
  if (!rendered.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${rendered.error.code}\n`); process.exitCode = 1; return; }
  const delivery = createPublicDelivery({ artifactsRoot: artifactsRoot! });
  if (!delivery.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${delivery.error.code}\n`); process.exitCode = 1; return; }
  const delivered = delivery.value.deliver(rendered.value);
  if (!delivered.ok) { process.stderr.write(`SITE_BUILD_FAILED code=${delivered.error.code}\n`); process.exitCode = 1; return; }
  process.stdout.write(`SITE_BUILD_OK digest=${delivered.value.artifactDigest} directory=${delivered.value.directory}\n`);
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
