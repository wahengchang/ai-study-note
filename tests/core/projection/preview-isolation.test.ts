import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { createPluginHost, type PluginActivationState } from "../../../core/plugin-host/index.js";
import { createProjectionPreview, parsePreviewInput, parseRendererInput } from "../../../core/projection/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import { createThemeHost } from "../../../core/theme-host/index.js";

function canonical(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical JSON failed");
  return result.value;
}

test("renderer input stays published-only while current preview exposes only its subject draft", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "projection-preview-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    const schema = canonical({ type: "object" });
    assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema, schemaDigest: sha256Digest(schema) }).ok, true);
    for (const [revisionId, content] of [["r1", { title: "published" }], ["r2", { title: "DRAFT_SECRET" }]] as const) {
      const bytes = canonical(content);
      assert.equal(store.createRevision({ identity: { entryId: "entry-a", revisionId }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: bytes, contentDigest: sha256Digest(bytes), lineage: { operationId: `save-${revisionId}`, operationKind: "SaveRevision" } }).ok, true);
    }
    assert.equal(store.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r1", publishedRevisionId: "r1", lineage: { revisionId: "r1", operationId: "publish-r1", operationKind: "PublishRevision" } }).ok, true);
    assert.equal(store.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r2", publishedRevisionId: "r1", lineage: { revisionId: "r2", operationId: "save-r2", operationKind: "SaveRevision" } }).ok, true);
    const siteDefinition = createSiteDefinition({ persistence: store });
    assert.equal(siteDefinition.createPublishedClaim({ owner: "entry-a", route: "/published", sourceRevisionId: "r1" }).ok, true);
    assert.equal(siteDefinition.createCurrentClaim({ owner: "entry-a", route: "/draft", sourceRevisionId: "r2" }).ok, true);
    const mediaStore = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "media") });
    assert.equal(mediaStore.ok, true);
    if (!mediaStore.ok) return;
    const media = startDataMedia({ persistence: store, objectStore: mediaStore.value });
    assert.equal(media.ok, true);
    if (!media.ok) return;
    const repositoryRoot = path.join(directory, "repository");
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const installedPlugins = path.join(directory, "plugins");
    mkdirSync(installedPlugins, { mode: 0o700 });
    const pluginHost = await createPluginHost({
      repositoryRoot, installedPluginsRoot: installedPlugins,
      activationState: {
        async read(): Promise<PluginActivationState> { return Object.freeze({ contract: "plugin-activation-state/v2", active: Object.freeze([]), reactivationRequired: Object.freeze([]) }); },
        async compareAndReplace(): Promise<boolean> { return false; },
      },
    });
    assert.equal(pluginHost.ok, true);
    if (!pluginHost.ok) return;
    const themes = path.join(directory, "themes");
    const themeDirectory = path.join(themes, "safe");
    mkdirSync(themeDirectory, { recursive: true, mode: 0o700 });
    const runtime = new TextEncoder().encode("export const theme = 'safe';\n");
    writeFileSync(path.join(themeDirectory, "runtime.mjs"), runtime, { mode: 0o600 });
    const manifest = canonical({ contract: "theme-manifest/v1", id: "safe-theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(runtime) }, resources: [] });
    writeFileSync(path.join(themeDirectory, "theme.json"), manifest, { mode: 0o600 });
    const themeHost = await createThemeHost({ repositoryRoot, installedThemesRoot: themes });
    assert.equal(themeHost.ok, true);
    if (!themeHost.ok) return;
    const projection = createProjectionPreview({ persistence: store, siteDefinition, dataMedia: media.value, pluginHost: pluginHost.value, themeHost: themeHost.value });
    const themeIdentity = { id: "safe-theme", version: "1.0.0", manifestHash: sha256Digest(manifest) } as const;
    const rendered = await projection.produceRendererInput({ themeIdentity });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    const renderedText = new TextDecoder().decode(rendered.value.bytes);
    assert.equal(renderedText.includes("DRAFT_SECRET"), false);
    assert.equal(parseRendererInput(rendered.value.bytes).ok, true);
    const current = await projection.preview({ selection: "current", subject: { entryId: "entry-a" }, themeIdentity });
    assert.equal(current.ok, true);
    if (!current.ok) return;
    assert.equal(new TextDecoder().decode(current.value.bytes).includes("DRAFT_SECRET"), true);
    assert.equal(parsePreviewInput(current.value.bytes).ok, true);
    const published = await projection.preview({ selection: "published", subject: { entryId: "entry-a" }, themeIdentity });
    assert.equal(published.ok, true);
    if (!published.ok) return;
    assert.equal(new TextDecoder().decode(published.value.bytes).includes("DRAFT_SECRET"), false);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
