import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { createContentTypeAdministration, createCurrentEntryAdministration, createCurrentMediaLibrary, createCurrentTaxonomyAdministration } from "../../core/application/index.js";
import { type MessageRemediation } from "../../core/foundation/index.js";
import { createCurrentMediaObjectStore, inspectCurrentMediaRoot } from "../../core/media/index.js";
import { inspectDatabaseGeneration, openPersistence, type PersistenceStore } from "../../core/persistence/index.js";
import { loadCmsAssets } from "./cms-assets.js";
import { createLocalAuthoringCredentialAuthority, type LocalAuthoringCredentialInput } from "./credential-store.js";
import { startAuthoringApi, type AuthoringApiLogEvent, type RunningAuthoringApi } from "./server.js";

export type CmsRuntimeFailureCode = "INVALID_CMS_RUNTIME_INPUT" | "CMS_ASSETS_UNAVAILABLE" | "CMS_CREDENTIAL_UNAVAILABLE" | "CMS_PERSISTENCE_UNAVAILABLE" | "OLD_DATABASE_UNSUPPORTED" | "CMS_MEDIA_UNAVAILABLE" | "OLD_MEDIA_UNSUPPORTED" | "CMS_LISTENER_UNAVAILABLE";
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
  } catch { return false; }
}
function trustedDatabase(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o022) === 0 && trustedDirectory(dirname(path));
  } catch { return false; }
}

export async function startCmsRuntime(input: StartCmsRuntimeInput): Promise<CmsRuntimeResult<RunningCmsRuntime>> {
  if (![input.repositoryRoot, input.databasePath, input.mediaRoot, input.installedPluginsRoot, input.installedThemesRoot, input.cmsAssetsRoot, input.credential.homeDirectory].every(isAbsolute) || typeof input.logger !== "function") return failure("INVALID_CMS_RUNTIME_INPUT");
  const generation = inspectDatabaseGeneration(input.databasePath);
  if (generation === "old") return failure("OLD_DATABASE_UNSUPPORTED");
  if (generation !== "current" || !trustedDatabase(input.databasePath)) return failure("CMS_PERSISTENCE_UNAVAILABLE");
  if (inspectCurrentMediaRoot(input.mediaRoot) !== "current") return failure("OLD_MEDIA_UNSUPPORTED");
  if (resolve(input.cmsAssetsRoot) !== resolve(input.repositoryRoot, "dist", "cms") || !trustedDirectory(resolve(input.cmsAssetsRoot))) return failure("CMS_ASSETS_UNAVAILABLE");
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
    const objects = createCurrentMediaObjectStore({ objectsRoot: input.mediaRoot });
    if (!objects.ok) return failure("CMS_MEDIA_UNAVAILABLE");
    const media = createCurrentMediaLibrary({ persistence, objectStore: objects.value, newStableId: randomUUID });
    if (!media.ok) return failure("CMS_MEDIA_UNAVAILABLE");
    const started = await startAuthoringApi({ credentialAuthority: credentials, cmsAssets: assets, logger: input.logger, contentTypeAdministration: createContentTypeAdministration({ persistence, newStableId: randomUUID }), currentEntryAdministration: createCurrentEntryAdministration({ persistence, newStableId: randomUUID }), currentTaxonomyAdministration: createCurrentTaxonomyAdministration({ persistence, newStableId: randomUUID }), currentMediaLibrary: media.value });
    if (!started.ok) return failure("CMS_LISTENER_UNAVAILABLE");
    listener = started.value;
    let closed = false;
    return { ok: true, value: { origin: listener.origin, async close() { if (closed) return; closed = true; try { await listener?.close(); } finally { persistence?.close(); } } } };
  } catch { return failure("CMS_PERSISTENCE_UNAVAILABLE"); }
  finally { if (listener === undefined) persistence?.close(); }
}
