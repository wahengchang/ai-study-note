import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { createThemeHost, type ThemeActivationIdentity, type ThemeActivationState, type ThemeActivationStatePort } from "../../../core/theme-host/index.js";

function bytes(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical fixture failed");
  return result.value;
}

function identity(value: ThemeActivationState): Digest { return sha256Digest(bytes(value)); }

class MemoryState implements ThemeActivationStatePort {
  public value: ThemeActivationState = Object.freeze({ contract: "theme-activation-state/v1" });
  public async read(): Promise<ThemeActivationState> { return this.value.active === undefined ? Object.freeze({ contract: "theme-activation-state/v1" }) : Object.freeze({ contract: "theme-activation-state/v1", active: Object.freeze({ ...this.value.active }) }); }
  public async compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: ThemeActivationState }>): Promise<boolean> {
    if (input.expectedDigest !== identity(this.value)) return false;
    this.value = input.nextState.active === undefined ? Object.freeze({ contract: "theme-activation-state/v1" }) : Object.freeze({ contract: "theme-activation-state/v1", active: Object.freeze({ ...input.nextState.active }) });
    return true;
  }
}

type Fixture = Readonly<{ directory: string; installed: string; theme: string; state: MemoryState }>;
function fixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "theme-host-"));
  const installed = path.join(directory, "installed");
  const theme = path.join(installed, "basic-theme");
  mkdirSync(path.join(theme, "resources"), { recursive: true });
  chmodSync(installed, 0o755);
  const entry = new TextEncoder().encode("export function render() { return []; }");
  const resource = new TextEncoder().encode("body{color:black}");
  writeFileSync(path.join(theme, "index.mjs"), entry);
  writeFileSync(path.join(theme, "resources", "site.css"), resource);
  writeFileSync(path.join(theme, "theme-manifest.json"), bytes({
    manifestVersion: "theme-manifest/v1",
    id: "basic-theme",
    version: "1.0.0",
    trustedLocal: true,
    rendererContract: "theme-renderer/v1",
    entry: { file: "index.mjs", digest: sha256Digest(entry) },
    resources: [{ file: "resources/site.css", digest: sha256Digest(resource) }],
  }));
  return { directory, installed, theme, state: new MemoryState() };
}

async function active(value: Fixture): Promise<ThemeActivationIdentity> {
  const created = await createThemeHost({ repositoryRoot: process.cwd(), installedThemesRoot: value.installed, activationState: value.state });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Theme Host creation failed");
  const discovered = await created.value.discover();
  assert.equal(discovered.ok, true);
  if (!discovered.ok) throw new Error("Theme discovery failed");
  assert.deepEqual(discovered.value.rejections, []);
  assert.equal(discovered.value.candidates.length, 1);
  const theme = discovered.value.candidates[0];
  assert.notEqual(theme, undefined);
  if (theme === undefined) throw new Error("Theme candidate missing");
  const activated = await created.value.activate({ identity: theme });
  assert.equal(activated.ok, true);
  if (!activated.ok) throw new Error("Theme activation failed");
  return theme;
}

test("Theme Host snapshots exact verified Theme bytes outside the repository", async () => {
  const value = fixture();
  try {
    const theme = await active(value);
    const host = await createThemeHost({ repositoryRoot: process.cwd(), installedThemesRoot: value.installed, activationState: value.state });
    assert.equal(host.ok, true);
    if (!host.ok) return;
    const source = await host.value.resolveActiveRendererSource();
    assert.equal(source.ok, true);
    if (!source.ok) return;
    assert.deepEqual(source.value.identity, theme);
    assert.equal(source.value.entryDigest, sha256Digest(new TextEncoder().encode("export function render() { return []; }")));
    source.value.entryBytes[0] = 0;
    source.value.resources[0]?.bytes.fill(0);
    const again = await host.value.resolveActiveRendererSource();
    assert.equal(again.ok, true);
    if (again.ok) {
      assert.equal(again.value.entryBytes[0], "e".charCodeAt(0));
      assert.equal(new TextDecoder().decode(again.value.resources[0]?.bytes), "body{color:black}");
    }
  } finally { rmSync(value.directory, { recursive: true, force: true }); }
});

test("Theme Host fails closed when active Theme evidence changes", async () => {
  const value = fixture();
  try {
    await active(value);
    writeFileSync(path.join(value.theme, "index.mjs"), "export function render() { return [Date.now()]; }");
    const host = await createThemeHost({ repositoryRoot: process.cwd(), installedThemesRoot: value.installed, activationState: value.state });
    assert.equal(host.ok, true);
    if (!host.ok) return;
    const source = await host.value.resolveActiveRendererSource();
    assert.equal(source.ok, false);
    if (!source.ok) assert.equal(source.error.code, "THEME_EVIDENCE_MISMATCH");
  } finally { rmSync(value.directory, { recursive: true, force: true }); }
});

test("Theme Host rejects a repository-contained installed root", async () => {
  const state = new MemoryState();
  const result = await createThemeHost({ repositoryRoot: process.cwd(), installedThemesRoot: path.join(process.cwd(), "extensions"), activationState: state });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INVALID_TRUSTED_ROOT");
});

test("Theme Host 以 UNSUPPORTED_RENDERER_CONTRACT 分開回報不受支援的 renderer contract", async () => {
  const value = fixture();
  try {
    const entry = new TextEncoder().encode("export function render() { return []; }");
    const resource = new TextEncoder().encode("body{color:black}");
    writeFileSync(path.join(value.theme, "theme-manifest.json"), bytes({
      manifestVersion: "theme-manifest/v1",
      id: "basic-theme",
      version: "1.0.0",
      trustedLocal: true,
      rendererContract: "theme-renderer/v2",
      entry: { file: "index.mjs", digest: sha256Digest(entry) },
      resources: [{ file: "resources/site.css", digest: sha256Digest(resource) }],
    }));
    const created = await createThemeHost({ repositoryRoot: process.cwd(), installedThemesRoot: value.installed, activationState: value.state });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const discovered = await created.value.discover();
    assert.equal(discovered.ok, true);
    if (!discovered.ok) return;
    assert.deepEqual(discovered.value.candidates, []);
    assert.deepEqual(discovered.value.rejections.map((rejection) => [rejection.code, rejection.subjectIds]), [["UNSUPPORTED_RENDERER_CONTRACT", ["basic-theme"]]]);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
