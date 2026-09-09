import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { createPluginHost, type PluginActivationState, type PluginActivationStatePort, type PluginSettingsState, type PluginSettingsStatePort } from "../../../core/plugin-host/index.js";

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
async function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "public-plugin-")); const installed = path.join(directory, "installed"); const plugin = path.join(installed, "seo"); mkdirSync(plugin, { recursive: true });
  const entry = new TextEncoder().encode("export function page(){return {contract:'public-seo-page-contribution/v1',contribution:{title:'Post'}}} export function site(){return {contract:'public-seo-site-contribution/v1',contribution:{robots:'allow'}}}");
  writeFileSync(path.join(plugin, "index.mjs"), entry);
  writeFileSync(path.join(plugin, "plugin-manifest.json"), bytes({ manifestVersion: "plugin-manifest/v1", id: "seo", version: "1.0.0", trustedLocal: true, hookContract: "plugin-hooks/v1", capabilities: ["public-seo-page-contribution", "public-seo-site-contribution"], entry: { file: "index.mjs", digest: sha256Digest(entry) }, callbacks: [{ hook: "public/seo/page", exportName: "page", priority: 0 }, { hook: "public/seo/site", exportName: "site", priority: 0 }], resources: [] }));
  const activation = new ActivationPort(); const settings = new SettingsPort(); const created = await createPluginHost({ repositoryRoot: process.cwd(), installedPluginsRoot: installed, activationState: activation, settingsState: settings }); if (!created.ok) throw new Error(created.error.code);
  const found = await created.value.discover(); if (!found.ok) throw new Error(found.error.code); const identity = found.value.candidates[0]!;
  const snapshot = await created.value.getSettingsSnapshot(); if (!snapshot.ok) throw new Error(snapshot.error.code);
  const saved = await created.value.replaceSettings({ identity, expectedSettingsStateDigest: snapshot.value.stateDigest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/", indexing: "allow" } }); if (!saved.ok) throw new Error(saved.error.code);
  const active = await created.value.getActiveSnapshot(); if (!active.ok) throw new Error(active.error.code); const activated = await created.value.activate({ identity, expectedActivationStateDigest: active.value.digest }); if (!activated.ok) throw new Error(activated.error.code);
  return { directory, plugin, host: created.value };
}

test("prepared public token rejects foreign and stale state", async () => {
  const value = await fixture();
  try {
    const prepared = await value.host.resolvePublicBuildSnapshot({ contract: "public-plugin-build-request/v1", published: { route: "/post/" } });
    assert.equal(prepared.ok, true); if (!prepared.ok) return;
    const foreign = await value.host.validatePublicBuildSnapshot({ snapshot: prepared.value.snapshot, token: Symbol("foreign") } as never);
    assert.equal(foreign.ok, false); if (!foreign.ok) assert.equal(foreign.error.code, "INVALID_PLUGIN_OPERATION_SNAPSHOT");
    const valid = await value.host.validatePublicBuildSnapshot(prepared.value); assert.equal(valid.ok, true);
    const next = await value.host.resolvePublicBuildSnapshot({ contract: "public-plugin-build-request/v1", published: { route: "/post/" } }); assert.equal(next.ok, true); if (!next.ok) return;
    const settings = await value.host.getSettingsSnapshot(); assert.equal(settings.ok, true); if (!settings.ok) return;
    const saved = await value.host.replaceSettings({ identity: settings.value.records[0]!.identity, expectedSettingsStateDigest: settings.value.stateDigest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: "https://example.test/sub/", indexing: "allow" } }); assert.equal(saved.ok, true);
    const stale = await value.host.validatePublicBuildSnapshot(next.value); assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, "PUBLIC_BUILD_SNAPSHOT_STALE");
  } finally { rmSync(value.directory, { recursive: true, force: true }); }
});

test("SEO-only evidence drift latches omission while generic invalid callback hard fails", async () => {
  const value = await fixture();
  try {
    unlinkSync(path.join(value.plugin, "index.mjs"));
    const omitted = await value.host.resolvePublicBuildSnapshot({ contract: "public-plugin-build-request/v1", published: { route: "/post/" } });
    assert.equal(omitted.ok, true); if (omitted.ok) assert.equal(omitted.value.snapshot.seo.status, "omitted");
  } finally { rmSync(value.directory, { recursive: true, force: true }); }
});
