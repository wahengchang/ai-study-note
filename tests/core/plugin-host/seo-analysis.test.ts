import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { createPluginHost, type PluginActivationIdentity, type PluginActivationState, type PluginActivationStatePort, type PluginHost, type PluginSettingsState, type PluginSettingsStatePort } from "../../../core/plugin-host/index.js";
function bytes(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); if (!result.ok) throw new Error("canonical"); return result.value; }
class ActivationPort implements PluginActivationStatePort {
  state: PluginActivationState = { contract: "plugin-activation-state/v2", active: [], reactivationRequired: [] };
  async read() { return JSON.parse(new TextDecoder().decode(bytes(this.state))) as PluginActivationState; }
  async compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginActivationState }>) { if (input.expectedDigest !== sha256Digest(bytes(this.state))) return false; this.state = input.nextState; return true; }
}
class SettingsPort implements PluginSettingsStatePort {
  state: PluginSettingsState = { contract: "plugin-settings-state/v1", records: [] };
  async read() { return JSON.parse(new TextDecoder().decode(bytes(this.state))) as PluginSettingsState; }
  async compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginSettingsState }>) { if (input.expectedDigest !== sha256Digest(bytes(this.state))) return false; this.state = input.nextState; return true; }
}
function stage(root: string, id: string, source: string): void {
  const directory = path.join(root, id); mkdirSync(directory, { recursive: true });
  const entry = new TextEncoder().encode(source);
  writeFileSync(path.join(directory, "index.mjs"), entry);
  writeFileSync(path.join(directory, "plugin-manifest.json"), bytes({ manifestVersion: "plugin-manifest/v1", id, version: "1.0.0", trustedLocal: true, hookContract: "plugin-hooks/v1", capabilities: ["cms-seo-analysis"], entry: { file: "index.mjs", digest: sha256Digest(entry) }, callbacks: [{ hook: "cms/seo/analyze", exportName: "analyze", priority: 0 }], resources: [] }));
}
async function setup(sources: readonly string[]) {
  const directory = mkdtempSync(path.join(tmpdir(), "seo-analysis-")); const installed = path.join(directory, "installed");
  for (let index = 0; index < sources.length; index += 1) stage(installed, `seo-${index}`, sources[index]!);
  const activation = new ActivationPort(); const settings = new SettingsPort();
  const created = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installed, activationState: activation, settingsState: settings });
  if (!created.ok) throw new Error(created.error.code);
  return { directory, host: created.value };
}
async function configureAndActivate(host: PluginHost, id: string): Promise<PluginActivationIdentity> {
  const discovered = await host.discover(); if (!discovered.ok) throw new Error(discovered.error.code);
  const identity = discovered.value.candidates.find((candidate) => candidate.id === id); if (identity === undefined) throw new Error("candidate");
  const settings = await host.getSettingsSnapshot(); if (!settings.ok) throw new Error(settings.error.code);
  const saved = await host.replaceSettings({ identity, expectedSettingsStateDigest: settings.value.stateDigest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/", indexing: "allow" } }); if (!saved.ok) throw new Error(saved.error.code);
  const active = await host.getActiveSnapshot(); if (!active.ok) throw new Error(active.error.code);
  const activated = await host.activate({ identity, expectedActivationStateDigest: active.value.digest }); if (!activated.ok) throw new Error(activated.error.code);
  return identity;
}
function request() {
  const value = { contract: "cms-seo-analysis-input/v1" as const, entryId: "entry", schemaIdentity: { schemaId: "site-content", version: 1 }, content: { title: "Post", blocks: [], seo: {} }, route: "/post/", settings: { contract: "seo-plugin-settings/v1" as const, publicSiteUrl: "https://example.test/", indexing: "allow" as const } };
  return { ...value, inputDigest: sha256Digest(bytes(value)) };
}

test("analysis accepts zero or one synchronous exact producer and rejects stale settings state", async () => {
  const fixture = await setup(["export function analyze(){return {contract:'cms-seo-analysis-output/v1',preview:{title:'Post'},suggestions:[{code:'SEO_TITLE_MISSING'}]};}"]);
  try {
    await configureAndActivate(fixture.host, "seo-0");
    const result = await fixture.host.analyzeCmsSeo(request());
    assert.equal(result.ok, true); if (result.ok) assert.equal(result.value.status, "available");
    const settings = await fixture.host.getSettingsSnapshot(); assert.equal(settings.ok, true); if (!settings.ok) return;
    const stale = await fixture.host.replaceSettings({ identity: settings.value.records[0]!.identity, expectedSettingsStateDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", settingsContract: "seo-plugin-settings/v1", settings: settings.value.records[0]!.settings });
    assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, "PLUGIN_SETTINGS_STATE_CONFLICT");
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("analysis makes two valid producers nonblocking unavailable", async () => {
  const source = "export function analyze(){return {contract:'cms-seo-analysis-output/v1',preview:{title:'Post'},suggestions:[]};}";
  const fixture = await setup([source, source]);
  try {
    await configureAndActivate(fixture.host, "seo-0"); await configureAndActivate(fixture.host, "seo-1");
    const result = await fixture.host.analyzeCmsSeo(request());
    assert.equal(result.ok, true); if (result.ok) { assert.equal(result.value.status, "unavailable"); assert.equal(result.value.diagnostics.some((item) => item.code === "SEO_ANALYSIS_CONFLICT"), true); }
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});
