import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue } from "../../../core/foundation/index.js";
import {
  createPluginHost,
  type PluginActivationIdentity,
  type PluginActivationState,
  type PluginActivationStatePort,
  type PluginManifestV1,
  type PluginHost,
  type PluginHostResult,
  type SaveRevisionContentGuard,
  type SaveRevisionValidatorInput,
} from "../../../core/plugin-host/index.js";

const repositoryRoot = process.cwd();
const templateRoot = path.join(repositoryRoot, "extensions", "plugins", "activation-probe");
const probeKey = "__pluginHostProbe";

type Fixture = Readonly<{ directory: string; installedRoot: string; pluginDirectory: string; port: MemoryActivationStatePort }>;
type Probe = { loads: number; callbacks: number; facades: number; frozen?: boolean; mode?: string };

function bytes(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
  return result.value;
}

function copyIdentity(value: PluginActivationIdentity): PluginActivationIdentity {
  return Object.freeze({ ...value });
}

function copyState(value: PluginActivationState): PluginActivationState {
  return Object.freeze({ contract: "plugin-activation-state/v2", active: Object.freeze(value.active.map(copyIdentity)), reactivationRequired: Object.freeze(value.reactivationRequired.map(copyIdentity)) });
}

function activationDigest(value: PluginActivationState): Digest {
  return sha256Digest(bytes({ contract: value.contract, active: value.active, reactivationRequired: value.reactivationRequired }));
}

class MemoryActivationStatePort implements PluginActivationStatePort {
  public state: PluginActivationState = copyState({ contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] });
  public rejectCompare = false;
  public throwRead = false;
  public throwCompare = false;
  public writes = 0;
  public reads = 0;
  public mutateOnRead: number | null = null;

  public async read(): Promise<PluginActivationState> {
    this.reads += 1;
    if (this.throwRead) throw new Error("port token must not leak");
    if (this.mutateOnRead === this.reads) this.state = copyState({ contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] });
    return copyState(this.state);
  }

  public async compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginActivationState }>): Promise<boolean> {
    if (this.throwCompare) throw new Error("port token must not leak");
    if (this.rejectCompare || input.expectedDigest !== activationDigest(this.state)) return false;
    this.state = copyState(input.nextState);
    this.writes += 1;
    return true;
  }

  public digest(): Digest {
    return activationDigest(this.state);
  }
}

function manifest(pluginDirectory: string, input: Partial<PluginManifestV1> = {}): PluginManifestV1 {
  const entryBytes = readFileSync(path.join(pluginDirectory, "index.mjs"));
  const resourceBytes = readFileSync(path.join(pluginDirectory, "resources", "contract.json"));
  return {
    manifestVersion: "plugin-manifest/v1",
    id: path.basename(pluginDirectory),
    version: "1.0.0",
    trustedLocal: true,
    hookContract: "plugin-hooks/v1",
    capabilities: ["save-revision-validator", "cms-editor-block-resolution"],
    entry: { file: "index.mjs", digest: sha256Digest(entryBytes) },
    callbacks: [
      { hook: "save-revision/validate", exportName: "validateSaveRevision", priority: 10 },
      { hook: "cms/editor-block/resolve", exportName: "resolveEditorBlock", priority: 20 },
    ],
    resources: [{ file: "resources/contract.json", digest: sha256Digest(resourceBytes) }],
    ...input,
  };
}

function writeManifest(pluginDirectory: string, input: Partial<PluginManifestV1> = {}): PluginManifestV1 {
  const value = manifest(pluginDirectory, input);
  writeFileSync(path.join(pluginDirectory, "plugin-manifest.json"), bytes(value));
  return value;
}

function writeEditorModule(pluginDirectory: string): void {
  writeFileSync(path.join(pluginDirectory, "index.mjs"), `
const key = ${JSON.stringify(probeKey)};
const probe = Reflect.get(globalThis, key) ?? { loads: 0, callbacks: 0, facades: 0 };
probe.loads += 1;
Reflect.set(globalThis, key, probe);
export function validateSaveRevision(input) { return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: input.content } }; }
export function resolveEditorBlock(input, facade) {
  probe.callbacks += 1;
  probe.facades += facade.capability === "cms-editor-block-resolution" ? 1 : 0;
  if (probe.mode === "throw") throw new Error("token-do-not-leak");
  if (probe.mode === "thenable") return Promise.resolve({ contract: "cms-editor-block-output/v1", block: {} });
  if (probe.mode === "extra") return { contract: "cms-editor-block-output/v1", block: {}, extra: true };
  if (probe.mode === "invalid") return { contract: "cms-editor-block-output/v1", block: { unsafe: BigInt(1) } };
  if (probe.mode === "mutate") { probe.frozen = Object.isFrozen(input.source) && Object.isFrozen(input.source.nested); try { input.source.nested.value = "mutated"; } catch {} }
  return { contract: "cms-editor-block-output/v1", block: { source: input.source } };
}
`);
}

function fixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "plugin-host-"));
  const installedRoot = path.join(directory, "installed");
  const pluginDirectory = path.join(installedRoot, "activation-probe");
  cpSync(templateRoot, pluginDirectory, { recursive: true });
  writeEditorModule(pluginDirectory);
  writeManifest(pluginDirectory);
  return { directory, installedRoot, pluginDirectory, port: new MemoryActivationStatePort() };
}

function addPlugin(value: Fixture, id: string): string {
  const pluginDirectory = path.join(value.installedRoot, id);
  cpSync(templateRoot, pluginDirectory, { recursive: true });
  writeEditorModule(pluginDirectory);
  writeManifest(pluginDirectory, { id });
  return pluginDirectory;
}

async function host(value: Fixture): Promise<PluginHost> {
  const created = await createPluginHost({ repositoryRoot, installedPluginsRoot: value.installedRoot, activationState: value.port });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Plugin Host unexpectedly failed to create");
  return created.value;
}

function resetProbe(): void {
  const current = Reflect.get(globalThis, probeKey);
  if (current !== null && typeof current === "object") {
    Object.assign(current, { loads: 0, callbacks: 0, facades: 0 });
    Reflect.deleteProperty(current, "frozen");
    Reflect.deleteProperty(current, "mode");
    return;
  }
  Reflect.set(globalThis, probeKey, { loads: 0, callbacks: 0, facades: 0 } satisfies Probe);
}

function probe(): Probe {
  return Reflect.get(globalThis, probeKey) as Probe;
}

function exactCandidate(report: Awaited<ReturnType<PluginHost["discover"]>>, id: string): PluginActivationIdentity {
  assert.equal(report.ok, true);
  if (!report.ok) throw new Error("Plugin discovery unexpectedly failed");
  const candidate = report.value.candidates.find((item) => item.id === id);
  if (candidate === undefined) throw new Error("Plugin candidate unexpectedly missing");
  return Object.freeze({ id: candidate.id, version: candidate.version, hookContract: candidate.hookContract, manifestHash: candidate.manifestHash });
}

async function activate(pluginHost: PluginHost, id = "activation-probe") {
  return pluginHost.activate({ identity: exactCandidate(await pluginHost.discover(), id) });
}

function assertFailure<T>(result: PluginHostResult<T>, code: string): asserts result is Extract<PluginHostResult<T>, { ok: false }> {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}

function source(identity: PluginActivationIdentity) {
  return { contract: "cms-editor-block-source/v1" as const, entryId: "entry-a", revisionId: "revision-a", pluginIdentity: identity, source: { nested: { value: "source" } } };
}

function assertSanitized(value: unknown, fixtureValue: Fixture): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("token-do-not-leak"), false);
  assert.equal(serialized.includes(fixtureValue.directory), false);
  assert.equal(serialized.includes(repositoryRoot), false);
}

const validatorTraceKey = "__saveRevisionValidatorTrace";
const moduleTraceKey = "__saveRevisionValidatorModuleLoads";

function resetValidatorTrace(): void {
  Reflect.deleteProperty(globalThis, validatorTraceKey);
}

function validatorTrace(): unknown[] {
  const value = Reflect.get(globalThis, validatorTraceKey);
  return Array.isArray(value) ? value : [];
}

function resetModuleTrace(): void {
  Reflect.deleteProperty(globalThis, moduleTraceKey);
}

function moduleTrace(): unknown[] {
  const value = Reflect.get(globalThis, moduleTraceKey);
  return Array.isArray(value) ? value : [];
}

function writeValidatorPlugin(value: Fixture, id: string, priority: number, source: string, version = "1.0.0"): void {
  const pluginDirectory = path.join(value.installedRoot, id);
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(path.join(pluginDirectory, "index.mjs"), source);
  const entryBytes = readFileSync(path.join(pluginDirectory, "index.mjs"));
  const pluginManifest: PluginManifestV1 = {
    manifestVersion: "plugin-manifest/v1",
    id,
    version,
    trustedLocal: true,
    hookContract: "plugin-hooks/v1",
    capabilities: ["save-revision-validator"],
    entry: { file: "index.mjs", digest: sha256Digest(entryBytes) },
    callbacks: [{ hook: "save-revision/validate", exportName: "validate", priority }],
    resources: [],
  };
  writeFileSync(path.join(pluginDirectory, "plugin-manifest.json"), bytes(pluginManifest));
}

async function validatorIdentity(pluginHost: PluginHost, id: string): Promise<PluginActivationIdentity> {
  return exactCandidate(await pluginHost.discover(), id);
}

function seedActive(port: MemoryActivationStatePort, identities: readonly PluginActivationIdentity[]): void {
  port.state = copyState({ contract: "plugin-activation-state/v2", active: [...identities].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0), reactivationRequired: [] });
}

function validatorInput(content: JsonValue, entryId = "entry-a"): SaveRevisionValidatorInput {
  return Object.freeze({ contract: "save-revision-validator-input/v1", entryId, revisionId: "draft-1", schemaIdentity: Object.freeze({ schemaId: "article", version: 1 }), content });
}

const acceptingGuard: SaveRevisionContentGuard = () => Object.freeze({ ok: true });

function expectedValidatorFailure(
  code: "PLUGIN_VALIDATION_REJECTED" | "PLUGIN_CALLBACK_RESULT_INVALID" | "PLUGIN_CALLBACK_FAILED",
  pluginId: string,
  entryId: string,
  cause: "rejected" | "invalid-result" | "callback-fault",
): unknown {
  const messages = {
    PLUGIN_VALIDATION_REJECTED: "Plugin validator 拒絕儲存此內容。",
    PLUGIN_CALLBACK_RESULT_INVALID: "Plugin callback 回傳不符合 plugin-hooks/v1 contract。",
    PLUGIN_CALLBACK_FAILED: "Plugin callback 執行失敗。",
  };
  return { ok: false, error: { code, owner: "PluginHost", subjectIds: [pluginId], remediation: { kind: "message", message: messages[code] }, detail: { pluginId, hook: "save-revision/validate", capability: "save-revision-validator", entryId, cause } } };
}

test("discovery only reads canonical external manifest data and rejects malformed candidates", async () => {
  resetProbe();
  const value = fixture();
  try {
    const malformed = path.join(value.installedRoot, "malformed");
    cpSync(value.pluginDirectory, malformed, { recursive: true });
    writeFileSync(path.join(malformed, "plugin-manifest.json"), Buffer.from('{"token":"token-do-not-leak"}'));
    const escaping = path.join(value.installedRoot, "escaping");
    cpSync(value.pluginDirectory, escaping, { recursive: true });
    writeManifest(escaping, { id: "escaping", entry: { file: "../token-do-not-leak.mjs", digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" } });
    symlinkSync(value.pluginDirectory, path.join(value.installedRoot, "symlinked"));
    const report = await (await host(value)).discover();
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.deepEqual(report.value.candidates.map((candidate) => candidate.id), ["activation-probe"]);
    assert.equal(report.value.rejections.length >= 2, true);
    assert.equal(probe().loads, 0);
    assertSanitized(report, value);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("editor resolution only executes an exact active identity and exact activation re-enables it", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    const active = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(active.ok, true);
    if (!active.ok || active.value.status !== "active") return;
    assert.deepEqual(active.value.output, { source: { nested: { value: "source" } } });
    assert.equal(active.value.outputDigest, sha256Digest(bytes(active.value.output)));
    const executed = { ...probe() };

    const deactivated = await pluginHost.deactivate({ identity });
    assert.equal(deactivated.ok, true);
    const inactive = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(inactive.ok, true);
    if (!inactive.ok || inactive.value.status !== "inactive") return;
    assert.deepEqual(inactive.value.source.source, { nested: { value: "source" } });
    assert.deepEqual([...inactive.value.source.sourceBytes], [...bytes({ nested: { value: "source" } })]);
    assert.equal(inactive.value.source.sourceDigest, sha256Digest(bytes({ nested: { value: "source" } })));
    assert.deepEqual(probe(), executed);

    const reenabled = await pluginHost.activate({ identity });
    assert.equal(reenabled.ok, true);
    const restored = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(restored.ok, true);
    if (restored.ok) assert.equal(restored.value.status, "active");
    assert.equal(probe().callbacks, executed.callbacks + 1);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("missing and mismatched evidence latch once, remain inactive after recovery, then require exact activation", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    const resourcePath = path.join(value.pluginDirectory, "resources", "contract.json");
    const resource = readFileSync(resourcePath);
    const before = { ...probe() };
    rmSync(resourcePath);
    const missing = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(missing.ok, true);
    if (missing.ok) {
      assert.equal(missing.value.status, "missing");
      assert.equal(missing.value.diagnostic.code, "PLUGIN_BLOCK_MISSING");
      assert.deepEqual(missing.value.diagnostic.detail, { pluginId: identity.id, hook: "cms/editor-block/resolve", capability: "cms-editor-block-resolution", entryId: "entry-a", cause: "missing" });
    }
    assert.deepEqual(value.port.state.active, []);
    assert.deepEqual(value.port.state.reactivationRequired, [identity]);
    assert.equal(value.port.writes, 2);
    assert.deepEqual(probe(), before);

    writeFileSync(resourcePath, resource);
    const recovered = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(recovered.ok, true);
    if (recovered.ok) assert.equal(recovered.value.status, "inactive");
    assert.equal(value.port.writes, 2);
    assert.deepEqual(probe(), before);
    const reenabled = await pluginHost.activate({ identity });
    assert.equal(reenabled.ok, true);
    const active = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(active.ok, true);
    if (active.ok) assert.equal(active.value.status, "active");

    writeFileSync(resourcePath, "tampered");
    const mismatch = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(mismatch.ok, true);
    if (mismatch.ok) assert.equal(mismatch.value.status, "identity-changed");
    assert.deepEqual(value.port.state.reactivationRequired, [identity]);
    assert.equal(value.port.writes, 4);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("malformed and escaping manifest evidence resolve as identity changes without execution", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    const before = { ...probe() };
    writeFileSync(path.join(value.pluginDirectory, "plugin-manifest.json"), Buffer.from('{"token":"token-do-not-leak"}'));
    const malformed = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(malformed.ok, true);
    if (malformed.ok) assert.equal(malformed.value.status, "identity-changed");
    assert.deepEqual(value.port.state.reactivationRequired, [identity]);
    assert.deepEqual(probe(), before);

    writeManifest(value.pluginDirectory);
    const reenabled = await pluginHost.activate({ identity });
    assert.equal(reenabled.ok, true);
    writeManifest(value.pluginDirectory, { entry: { file: "../token-do-not-leak.mjs", digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" } });
    const escaping = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(escaping.ok, true);
    if (escaping.ok) assert.equal(escaping.value.status, "identity-changed");
    assert.deepEqual(value.port.state.reactivationRequired, [identity]);
    assert.deepEqual(probe(), before);
    assertSanitized(escaping, value);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("identity drift does not import a replacement and a healthy different identity never latches", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const original = activated.value.identities[0]!;
    const before = { ...probe() };
    writeManifest(value.pluginDirectory, { version: "1.0.1" });
    const changed = await pluginHost.resolveCmsEditorBlock(source(original));
    assert.equal(changed.ok, true);
    if (changed.ok) assert.equal(changed.value.status, "identity-changed");
    const replacement = exactCandidate(await pluginHost.discover(), original.id);
    const conflict = await pluginHost.activate({ identity: replacement });
    assertFailure(conflict, "PLUGIN_IDENTITY_CONFLICT");
    assert.deepEqual(probe(), before);
    writeManifest(value.pluginDirectory);
    const inactive = await pluginHost.resolveCmsEditorBlock(source(original));
    assert.equal(inactive.ok, true);
    if (inactive.ok) assert.equal(inactive.value.status, "inactive");
    const reenabled = await pluginHost.activate({ identity: original });
    assert.equal(reenabled.ok, true);

    const healthyB = exactCandidate(await pluginHost.discover(), original.id);
    const wantedA = Object.freeze({ ...healthyB, version: "0.9.0" });
    const digestBefore = value.port.digest();
    const writesBefore = value.port.writes;
    const unrelated = await pluginHost.resolveCmsEditorBlock(source(wantedA));
    assert.equal(unrelated.ok, true);
    if (unrelated.ok) assert.equal(unrelated.value.status, "identity-changed");
    assert.equal(value.port.digest(), digestBefore);
    assert.equal(value.port.writes, writesBefore);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("activation validates the persisted identity before filesystem reads and latches exact active evidence drift", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    const before = { ...probe() };
    const changedManifest = writeManifest(value.pluginDirectory, { version: "1.0.1" });
    const different = Object.freeze({ id: identity.id, version: changedManifest.version, hookContract: changedManifest.hookContract, manifestHash: sha256Digest(bytes(changedManifest)) });
    const conflict = await pluginHost.activate({ identity: different });
    assertFailure(conflict, "PLUGIN_IDENTITY_CONFLICT");
    assert.deepEqual(probe(), before);
    assert.equal(value.port.writes, 1);

    writeManifest(value.pluginDirectory);
    rmSync(path.join(value.pluginDirectory, "resources", "contract.json"));
    const evidence = await pluginHost.activate({ identity });
    assertFailure(evidence, "PLUGIN_EVIDENCE_MISMATCH");
    assert.deepEqual(value.port.state.active, []);
    assert.deepEqual(value.port.state.reactivationRequired, [identity]);
    assert.equal(value.port.writes, 2);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("active snapshot and validator preflight latch all drift before loading any validator module", async () => {
  resetProbe();
  const value = fixture();
  try {
    const secondDirectory = addPlugin(value, "second-probe");
    const pluginHost = await host(value);
    const report = await pluginHost.discover();
    const first = exactCandidate(report, "activation-probe");
    const second = exactCandidate(report, "second-probe");
    value.port.state = copyState({ contract: "plugin-activation-state/v2", active: [first, second], reactivationRequired: [] });
    rmSync(path.join(secondDirectory, "resources", "contract.json"));
    const snapshot = await pluginHost.getActiveSnapshot();
    assertFailure(snapshot, "ACTIVE_PLUGIN_SOURCE_MISSING");
    assert.deepEqual(value.port.state.active, [first]);
    assert.deepEqual(value.port.state.reactivationRequired, [second]);
    assert.equal(probe().loads, 0);

    const prepared = await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-a" });
    assertFailure(prepared, "ACTIVE_PLUGIN_REACTIVATION_REQUIRED");
    assert.equal(probe().loads, 0);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("trusted-root replacement and unsafe mode fail closed without state writes or execution", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    const writes = value.port.writes;
    const executed = { ...probe() };
    const displaced = path.join(value.directory, "displaced-installed");
    renameSync(value.installedRoot, displaced);
    mkdirSync(value.installedRoot);
    cpSync(path.join(displaced, "activation-probe"), value.pluginDirectory, { recursive: true });
    assertFailure(await pluginHost.activate({ identity }), "INVALID_TRUSTED_ROOT");
    assertFailure(await pluginHost.getActiveSnapshot(), "INVALID_TRUSTED_ROOT");
    assertFailure(await pluginHost.resolveCmsEditorBlock(source(identity)), "INVALID_TRUSTED_ROOT");
    assertFailure(await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-a" }), "INVALID_TRUSTED_ROOT");
    assertFailure(await pluginHost.discover(), "INVALID_TRUSTED_ROOT");
    assert.equal(value.port.writes, writes);
    assert.deepEqual(probe(), executed);

    const modeFixture = fixture();
    try {
      const modeHost = await host(modeFixture);
      const modeActivated = await activate(modeHost);
      assert.equal(modeActivated.ok, true);
      chmodSync(modeFixture.installedRoot, 0o777);
      assertFailure(await modeHost.getActiveSnapshot(), "INVALID_TRUSTED_ROOT");
      assert.equal(modeFixture.port.writes, 1);
    } finally {
      chmodSync(modeFixture.installedRoot, 0o755);
      rmSync(modeFixture.directory, { recursive: true, force: true });
    }
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("editor callback failures are sanitized, contract-bound, and never authorize a stale state", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    for (const mode of ["throw", "thenable", "extra", "invalid"] as const) {
      probe().mode = mode;
      const result = await pluginHost.resolveCmsEditorBlock(source(identity));
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, mode === "throw" ? "PLUGIN_CALLBACK_FAILED" : "PLUGIN_CALLBACK_RESULT_INVALID");
        assert.deepEqual(result.error.detail, { pluginId: identity.id, hook: "cms/editor-block/resolve", capability: "cms-editor-block-resolution", entryId: "entry-a", cause: mode === "throw" ? "callback-fault" : "invalid-result" });
        assert.equal(result.error.remediation.kind === "message" && result.error.remediation.message.includes("replacement"), false);
      }
      assertSanitized(result, value);
    }
    probe().mode = "mutate";
    const frozen = await pluginHost.resolveCmsEditorBlock(source(identity));
    assert.equal(frozen.ok, true);
    assert.equal(probe().frozen, true);

    const fresh = fixture();
    try {
      const staleHost = await host(fresh);
      const staleActivated = await activate(staleHost);
      assert.equal(staleActivated.ok, true);
      fresh.port.mutateOnRead = fresh.port.reads + 3;
      const stale = await staleHost.resolveCmsEditorBlock(source(staleActivated.ok ? staleActivated.value.identities[0]! : identity));
      assertFailure(stale, "INVALID_PLUGIN_OPERATION_SNAPSHOT");
      assert.equal(probe().callbacks, 5);
    } finally {
      rmSync(fresh.directory, { recursive: true, force: true });
    }
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("latch CAS conflict and port failure never execute a callback or expose port exceptions", async () => {
  resetProbe();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const activated = await activate(pluginHost);
    assert.equal(activated.ok, true);
    if (!activated.ok) return;
    const identity = activated.value.identities[0]!;
    writeFileSync(path.join(value.pluginDirectory, "resources", "contract.json"), "tampered");
    const before = { ...probe() };
    value.port.rejectCompare = true;
    const conflict = await pluginHost.getActiveSnapshot();
    assertFailure(conflict, "ACTIVATION_STATE_CONFLICT");
    assertSanitized(conflict, value);
    value.port.rejectCompare = false;
    value.port.throwCompare = true;
    const failure = await pluginHost.getActiveSnapshot();
    assertFailure(failure, "ACTIVATION_STATE_FAILURE");
    assertSanitized(failure, value);
    assert.deepEqual(probe(), before);
    assert.equal(value.port.state.active[0]?.id, identity.id);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("trusted root rejects repository-local source", async () => {
  const port = new MemoryActivationStatePort();
  const result = await createPluginHost({ repositoryRoot, installedPluginsRoot: path.join(repositoryRoot, "extensions", "plugins"), activationState: port });
  assertFailure(result, "INVALID_TRUSTED_ROOT");
  assert.equal(existsSync(path.join(templateRoot, "index.ts")), true);
});

test("SaveRevision validators use one immutable ordered replacement snapshot", async () => {
  resetValidatorTrace();
  const value = fixture();
  try {
    writeValidatorPlugin(value, "zeta-priority", 0, `export function validate(input, facade) {
      const trace = globalThis["__saveRevisionValidatorTrace"] ?? [];
      trace.push({ id: "zeta-priority", content: input.content, mutations: [Reflect.set(input.content.nested, "value", "mutated"), Reflect.set(input.schemaIdentity, "schemaId", "mutated"), Reflect.set(facade, "extra", true)], keys: Object.keys(facade) });
      globalThis["__saveRevisionValidatorTrace"] = trace;
      return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: { nested: { value: "zeta" } } } };
    }`);
    for (const [id, valueName] of [["alpha-tie", "alpha"], ["beta-tie", "beta"]] as const) {
      writeValidatorPlugin(value, id, 10, `export function validate(input) {
        const trace = globalThis["__saveRevisionValidatorTrace"] ?? [];
        trace.push({ id: ${JSON.stringify(id)}, content: input.content });
        globalThis["__saveRevisionValidatorTrace"] = trace;
        return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: { nested: { value: ${JSON.stringify(valueName)} } } } };
      }`);
    }
    const pluginHost = await host(value);
    seedActive(value.port, await Promise.all(["zeta-priority", "alpha-tie", "beta-tie"].map((id) => validatorIdentity(pluginHost, id))));
    value.port.reads = 0;
    const prepared = await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-a" });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(value.port.reads, 1);
    const callerContent: JsonValue = { nested: { value: "origin" } };
    const guardCalls: { bytes: string; digest: Digest }[] = [];
    const guard: SaveRevisionContentGuard = ({ contentBytes, contentDigest }) => {
      guardCalls.push({ bytes: new TextDecoder().decode(contentBytes), digest: contentDigest });
      return Object.freeze({ ok: true });
    };
    value.port.throwRead = true;
    const result = pluginHost.runPreparedSaveRevisionValidators(prepared.value, validatorInput(callerContent), guard);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(value.port.reads, 1);
    const trace = validatorTrace() as { id: string; content: JsonValue; mutations?: boolean[]; keys?: string[] }[];
    assert.deepEqual(trace.map((item) => item.id), ["zeta-priority", "alpha-tie", "beta-tie"]);
    assert.deepEqual(trace.map((item) => item.content), [{ nested: { value: "origin" } }, { nested: { value: "zeta" } }, { nested: { value: "alpha" } }]);
    assert.deepEqual(trace[0]?.mutations, [false, false, false]);
    assert.deepEqual(trace[0]?.keys, ["capability"]);
    assert.deepEqual(callerContent, { nested: { value: "origin" } });
    assert.deepEqual(result.value.content, { nested: { value: "beta" } });
    assert.deepEqual(guardCalls, ["zeta", "alpha", "beta"].map((item) => ({ bytes: new TextDecoder().decode(bytes({ nested: { value: item } })), digest: sha256Digest(bytes({ nested: { value: item } })) })));
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("SaveRevision validator tokens and failures are host-owned and one-shot", async () => {
  const value = fixture();
  const canary = `draft-html token-do-not-leak ${value.directory} ${repositoryRoot}`;
  try {
    writeValidatorPlugin(value, "validator", 0, `export function validate(input) {
      const trace = globalThis["__saveRevisionValidatorTrace"] ?? [];
      trace.push(input.entryId);
      globalThis["__saveRevisionValidatorTrace"] = trace;
      if (input.entryId === "fault") throw new Error(${JSON.stringify(canary)});
      if (input.entryId === "reject") return { contract: "save-revision-validator-output/v1", decision: "reject" };
      if (input.entryId === "invalid") return { contract: "save-revision-validator-output/v1", decision: "reject", replacement: { content: { canary: ${JSON.stringify(canary)} } } };
      if (input.entryId === "promise") return Promise.reject(new Error(${JSON.stringify(canary)}));
      return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: input.content } };
    }`);
    const hostA = await host(value);
    const hostB = await host(value);
    seedActive(value.port, [await validatorIdentity(hostA, "validator")]);
    resetValidatorTrace();

    const foreign = await hostA.prepareSaveRevisionValidators({ entryId: "entry-a" });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    assertFailure(hostB.runPreparedSaveRevisionValidators(foreign.value, validatorInput({ value: "foreign" }), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");
    assert.equal(hostA.runPreparedSaveRevisionValidators(foreign.value, validatorInput({ value: "owner" }), acceptingGuard).ok, true);

    const wrong = await hostA.prepareSaveRevisionValidators({ entryId: "entry-a" });
    assert.equal(wrong.ok, true);
    if (!wrong.ok) return;
    assertFailure(hostA.runPreparedSaveRevisionValidators(wrong.value, validatorInput({ value: "wrong" }, "entry-b"), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");
    assertFailure(hostA.runPreparedSaveRevisionValidators(wrong.value, validatorInput({ value: "replay" }), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");

    for (const [entryId, code, cause] of [["reject", "PLUGIN_VALIDATION_REJECTED", "rejected"], ["fault", "PLUGIN_CALLBACK_FAILED", "callback-fault"], ["invalid", "PLUGIN_CALLBACK_RESULT_INVALID", "invalid-result"], ["promise", "PLUGIN_CALLBACK_RESULT_INVALID", "invalid-result"]] as const) {
      const token = await hostA.prepareSaveRevisionValidators({ entryId });
      assert.equal(token.ok, true);
      if (!token.ok) continue;
      let unhandled: unknown;
      const onUnhandled = (reason: unknown) => { unhandled = reason; };
      if (entryId === "promise") process.on("unhandledRejection", onUnhandled);
      try {
        const result = hostA.runPreparedSaveRevisionValidators(token.value, validatorInput({ draft: "content" }, entryId), acceptingGuard);
        assert.deepEqual(result, expectedValidatorFailure(code, "validator", entryId, cause));
        assertSanitized(result, value);
        assertFailure(hostA.runPreparedSaveRevisionValidators(token.value, validatorInput({ draft: "replay" }, entryId), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");
        if (entryId === "promise") {
          await new Promise<void>((resolve) => setImmediate(resolve));
          assert.equal(unhandled, undefined);
        }
      } finally {
        if (entryId === "promise") process.off("unhandledRejection", onUnhandled);
      }
    }
    assert.deepEqual(validatorTrace(), ["entry-a", "reject", "fault", "invalid", "promise"]);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("validator guard distinguishes invalid replacement from validation service failure", async () => {
  resetValidatorTrace();
  const value = fixture();
  const canary = `guard-service-canary ${value.directory} ${repositoryRoot}`;
  try {
    for (const [id, priority] of [["guard-first", 0], ["guard-next", 1]] as const) {
      writeValidatorPlugin(value, id, priority, `export function validate(input) {
        const trace = globalThis["__saveRevisionValidatorTrace"] ?? [];
        trace.push(${JSON.stringify(id)});
        globalThis["__saveRevisionValidatorTrace"] = trace;
        return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: input.content } };
      }`);
    }
    const pluginHost = await host(value);
    seedActive(value.port, await Promise.all(["guard-first", "guard-next"].map((id) => validatorIdentity(pluginHost, id))));

    const rejected = await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-a" });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    const invalid = pluginHost.runPreparedSaveRevisionValidators(rejected.value, validatorInput({ draft: "content" }), () => Object.freeze({ ok: false }));
    assert.deepEqual(invalid, expectedValidatorFailure("PLUGIN_CALLBACK_RESULT_INVALID", "guard-first", "entry-a", "invalid-result"));
    assert.deepEqual(validatorTrace(), ["guard-first"]);
    assertFailure(pluginHost.runPreparedSaveRevisionValidators(rejected.value, validatorInput({ draft: "replay" }), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");

    resetValidatorTrace();
    const failed = await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-b" });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    const serviceFailure = pluginHost.runPreparedSaveRevisionValidators(failed.value, validatorInput({ draft: "content" }, "entry-b"), () => { throw new Error(canary); });
    assert.deepEqual(serviceFailure, { ok: false, error: { code: "PLUGIN_VALIDATION_SERVICE_FAILED", owner: "PluginHost", subjectIds: [], remediation: { kind: "message", message: "Plugin replacement 驗證未完成。" } } });
    assertSanitized(serviceFailure, value);
    assert.deepEqual(validatorTrace(), ["guard-first"]);
    assertFailure(pluginHost.runPreparedSaveRevisionValidators(failed.value, validatorInput({ draft: "replay" }, "entry-b"), acceptingGuard), "INVALID_PLUGIN_OPERATION_SNAPSHOT");
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("validator prepare verifies all evidence before imports and rejects replaced trusted roots", async () => {
  resetModuleTrace();
  const value = fixture();
  try {
    const source = (id: string) => `const trace = globalThis["__saveRevisionValidatorModuleLoads"] ?? [];
      trace.push(${JSON.stringify(id)});
      globalThis["__saveRevisionValidatorModuleLoads"] = trace;
      export function validate(input) { return { contract: "save-revision-validator-output/v1", decision: "accept", replacement: { content: input.content } }; }`;
    writeValidatorPlugin(value, "alpha-valid", 0, source("alpha-valid"));
    writeValidatorPlugin(value, "zeta-drift", 0, source("zeta-drift"));
    const pluginHost = await host(value);
    seedActive(value.port, await Promise.all(["alpha-valid", "zeta-drift"].map((id) => validatorIdentity(pluginHost, id))));
    writeValidatorPlugin(value, "zeta-drift", 0, source("zeta-drift"), "1.0.1");
    value.port.reads = 0;
    assertFailure(await pluginHost.prepareSaveRevisionValidators({ entryId: "entry-a" }), "ACTIVE_PLUGIN_IDENTITY_MISMATCH");
    assert.equal(value.port.reads, 1);
    assert.deepEqual(moduleTrace(), []);

    writeValidatorPlugin(value, "root-validator", 0, source("root-validator"));
    const rootHost = await host(value);
    seedActive(value.port, [await validatorIdentity(rootHost, "root-validator")]);
    resetModuleTrace();
    renameSync(value.installedRoot, path.join(value.directory, "installed-original"));
    mkdirSync(value.installedRoot);
    assertFailure(await rootHost.prepareSaveRevisionValidators({ entryId: "entry-a" }), "INVALID_TRUSTED_ROOT");
    assert.deepEqual(moduleTrace(), []);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
