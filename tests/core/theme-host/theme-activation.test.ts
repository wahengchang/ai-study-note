import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { createThemeHost, type ThemeActivationStatePort, type ThemeActivationStateRecord, type ThemeIdentity } from "../../../core/theme-host/index.js";

type Fixture = Readonly<{ base: string; repositoryRoot: string; installedThemesRoot: string }>;

function canonical(value: unknown): Uint8Array {
  const encoded = canonicalJsonBytes(value);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("canonical JSON failed");
  return encoded.value;
}

function inactiveState(): Uint8Array {
  return canonical({ contract: "theme-activation-state/v1" });
}

class ActivationPort implements ThemeActivationStatePort {
  private record: ThemeActivationStateRecord;
  public replaceAttempts = 0;
  public mode: "normal" | "read-fault" | "cas-fault" | "cas-conflict" = "normal";

  constructor(bytes: Uint8Array) {
    this.record = Object.freeze({ bytes: new Uint8Array(bytes), digest: sha256Digest(bytes) });
  }

  async read(): Promise<ThemeActivationStateRecord> {
    if (this.mode === "read-fault") throw new Error("read fault");
    return Object.freeze({ bytes: new Uint8Array(this.record.bytes), digest: this.record.digest });
  }

  async compareAndReplace(input: Readonly<{ expectedDigest: Digest; next: ThemeActivationStateRecord }>): Promise<boolean> {
    this.replaceAttempts += 1;
    if (this.mode === "cas-fault") throw new Error("CAS fault");
    if (this.mode === "cas-conflict" || input.expectedDigest !== this.record.digest) return false;
    this.record = Object.freeze({ bytes: new Uint8Array(input.next.bytes), digest: input.next.digest });
    return true;
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.record.bytes);
  }
}

async function fixture(): Promise<Fixture> {
  const base = await mkdtemp(path.join(tmpdir(), "theme-activation-"));
  const repositoryRoot = path.join(base, "repository");
  const installedThemesRoot = path.join(base, "themes");
  await Promise.all([mkdir(repositoryRoot, { recursive: true, mode: 0o700 }), mkdir(installedThemesRoot, { recursive: true, mode: 0o700 })]);
  return Object.freeze({ base, repositoryRoot, installedThemesRoot });
}

async function installTheme(input: Readonly<{ root: string; slot: string; id: string; version: string; stylesheet?: string }>): Promise<ThemeIdentity> {
  const directory = path.join(input.root, input.slot);
  const runtime = "export const theme = 'ok';\n";
  const stylesheet = input.stylesheet ?? "body{}\n";
  await mkdir(path.join(directory, "assets"), { recursive: true, mode: 0o700 });
  await Promise.all([
    writeFile(path.join(directory, "runtime.mjs"), runtime, { mode: 0o600 }),
    writeFile(path.join(directory, "assets/site.css"), stylesheet, { mode: 0o600 }),
  ]);
  const manifest = canonical({
    contract: "theme-manifest/v1",
    id: input.id,
    version: input.version,
    runtime: { file: "runtime.mjs", digest: sha256Digest(new TextEncoder().encode(runtime)) },
    resources: [{ file: "assets/site.css", digest: sha256Digest(new TextEncoder().encode(stylesheet)) }],
  });
  await writeFile(path.join(directory, "theme.json"), manifest, { mode: 0o600 });
  return Object.freeze({ id: input.id, version: input.version, manifestHash: sha256Digest(manifest) });
}

test("activation snapshot fails closed when unconfigured, activates exact verified evidence, and resolves durable active Theme", async (context) => {
  const roots = await fixture();
  context.after(() => rm(roots.base, { recursive: true, force: true }));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "study-notes", id: "study-notes", version: "1.0.0" });
  const port = new ActivationPort(inactiveState());
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, activationState: port });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const initial = await created.value.getActivationSnapshot();
  if (!initial.ok) return;
  assert.deepEqual(initial, { ok: true, value: { stateDigest: sha256Digest(inactiveState()) } });
  const inactive = await created.value.resolveActive();
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.equal(inactive.error.code, "THEME_NOT_ACTIVE");
  assert.equal(port.replaceAttempts, 0);

  const activated = await created.value.activate({ identity, expectedActivationStateDigest: initial.value.stateDigest });
  assert.equal(activated.ok, true);
  if (!activated.ok) return;
  assert.deepEqual(activated.value.active, identity);
  assert.equal(port.replaceAttempts, 1);
  const active = await created.value.resolveActive();
  assert.equal(active.ok, true);
  if (!active.ok) return;
  assert.deepEqual(active.value.identity, identity);
  assert.deepEqual(active.value.theme.identity, identity);
  assert.equal(active.value.activationStateDigest, activated.value.stateDigest);
  assert.equal(Object.isFrozen(active.value.theme.manifest.resources), true);
});

test("activation rejects stale or malformed state and CAS faults without mutating durable bytes", async (context) => {
  const roots = await fixture();
  context.after(() => rm(roots.base, { recursive: true, force: true }));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "study-notes", id: "study-notes", version: "1.0.0" });
  const port = new ActivationPort(inactiveState());
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, activationState: port });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const before = port.bytes();
  const stale = await created.value.activate({ identity, expectedActivationStateDigest: sha256Digest(canonical({ contract: "theme-activation-state/v1", active: identity })) });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.code, "THEME_ACTIVATION_STATE_CONFLICT");
  assert.deepEqual(port.bytes(), before);
  assert.equal(port.replaceAttempts, 0);

  port.mode = "cas-fault";
  const snapshot = await created.value.getActivationSnapshot();
  assert.equal(snapshot.ok, true);
  if (!snapshot.ok) return;
  const failedCas = await created.value.activate({ identity, expectedActivationStateDigest: snapshot.value.stateDigest });
  assert.equal(failedCas.ok, false);
  if (!failedCas.ok) assert.equal(failedCas.error.code, "THEME_ACTIVATION_STATE_FAILURE");
  assert.deepEqual(port.bytes(), before);

  const malformed = new ActivationPort(new TextEncoder().encode("{}"));
  const malformedHost = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, activationState: malformed });
  assert.equal(malformedHost.ok, true);
  if (!malformedHost.ok) return;
  const malformedSnapshot = await malformedHost.value.getActivationSnapshot();
  assert.equal(malformedSnapshot.ok, false);
  if (!malformedSnapshot.ok) assert.equal(malformedSnapshot.error.code, "THEME_ACTIVATION_STATE_FAILURE");
  assert.equal(malformed.replaceAttempts, 0);
  for (const invalidBytes of [new Uint8Array(), new TextEncoder().encode('{"contract":"theme-activation-state/v1"}\n')]) {
    const invalidPort = new ActivationPort(invalidBytes);
    const invalidHost = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, activationState: invalidPort });
    assert.equal(invalidHost.ok, true);
    if (!invalidHost.ok) continue;
    const invalidSnapshot = await invalidHost.value.getActivationSnapshot();
    assert.equal(invalidSnapshot.ok, false);
    if (!invalidSnapshot.ok) assert.equal(invalidSnapshot.error.code, "THEME_ACTIVATION_STATE_FAILURE");
    assert.equal(invalidPort.replaceAttempts, 0);
  }
});

test("activation verifies evidence before CAS and discovery keeps same-ID versions ambiguous for selection services", async (context) => {
  const roots = await fixture();
  context.after(() => rm(roots.base, { recursive: true, force: true }));
  const first = await installTheme({ root: roots.installedThemesRoot, slot: "first", id: "study-notes", version: "1.0.0" });
  await installTheme({ root: roots.installedThemesRoot, slot: "second", id: "study-notes", version: "2.0.0" });
  const port = new ActivationPort(inactiveState());
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, activationState: port });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  assert.equal(discovery.value.candidates.filter((candidate) => candidate.id === "study-notes").length, 2);

  await writeFile(path.join(roots.installedThemesRoot, "first", "assets/site.css"), "drift\n", { mode: 0o600 });
  const snapshot = await created.value.getActivationSnapshot();
  assert.equal(snapshot.ok, true);
  if (!snapshot.ok) return;
  const evidence = await created.value.activate({ identity: first, expectedActivationStateDigest: snapshot.value.stateDigest });
  assert.equal(evidence.ok, false);
  if (!evidence.ok) assert.equal(evidence.error.code, "THEME_EVIDENCE_MISMATCH");
  assert.equal(port.replaceAttempts, 0);
  assert.deepEqual(port.bytes(), inactiveState());
});
