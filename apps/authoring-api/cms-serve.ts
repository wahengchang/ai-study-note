import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createDomainApplication, createPersistencePluginActivationStatePort, createPersistencePluginSettingsStatePort, createPersistenceThemeActivationStatePort } from "../../core/application/index.js";
import { createContentReadModel } from "../../core/content/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../core/media/index.js";
import { openPersistence } from "../../core/persistence/index.js";
import { createPluginHost } from "../../core/plugin-host/index.js";
import { createSiteDefinition } from "../../core/site-definition/index.js";
import { createThemeHost } from "../../core/theme-host/index.js";
import { createLocalAuthoringCredentialAuthority, startAuthoringApi } from "./index.js";
import { createJsonSchemaRevisionValidator } from "./schema-validator.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let database: string | undefined; let mediaRoot: string | undefined; let installedPluginsRoot: string | undefined; let installedThemesRoot: string | undefined; let cmsAssetsRoot: string | undefined;
  try {
    const parsed = parseArgs({ args: argv, options: { database: { type: "string" }, "media-root": { type: "string" }, "installed-plugins-root": { type: "string" }, "installed-themes-root": { type: "string" }, "cms-assets-root": { type: "string" } }, strict: true });
    database = parsed.values.database; mediaRoot = parsed.values["media-root"]; installedPluginsRoot = parsed.values["installed-plugins-root"]; installedThemesRoot = parsed.values["installed-themes-root"]; cmsAssetsRoot = parsed.values["cms-assets-root"];
  } catch { process.stderr.write("CMS_SERVE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  if ([database, mediaRoot, installedPluginsRoot, installedThemesRoot, cmsAssetsRoot].some((value) => value === undefined || value.trim() === "")) { process.stderr.write("CMS_SERVE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  const persistence = openPersistence({ databasePath: database! });
  if (!persistence.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${persistence.error.code}\n`); process.exitCode = 1; return; }
  const objects = createLocalMediaObjectStore({ objectsRoot: mediaRoot! });
  if (!objects.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${objects.error.code}\n`); process.exitCode = 1; return; }
  const media = startDataMedia({ persistence: persistence.value, objectStore: objects.value });
  if (!media.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${media.error.code}\n`); process.exitCode = 1; return; }
  const [plugins, theme, content] = await Promise.all([
    createPluginHost({ repositoryRoot, installedPluginsRoot: installedPluginsRoot!, activationState: createPersistencePluginActivationStatePort({ persistence: persistence.value }), settingsState: createPersistencePluginSettingsStatePort({ persistence: persistence.value }) }),
    createThemeHost({ repositoryRoot, installedThemesRoot: installedThemesRoot!, activationState: createPersistenceThemeActivationStatePort({ persistence: persistence.value }) }),
    Promise.resolve(createContentReadModel({ approvedRawFullPageSchemas: [] })),
  ]);
  if (!plugins.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${plugins.error.code}\n`); process.exitCode = 1; return; }
  if (!theme.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${theme.error.code}\n`); process.exitCode = 1; return; }
  if (!content.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${content.error.code}\n`); process.exitCode = 1; return; }
  const application = createDomainApplication({ persistence: persistence.value, siteDefinition: createSiteDefinition({ persistence: persistence.value }), dataMedia: media.value, contentReadModel: content.value, pluginHost: plugins.value, schemaValidator: createJsonSchemaRevisionValidator() });
  const credentialAuthority = createLocalAuthoringCredentialAuthority({ homeDirectory: homedir() });
  const started = await startAuthoringApi({ domainApplication: application, credentialAuthority, cmsAssetsRoot: cmsAssetsRoot!, logger: () => {} });
  if (!started.ok) { process.stderr.write(`CMS_SERVE_FAILED code=${started.error.code}\n`); process.exitCode = 1; return; }
  process.stdout.write(`CMS_SERVE_OK origin=${started.value.origin}/cms/\n`);
  const close = () => { void started.value.close(); };
  process.once("SIGINT", close); process.once("SIGTERM", close);
}
if (process.argv[1] !== undefined && new URL(`file://${process.argv[1]}`).href === import.meta.url) void main();
