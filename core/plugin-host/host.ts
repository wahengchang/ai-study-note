import { readFile } from "node:fs/promises";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { ActivePluginSnapshot, ActivePublicPluginRenderer, CmsEditorBlockResolution, CmsEditorBlockSource, CmsEditorBlockSourceEvidence, CmsEditorBlockResolverInput, CmsEditorBlockResolverOutput, CmsSeoAnalysisInputV1, CmsSeoAnalysisOutputV1, CreatePluginHostInput, PluginActivationIdentity, PluginActivationManagementSnapshot, PluginActivationState, PluginDiscoveryReport, PluginHost, PluginHostResult, PluginManifestV1, PluginSeoAnalysisResult, PluginSettingsRecord, PluginSettingsState, PreparedPublicBuildSnapshot, PreparedSaveRevisionValidators, PublicPluginBuildSnapshotV1, PublicSeoContributionRecord, PublicSeoEvidence, PublicSeoPageContributionV1, PublicSeoSiteContributionV1, ResolvePublicBuildSnapshotInput, SaveRevisionContentGuard, SaveRevisionValidatorInput, SeoPluginSettingsV1, ValidatedSaveRevisionContent, VerifiedPluginResource } from "./contracts.js";
import { isCanonicalPluginId, pluginHostError, pluginHostFailure, type PluginDiagnosticDetail, type PluginHostFailure } from "./failures.js";
import { isExactSemver, readManifest } from "./manifest.js";
import { loadVerifiedPluginModule } from "./module-loader.js";
import { compareCodeUnits } from "./ordering.js";
import { installedPluginDirectories, resolvePluginDirectory, resolvePluginFile, revalidateTrustedRoots, type TrustedRoots, validateTrustedRoots } from "./trusted-root.js";

type Installed = Readonly<{ manifest: PluginManifestV1; manifestHash: Digest; entryBytes: Uint8Array; resources: readonly VerifiedPluginResource[] }>;
type InstalledLookup = Readonly<{ status: "available"; value: Installed }> | Readonly<{ status: "invalid-root" }> | Readonly<{ status: "source-missing" }> | Readonly<{ status: "evidence-mismatch" }>;
type State = Readonly<{ state: PluginActivationState; digest: Digest }>;
type Prepared = Readonly<{ entryId: string; digest: Digest; callbacks: readonly Readonly<{ identity: PluginActivationIdentity; priority: number; callback: (input: unknown, facade: unknown) => unknown }>[] }>;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors && "value" in descriptors[key]!);
  } catch {
    return false;
  }
}

function capabilities(value: unknown): readonly PluginActivationIdentity["capabilities"][number][] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string")) return null;
  const known = new Set(["save-revision-validator", "cms-editor-block-resolution", "cms-seo-analysis", "public-block-renderer", "public-assets-emitter", "public-seo-page-contribution", "public-seo-site-contribution"]);
  if (new Set(value).size !== value.length || value.some((item) => !known.has(item))) return null;
  const result = [...value] as PluginActivationIdentity["capabilities"][number][];
  if (result.some((item, index) => index > 0 && compareCodeUnits(result[index - 1]!, item) >= 0)) return null;
  return Object.freeze(result);
}

function identity(value: unknown): PluginActivationIdentity | null {
  if (!exact(value, ["id", "version", "hookContract", "manifestHash", "capabilities"]) || !isCanonicalPluginId(value.id) || typeof value.version !== "string" || !isExactSemver(value.version) || value.hookContract !== "plugin-hooks/v1" || typeof value.manifestHash !== "string" || !isDigest(value.manifestHash)) return null;
  const capabilitySet = capabilities(value.capabilities);
  return capabilitySet === null ? null : Object.freeze({ id: value.id, version: value.version, hookContract: value.hookContract, manifestHash: value.manifestHash, capabilities: capabilitySet });
}

function same(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return left.id === right.id
    && left.version === right.version
    && left.hookContract === right.hookContract
    && left.manifestHash === right.manifestHash
    && left.capabilities.length === right.capabilities.length
    && left.capabilities.every((capability, index) => capability === right.capabilities[index]);
}

function ordered(values: readonly PluginActivationIdentity[]): readonly PluginActivationIdentity[] {
  return Object.freeze([...values].map((item) => Object.freeze({ ...item, capabilities: Object.freeze([...item.capabilities]) })).sort((left, right) => compareCodeUnits(left.id, right.id)));
}

function parseState(value: unknown): PluginActivationState | null {
  if (!exact(value, ["contract", "active", "reactivationRequired"]) || value.contract !== "plugin-activation-state/v2" || !Array.isArray(value.active) || !Array.isArray(value.reactivationRequired)) return null;
  const active = value.active.map(identity);
  const reactivationRequired = value.reactivationRequired.map(identity);
  if (active.some((item) => item === null) || reactivationRequired.some((item) => item === null)) return null;
  const all = [...active, ...reactivationRequired] as PluginActivationIdentity[];
  if (new Set(all.map((item) => item.id)).size !== all.length || ![active, reactivationRequired].every((items) => items.every((item, index) => index === 0 || compareCodeUnits(items[index - 1]!.id, item!.id) < 0))) return null;
  return Object.freeze({ contract: "plugin-activation-state/v2", active: Object.freeze(active as PluginActivationIdentity[]), reactivationRequired: Object.freeze(reactivationRequired as PluginActivationIdentity[]) });
}

function digest(state: PluginActivationState): Digest | null {
  const bytes = canonicalJsonBytes(state);
  return bytes.ok ? sha256Digest(bytes.value) : null;
}

function snapshot(state: PluginActivationState, stateDigest: Digest): ActivePluginSnapshot {
  return Object.freeze({ identities: Object.freeze(state.active.map((item) => Object.freeze({ ...item }))), digest: stateDigest });
}

function evidenceIdentity(item: Installed): PluginActivationIdentity | null {
  return identity({
    id: item.manifest.id,
    version: item.manifest.version,
    hookContract: item.manifest.hookContract,
    manifestHash: item.manifestHash,
    capabilities: item.manifest.capabilities,
  });
}

function settings(value: unknown): SeoPluginSettingsV1 | null {
  if (!exact(value, ["contract", "publicSiteUrl", "indexing"]) || value.contract !== "seo-plugin-settings/v1" || typeof value.publicSiteUrl !== "string" || value.publicSiteUrl.length === 0 || (value.indexing !== "allow" && value.indexing !== "disallow")) return null;
  try {
    const url = new URL(value.publicSiteUrl);
    if (url.href !== value.publicSiteUrl || url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || url.port !== "" || !url.pathname.startsWith("/") || (url.pathname !== "/" && !url.pathname.endsWith("/")) || /%2f|%5c/i.test(url.pathname)) return null;
  } catch { return null; }
  return Object.freeze({ contract: "seo-plugin-settings/v1", publicSiteUrl: value.publicSiteUrl, indexing: value.indexing });
}

function settingsState(value: unknown): PluginSettingsState | null {
  if (!exact(value, ["contract", "records"]) || value.contract !== "plugin-settings-state/v1" || !Array.isArray(value.records)) return null;
  const records: PluginSettingsRecord[] = [];
  for (const candidate of value.records) {
    if (!exact(candidate, ["identity", "settingsContract", "settings", "settingsDigest"]) || candidate.settingsContract !== "seo-plugin-settings/v1" || typeof candidate.settingsDigest !== "string" || !isDigest(candidate.settingsDigest)) return null;
    const recordIdentity = identity(candidate.identity);
    const recordSettings = settings(candidate.settings);
    if (recordIdentity === null || recordSettings === null || recordSettings.contract !== candidate.settingsContract) return null;
    const bytes = canonicalJsonBytes(recordSettings);
    if (!bytes.ok || sha256Digest(bytes.value) !== candidate.settingsDigest) return null;
    records.push(Object.freeze({ identity: recordIdentity, settingsContract: "seo-plugin-settings/v1", settings: recordSettings, settingsDigest: candidate.settingsDigest }));
  }
  if (new Set(records.map((record) => record.identity.id)).size !== records.length || records.some((record, index) => index > 0 && compareCodeUnits(records[index - 1]!.identity.id, record.identity.id) >= 0)) return null;
  return Object.freeze({ contract: "plugin-settings-state/v1", records: Object.freeze(records) });
}

function settingsDigest(state: PluginSettingsState): Digest | null {
  const bytes = canonicalJsonBytes(state);
  return bytes.ok ? sha256Digest(bytes.value) : null;
}

function cmsSeoOutput(value: unknown): Readonly<{ output: CmsSeoAnalysisOutputV1; digest: Digest }> | null {
  if (!exact(value, ["contract", "preview", "suggestions"]) || value.contract !== "cms-seo-analysis-output/v1" || !exact(value.preview, ["title", "description", "canonicalPath"]) && !exact(value.preview, ["title", "canonicalPath"]) || !Array.isArray(value.suggestions)) return null;
  const preview = value.preview;
  if (typeof preview.title !== "string" || preview.title.length === 0 || typeof preview.canonicalPath !== "string" || preview.canonicalPath.length === 0 || (preview.description !== undefined && (typeof preview.description !== "string" || preview.description.length === 0))) return null;
  if (!value.suggestions.every((suggestion) => exact(suggestion, ["code", "field"]) && ((suggestion.code === "SEO_TITLE_MISSING" && suggestion.field === "title") || (suggestion.code === "SEO_DESCRIPTION_MISSING" && suggestion.field === "description")))) return null;
  const canonical = json(value);
  return canonical === null ? null : Object.freeze({ output: canonical.value as unknown as CmsSeoAnalysisOutputV1, digest: canonical.digest });
}

function publicPageContribution(value: unknown, input: ResolvePublicBuildSnapshotInput["published"][number]): Readonly<{ contribution: PublicSeoPageContributionV1; digest: Digest }> | null {
  if (!exact(value, ["contract", "entryId", "revisionId", "route", "title", "description", "canonicalPath", "openGraph", "jsonLd"]) && !exact(value, ["contract", "entryId", "revisionId", "route", "title", "canonicalPath", "openGraph", "jsonLd"])) return null;
  if (value.contract !== "public-seo-page-contribution/v1" || value.entryId !== input.entryId || value.revisionId !== input.revisionId || value.route !== input.route || typeof value.title !== "string" || value.title.length === 0 || typeof value.canonicalPath !== "string" || value.canonicalPath.length === 0 || (value.description !== undefined && (typeof value.description !== "string" || value.description.length === 0))) return null;
  if (!exact(value.openGraph, value.description === undefined ? ["title", "urlPath", "type"] : ["title", "description", "urlPath", "type"]) || value.openGraph.title !== value.title || value.openGraph.description !== value.description || value.openGraph.urlPath !== value.canonicalPath || value.openGraph.type !== "article") return null;
  if (!exact(value.jsonLd, value.description === undefined ? ["type", "name", "urlPath"] : ["type", "name", "description", "urlPath"]) || value.jsonLd.type !== "WebPage" || value.jsonLd.name !== value.title || value.jsonLd.description !== value.description || value.jsonLd.urlPath !== value.canonicalPath) return null;
  const canonical = json(value);
  return canonical === null ? null : Object.freeze({ contribution: canonical.value as unknown as PublicSeoPageContributionV1, digest: canonical.digest });
}

function publicSiteContribution(value: unknown, indexing: SeoPluginSettingsV1["indexing"]): Readonly<{ contribution: PublicSeoSiteContributionV1; digest: Digest }> | null {
  if (!exact(value, ["contract", "sitemap", "robots"]) || value.contract !== "public-seo-site-contribution/v1" || !exact(value.sitemap, ["include"]) || value.sitemap.include !== "all-published" || !exact(value.robots, ["indexing"]) || value.robots.indexing !== indexing) return null;
  const canonical = json(value);
  return canonical === null ? null : Object.freeze({ contribution: canonical.value as unknown as PublicSeoSiteContributionV1, digest: canonical.digest });
}

function publicInput(value: unknown): ResolvePublicBuildSnapshotInput | null {
  if (!exact(value, ["contract", "published"]) || value.contract !== "public-plugin-build-request/v1" || !Array.isArray(value.published)) return null;
  const published: ResolvePublicBuildSnapshotInput["published"][number][] = [];
  for (const entry of value.published) {
    if (!exact(entry, ["entryId", "revisionId", "schemaIdentity", "route", "content"]) || typeof entry.entryId !== "string" || entry.entryId.length === 0 || typeof entry.revisionId !== "string" || entry.revisionId.length === 0 || typeof entry.route !== "string" || entry.route.length === 0 || !exact(entry.schemaIdentity, ["schemaId", "version"]) || typeof entry.schemaIdentity.schemaId !== "string" || !Number.isSafeInteger(entry.schemaIdentity.version) || json(entry.content) === null) return null;
    published.push(Object.freeze({ entryId: entry.entryId, revisionId: entry.revisionId, schemaIdentity: Object.freeze({ schemaId: entry.schemaIdentity.schemaId, version: entry.schemaIdentity.version as number }), route: entry.route, content: json(entry.content)!.value }));
  }
  if (new Set(published.map((entry) => entry.route)).size !== published.length || new Set(published.map((entry) => entry.entryId)).size !== published.length || published.some((entry, index) => index > 0 && `${published[index - 1]!.route} ${published[index - 1]!.entryId} ${published[index - 1]!.revisionId}` >= `${entry.route} ${entry.entryId} ${entry.revisionId}`)) return null;
  return Object.freeze({ contract: "public-plugin-build-request/v1", published: Object.freeze(published) });
}
function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeJson(item)));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)])));
}

function json(value: unknown): Readonly<{ value: JsonValue; bytes: Uint8Array; digest: Digest }> | null {
  const bytes = canonicalJsonBytes(value);
  if (!bytes.ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.value)) as JsonValue;
    return Object.freeze({ value: freezeJson(parsed), bytes: copyBytes(bytes.value), digest: sha256Digest(bytes.value) });
  } catch {
    return null;
  }
}

function editorDetail(pluginId: string, entryId: string, cause: PluginDiagnosticDetail["cause"]): PluginDiagnosticDetail {
  return Object.freeze({ pluginId, hook: "cms/editor-block/resolve", capability: "cms-editor-block-resolution", scope: Object.freeze({ kind: "entry", entryId }), cause });
}

function validatorDetail(pluginId: string, entryId: string, cause: "rejected" | "invalid-result" | "callback-fault"): PluginDiagnosticDetail {
  return Object.freeze({ pluginId, hook: "save-revision/validate", capability: "save-revision-validator", scope: Object.freeze({ kind: "entry", entryId }), cause });
}

function outputValues(value: unknown, keys: readonly string[]): readonly unknown[] | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertyDescriptor(Object.prototype, "then") !== undefined) return null;
    const names = Reflect.ownKeys(value);
    if (names.length !== keys.length || !keys.every((key) => names.includes(key))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (!keys.every((key) => descriptors[key] !== undefined && "value" in descriptors[key]!)) return null;
    return Object.freeze(keys.map((key) => descriptors[key]!.value));
  } catch {
    return null;
  }
}

const nativePromiseThen = Promise.prototype.then;

function nativePromise(value: unknown): value is Promise<unknown> {
  try {
    return value instanceof Promise;
  } catch {
    return false;
  }
}

function observeRejectedPromise(value: Promise<unknown>): void {
  try {
    void nativePromiseThen.call(value, undefined, () => undefined);
  } catch {}
}

function thenable(value: unknown): boolean {
  try {
    return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
  } catch {
    return true;
  }
}

async function installed(roots: TrustedRoots, id: string): Promise<InstalledLookup> {
  if (!(await revalidateTrustedRoots(roots))) return Object.freeze({ status: "invalid-root" });
  let result: InstalledLookup;
  const directory = await resolvePluginDirectory(roots, id);
  if (directory.status === "missing") {
    result = Object.freeze({ status: "source-missing" });
  } else if (directory.status === "invalid") {
    result = Object.freeze({ status: "evidence-mismatch" });
  } else {
    const manifestPath = await resolvePluginFile(directory.path, "plugin-manifest.json");
    if (manifestPath.status === "missing") {
      result = Object.freeze({ status: "source-missing" });
    } else if (manifestPath.status === "invalid") {
      result = Object.freeze({ status: "evidence-mismatch" });
    } else {
      const parsed = await readManifest(manifestPath.path, id);
      if (!parsed.ok) {
        result = Object.freeze({ status: "evidence-mismatch" });
      } else {
        let entryBytes: Uint8Array | null = null;
        const resources: VerifiedPluginResource[] = [];
        let failure: "source-missing" | "evidence-mismatch" | null = null;
        for (const item of [parsed.value.manifest.entry, ...parsed.value.manifest.resources]) {
          const file = await resolvePluginFile(directory.path, item.file);
          if (file.status === "missing") {
            failure = "source-missing";
            break;
          }
          if (file.status === "invalid") {
            failure = "evidence-mismatch";
            break;
          }
          try {
            const fileBytes = await readFile(file.path);
            if (sha256Digest(fileBytes) !== item.digest) {
              failure = "evidence-mismatch";
              break;
            }
            if (item.file === parsed.value.manifest.entry.file) entryBytes = copyBytes(fileBytes);
            else resources.push(Object.freeze({ file: item.file, bytes: copyBytes(fileBytes), digest: item.digest }));
          } catch {
            failure = "evidence-mismatch";
            break;
          }
        }
        result = failure === null && entryBytes !== null
          ? Object.freeze({ status: "available", value: Object.freeze({ manifest: parsed.value.manifest, manifestHash: parsed.value.manifestHash, entryBytes, resources: Object.freeze(resources) }) })
          : Object.freeze({ status: failure ?? "evidence-mismatch" });
      }
    }
  }
  return (await revalidateTrustedRoots(roots)) ? result : Object.freeze({ status: "invalid-root" });
}

class Host implements PluginHost {
  #queue = Promise.resolve();
  #prepared = new WeakMap<PreparedSaveRevisionValidators, Prepared>();
  #publicPrepared = new WeakMap<PreparedPublicBuildSnapshot, Readonly<{ activationDigest: Digest; settingsDigest: Digest }>>();

  constructor(
    private readonly roots: TrustedRoots,
    private readonly port: CreatePluginHostInput["activationState"],
    private readonly settingsPort: CreatePluginHostInput["settingsState"],
  ) {}

  async discover(): Promise<PluginHostResult<PluginDiscoveryReport>> {
    if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");
    try {
      const candidates = [];
      const rejections: PluginHostFailure[] = [];
      for (const id of await installedPluginDirectories(this.roots)) {
        const item = isCanonicalPluginId(id) ? await installed(this.roots, id) : Object.freeze({ status: "evidence-mismatch" } as const);
        if (item.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
        if (item.status !== "available") {
          rejections.push(pluginHostFailure("INVALID_PLUGIN_MANIFEST", id));
          continue;
        }
        candidates.push(Object.freeze({ id: item.value.manifest.id, version: item.value.manifest.version, hookContract: item.value.manifest.hookContract, capabilities: item.value.manifest.capabilities, manifestHash: item.value.manifestHash }));
      }
      if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");
      return { ok: true, value: Object.freeze({ candidates: Object.freeze(candidates.sort((left, right) => compareCodeUnits(left.id, right.id))), rejections: Object.freeze(rejections) }) };
    } catch {
      return pluginHostError("PLUGIN_DISCOVERY_FAILED");
    }
  }

  activate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      if (!exact(input, ["identity", "expectedActivationStateDigest"]) || typeof input.expectedActivationStateDigest !== "string" || !isDigest(input.expectedActivationStateDigest)) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const wanted = identity(input.identity);
      if (wanted === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const current = await this.state();
      if (!current.ok) return current;
      if (current.value.digest !== input.expectedActivationStateDigest) return pluginHostError("ACTIVATION_STATE_CONFLICT");
      const existing = [...current.value.state.active, ...current.value.state.reactivationRequired].find((entry) => entry.id === wanted.id);
      if (existing !== undefined && !same(existing, wanted)) return pluginHostError("PLUGIN_IDENTITY_CONFLICT", wanted.id);

      const item = await installed(this.roots, wanted.id);
      if (item.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
      if (item.status !== "available") {
        if (current.value.state.active.some((entry) => same(entry, wanted))) {
          const latched = await this.latchReactivation(current.value, [wanted]);
          if (!latched.ok) return latched;
        }
        return pluginHostError("PLUGIN_EVIDENCE_MISMATCH", wanted.id);
      }
      const actual = evidenceIdentity(item.value);
      if (actual === null) return pluginHostError("PLUGIN_EVIDENCE_MISMATCH", wanted.id);
      if (!same(wanted, actual)) {
        if (current.value.state.active.some((entry) => same(entry, wanted))) {
          const latched = await this.latchReactivation(current.value, [wanted]);
          if (!latched.ok) return latched;
        }
        return pluginHostError("PLUGIN_IDENTITY_CONFLICT", wanted.id);
      }
      if (current.value.state.active.some((entry) => same(entry, wanted))) {
        const fresh = await this.state();
        if (!fresh.ok) return fresh;
        return fresh.value.digest === current.value.digest ? { ok: true, value: snapshot(fresh.value.state, fresh.value.digest) } : pluginHostError("ACTIVATION_STATE_CONFLICT");
      }
      if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");
      const module = await loadVerifiedPluginModule({ entryBytes: item.value.entryBytes, manifestHash: item.value.manifestHash, callbacks: item.value.manifest.callbacks, pluginId: wanted.id });
      if (!module.ok) return module;
      const fresh = await this.state();
      if (!fresh.ok) return fresh;
      if (fresh.value.digest !== current.value.digest) return pluginHostError("ACTIVATION_STATE_CONFLICT");
      const next: PluginActivationState = Object.freeze({
        contract: "plugin-activation-state/v2",
        active: ordered([...current.value.state.active, wanted]),
        reactivationRequired: ordered(current.value.state.reactivationRequired.filter((entry) => entry.id !== wanted.id)),
      });
      return this.replace(current.value, next);
    });
  }

  deactivate(input: Readonly<{ identity: PluginActivationIdentity; expectedActivationStateDigest: Digest }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      if (!exact(input, ["identity", "expectedActivationStateDigest"]) || typeof input.expectedActivationStateDigest !== "string" || !isDigest(input.expectedActivationStateDigest)) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const wanted = identity(input.identity);
      const current = await this.state();
      if (wanted === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      if (!current.ok) return current;
      if (current.value.digest !== input.expectedActivationStateDigest) return pluginHostError("ACTIVATION_STATE_CONFLICT");
      if (![...current.value.state.active, ...current.value.state.reactivationRequired].some((entry) => same(entry, wanted))) return pluginHostError("PLUGIN_NOT_ACTIVE", wanted.id);
      const next: PluginActivationState = Object.freeze({
        contract: "plugin-activation-state/v2",
        active: ordered(current.value.state.active.filter((entry) => entry.id !== wanted.id)),
        reactivationRequired: ordered(current.value.state.reactivationRequired.filter((entry) => entry.id !== wanted.id)),
      });
      return this.replace(current.value, next);
    });
  }

  getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      const current = await this.state();
      if (!current.ok) return current;
      const validated = await this.validateActiveEvidence(current.value);
      return validated.ok ? { ok: true, value: snapshot(validated.value.state, validated.value.digest) } : validated;
    });
  }
  getActivationManagementSnapshot(): Promise<PluginHostResult<PluginActivationManagementSnapshot>> {
    return this.serial(async () => {
      const current = await this.state();
      if (!current.ok) return current;
      return {
        ok: true,
        value: Object.freeze({
          activationStateDigest: current.value.digest,
          active: ordered(current.value.state.active),
          reactivationRequired: ordered(current.value.state.reactivationRequired),
        }),
      };
    });
  }

  resolveCmsEditorBlock(input: CmsEditorBlockSource): Promise<PluginHostResult<CmsEditorBlockResolution>> {
    return this.serial(async () => {
      if (!exact(input, ["contract", "entryId", "revisionId", "pluginIdentity", "source"]) || input.contract !== "cms-editor-block-source/v1" || typeof input.entryId !== "string" || typeof input.revisionId !== "string") return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const wanted = identity(input.pluginIdentity);
      const source = json(input.source);
      if (wanted === null || source === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const evidence: CmsEditorBlockSourceEvidence = Object.freeze({ contract: input.contract, entryId: input.entryId, revisionId: input.revisionId, pluginIdentity: wanted, source: source.value, sourceBytes: source.bytes, sourceDigest: source.digest });
      const current = await this.state();
      if (!current.ok) return current;
      const item = await installed(this.roots, wanted.id);
      if (item.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
      const active = current.value.state.active.find((entry) => entry.id === wanted.id);
      let state = current.value;
      const actual = item.status === "available" ? evidenceIdentity(item.value) : null;
      if (active !== undefined && (item.status === "source-missing" || item.status === "evidence-mismatch" || actual === null || !same(active, actual))) {
        const latched = await this.latchReactivation(current.value, [active]);
        if (!latched.ok) return latched;
        state = latched.value;
      }

      let status: "inactive" | "missing" | "identity-changed" | null = null;
      if (item.status === "source-missing") status = "missing";
      else if (item.status === "evidence-mismatch" || actual === null || !same(wanted, actual)) status = "identity-changed";
      else if (!state.state.active.some((entry) => same(entry, wanted))) status = "inactive";
      if (status !== null) {
        const code = status === "missing" ? "PLUGIN_BLOCK_MISSING" : status === "identity-changed" ? "PLUGIN_BLOCK_IDENTITY_CHANGED" : "PLUGIN_BLOCK_INACTIVE";
        const cause = status === "missing" ? "missing" : status === "identity-changed" ? "identity-changed" : "inactive";
        return { ok: true, value: Object.freeze({ status, source: evidence, diagnostic: pluginHostFailure(code, wanted.id, editorDetail(wanted.id, evidence.entryId, cause)), activeStateDigest: state.digest }) };
      }
      if (item.status !== "available") return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT", wanted.id);
      if (!item.value.manifest.callbacks.some((callback) => callback.hook === "cms/editor-block/resolve")) return pluginHostError("PLUGIN_CAPABILITY_DENIED", wanted.id, editorDetail(wanted.id, evidence.entryId, "capability-denied"));
      if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");
      const authorized = await this.state();
      if (!authorized.ok) return authorized;
      if (authorized.value.digest !== state.digest || !authorized.value.state.active.some((entry) => same(entry, wanted))) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT", wanted.id);
      const declaration = item.value.manifest.callbacks.find((callback) => callback.hook === "cms/editor-block/resolve");
      if (declaration === undefined) return pluginHostError("PLUGIN_CAPABILITY_DENIED", wanted.id, editorDetail(wanted.id, evidence.entryId, "capability-denied"));
      const module = await loadVerifiedPluginModule({ entryBytes: item.value.entryBytes, manifestHash: item.value.manifestHash, callbacks: item.value.manifest.callbacks, pluginId: wanted.id });
      if (!module.ok) return module;
      if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");
      const afterModule = await this.state();
      if (!afterModule.ok) return afterModule;
      if (afterModule.value.digest !== authorized.value.digest || !afterModule.value.state.active.some((entry) => same(entry, wanted))) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT", wanted.id);
      const callbackSource = json(source.value);
      if (callbackSource === null) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", wanted.id, editorDetail(wanted.id, evidence.entryId, "invalid-result"));
      const callbackInput: CmsEditorBlockResolverInput = Object.freeze({ contract: "cms-editor-block-resolver-input/v1", entryId: evidence.entryId, revisionId: evidence.revisionId, source: callbackSource.value });
      let output: unknown;
      try {
        output = (module.value.namespace[declaration.exportName] as (resolverInput: CmsEditorBlockResolverInput, facade: Readonly<{ capability: "cms-editor-block-resolution" }>) => unknown)(callbackInput, Object.freeze({ capability: "cms-editor-block-resolution" }));
      } catch {
        return pluginHostError("PLUGIN_CALLBACK_FAILED", wanted.id, editorDetail(wanted.id, evidence.entryId, "callback-fault"));
      }
      // Callback 回傳的 native promise 一律被拒絕；未觀察的 rejection 會以 raw exception 逸出 host 的 sanitized diagnostic boundary。
      if (nativePromise(output)) observeRejectedPromise(output);
      if (thenable(output) || !exact(output, ["contract", "block"]) || output.contract !== "cms-editor-block-output/v1") return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", wanted.id, editorDetail(wanted.id, evidence.entryId, "invalid-result"));
      const resolved = json((output as CmsEditorBlockResolverOutput).block);
      if (resolved === null) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", wanted.id, editorDetail(wanted.id, evidence.entryId, "invalid-result"));
      return { ok: true, value: Object.freeze({ status: "active", source: evidence, output: resolved.value, outputBytes: resolved.bytes, outputDigest: resolved.digest, activeStateDigest: afterModule.value.digest }) };
    });
  }

  resolveActivePublicRenderers(): Promise<PluginHostResult<readonly ActivePublicPluginRenderer[]>> {
    return this.serial(async () => {
      const current = await this.state();
      if (!current.ok) return current;
      const validated = await this.validateActiveEvidence(current.value);
      if (!validated.ok) return validated;
      const sources: ActivePublicPluginRenderer[] = [];
      for (const identity of validated.value.state.active) {
        const lookup = await installed(this.roots, identity.id);
        if (lookup.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
        if (lookup.status === "source-missing") return pluginHostError("ACTIVE_PLUGIN_SOURCE_MISSING", identity.id);
        if (lookup.status !== "available" || !same(identity, evidenceIdentity(lookup.value)!)) return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", identity.id);
        const callbacks = lookup.value.manifest.callbacks.filter((callback): callback is Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }> => callback.hook === "public/block/render" || callback.hook === "public/assets/emit");
        if (callbacks.length === 0) continue;
        sources.push(Object.freeze({
          identity: Object.freeze({ ...identity, capabilities: Object.freeze([...identity.capabilities]) }),
          activeStateDigest: validated.value.digest,
          entryBytes: copyBytes(lookup.value.entryBytes),
          resources: Object.freeze(lookup.value.resources.map((resource) => Object.freeze({ file: resource.file, bytes: copyBytes(resource.bytes), digest: resource.digest }))),
          callbacks: Object.freeze(callbacks.map((callback) => Object.freeze({ ...callback }))),
        }));
      }
      return Object.freeze({ ok: true, value: Object.freeze(sources) });
    });
  }

  getSettingsSnapshot(): Promise<PluginHostResult<Readonly<{ state: PluginSettingsState; digest: Digest }>>> {
    return this.serial(async () => this.settingsState());
  }

  replaceSettings(input: Readonly<{ identity: PluginActivationIdentity; expectedSettingsStateDigest: Digest; settingsContract: "seo-plugin-settings/v1"; settings: SeoPluginSettingsV1 }>): Promise<PluginHostResult<Readonly<{ state: PluginSettingsState; digest: Digest }>>> {
    return this.serial(async () => {
      if (!exact(input, ["identity", "expectedSettingsStateDigest", "settingsContract", "settings"]) || typeof input.expectedSettingsStateDigest !== "string" || !isDigest(input.expectedSettingsStateDigest) || input.settingsContract !== "seo-plugin-settings/v1") return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const wanted = identity(input.identity);
      const nextSettings = settings(input.settings);
      if (wanted === null || nextSettings === null || input.settingsContract !== nextSettings.contract) return pluginHostError("INVALID_PLUGIN_SETTINGS");
      const active = await this.state();
      if (!active.ok) return active;
      if (!active.value.state.active.some((entry) => same(entry, wanted))) return pluginHostError("PLUGIN_SETTINGS_MISMATCH", wanted.id);
      const current = await this.settingsState();
      if (!current.ok) return current;
      if (current.value.digest !== input.expectedSettingsStateDigest) return pluginHostError("PLUGIN_SETTINGS_STATE_CONFLICT");
      const bytes = canonicalJsonBytes(nextSettings);
      if (!bytes.ok) return pluginHostError("INVALID_PLUGIN_SETTINGS", wanted.id);
      const record: PluginSettingsRecord = Object.freeze({ identity: wanted, settingsContract: "seo-plugin-settings/v1", settings: nextSettings, settingsDigest: sha256Digest(bytes.value) });
      const next: PluginSettingsState = Object.freeze({ contract: "plugin-settings-state/v1", records: Object.freeze([...current.value.state.records.filter((item) => item.identity.id !== wanted.id), record].sort((left, right) => compareCodeUnits(left.identity.id, right.identity.id))) });
      try {
        if (!(await this.settingsPort!.compareAndReplace({ expectedDigest: current.value.digest, nextState: next }))) return pluginHostError("PLUGIN_SETTINGS_STATE_CONFLICT");
      } catch { return pluginHostError("PLUGIN_SETTINGS_STATE_FAILURE"); }
      const nextDigest = settingsDigest(next);
      return nextDigest === null ? pluginHostError("PLUGIN_SETTINGS_STATE_FAILURE") : { ok: true, value: Object.freeze({ state: next, digest: nextDigest }) };
    });
  }

  analyzeCmsSeo(input: Readonly<{ entryId: string; schemaIdentity: Readonly<{ schemaId: string; version: number }>; content: JsonValue; route: string }>): Promise<PluginHostResult<PluginSeoAnalysisResult>> {
    return this.serial(async () => {
      if (!exact(input, ["entryId", "schemaIdentity", "content", "route"]) || typeof input.entryId !== "string" || typeof input.route !== "string" || !exact(input.schemaIdentity, ["schemaId", "version"]) || typeof input.schemaIdentity.schemaId !== "string" || !Number.isSafeInteger(input.schemaIdentity.version) || json(input.content) === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const active = await this.state();
      const configured = await this.settingsState();
      if (!active.ok) return active;
      if (!configured.ok) return configured;
      const outputs: Readonly<{ output: CmsSeoAnalysisOutputV1; identity: PluginActivationIdentity; priority: number; inputDigest: Digest; outputDigest: Digest; settingsDigest: Digest; settings: SeoPluginSettingsV1 }>[] = [];
      const diagnostics: PluginHostFailure[] = [];
      for (const entry of active.value.state.active) {
        const declaration = await installed(this.roots, entry.id);
        const installedIdentity = declaration.status === "available" ? evidenceIdentity(declaration.value) : null;
        if (declaration.status !== "available" || installedIdentity === null || !same(entry, installedIdentity)) {
          const latched = await this.latchReactivation(active.value, [entry]);
          if (!latched.ok) return latched;
          diagnostics.push(pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", entry.id));
          continue;
        }
        const callback = declaration.value.manifest.callbacks.find((item) => item.hook === "cms/seo/analyze");
        if (callback === undefined) continue;
        const record = configured.value.state.records.find((item) => same(item.identity, entry));
        if (record === undefined) { diagnostics.push(pluginHostFailure("PLUGIN_SETTINGS_MISMATCH", entry.id)); continue; }
        const inputWithoutDigest: Omit<CmsSeoAnalysisInputV1, "inputDigest"> = { contract: "cms-seo-analysis-input/v1", entryId: input.entryId, schemaIdentity: input.schemaIdentity, content: input.content, route: input.route, settings: record.settings };
        const inputBytes = canonicalJsonBytes(inputWithoutDigest);
        if (!inputBytes.ok) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
        const callbackInput: CmsSeoAnalysisInputV1 = Object.freeze({ ...inputWithoutDigest, inputDigest: sha256Digest(inputBytes.value) });
        const module = await loadVerifiedPluginModule({ entryBytes: declaration.value.entryBytes, manifestHash: declaration.value.manifestHash, callbacks: declaration.value.manifest.callbacks, pluginId: entry.id });
        if (!module.ok) { diagnostics.push(module.error); continue; }
        let returned: unknown;
        const frozenInput = json(callbackInput);
        if (frozenInput === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
        try { returned = (module.value.namespace[callback.exportName] as (value: CmsSeoAnalysisInputV1, facade: object) => unknown)(frozenInput.value as unknown as CmsSeoAnalysisInputV1, Object.freeze({ capability: "cms-seo-analysis" })); } catch { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_FAILED", entry.id)); continue; }
        if (nativePromise(returned)) observeRejectedPromise(returned);
        if (thenable(returned)) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", entry.id)); continue; }
        const output = cmsSeoOutput(returned);
        if (output === null) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", entry.id)); continue; }
        outputs.push(Object.freeze({ output: output.output, identity: entry, priority: callback.priority, inputDigest: callbackInput.inputDigest, outputDigest: output.digest, settingsDigest: record.settingsDigest, settings: record.settings }));
      }
      if (outputs.length !== 1) return outputs.length > 1 ? { ok: true, value: Object.freeze({ status: "unavailable", diagnostics: Object.freeze([pluginHostFailure("SEO_ANALYSIS_CONFLICT")]) }) } : { ok: true, value: Object.freeze({ status: "unavailable", diagnostics: Object.freeze(diagnostics) }) };
      const result = outputs[0]!;
      return { ok: true, value: Object.freeze({ status: "available", preview: result.output.preview, suggestions: Object.freeze([...result.output.suggestions]), producers: Object.freeze([Object.freeze({ identity: result.identity, hook: "cms/seo/analyze", priority: result.priority, inputDigest: result.inputDigest, outputDigest: result.outputDigest, settingsDigest: result.settingsDigest })]), settings: result.settings, settingsDigest: result.settingsDigest }) };
    });
  }
  resolvePublicBuildSnapshot(input: ResolvePublicBuildSnapshotInput): Promise<PluginHostResult<PreparedPublicBuildSnapshot>> {
    return this.serial(async () => {
      const request = publicInput(input);
      if (request === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const activation = await this.state();
      const configured = await this.settingsState();
      if (!activation.ok) return activation;
      if (!configured.ok) return configured;

      const sources: ActivePublicPluginRenderer[] = [];
      const pageContributions: PublicSeoContributionRecord<PublicSeoPageContributionV1>[] = [];
      const siteContributions: PublicSeoContributionRecord<PublicSeoSiteContributionV1>[] = [];
      const diagnostics: PluginHostFailure[] = [];
      for (const identity of activation.value.state.active) {
        const lookup = await installed(this.roots, identity.id);
        const actual = lookup.status === "available" ? evidenceIdentity(lookup.value) : null;
        if (lookup.status !== "available" || actual === null || !same(identity, actual)) {
          const latched = await this.latchReactivation(activation.value, [identity]);
          if (!latched.ok) return latched;
          diagnostics.push(pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", identity.id));
          continue;
        }
        const rendererCallbacks = lookup.value.manifest.callbacks.filter((callback): callback is Readonly<{ hook: "public/block/render" | "public/assets/emit"; exportName: string; priority: number }> => callback.hook === "public/block/render" || callback.hook === "public/assets/emit");
        if (rendererCallbacks.length > 0) {
          sources.push(Object.freeze({ identity: Object.freeze({ ...identity, capabilities: Object.freeze([...identity.capabilities]) }), activeStateDigest: activation.value.digest, entryBytes: copyBytes(lookup.value.entryBytes), resources: Object.freeze(lookup.value.resources.map((resource) => Object.freeze({ file: resource.file, bytes: copyBytes(resource.bytes), digest: resource.digest }))), callbacks: Object.freeze(rendererCallbacks.map((callback) => Object.freeze({ ...callback }))) }));
        }
        const page = lookup.value.manifest.callbacks.find((callback) => callback.hook === "public/seo/page");
        const site = lookup.value.manifest.callbacks.find((callback) => callback.hook === "public/seo/site");
        if (page === undefined && site === undefined) continue;
        const record = configured.value.state.records.find((candidate) => same(candidate.identity, identity));
        if (record === undefined) { diagnostics.push(pluginHostFailure("PLUGIN_SETTINGS_MISMATCH", identity.id)); continue; }
        const loaded = await loadVerifiedPluginModule({ entryBytes: lookup.value.entryBytes, manifestHash: lookup.value.manifestHash, callbacks: lookup.value.manifest.callbacks, pluginId: identity.id });
        if (!loaded.ok) { diagnostics.push(loaded.error); continue; }
        if (page !== undefined) {
          for (const published of request.published) {
            const withoutDigest = { contract: "public-seo-page-input/v1" as const, entryId: published.entryId, revisionId: published.revisionId, schemaIdentity: published.schemaIdentity, route: published.route, content: published.content, settings: record.settings };
            const bytes = canonicalJsonBytes(withoutDigest);
            if (!bytes.ok) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT", identity.id);
            const callbackInput = Object.freeze({ ...withoutDigest, inputDigest: sha256Digest(bytes.value) });
            let returned: unknown;
            try { returned = (loaded.value.namespace[page.exportName] as (value: typeof callbackInput, facade: Readonly<{ capability: "public-seo-page-contribution" }>) => unknown)(json(callbackInput)!.value as unknown as typeof callbackInput, Object.freeze({ capability: "public-seo-page-contribution" })); } catch { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_FAILED", identity.id)); continue; }
            if (nativePromise(returned)) observeRejectedPromise(returned);
            if (thenable(returned)) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", identity.id)); continue; }
            const output = publicPageContribution(returned, published);
            if (output === null) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", identity.id)); continue; }
            const evidence: PublicSeoEvidence = Object.freeze({ identity, hook: "public/seo/page", priority: page.priority, inputDigest: callbackInput.inputDigest, outputDigest: output.digest, settingsContract: record.settingsContract, settingsDigest: record.settingsDigest });
            pageContributions.push(Object.freeze({ evidence, contribution: output.contribution }));
          }
        }
        if (site !== undefined) {
          const routes = request.published.map((published) => Object.freeze({ entryId: published.entryId, revisionId: published.revisionId, route: published.route }));
          const withoutDigest = { contract: "public-seo-site-input/v1" as const, routes: Object.freeze(routes), settings: record.settings };
          const bytes = canonicalJsonBytes(withoutDigest);
          if (!bytes.ok) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT", identity.id);
          const callbackInput = Object.freeze({ ...withoutDigest, inputDigest: sha256Digest(bytes.value) });
          let returned: unknown;
          try { returned = (loaded.value.namespace[site.exportName] as (value: typeof callbackInput, facade: Readonly<{ capability: "public-seo-site-contribution" }>) => unknown)(json(callbackInput)!.value as unknown as typeof callbackInput, Object.freeze({ capability: "public-seo-site-contribution" })); } catch { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_FAILED", identity.id)); continue; }
          if (nativePromise(returned)) observeRejectedPromise(returned);
          if (thenable(returned)) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", identity.id)); continue; }
          const output = publicSiteContribution(returned, record.settings.indexing);
          if (output === null) { diagnostics.push(pluginHostFailure("PLUGIN_CALLBACK_RESULT_INVALID", identity.id)); continue; }
          const evidence: PublicSeoEvidence = Object.freeze({ identity, hook: "public/seo/site", priority: site.priority, inputDigest: callbackInput.inputDigest, outputDigest: output.digest, settingsContract: record.settingsContract, settingsDigest: record.settingsDigest });
          siteContributions.push(Object.freeze({ evidence, contribution: output.contribution }));
        }
      }
      const renderers = Object.freeze(sources.sort((left, right) => compareCodeUnits(left.identity.id, right.identity.id)));
      const rendererEvidence = Object.freeze(renderers.map((renderer) => Object.freeze({ identity: renderer.identity, entryDigest: sha256Digest(renderer.entryBytes), callbacks: Object.freeze([...renderer.callbacks].sort((left, right) => left.priority - right.priority || compareCodeUnits(left.hook, right.hook) || compareCodeUnits(left.exportName, right.exportName))), resources: Object.freeze(renderer.resources.map((resource) => Object.freeze({ file: resource.file, digest: resource.digest })).sort((left, right) => compareCodeUnits(left.file, right.file))) })));
      pageContributions.sort((left, right) => left.evidence.priority - right.evidence.priority || compareCodeUnits(left.evidence.identity.id, right.evidence.identity.id) || compareCodeUnits(left.contribution.route, right.contribution.route));
      siteContributions.sort((left, right) => left.evidence.priority - right.evidence.priority || compareCodeUnits(left.evidence.identity.id, right.evidence.identity.id));
      diagnostics.sort((left, right) => compareCodeUnits(`${left.code}\0${left.subjectIds.join("\0")}`, `${right.code}\0${right.subjectIds.join("\0")}`));
      const digestBase = { contract: "public-plugin-build-snapshot/v1" as const, activationStateDigest: activation.value.digest, settingsStateDigest: configured.value.digest, publicRendererEvidence: rendererEvidence, pageContributions, siteContributions, diagnostics };
      const bytes = canonicalJsonBytes(digestBase);
      if (!bytes.ok) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT");
      const snapshot: PublicPluginBuildSnapshotV1 = Object.freeze({ ...digestBase, publicRenderers: renderers, snapshotDigest: sha256Digest(bytes.value) });
      const token = Object.freeze({ snapshot, __publicSnapshotToken: Symbol("public-plugin-build") }) as unknown as PreparedPublicBuildSnapshot;
      this.#publicPrepared.set(token, Object.freeze({ activationDigest: activation.value.digest, settingsDigest: configured.value.digest }));
      return { ok: true, value: token };
    });
  }

  validatePublicBuildSnapshot(token: PreparedPublicBuildSnapshot): Promise<PluginHostResult<true>> {
    return this.serial(async () => {
      const prepared = this.#publicPrepared.get(token);
      if (prepared === undefined) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT");
      this.#publicPrepared.delete(token);
      const activation = await this.state();
      const configured = await this.settingsState();
      if (!activation.ok) return activation;
      if (!configured.ok) return configured;
      return activation.value.digest === prepared.activationDigest && configured.value.digest === prepared.settingsDigest
        ? { ok: true, value: true }
        : pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT");
    });
  }
  prepareSaveRevisionValidators(input: Readonly<{ entryId: string }>): Promise<PluginHostResult<PreparedSaveRevisionValidators>> {
    return this.serial(async () => {
      if (!exact(input, ["entryId"]) || typeof input.entryId !== "string") return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const current = await this.state();
      if (!current.ok) return current;
      if (current.value.state.reactivationRequired.length > 0) return pluginHostError("ACTIVE_PLUGIN_REACTIVATION_REQUIRED", current.value.state.reactivationRequired[0]!.id);
      if (!(await revalidateTrustedRoots(this.roots))) return pluginHostError("INVALID_TRUSTED_ROOT");

      const verified: Readonly<{ identity: PluginActivationIdentity; item: Installed; declaration: PluginManifestV1["callbacks"][number] | undefined }>[] = [];
      for (const entry of current.value.state.active) {
        const lookup = await installed(this.roots, entry.id);
        if (lookup.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
        if (lookup.status === "source-missing") return pluginHostError("ACTIVE_PLUGIN_SOURCE_MISSING", entry.id);
        if (lookup.status === "evidence-mismatch") return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", entry.id);
        const actual = evidenceIdentity(lookup.value);
        if (actual === null || !same(entry, actual)) return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", entry.id);
        verified.push(Object.freeze({ identity: entry, item: lookup.value, declaration: lookup.value.manifest.callbacks.find((candidate) => candidate.hook === "save-revision/validate") }));
      }

      const callbacks: Prepared["callbacks"][number][] = [];
      for (const record of verified) {
        if (record.declaration === undefined) continue;
        const loaded = await loadVerifiedPluginModule({ entryBytes: record.item.entryBytes, manifestHash: record.item.manifestHash, callbacks: record.item.manifest.callbacks, pluginId: record.identity.id });
        if (!loaded.ok) return loaded;
        callbacks.push(Object.freeze({ identity: record.identity, priority: record.declaration.priority, callback: loaded.value.namespace[record.declaration.exportName] as (validatorInput: unknown, facade: unknown) => unknown }));
      }
      callbacks.sort((left, right) => left.priority - right.priority || compareCodeUnits(left.identity.id, right.identity.id));
      const token = Object.freeze({ activeStateDigest: current.value.digest, __pluginOperationToken: Symbol("plugin-operation") }) as unknown as PreparedSaveRevisionValidators;
      this.#prepared.set(token, Object.freeze({ entryId: input.entryId, digest: current.value.digest, callbacks: Object.freeze(callbacks) }));
      return { ok: true, value: token };
    });
  }

  runPreparedSaveRevisionValidators(token: PreparedSaveRevisionValidators, input: SaveRevisionValidatorInput, guard: SaveRevisionContentGuard): PluginHostResult<ValidatedSaveRevisionContent> {
    const prepared = this.#prepared.get(token);
    if (prepared === undefined) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT");
    this.#prepared.delete(token);
    if (prepared.entryId !== input.entryId) return pluginHostError("INVALID_PLUGIN_OPERATION_SNAPSHOT");

    const schemaIdentity = json(input.schemaIdentity);
    let content = json(input.content);
    if (schemaIdentity === null || content === null) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID");
    for (const item of prepared.callbacks) {
      let output: unknown;
      try {
        output = item.callback(Object.freeze({ contract: input.contract, entryId: input.entryId, revisionId: input.revisionId, schemaIdentity: schemaIdentity.value, content: content.value }), Object.freeze({ capability: "save-revision-validator" }));
      } catch {
        return pluginHostError("PLUGIN_CALLBACK_FAILED", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "callback-fault"));
      }
      if (nativePromise(output)) {
        observeRejectedPromise(output);
        return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
      }

      const rejected = outputValues(output, ["contract", "decision"]);
      if (rejected !== null) {
        if (rejected[0] !== "save-revision-validator-output/v1" || rejected[1] !== "reject") return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
        return pluginHostError("PLUGIN_VALIDATION_REJECTED", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "rejected"));
      }
      const accepted = outputValues(output, ["contract", "decision", "replacement"]);
      if (accepted === null || accepted[0] !== "save-revision-validator-output/v1" || accepted[1] !== "accept") return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
      const replacement = outputValues(accepted[2], ["content"]);
      if (replacement === null) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
      content = json(replacement[0]);
      if (content === null) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
      try {
        if (guard({ contentBytes: copyBytes(content.bytes), contentDigest: content.digest }).ok !== true) return pluginHostError("PLUGIN_CALLBACK_RESULT_INVALID", item.identity.id, validatorDetail(item.identity.id, prepared.entryId, "invalid-result"));
      } catch {
        return pluginHostError("PLUGIN_VALIDATION_SERVICE_FAILED");
      }
    }
    return { ok: true, value: Object.freeze({ content: content.value, contentBytes: content.bytes, contentDigest: content.digest, activeStateDigest: prepared.digest }) };
  }

  private async validateActiveEvidence(current: State): Promise<PluginHostResult<State>> {
    const drift: Readonly<{ identity: PluginActivationIdentity; code: "ACTIVE_PLUGIN_SOURCE_MISSING" | "ACTIVE_PLUGIN_IDENTITY_MISMATCH" }>[] = [];
    for (const entry of current.state.active) {
      const item = await installed(this.roots, entry.id);
      if (item.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
      if (item.status === "source-missing") {
        drift.push(Object.freeze({ identity: entry, code: "ACTIVE_PLUGIN_SOURCE_MISSING" }));
        continue;
      }
      if (item.status === "evidence-mismatch") {
        drift.push(Object.freeze({ identity: entry, code: "ACTIVE_PLUGIN_IDENTITY_MISMATCH" }));
        continue;
      }
      const actual = evidenceIdentity(item.value);
      if (actual === null || !same(entry, actual)) {
        drift.push(Object.freeze({ identity: entry, code: "ACTIVE_PLUGIN_IDENTITY_MISMATCH" }));
        continue;
      }
    }
    if (drift.length > 0) {
      const latched = await this.latchReactivation(current, drift.map((item) => item.identity));
      if (!latched.ok) return latched;
      const first = [...drift].sort((left, right) => compareCodeUnits(left.identity.id, right.identity.id))[0]!;
      return pluginHostError(first.code, first.identity.id);
    }
    const fresh = await this.state();
    if (!fresh.ok) return fresh;
    if (fresh.value.digest !== current.digest) return pluginHostError("ACTIVATION_STATE_CONFLICT");
    if (fresh.value.state.reactivationRequired.length > 0) return pluginHostError("ACTIVE_PLUGIN_REACTIVATION_REQUIRED", fresh.value.state.reactivationRequired[0]!.id);
    return { ok: true, value: fresh.value };
  }

  private async settingsState(): Promise<Readonly<{ ok: true; value: Readonly<{ state: PluginSettingsState; digest: Digest }> }> | Readonly<{ ok: false; error: PluginHostFailure }>> {
    if (this.settingsPort === undefined) return pluginHostError("PLUGIN_SETTINGS_STATE_FAILURE");
    try {
      const state = settingsState(await this.settingsPort.read());
      const stateDigest = state === null ? null : settingsDigest(state);
      return state === null || stateDigest === null ? pluginHostError("PLUGIN_SETTINGS_STATE_FAILURE") : { ok: true, value: Object.freeze({ state, digest: stateDigest }) };
    } catch {
      return pluginHostError("PLUGIN_SETTINGS_STATE_FAILURE");
    }
  }

  private async state(): Promise<Readonly<{ ok: true; value: State }> | Readonly<{ ok: false; error: PluginHostFailure }>> {
    try {
      const activationState = parseState(await this.port.read());
      const stateDigest = activationState === null ? null : digest(activationState);
      return activationState === null || stateDigest === null ? pluginHostError("ACTIVATION_STATE_FAILURE") : { ok: true, value: Object.freeze({ state: activationState, digest: stateDigest }) };
    } catch {
      return pluginHostError("ACTIVATION_STATE_FAILURE");
    }
  }

  private async replace(current: State, next: PluginActivationState): Promise<PluginHostResult<ActivePluginSnapshot>> {
    try {
      if (!(await this.port.compareAndReplace({ expectedDigest: current.digest, nextState: next }))) return pluginHostError("ACTIVATION_STATE_CONFLICT");
      const nextDigest = digest(next);
      return nextDigest === null ? pluginHostError("ACTIVATION_STATE_FAILURE") : { ok: true, value: snapshot(next, nextDigest) };
    } catch {
      return pluginHostError("ACTIVATION_STATE_FAILURE");
    }
  }

  private async latchReactivation(current: State, identities: readonly PluginActivationIdentity[]): Promise<PluginHostResult<State>> {
    const ids = new Set(identities.map((item) => item.id));
    const moved = current.state.active.filter((item) => ids.has(item.id));
    if (moved.length === 0) return { ok: true, value: current };
    const next: PluginActivationState = Object.freeze({
      contract: "plugin-activation-state/v2",
      active: ordered(current.state.active.filter((item) => !ids.has(item.id))),
      reactivationRequired: ordered([...current.state.reactivationRequired, ...moved]),
    });
    try {
      if (!(await this.port.compareAndReplace({ expectedDigest: current.digest, nextState: next }))) return pluginHostError("ACTIVATION_STATE_CONFLICT");
      const nextDigest = digest(next);
      return nextDigest === null ? pluginHostError("ACTIVATION_STATE_FAILURE") : { ok: true, value: Object.freeze({ state: next, digest: nextDigest }) };
    } catch {
      return pluginHostError("ACTIVATION_STATE_FAILURE");
    }
  }

  private async serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#queue;
    let release: () => void = () => {};
    this.#queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export async function createPluginHost(input: CreatePluginHostInput): Promise<PluginHostResult<PluginHost>> {
  if (input === null || typeof input !== "object" || typeof input.activationState?.read !== "function" || typeof input.activationState?.compareAndReplace !== "function" || typeof input.settingsState?.read !== "function" || typeof input.settingsState?.compareAndReplace !== "function") return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
  const roots = await validateTrustedRoots(input);
  return roots === null ? pluginHostError("INVALID_TRUSTED_ROOT") : { ok: true, value: new Host(roots, input.activationState, input.settingsState) };
}
