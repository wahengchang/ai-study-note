import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { createLocalMediaObjectStore, startDataMedia } from "../../../core/media/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";
import { createPluginHost, type PluginActivationState } from "../../../core/plugin-host/index.js";
import { createProjectionPreview, parsePreviewInput, parseRendererInput, type ProjectionPreview } from "../../../core/projection/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import { createThemeHost, type ThemeIdentity } from "../../../core/theme-host/index.js";

function canonical(value: unknown): Uint8Array {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("canonical JSON failed");
  return result.value;
}
function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}
// 重新簽出一份 body digest 與 canonical bytes 一致的 payload，證明 digest 本身無法認證來源。
function reseal(document: Record<string, unknown>, digestKey: "inputDigest" | "previewDigest"): Uint8Array {
  const unsigned = Object.fromEntries(Object.entries(document).filter(([key]) => key !== digestKey));
  return canonical({ ...unsigned, [digestKey]: sha256Digest(canonical(unsigned)) });
}

type Harness = Readonly<{ directory: string; store: PersistenceStore; projection: ProjectionPreview; themeIdentity: ThemeIdentity }>;

async function harness(withMedia: boolean): Promise<Harness> {
  const directory = mkdtempSync(path.join(tmpdir(), "projection-strict-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence");
  const store = opened.value;
  const schema = canonical({ type: "object" });
  assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema, schemaDigest: sha256Digest(schema) }).ok, true);
  const mediaStore = createLocalMediaObjectStore({ objectsRoot: path.join(directory, "media") });
  assert.equal(mediaStore.ok, true);
  if (!mediaStore.ok) throw new Error("object store");
  const media = startDataMedia({ persistence: store, objectStore: mediaStore.value });
  assert.equal(media.ok, true);
  if (!media.ok) throw new Error("media");
  const assetVersions = [];
  if (withMedia) {
    assert.equal(media.value.importLocal({ importId: "import-1", assetId: "asset", assetVersionId: "v1", bytes: new Uint8Array([1, 2, 3, 250]), metadata: { type: "image" } }).ok, true);
    assetVersions.push({ assetId: "asset", assetVersionId: "v1" } as const);
  }
  const content = canonical({ title: "published" });
  const revision = { identity: { entryId: "entry-a", revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: content, contentDigest: sha256Digest(content), lineage: { operationId: "save-r1", operationKind: "SaveRevision" } };
  assert.equal(store.createRevisionWithReferences({ revision, assetVersions }).ok, true);
  assert.equal(store.setEntryPointers({ entryId: "entry-a", currentRevisionId: "r1", publishedRevisionId: "r1", lineage: { revisionId: "r1", operationId: "publish-r1", operationKind: "PublishRevision" } }).ok, true);
  // entryId 的 prefix 關係會讓「以空白分隔 tuple」與 producer 的排序不同，用來釘住分隔字元約定。
  const sibling = canonical({ title: "sibling" });
  assert.equal(store.createRevision({ identity: { entryId: "entry-a b", revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: sibling, contentDigest: sha256Digest(sibling), lineage: { operationId: "save-sibling", operationKind: "SaveRevision" } }).ok, true);
  assert.equal(store.setEntryPointers({ entryId: "entry-a b", currentRevisionId: "r1", publishedRevisionId: "r1", lineage: { revisionId: "r1", operationId: "publish-sibling", operationKind: "PublishRevision" } }).ok, true);
  const siteDefinition = createSiteDefinition({ persistence: store });
  assert.equal(siteDefinition.createPublishedClaim({ owner: "entry-a b", route: "/sibling", sourceRevisionId: "r1" }).ok, true);
  assert.equal(siteDefinition.createPublishedClaim({ owner: "entry-a", route: "/published", sourceRevisionId: "r1" }).ok, true);
  assert.equal(siteDefinition.createCurrentClaim({ owner: "entry-a", route: "/published", sourceRevisionId: "r1" }).ok, true);
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
  if (!pluginHost.ok) throw new Error("plugin host");
  const themes = path.join(directory, "themes");
  const themeDirectory = path.join(themes, "safe");
  mkdirSync(themeDirectory, { recursive: true, mode: 0o700 });
  const runtime = new TextEncoder().encode("export const theme = 'safe';\n");
  writeFileSync(path.join(themeDirectory, "runtime.mjs"), runtime, { mode: 0o600 });
  const manifest = canonical({ contract: "theme-manifest/v1", id: "safe-theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest: sha256Digest(runtime) }, resources: [] });
  writeFileSync(path.join(themeDirectory, "theme.json"), manifest, { mode: 0o600 });
  const themeHost = await createThemeHost({ repositoryRoot, installedThemesRoot: themes });
  assert.equal(themeHost.ok, true);
  if (!themeHost.ok) throw new Error("theme host");
  return Object.freeze({
    directory, store,
    projection: createProjectionPreview({ persistence: store, siteDefinition, dataMedia: media.value, pluginHost: pluginHost.value, themeHost: themeHost.value }),
    themeIdentity: Object.freeze({ id: "safe-theme", version: "1.0.0", manifestHash: sha256Digest(manifest) as Digest }),
  });
}

test("capture failures reach the caller as their own diagnosis instead of one storage failure", async () => {
  const context = await harness(false);
  try {
    const missing = await context.projection.preview({ selection: "published", subject: { entryId: "absent" }, themeIdentity: context.themeIdentity });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.error.code, "SUBJECT_NOT_FOUND");
    assert.deepEqual([...missing.error.subjectIds], ["absent"]);

    // 有 published pointer 但沒有 published route claim 的 subject，必須回報 route 無法解析。
    const bytes = canonical({ title: "unrouted" });
    assert.equal(context.store.createRevision({ identity: { entryId: "entry-b", revisionId: "b1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: bytes, contentDigest: sha256Digest(bytes), lineage: { operationId: "save-b1", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(context.store.setEntryPointers({ entryId: "entry-b", currentRevisionId: "b1", publishedRevisionId: "b1", lineage: { revisionId: "b1", operationId: "publish-b1", operationKind: "PublishRevision" } }).ok, true);
    const unrouted = await context.projection.preview({ selection: "published", subject: { entryId: "entry-b" }, themeIdentity: context.themeIdentity });
    assert.equal(unrouted.ok, false);
    if (unrouted.ok) return;
    assert.equal(unrouted.error.code, "UNRESOLVED_ROUTE_REFERENCE");
    assert.deepEqual([...unrouted.error.subjectIds], ["entry-b"]);

    // renderer 是全站 published 投影，多出的無 route entry 必須讓整份 renderer input fail closed。
    const rendered = await context.projection.produceRendererInput({ themeIdentity: context.themeIdentity });
    assert.equal(rendered.ok, false);
    if (rendered.ok) return;
    assert.equal(rendered.error.code, "UNRESOLVED_ROUTE_REFERENCE");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("producer output with embedded media round-trips through the strict parsers", async () => {
  const context = await harness(true);
  try {
    const rendered = await context.projection.produceRendererInput({ themeIdentity: context.themeIdentity });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    const parsed = parseRendererInput(rendered.value.bytes);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.value.input.entries.map((entry) => entry.entryId), ["entry-a", "entry-a b"]);
    assert.equal(parsed.value.input.media.objects.length, 1);
    assert.equal(parsed.value.input.media.objects[0]!.bytesBase64url, "AQID-g");
    assert.equal(parsed.value.input.theme.files.length, 1);
    assert.equal(parsed.value.bytesDigest, rendered.value.bytesDigest);

    const preview = await context.projection.preview({ selection: "published", subject: { entryId: "entry-a" }, themeIdentity: context.themeIdentity });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(parsePreviewInput(preview.value.bytes).ok, true);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("strict parsers reject every resealed payload whose evidence no longer matches its bytes", async () => {
  const context = await harness(true);
  try {
    const rendered = await context.projection.produceRendererInput({ themeIdentity: context.themeIdentity });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    const preview = await context.projection.preview({ selection: "published", subject: { entryId: "entry-a" }, themeIdentity: context.themeIdentity });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;

    // 只有 body digest 自洽、結構完全任意的 document 不得通過。
    assert.equal(parseRendererInput(reseal({ contract: "renderer-input/v1", selection: 5, entries: "not-an-array", routes: null, media: 0, theme: false, plugins: [] }, "inputDigest")).ok, false);
    assert.equal(parsePreviewInput(reseal({ contract: "preview-input/v1", subject: 1, selection: null, entry: [], route: "/", media: 0, theme: false, plugins: [] }, "previewDigest")).ok, false);

    const tampered: readonly (readonly [string, (document: Record<string, unknown>) => void])[] = [
      ["entry content 與 contentDigest 不符", (document) => { (document.entries as Record<string, unknown>[])[0]!.content = { title: "swapped" }; }],
      ["media object bytes 與 objectDigest 不符", (document) => { ((document.media as Record<string, unknown>).objects as Record<string, unknown>[])[0]!.bytesBase64url = "AQIDAQ"; }],
      ["theme runtime bytes 與 manifest digest 不符", (document) => { ((document.theme as Record<string, unknown>).files as Record<string, unknown>[])[0]!.bytesBase64url = "AA"; }],
      ["media selection digest 與內容不符", (document) => { ((document.media as Record<string, unknown>).references as unknown[]).length = 0; }],
      ["route 未經 route-normalization/v1 正規化", (document) => { ((document.routes as Record<string, unknown>).claims as Record<string, unknown>[])[0]!.normalizedRoute = "/Published"; }],
      ["selection 與 entries 不再一一對應", (document) => { (document.selection as Record<string, unknown>).publishedRevisionIds = [{ entryId: "entry-a", revisionId: "r2" }]; }],
    ];
    for (const [reason, mutate] of tampered) {
      const document = decode(rendered.value.bytes);
      mutate(document);
      assert.equal(parseRendererInput(reseal(document, "inputDigest")).ok, false, reason);
    }

    // Preview 只輸出單一 subject：任何讓 subject／entry／route 不一致的改寫都必須被拒絕。
    for (const [reason, mutate] of [
      ["route owner 指向別的 subject", (document: Record<string, unknown>) => { (document.route as Record<string, unknown>).owner = "entry-b"; }],
      ["selectedRevision 與 entry 不符", (document: Record<string, unknown>) => { ((document.selection as Record<string, unknown>).selectedRevision as Record<string, unknown>).revisionId = "r9"; }],
      ["mode 與 routeSelectionDigest 不符", (document: Record<string, unknown>) => { (document.selection as Record<string, unknown>).mode = "current"; }],
    ] as const) {
      const document = decode(preview.value.bytes);
      mutate(document);
      assert.equal(parsePreviewInput(reseal(document, "previewDigest")).ok, false, reason);
    }

    // 非 canonical 的 base64url（補上 padding）不得通過。
    const padded = decode(rendered.value.bytes);
    ((padded.media as Record<string, unknown>).objects as Record<string, unknown>[])[0]!.bytesBase64url = "AQID-g==";
    assert.equal(parseRendererInput(reseal(padded, "inputDigest")).ok, false);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});
