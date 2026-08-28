import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import {
  createPluginHost,
  type PluginActivationState,
  type PluginActivationStatePort,
  type PluginManifestV1,
} from "../../../core/plugin-host/index.js";

const repositoryRoot = process.cwd();
const templateRoot = path.join(repositoryRoot, "extensions", "plugins", "activation-probe");
// `aa`／`ab` 與 `resources/aa.json`／`resources/ab.json` 在 da-DK collation 下的順序與
// code-unit 順序相反，因此可分辨 host 是否讓 locale 決定 identity 與 manifest hash。
const divergentLocale = "da_DK.UTF-8";
const childMarker = "PLUGIN_HOST_LOCALE_CHILD";
const pluginIds = ["aa", "ab"] as const;
const resourceFiles = ["resources/ab.json", "resources/aa.json"] as const;

function bytes(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Foundation canonical JSON unexpectedly failed");
  return result.value;
}

function copyState(value: PluginActivationState): PluginActivationState {
  return Object.freeze({
    contract: "plugin-activation-state/v1",
    identities: Object.freeze(value.identities.map((identity) => Object.freeze({ ...identity }))),
  });
}

function activationDigest(value: PluginActivationState): Digest {
  return sha256Digest(bytes({ contract: value.contract, identities: value.identities }));
}

class MemoryActivationStatePort implements PluginActivationStatePort {
  public state: PluginActivationState = copyState({ contract: "plugin-activation-state/v1", identities: [] });

  public async read(): Promise<PluginActivationState> {
    return copyState(this.state);
  }

  public async compareAndReplace(input: Readonly<{ expectedDigest: Digest; nextState: PluginActivationState }>): Promise<boolean> {
    if (input.expectedDigest !== activationDigest(this.state)) return false;
    this.state = copyState(input.nextState);
    return true;
  }
}

function manifestFor(pluginDirectory: string, pluginId: string, files: readonly string[]): PluginManifestV1 {
  return {
    manifestVersion: "plugin-manifest/v1",
    id: pluginId,
    version: "1.0.0",
    trustedLocal: true,
    hookContract: "plugin-hooks/v1",
    capabilities: ["save-revision-validator", "cms-editor-block-resolution"],
    entry: { file: "index.mjs", digest: sha256Digest(readFileSync(path.join(pluginDirectory, "index.mjs"))) },
    callbacks: [
      { hook: "save-revision/validate", exportName: "validateSaveRevision", priority: 10 },
      { hook: "cms/editor-block/resolve", exportName: "resolveEditorBlock", priority: 20 },
    ],
    resources: files.map((file) => ({ file, digest: sha256Digest(readFileSync(path.join(pluginDirectory, file))) })),
  };
}

function stage(installedRoot: string, pluginId: string): Digest {
  const pluginDirectory = path.join(installedRoot, pluginId);
  cpSync(templateRoot, pluginDirectory, { recursive: true });
  writeFileSync(path.join(pluginDirectory, "index.mjs"), readFileSync(path.join(templateRoot, "index.ts")));
  for (const file of resourceFiles) writeFileSync(path.join(pluginDirectory, file), bytes({ resource: file }));
  // 宣告順序刻意不是正規順序：normalization 的排序規則決定 manifest hash。
  writeFileSync(path.join(pluginDirectory, "plugin-manifest.json"), bytes(manifestFor(pluginDirectory, pluginId, resourceFiles)));
  // 期望值只用 code-unit 順序，與執行環境的 collation 無關。
  const normalized = manifestFor(pluginDirectory, pluginId, [...resourceFiles].sort());
  return sha256Digest(bytes({
    ...normalized,
    capabilities: [...normalized.capabilities].sort(),
    callbacks: [...normalized.callbacks].sort((left, right) => (left.hook < right.hook ? -1 : left.hook > right.hook ? 1 : 0)),
  }));
}

test("identity and manifest hash follow code-unit order, not the host locale", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "plugin-host-locale-"));
  try {
    const installedRoot = path.join(directory, "installed");
    const expected = pluginIds.map((pluginId) => stage(installedRoot, pluginId));
    const port = new MemoryActivationStatePort();
    const created = await createPluginHost({ repositoryRoot, installedPluginsRoot: installedRoot, activationState: port });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    for (const pluginId of pluginIds) {
      const activated = await created.value.activate({ pluginId });
      assert.equal(activated.ok, true, activated.ok ? "" : activated.error.code);
    }
    assert.deepEqual(port.state.identities.map((identity) => identity.id), [...pluginIds].sort());
    assert.deepEqual(port.state.identities.map((identity) => identity.manifestHash), expected);

    // 寫入順序若不是 reader 接受的 canonical 順序，active state 會永久無法讀取。
    const restored = await created.value.getActiveSnapshot();
    assert.equal(restored.ok, true, restored.ok ? "" : restored.error.code);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the same contract holds under a collation-divergent locale", { skip: process.env[childMarker] === "1" }, () => {
  const { NODE_TEST_CONTEXT, NODE_TEST_WORKER_ID, ...inherited } = process.env;
  void NODE_TEST_CONTEXT;
  void NODE_TEST_WORKER_ID;
  // child 必須是獨立的 runner；沿用 test-runner context 會讓巢狀 `--test` 回報 exit code 0。
  execFileSync(process.execPath, ["--import", "tsx", "--test", fileURLToPath(import.meta.url)], {
    cwd: repositoryRoot,
    env: { ...inherited, [childMarker]: "1", LANG: divergentLocale, LC_ALL: divergentLocale },
    stdio: ["ignore", "pipe", "pipe"],
  });
});
