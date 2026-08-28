import { readFile } from "node:fs/promises";

import { canonicalJsonBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import type {
  ActivePluginSnapshot,
  CreatePluginHostInput,
  PluginActivationIdentity,
  PluginActivationState,
  PluginCandidate,
  PluginDiscoveryReport,
  PluginHost,
  PluginHostResult,
  PluginManifestV1,
} from "./contracts.js";
import { isCanonicalPluginId, pluginHostError, pluginHostFailure, type PluginHostFailure } from "./failures.js";
import { isExactSemver, readManifest } from "./manifest.js";
import { loadVerifiedPluginModule } from "./module-loader.js";
import { compareCodeUnits } from "./ordering.js";
import {
  installedPluginDirectories,
  resolvePluginDirectory,
  resolvePluginFile,
  type TrustedRoots,
  validateTrustedRoots,
} from "./trusted-root.js";

type InstalledManifest = Readonly<{
  directory: string;
  manifest: PluginManifestV1;
  manifestHash: Digest;
}>;

type VerifiedPlugin = InstalledManifest & Readonly<{ entryRealpath: string }>;

type StateRead = Readonly<{ ok: true; state: PluginActivationState; digest: Digest }> | Readonly<{ ok: false; error: PluginHostFailure }>;
type InstalledRead = Readonly<{ ok: true; value: InstalledManifest }> | Readonly<{ ok: false; error: PluginHostFailure }>;
type Verification = Readonly<{ ok: true; value: VerifiedPlugin }> | Readonly<{ ok: false; error: PluginHostFailure }>;

function frozenIdentity(value: PluginActivationIdentity): PluginActivationIdentity {
  return Object.freeze({ id: value.id, version: value.version, hookContract: value.hookContract, manifestHash: value.manifestHash });
}

function stateDigest(identities: readonly PluginActivationIdentity[]): Digest | null {
  const canonical = canonicalJsonBytes({ contract: "plugin-activation-state/v1", identities });
  return canonical.ok ? sha256Digest(canonical.value) : null;
}

function identityEqual(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.hookContract === right.hookContract && left.manifestHash === right.manifestHash;
}

function exactIdentity(value: unknown): PluginActivationIdentity | null {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== 4 || !["id", "version", "hookContract", "manifestHash"].every((key) => keys.includes(key))) return null;
  if (!keys.every((key) => "value" in (descriptors[key] ?? {}))) return null;
  const id = descriptors.id?.value;
  const version = descriptors.version?.value;
  const hookContract = descriptors.hookContract?.value;
  const manifestHash = descriptors.manifestHash?.value;
  if (!isCanonicalPluginId(id) || typeof version !== "string" || !isExactSemver(version) || hookContract !== "plugin-hooks/v1" || typeof manifestHash !== "string" || !isDigest(manifestHash)) return null;
  return frozenIdentity({ id, version, hookContract, manifestHash });
}

function activationState(value: unknown): PluginActivationState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== 2 || !("contract" in descriptors) || !("identities" in descriptors)) return null;
  if (!("value" in descriptors.contract) || !("value" in descriptors.identities) || descriptors.contract.value !== "plugin-activation-state/v1" || !Array.isArray(descriptors.identities.value)) return null;
  const identities = descriptors.identities.value.map(exactIdentity);
  if (identities.some((identity) => identity === null)) return null;
  const copied = identities as PluginActivationIdentity[];
  if (new Set(copied.map((identity) => identity.id)).size !== copied.length) return null;
  if (copied.some((identity, index) => index > 0 && compareCodeUnits(copied[index - 1]!.id, identity.id) >= 0)) return null;
  return Object.freeze({ contract: "plugin-activation-state/v1", identities: Object.freeze(copied) });
}

function snapshot(state: PluginActivationState, digest: Digest): ActivePluginSnapshot {
  return Object.freeze({ identities: Object.freeze(state.identities.map(frozenIdentity)), digest });
}

function identityFor(installed: InstalledManifest): PluginActivationIdentity {
  return frozenIdentity({
    id: installed.manifest.id,
    version: installed.manifest.version,
    hookContract: installed.manifest.hookContract,
    manifestHash: installed.manifestHash,
  });
}

async function readInstalledManifest(roots: TrustedRoots, pluginId: string): Promise<InstalledRead> {
  const directory = await resolvePluginDirectory(roots, pluginId);
  if (directory === null) return { ok: false, error: pluginHostFailure("INVALID_PLUGIN_MANIFEST", pluginId) };
  const manifestPath = await resolvePluginFile(directory, "plugin-manifest.json");
  if (manifestPath === null) return { ok: false, error: pluginHostFailure("INVALID_PLUGIN_MANIFEST", pluginId) };
  const parsed = await readManifest(manifestPath, pluginId);
  if (!parsed.ok) return parsed;
  return Object.freeze({ ok: true, value: Object.freeze({ directory, manifest: parsed.value.manifest, manifestHash: parsed.value.manifestHash }) });
}

async function verifyEvidence(installed: InstalledManifest): Promise<Verification> {
  const entryRealpath = await resolvePluginFile(installed.directory, installed.manifest.entry.file);
  if (entryRealpath === null) return { ok: false, error: pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", installed.manifest.id) };
  const declared = [installed.manifest.entry, ...installed.manifest.resources];
  for (const item of declared) {
    const resolved = await resolvePluginFile(installed.directory, item.file);
    if (resolved === null) return { ok: false, error: pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", installed.manifest.id) };
    try {
      if (sha256Digest(await readFile(resolved)) !== item.digest) return { ok: false, error: pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", installed.manifest.id) };
    } catch {
      return { ok: false, error: pluginHostFailure("PLUGIN_EVIDENCE_MISMATCH", installed.manifest.id) };
    }
  }
  return Object.freeze({ ok: true, value: Object.freeze({ ...installed, entryRealpath }) });
}

async function discovery(roots: TrustedRoots): Promise<PluginHostResult<PluginDiscoveryReport>> {
  let directories: readonly string[];
  try {
    directories = await installedPluginDirectories(roots);
  } catch {
    return pluginHostError("PLUGIN_DISCOVERY_FAILED");
  }
  const valid: PluginCandidate[] = [];
  const rejections: PluginHostFailure[] = [];
  for (const directory of directories) {
    if (!isCanonicalPluginId(directory)) {
      rejections.push(pluginHostFailure("INVALID_PLUGIN_MANIFEST"));
      continue;
    }
    const parsed = await readInstalledManifest(roots, directory);
    if (!parsed.ok) {
      rejections.push(parsed.error);
      continue;
    }
    valid.push(Object.freeze({
      id: parsed.value.manifest.id,
      version: parsed.value.manifest.version,
      hookContract: parsed.value.manifest.hookContract,
      capabilities: Object.freeze([...parsed.value.manifest.capabilities]),
      manifestHash: parsed.value.manifestHash,
    }));
  }
  const counts = new Map<string, number>();
  for (const candidate of valid) counts.set(candidate.id, (counts.get(candidate.id) ?? 0) + 1);
  const candidates = valid.filter((candidate) => counts.get(candidate.id) === 1).sort((left, right) => compareCodeUnits(left.id, right.id));
  for (const [id, count] of counts) if (count > 1) rejections.push(pluginHostFailure("PLUGIN_IDENTITY_CONFLICT", id));
  return Object.freeze({ ok: true, value: Object.freeze({ candidates: Object.freeze(candidates), rejections: Object.freeze(rejections) }) });
}

class PluginHostImplementation implements PluginHost {
  #operation = Promise.resolve();

  public constructor(
    private readonly roots: TrustedRoots,
    private readonly activationState: CreatePluginHostInput["activationState"],
  ) {}

  public async discover(): Promise<PluginHostResult<PluginDiscoveryReport>> {
    return discovery(this.roots);
  }

  public activate(input: Readonly<{ pluginId: string }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serialize(() => this.activateOnce(input));
  }

  public deactivate(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    return this.serialize(() => this.deactivateOnce(input));
  }

  public async getActiveSnapshot(): Promise<PluginHostResult<ActivePluginSnapshot>> {
    const current = await this.readState();
    if (!current.ok) return current;
    const verified: VerifiedPlugin[] = [];
    for (const active of current.state.identities) {
      const installed = await readInstalledManifest(this.roots, active.id);
      if (!installed.ok || !identityEqual(identityFor(installed.value), active)) return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", active.id);
      const evidence = await verifyEvidence(installed.value);
      if (!evidence.ok) return pluginHostError("ACTIVE_PLUGIN_IDENTITY_MISMATCH", active.id);
      verified.push(evidence.value);
    }
    for (const plugin of verified) {
      const loaded = await loadVerifiedPluginModule({
        entryRealpath: plugin.entryRealpath,
        manifestHash: plugin.manifestHash,
        callbacks: plugin.manifest.callbacks,
        pluginId: plugin.manifest.id,
      });
      if (!loaded.ok) return loaded;
    }
    return Object.freeze({ ok: true, value: snapshot(current.state, current.digest) });
  }

  private async activateOnce(input: Readonly<{ pluginId: string }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    if (!isCanonicalPluginId(input?.pluginId)) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
    const report = await discovery(this.roots);
    if (!report.ok) return report;
    const rejected = report.value.rejections.find((rejection) => rejection.code === "PLUGIN_IDENTITY_CONFLICT" && rejection.subjectIds[0] === input.pluginId);
    if (rejected !== undefined) return Object.freeze({ ok: false, error: rejected });
    if (!report.value.candidates.some((candidate) => candidate.id === input.pluginId)) {
      const invalid = report.value.rejections.find((rejection) => rejection.subjectIds[0] === input.pluginId);
      return invalid === undefined ? pluginHostError("PLUGIN_NOT_FOUND", input.pluginId) : Object.freeze({ ok: false, error: invalid });
    }
    const installed = await readInstalledManifest(this.roots, input.pluginId);
    if (!installed.ok) return installed;
    const evidence = await verifyEvidence(installed.value);
    if (!evidence.ok) return evidence;
    const current = await this.readState();
    if (!current.ok) return current;
    const identity = identityFor(installed.value);
    const sameId = current.state.identities.find((active) => active.id === identity.id);
    if (sameId !== undefined && !identityEqual(sameId, identity)) return pluginHostError("PLUGIN_IDENTITY_CONFLICT", identity.id);
    const loaded = await loadVerifiedPluginModule({
      entryRealpath: evidence.value.entryRealpath,
      manifestHash: installed.value.manifestHash,
      callbacks: installed.value.manifest.callbacks,
      pluginId: identity.id,
    });
    if (!loaded.ok) return loaded;
    if (sameId !== undefined) return Object.freeze({ ok: true, value: snapshot(current.state, current.digest) });
    const nextIdentities = Object.freeze([...current.state.identities, identity].sort((left, right) => compareCodeUnits(left.id, right.id)));
    const nextState: PluginActivationState = Object.freeze({ contract: "plugin-activation-state/v1", identities: nextIdentities });
    try {
      if (!(await this.activationState.compareAndReplace({ expectedDigest: current.digest, nextState }))) return pluginHostError("ACTIVATION_STATE_CONFLICT");
    } catch {
      return pluginHostError("ACTIVATION_STATE_FAILURE");
    }
    const nextDigest = stateDigest(nextIdentities);
    return nextDigest === null ? pluginHostError("ACTIVATION_STATE_FAILURE") : Object.freeze({ ok: true, value: snapshot(nextState, nextDigest) });
  }

  private async deactivateOnce(input: Readonly<{ identity: PluginActivationIdentity }>): Promise<PluginHostResult<ActivePluginSnapshot>> {
    const identity = exactIdentity(input?.identity);
    if (identity === null) return pluginHostError("INVALID_PLUGIN_HOST_INPUT");
    const current = await this.readState();
    if (!current.ok) return current;
    const active = current.state.identities.find((item) => item.id === identity.id);
    if (active === undefined || !identityEqual(active, identity)) return pluginHostError("PLUGIN_NOT_ACTIVE", identity.id);
    const nextIdentities = Object.freeze(current.state.identities.filter((item) => item.id !== identity.id).map(frozenIdentity));
    const nextState: PluginActivationState = Object.freeze({ contract: "plugin-activation-state/v1", identities: nextIdentities });
    try {
      if (!(await this.activationState.compareAndReplace({ expectedDigest: current.digest, nextState }))) return pluginHostError("ACTIVATION_STATE_CONFLICT");
    } catch {
      return pluginHostError("ACTIVATION_STATE_FAILURE");
    }
    const nextDigest = stateDigest(nextIdentities);
    return nextDigest === null ? pluginHostError("ACTIVATION_STATE_FAILURE") : Object.freeze({ ok: true, value: snapshot(nextState, nextDigest) });
  }

  private async readState(): Promise<StateRead> {
    let value: unknown;
    try {
      value = await this.activationState.read();
    } catch {
      return { ok: false, error: pluginHostFailure("ACTIVATION_STATE_FAILURE") };
    }
    const state = activationState(value);
    if (state === null) return { ok: false, error: pluginHostFailure("ACTIVATION_STATE_FAILURE") };
    const digest = stateDigest(state.identities);
    return digest === null ? { ok: false, error: pluginHostFailure("ACTIVATION_STATE_FAILURE") } : Object.freeze({ ok: true, state, digest });
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#operation;
    let release: () => void = () => undefined;
    this.#operation = new Promise<void>((resolve) => {
      release = resolve;
    });
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
  if (roots === null) return pluginHostError("INVALID_TRUSTED_ROOT");
  return Object.freeze({ ok: true, value: new PluginHostImplementation(roots, input.activationState) });
}
