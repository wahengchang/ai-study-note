import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import {
  createPluginHost,
  type PluginActivationIdentity,
  type PluginActivationState,
  type PluginActivationStatePort,
  type PluginManifestV1,
} from "../../../core/plugin-host/index.js";

const repositoryRoot = process.cwd();
const templateRoot = path.join(repositoryRoot, "extensions", "plugins", "activation-probe");
const probeKey = "__activationProbeLoads";

type Fixture = Readonly<{
  directory: string;
  installedRoot: string;
  pluginDirectory: string;
  port: MemoryActivationStatePort;
}>;

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
  return Object.freeze({ contract: "plugin-activation-state/v1", identities: Object.freeze(value.identities.map(copyIdentity)) });
}

function activationDigest(value: PluginActivationState): Digest {
  return sha256Digest(bytes({ contract: value.contract, identities: value.identities }));
}

class MemoryActivationStatePort implements PluginActivationStatePort {
  public state: PluginActivationState = copyState({ contract: "plugin-activation-state/v1", identities: [] });
  public rejectCompare = false;
  public throwRead = false;
  public throwCompare = false;
  public writes = 0;

  public async read(): Promise<PluginActivationState> {
    if (this.throwRead) throw new Error("port token must not leak");
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
    id: "activation-probe",
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

function fixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "plugin-host-"));
  const installedRoot = path.join(directory, "installed");
  const pluginDirectory = path.join(installedRoot, "activation-probe");
  cpSync(templateRoot, pluginDirectory, { recursive: true });
  writeFileSync(path.join(pluginDirectory, "index.mjs"), readFileSync(path.join(templateRoot, "index.ts")));
  writeManifest(pluginDirectory);
  return { directory, installedRoot, pluginDirectory, port: new MemoryActivationStatePort() };
}

async function host(value: Fixture) {
  const created = await createPluginHost({ repositoryRoot, installedPluginsRoot: value.installedRoot, activationState: value.port });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Plugin Host unexpectedly failed to create");
  return created.value;
}

function loads(): number {
  return (Reflect.get(globalThis, probeKey) as number | undefined) ?? 0;
}

function resetLoads(): void {
  Reflect.deleteProperty(globalThis, probeKey);
}

function assertSanitized(value: unknown, fixtureValue: Fixture): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("token-do-not-leak"), false);
  assert.equal(serialized.includes(fixtureValue.directory), false);
  assert.equal(serialized.includes(repositoryRoot), false);
}

test("discovery only reads canonical external manifest data", async () => {
  resetLoads();
  const value = fixture();
  try {
    rmSync(value.pluginDirectory, { recursive: true, force: true });
    const empty = await host(value);
    const report = await empty.discover();
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.deepEqual(report.value.candidates, []);
    assert.deepEqual(report.value.rejections, []);
    assert.equal(loads(), 0);

    cpSync(templateRoot, value.pluginDirectory, { recursive: true });
    writeFileSync(path.join(value.pluginDirectory, "index.mjs"), readFileSync(path.join(templateRoot, "index.ts")));
    writeManifest(value.pluginDirectory);
    const staged = await empty.discover();
    assert.equal(staged.ok, true);
    if (!staged.ok) return;
    assert.deepEqual(staged.value.candidates.map((candidate) => candidate.id), ["activation-probe"]);
    assert.equal(staged.value.rejections.length, 0);
    assert.equal(loads(), 0);
    assertSanitized(staged, value);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("discovery rejects malformed and escaping candidates without hiding valid candidates", async () => {
  resetLoads();
  const value = fixture();
  try {
    const malformed = path.join(value.installedRoot, "malformed");
    cpSync(value.pluginDirectory, malformed, { recursive: true });
    writeFileSync(path.join(malformed, "plugin-manifest.json"), Buffer.from('{"token":"token-do-not-leak"}'));
    const escaping = path.join(value.installedRoot, "escaping");
    cpSync(value.pluginDirectory, escaping, { recursive: true });
    writeManifest(escaping, {
      id: "escaping",
      entry: { file: "../token-do-not-leak.mjs", digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
    });
    const symlinked = path.join(value.installedRoot, "symlinked");
    symlinkSync(value.pluginDirectory, symlinked);
    const result = await (await host(value)).discover();
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value.candidates.map((candidate) => candidate.id), ["activation-probe"]);
    assert.equal(result.value.rejections.length >= 2, true);
    assert.equal(result.value.rejections.every((rejection) => rejection.owner === "PluginHost"), true);
    assertSanitized(result, value);
    assert.equal(loads(), 0);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("activation validates evidence and exports before one exact CAS", async () => {
  resetLoads();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const before = value.port.digest();
    const activated = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(activated.ok, true, activated.ok ? "" : activated.error.code);
    if (!activated.ok) return;
    assert.equal(activated.value.identities.length, 1);
    assert.equal(value.port.writes, 1);
    assert.equal(loads(), 1);
    assert.notEqual(activated.value.digest, before);

    const repeated = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(repeated.ok, true);
    assert.equal(value.port.writes, 1);
    assert.equal(loads(), 1);

    writeManifest(value.pluginDirectory, { version: "1.0.1" });
    const conflict = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "PLUGIN_IDENTITY_CONFLICT");
    assert.equal(value.port.digest(), activated.value.digest);
    assert.equal(loads(), 1);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("activation failure never writes active state", async () => {
  resetLoads();
  const value = fixture();
  try {
    const pluginHost = await host(value);
    const before = value.port.digest();
    writeFileSync(path.join(value.pluginDirectory, "index.mjs"), "export const validateSaveRevision = 1;\nexport const resolveEditorBlock = 1;\n");
    writeManifest(value.pluginDirectory);
    const moduleFailure = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(moduleFailure.ok, false);
    if (!moduleFailure.ok) assert.equal(moduleFailure.error.code, "PLUGIN_MODULE_INVALID");
    assert.equal(value.port.digest(), before);
    assert.equal(value.port.writes, 0);

    writeFileSync(path.join(value.pluginDirectory, "index.mjs"), readFileSync(path.join(templateRoot, "index.ts")));
    const resourcePath = path.join(value.pluginDirectory, "resources", "contract.json");
    const resource = readFileSync(resourcePath);
    rmSync(resourcePath);
    const evidenceFailure = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(evidenceFailure.ok, false);
    if (!evidenceFailure.ok) assert.equal(evidenceFailure.error.code, "PLUGIN_EVIDENCE_MISMATCH");
    assert.equal(value.port.digest(), before);
    writeFileSync(resourcePath, resource);

    writeFileSync(path.join(value.pluginDirectory, "index.mjs"), "throw new Error('token-do-not-leak');\n");
    writeManifest(value.pluginDirectory, { version: "1.0.1" });
    const topLevelFailure = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(topLevelFailure.ok, false);
    if (!topLevelFailure.ok) assert.equal(topLevelFailure.error.code, "PLUGIN_MODULE_INVALID");
    assert.equal(value.port.digest(), before);

    writeFileSync(path.join(value.pluginDirectory, "index.mjs"), readFileSync(path.join(templateRoot, "index.ts")));
    writeManifest(value.pluginDirectory, { version: "1.0.2" });
    value.port.throwCompare = true;
    const portFailure = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(portFailure.ok, false);
    if (!portFailure.ok) assert.equal(portFailure.error.code, "ACTIVATION_STATE_FAILURE");
    assert.equal(value.port.digest(), before);

    value.port.throwCompare = false;
    value.port.rejectCompare = true;
    const conflict = await pluginHost.activate({ pluginId: "activation-probe" });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "ACTIVATION_STATE_CONFLICT");
    assert.equal(value.port.digest(), before);
    assert.equal(value.port.writes, 0);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("snapshot revalidates identity and deactivation enables exact replacement", async () => {
  resetLoads();
  const value = fixture();
  try {
    const firstHost = await host(value);
    const activated = await firstHost.activate({ pluginId: "activation-probe" });
    assert.equal(activated.ok, true, activated.ok ? "" : activated.error.code);
    if (!activated.ok) return;
    const recreated = await host(value);
    const restored = await recreated.getActiveSnapshot();
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.value.digest, activated.value.digest);

    const original = readFileSync(path.join(value.pluginDirectory, "resources", "contract.json"));
    writeFileSync(path.join(value.pluginDirectory, "resources", "contract.json"), "mutated");
    const mismatch = await recreated.getActiveSnapshot();
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.error.code, "ACTIVE_PLUGIN_IDENTITY_MISMATCH");
    assert.equal(value.port.digest(), activated.value.digest);
    writeFileSync(path.join(value.pluginDirectory, "resources", "contract.json"), original);
    rmSync(path.join(value.pluginDirectory, "resources", "contract.json"));
    const missing = await recreated.getActiveSnapshot();
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "ACTIVE_PLUGIN_IDENTITY_MISMATCH");
    assert.equal(value.port.digest(), activated.value.digest);
    writeFileSync(path.join(value.pluginDirectory, "resources", "contract.json"), original);
    const recovered = await recreated.getActiveSnapshot();
    assert.equal(recovered.ok, true);

    const wrong = await recreated.deactivate({ identity: { ...activated.value.identities[0]!, version: "2.0.0" } });
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.error.code, "PLUGIN_NOT_ACTIVE");
    const deactivated = await recreated.deactivate({ identity: activated.value.identities[0]! });
    assert.equal(deactivated.ok, true);
    if (!deactivated.ok) return;
    assert.equal(deactivated.value.identities.length, 0);

    writeManifest(value.pluginDirectory, { version: "1.0.1" });
    const replacement = await recreated.activate({ pluginId: "activation-probe" });
    assert.equal(replacement.ok, true);
    if (!replacement.ok) return;
    const mutable = replacement.value.identities as PluginActivationIdentity[];
    assert.throws(() => mutable.push(replacement.value.identities[0]!));
    const later = await recreated.getActiveSnapshot();
    assert.equal(later.ok, true);
    if (later.ok) assert.equal(later.value.identities[0]?.version, "1.0.1");
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("trusted root rejects repository-local source", async () => {
  const port = new MemoryActivationStatePort();
  const result = await createPluginHost({ repositoryRoot, installedPluginsRoot: path.join(repositoryRoot, "extensions", "plugins"), activationState: port });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INVALID_TRUSTED_ROOT");
  assert.equal(existsSync(path.join(templateRoot, "index.ts")), true);
});
