import { readFile } from "node:fs/promises";

import { canonicalJsonBytes, copyBytes, isDigest, sha256Digest, type Digest, type JsonValue } from "../foundation/index.js";
import type { ActivePluginSnapshot, CmsEditorBlockResolution, CmsEditorBlockSource, CmsEditorBlockSourceEvidence, CmsEditorBlockResolverInput, CmsEditorBlockResolverOutput, CreatePluginHostInput, PluginActivationIdentity, PluginActivationState, PluginDiscoveryReport, PluginHost, PluginHostResult, PluginManifestV1, PreparedSaveRevisionValidators, SaveRevisionContentGuard, SaveRevisionValidatorInput, ValidatedSaveRevisionContent } from "./contracts.js";
import { isCanonicalPluginId, pluginHostError, pluginHostFailure, type PluginDiagnosticDetail, type PluginHostFailure } from "./failures.js";
import { isExactSemver, readManifest } from "./manifest.js";
import { loadVerifiedPluginModule } from "./module-loader.js";
import { compareCodeUnits } from "./ordering.js";
import { installedPluginDirectories, resolvePluginDirectory, resolvePluginFile, revalidateTrustedRoots, type TrustedRoots, validateTrustedRoots } from "./trusted-root.js";

type Installed = Readonly<{ manifest: PluginManifestV1; manifestHash: Digest; entryBytes: Uint8Array }>;
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

export function validatePluginActivationIdentity(value: unknown): PluginHostResult<PluginActivationIdentity> {
  if (!exact(value, ["id", "version", "hookContract", "manifestHash"]) || !isCanonicalPluginId(value.id) || typeof value.version !== "string" || !isExactSemver(value.version) || value.hookContract !== "plugin-hooks/v1" || typeof value.manifestHash !== "string" || !isDigest(value.manifestHash)) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
  return { ok: true, value: Object.freeze({ id: value.id, version: value.version, hookContract: value.hookContract, manifestHash: value.manifestHash }) };
}

function identity(value: unknown): PluginActivationIdentity | null {
  const validated = validatePluginActivationIdentity(value);
  return validated.ok ? validated.value : null;
}

function same(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.hookContract === right.hookContract && left.manifestHash === right.manifestHash;
}

function ordered(values: readonly PluginActivationIdentity[]): readonly PluginActivationIdentity[] {
  return Object.freeze([...values].map((item) => Object.freeze({ ...item })).sort((left, right) => compareCodeUnits(left.id, right.id)));
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
  return identity({ id: item.manifest.id, version: item.manifest.version, hookContract: item.manifest.hookContract, manifestHash: item.manifestHash });
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
  return Object.freeze({ pluginId, hook: "cms/editor-block/resolve", capability: "cms-editor-block-resolution", entryId, cause });
}

function validatorDetail(pluginId: string, entryId: string, cause: "rejected" | "invalid-result" | "callback-fault"): PluginDiagnosticDetail {
  return Object.freeze({ pluginId, hook: "save-revision/validate", capability: "save-revision-validator", entryId, cause });
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
          } catch {
            failure = "evidence-mismatch";
            break;
          }
        }
        result = failure === null && entryBytes !== null
          ? Object.freeze({ status: "available", value: Object.freeze({ manifest: parsed.value.manifest, manifestHash: parsed.value.manifestHash, entryBytes }) })
          : Object.freeze({ status: failure ?? "evidence-mismatch" });
      }
    }
  }
  return (await revalidateTrustedRoots(roots)) ? result : Object.freeze({ status: "invalid-root" });
}

class Host implements PluginHost {
  #queue = Promise.resolve();
  #prepared = new WeakMap<PreparedSaveRevisionValidators, Prepared>();

  constructor(private readonly roots: TrustedRoots, private readonly port: CreatePluginHostInput["activationState"]) {}

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

  activate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      const wanted = identity(input?.identity);
      if (wanted === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      const current = await this.state();
      if (!current.ok) return current;
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

  deactivate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      const wanted = identity(input?.identity);
      const current = await this.state();
      if (wanted === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
      if (!current.ok) return current;
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
  inspectActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serial(async () => {
      const current = await this.state();
      if (!current.ok) return current;
      if (current.value.state.reactivationRequired.length > 0) return pluginHostError("ACTIVE_PLUGIN_REACTIVATION_REQUIRED", current.value.state.reactivationRequired[0]!.id);
      for (const entry of current.value.state.active) {
        const lookup = await installed(this.roots, entry.id);
        if (lookup.status === "invalid-root") return pluginHostError("INVALID_TRUSTED_ROOT");
        if (lookup.status === "source-missing") return pluginHostError("ACTIVE_PLUGIN_SOURCE_MISSING", entry.id);
        if (lookup.status !== "available") return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", entry.id);
        const actual = evidenceIdentity(lookup.value);
        if (actual === null || !same(entry, actual)) return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", entry.id);
      }
      const after = await this.state();
      if (!after.ok) return after;
      return after.value.digest === current.value.digest ? { ok: true, value: snapshot(after.value.state, after.value.digest) } : pluginHostError("ACTIVATION_STATE_CONFLICT");
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
  if (input === null || typeof input !== "object" || typeof input.activationState?.read !== "function" || typeof input.activationState?.compareAndReplace !== "function") return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
  const roots = await validateTrustedRoots(input);
  return roots === null ? pluginHostError("INVALID_TRUSTED_ROOT") : { ok: true, value: new Host(roots, input.activationState) };
}
