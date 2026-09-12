import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { createAuthoringReadFacade, createContentTypeAdministration, createContentTypeMigrationAdministration, createDomainApplication, createPersistencePluginActivationStatePort, createPersistencePluginSettingsStatePort } from "../../core/application/index.js";
import { createPublishedContentReadModel } from "../../core/content/index.js";
import { createFixedRootReleaseDelivery, createPublicDelivery } from "../../core/delivery/index.js";
import { type MessageRemediation } from "../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../core/media/index.js";
import { openPersistence, type PersistenceStore } from "../../core/persistence/index.js";
import { createPluginHost } from "../../core/plugin-host/index.js";
import { createProjectionPreview } from "../../core/projection/index.js";
import { createSiteDefinition } from "../../core/site-definition/index.js";
import { createTaxonomy } from "../../core/taxonomy/index.js";
import { createThemeHost, type ThemeActivationStatePort } from "../../core/theme-host/index.js";

import { loadCmsAssets } from "./cms-assets.js";
import { createLocalAuthoringCredentialAuthority, type LocalAuthoringCredentialInput } from "./credential-store.js";
import { createAjvSchemaValidator } from "./schema-validator.js";
import { createAuthoringReleaseTransport } from "./release-transport.js";
import { startAuthoringApi, type AuthoringApiLogEvent, type RunningAuthoringApi } from "./server.js";

export type CmsRuntimeFailureCode = "INVALID_CMS_RUNTIME_INPUT" | "CMS_ASSETS_UNAVAILABLE" | "CMS_CREDENTIAL_UNAVAILABLE" | "CMS_PERSISTENCE_UNAVAILABLE" | "CMS_MEDIA_UNAVAILABLE" | "CMS_PLUGIN_HOST_UNAVAILABLE" | "CMS_THEME_HOST_UNAVAILABLE" | "CMS_PROJECTION_UNAVAILABLE" | "CMS_DELIVERY_UNAVAILABLE" | "CMS_LISTENER_UNAVAILABLE";
export type CmsRuntimeFailure = Readonly<{ code: CmsRuntimeFailureCode; owner: "CmsRuntime"; subjectIds: readonly []; remediation: MessageRemediation }>;
export type CmsRuntimeResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: CmsRuntimeFailure }>;
export type StartCmsRuntimeInput = Readonly<{ repositoryRoot: string; databasePath: string; mediaRoot: string; installedPluginsRoot: string; installedThemesRoot: string; cmsAssetsRoot: string; credential: LocalAuthoringCredentialInput; logger: (event: AuthoringApiLogEvent) => void }>;
export interface RunningCmsRuntime { readonly origin: RunningAuthoringApi["origin"]; close(): Promise<void>; }

function failure<T>(code: CmsRuntimeFailureCode): CmsRuntimeResult<T> {
  return { ok: false, error: { code, owner: "CmsRuntime", subjectIds: [], remediation: { kind: "message", message: "CMS runtime 無法安全啟動。" } } };
}

function trustedDirectory(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0 && realpathSync(path).length > 0;
  } catch {
    return false;
  }
}

function trustedDatabase(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0 && trustedDirectory(dirname(path));
  } catch {
    return false;
  }
}

function createPersistenceThemeActivationStatePort(
  { persistence }: Readonly<{ persistence: Pick<PersistenceStore, "readThemeActivationState" | "compareAndReplaceThemeActivationState"> }>,
): ThemeActivationStatePort {
  return Object.freeze({
    async read() {
      const state = persistence.readThemeActivationState();
      if (!state.ok) throw new Error("theme activation state read");
      return Object.freeze({ bytes: new Uint8Array(state.value.bytes), digest: state.value.digest });
    },
    async compareAndReplace(input) {
      const replaced = persistence.compareAndReplaceThemeActivationState({
        expectedDigest: input.expectedDigest,
        next: Object.freeze({ bytes: new Uint8Array(input.next.bytes), digest: input.next.digest }),
      });
      if (!replaced.ok) throw new Error("theme activation state replace");
      return replaced.value;
    },
  });
}



export async function startCmsRuntime(input: StartCmsRuntimeInput): Promise<CmsRuntimeResult<RunningCmsRuntime>> {
  if (!isAbsolute(input.repositoryRoot) || !isAbsolute(input.databasePath) || !isAbsolute(input.mediaRoot) || !isAbsolute(input.installedPluginsRoot) || !isAbsolute(input.installedThemesRoot) || !isAbsolute(input.cmsAssetsRoot) || !isAbsolute(input.credential.homeDirectory) || typeof input.logger !== "function") return failure("INVALID_CMS_RUNTIME_INPUT");
  const repositoryRoot = resolve(input.repositoryRoot);
  const localReleaseRoot = resolve(input.credential.homeDirectory, ".local", "share", "ai-study-note-reset");
  const releaseRelation = relative(repositoryRoot, localReleaseRoot);
  if (releaseRelation === "" || (!releaseRelation.startsWith(`..${sep}`) && releaseRelation !== ".." && !isAbsolute(releaseRelation))) return failure("CMS_DELIVERY_UNAVAILABLE");
  if (resolve(input.cmsAssetsRoot) !== resolve(repositoryRoot, "dist", "cms") || !trustedDirectory(resolve(input.cmsAssetsRoot))) return failure("CMS_ASSETS_UNAVAILABLE");
  if (!trustedDatabase(input.databasePath)) return failure("CMS_PERSISTENCE_UNAVAILABLE");
  const assets = loadCmsAssets(input.cmsAssetsRoot);
  if (assets === undefined) return failure("CMS_ASSETS_UNAVAILABLE");

  let persistence: PersistenceStore | undefined;
  let listener: RunningAuthoringApi | undefined;
  try {
    const credentials = createLocalAuthoringCredentialAuthority(input.credential);
    const admission = await credentials.openAdmission();
    if (!admission.ok) return failure("CMS_CREDENTIAL_UNAVAILABLE");
    admission.value.dispose();

    const opened = openPersistence({ databasePath: input.databasePath });
    if (!opened.ok) return failure("CMS_PERSISTENCE_UNAVAILABLE");
    persistence = opened.value;
    const objectStore = createLocalMediaObjectStore({ objectsRoot: input.mediaRoot });
    if (!objectStore.ok) return failure("CMS_MEDIA_UNAVAILABLE");
    const dataMedia = startDataMedia({ persistence, objectStore: objectStore.value });
    if (!dataMedia.ok) return failure("CMS_MEDIA_UNAVAILABLE");
    const siteDefinition = createSiteDefinition({ persistence });
    const pluginHost = await createPluginHost({ repositoryRoot, installedPluginsRoot: input.installedPluginsRoot, activationState: createPersistencePluginActivationStatePort({ persistence }), settingsState: createPersistencePluginSettingsStatePort({ persistence }) });
    if (!pluginHost.ok) return failure("CMS_PLUGIN_HOST_UNAVAILABLE");
    const contentReadModel = createPublishedContentReadModel({ approvedRawFullPageSchemas: [] });
    if (!contentReadModel.ok) return failure("CMS_PROJECTION_UNAVAILABLE");
    const schemaValidator = createAjvSchemaValidator();
    const taxonomy = createTaxonomy({ persistence });
    const domainApplication = createDomainApplication({ persistence, siteDefinition, dataMedia: dataMedia.value, schemaValidator, pluginHost: pluginHost.value, taxonomy });
    const authoringReadFacade = createAuthoringReadFacade({ persistence, siteDefinition, dataMedia: dataMedia.value, contentReadModel: contentReadModel.value });
    const contentTypeAdministration = createContentTypeAdministration({ persistence, validator: schemaValidator });
    const contentTypeMigrationAdministration = createContentTypeMigrationAdministration({ persistence, validator: schemaValidator });
    const themeHost = await createThemeHost({
      repositoryRoot,
      installedThemesRoot: input.installedThemesRoot,
      activationState: createPersistenceThemeActivationStatePort({ persistence }),
    });
    if (!themeHost.ok) return failure("CMS_THEME_HOST_UNAVAILABLE");
    const activeTheme = await themeHost.value.resolveActive();
    if (!activeTheme.ok) return failure("CMS_THEME_HOST_UNAVAILABLE");
    const projectionPreview = createProjectionPreview({ persistence, siteDefinition, dataMedia: dataMedia.value, contentReadModel: contentReadModel.value, themeHost: themeHost.value, pluginHost: pluginHost.value });
    const delivery = createPublicDelivery({ artifactsRoot: join(localReleaseRoot, "artifacts") });
    if (!delivery.ok) return failure("CMS_DELIVERY_UNAVAILABLE");
    const releaseDelivery = createFixedRootReleaseDelivery({ artifactsRoot: join(localReleaseRoot, "artifacts"), releaseRoot: join(localReleaseRoot, "release") });
    if (!releaseDelivery.ok) return failure("CMS_DELIVERY_UNAVAILABLE");
    const effectiveReleaseRoot = realpathSync(join(localReleaseRoot, "release"));
    const effectiveRepositoryRoot = realpathSync(repositoryRoot);
    const effectiveRelation = relative(effectiveRepositoryRoot, effectiveReleaseRoot);
    if (effectiveRelation === "" || (!effectiveRelation.startsWith(`..${sep}`) && effectiveRelation !== ".." && !isAbsolute(effectiveRelation))) return failure("CMS_DELIVERY_UNAVAILABLE");
    const releaseTransport = createAuthoringReleaseTransport({ projection: projectionPreview, delivery: delivery.value, releaseDelivery: releaseDelivery.value });
    const started = await startAuthoringApi({ domainApplication, credentialAuthority: credentials, cmsAssets: assets, logger: input.logger, authoringReadFacade, contentTypeAdministration, contentTypeMigrationAdministration, projectionPreview, releaseTransport });
    if (!started.ok) return failure("CMS_LISTENER_UNAVAILABLE");
    listener = started.value;
    let closed = false;
    return { ok: true, value: { origin: listener.origin, async close() { if (closed) return; closed = true; try { await listener?.close(); } finally { persistence?.close(); } } } };
  } catch {
    return failure("CMS_PERSISTENCE_UNAVAILABLE");
  } finally {
    if (listener === undefined) persistence?.close();
  }
}
