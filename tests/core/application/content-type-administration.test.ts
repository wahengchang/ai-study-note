import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createContentTypeAdministration } from "../../../core/application/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { getSiteContentSchemaEvidence } from "../../../core/content/index.js";

function databasePath(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "content-type-administration-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

test("create allocates a current definition, actual slug, fixed fields, and catalog digest", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({
      persistence: opened.value,
      newStableId: (() => {
        const identifiers = ["00000000-0000-4000-8000-000000000010"];
        return () => identifiers.shift() ?? "00000000-0000-4000-8000-000000000099";
      })(),
    });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const created = await administration.create({
      contract: "content-type-create-request/v1",
      expectedStateDigest: catalog.value.stateDigest,
      label: "Categories",
      help: "",
      order: 1,
      showInMenu: true,
      fieldGroups: [],
      taxonomyAttachments: [],
    });
    assert.deepEqual(created.ok && { contract: created.value.contract, slug: created.value.slug, systemFields: created.value.systemFields }, {
      contract: "content-type-definition/v1",
      slug: "categories-2",
      systemFields: ["title", "body", "slug", "excerpt", "featuredMedia", "categories", "tags", "seo", "status", "publishedAt"],
    });
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("invalid canonical definition rolls back its global slug claim", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({ persistence: opened.value, newStableId: () => "00000000-0000-4000-8000-000000000011" });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const before = opened.value.canonicalState();
    assert.equal(before.ok, true);
    const rejected = await administration.create({
      contract: "content-type-create-request/v1",
      expectedStateDigest: catalog.value.stateDigest,
      label: "Rollback",
      help: "",
      order: 1,
      showInMenu: true,
      fieldGroups: [undefined],
      taxonomyAttachments: [],
    });
    assert.deepEqual(rejected.ok ? undefined : rejected.error.code, "INVALID_CONTENT_TYPE_DEFINITION");
    const after = opened.value.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest);
    assert.deepEqual(opened.value.getCurrentContentType("00000000-0000-4000-8000-000000000011").ok, false);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("replace uses the definition digest and preserves current definition identity", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({ persistence: opened.value });
    const articleId = "00000000-0000-4000-8000-000000000001";
    const before = await administration.get({ typeId: articleId });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const replaced = await administration.replace({
      typeId: articleId,
      definition: {
        contract: "content-type-replace-request/v1",
        expectedStateDigest: before.value.stateDigest,
        label: "文章更新",
        slug: "articles-updated",
        help: "更新說明",
        order: 3,
        showInMenu: false,
        fieldGroups: before.value.fieldGroups,
        taxonomyAttachments: before.value.taxonomyAttachments,
      },
    });
    assert.deepEqual(replaced.ok && { typeId: replaced.value.typeId, slug: replaced.value.slug, label: replaced.value.label, showInMenu: replaced.value.showInMenu }, { typeId: articleId, slug: "articles-updated", label: "文章更新", showInMenu: false });
    const stale = await administration.replace({
      typeId: articleId,
      definition: {
        contract: "content-type-replace-request/v1",
        expectedStateDigest: before.value.stateDigest,
        label: "不得寫入",
        slug: "articles-stale",
        help: "",
        order: 0,
        showInMenu: true,
        fieldGroups: before.value.fieldGroups,
        taxonomyAttachments: before.value.taxonomyAttachments,
      },
    });
    assert.deepEqual(stale.ok ? undefined : stale.error.code, "CONTENT_TYPE_STATE_CONFLICT");
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("default allocator issues a UUIDv4 when no test allocator is supplied", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({ persistence: opened.value });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const created = await administration.create({
      contract: "content-type-create-request/v1",
      expectedStateDigest: catalog.value.stateDigest,
      label: "預設 ID",
      help: "",
      order: 1,
      showInMenu: true,
      fieldGroups: [],
      taxonomyAttachments: [],
    });
    assert.equal(created.ok, true);
    if (created.ok) assert.match(created.value.typeId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("metadata scalar bounds reject before durable mutation", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({ persistence: opened.value });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const before = opened.value.canonicalState();
    assert.equal(before.ok, true);
    const rejected = await administration.create({
      contract: "content-type-create-request/v1",
      expectedStateDigest: catalog.value.stateDigest,
      label: "a".repeat(121),
      help: "",
      order: 0,
      showInMenu: true,
      fieldGroups: [],
      taxonomyAttachments: [],
    });
    assert.deepEqual(rejected.ok ? undefined : rejected.error.code, "INVALID_CONTENT_TYPE_DEFINITION");
    const after = opened.value.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("create materializes nested IDs and select default references", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    let next = 20;
    const administration = createContentTypeAdministration({ persistence: opened.value, newStableId: () => `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}` });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const created = await administration.create({
      contract: "content-type-create-request/v1", expectedStateDigest: catalog.value.stateDigest, label: "活動", help: "", order: 1, showInMenu: true, taxonomyAttachments: [],
      fieldGroups: [{ label: "設定", help: "", order: 0, fields: [{ kind: "single-select", label: "狀態", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: {}, options: [{ newOptionKey: "draft", label: "草稿", order: 0 }, { newOptionKey: "live", label: "上線", order: 1 }], defaultOptionRef: { newOptionKey: "live" } }] }],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const group = created.value.fieldGroups[0] as Record<string, unknown>;
    const field = (group.fields as readonly Record<string, unknown>[])[0]!;
    const options = field.options as readonly Record<string, unknown>[];
    assert.deepEqual({ groupId: group.groupId, fieldId: field.fieldId, optionIds: options.map((option) => option.optionId), defaultValue: field.defaultValue }, {
      groupId: "00000000-0000-4000-8000-000000000020", fieldId: "00000000-0000-4000-8000-000000000021", optionIds: ["00000000-0000-4000-8000-000000000022", "00000000-0000-4000-8000-000000000023"], defaultValue: "00000000-0000-4000-8000-000000000023",
    });
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("populated Article permits an optional field but rejects required tightening", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const bytes = canonicalJsonBytes({ title: "existing" });
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    const siteContent = getSiteContentSchemaEvidence();
    assert.equal(opened.value.registerSchemaVersion({ identity: siteContent.identity, schemaBytes: siteContent.schemaBytes, schemaDigest: siteContent.schemaDigest }).ok, true);
    assert.equal(opened.value.createRevision({ identity: { entryId: "existing-article", revisionId: "r1" }, schemaIdentity: { schemaId: "site-content", version: 1 }, contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value), lineage: { operationId: "seed", operationKind: "SaveRevision" } }).ok, true);
    assert.equal(opened.value.setEntryPointers({ entryId: "existing-article", currentRevisionId: "r1", lineage: { revisionId: "r1", operationId: "seed", operationKind: "SaveRevision" } }).ok, true);
    let id = 30;
    const administration = createContentTypeAdministration({ persistence: opened.value, newStableId: () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}` });
    const article = await administration.get({ typeId: "00000000-0000-4000-8000-000000000001" });
    assert.equal(article.ok, true);
    if (!article.ok) return;
    const optional = await administration.replace({ typeId: article.value.typeId, definition: { contract: "content-type-replace-request/v1", expectedStateDigest: article.value.stateDigest, label: article.value.label, slug: article.value.slug, help: article.value.help, order: article.value.order, showInMenu: article.value.showInMenu, taxonomyAttachments: article.value.taxonomyAttachments, fieldGroups: [{ label: "延伸", help: "", order: 0, fields: [{ kind: "text", label: "副標", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: {} }] }] } });
    assert.equal(optional.ok, true);
    if (!optional.ok) return;
    const groups = structuredClone(optional.value.fieldGroups) as unknown as Array<Record<string, unknown>>;
    const field = (groups[0]!.fields as Array<Record<string, unknown>>)[0]!;
    field.required = true;
    const before = opened.value.canonicalState();
    assert.equal(before.ok, true);
    const tightened = await administration.replace({ typeId: optional.value.typeId, definition: { contract: "content-type-replace-request/v1", expectedStateDigest: optional.value.stateDigest, label: optional.value.label, slug: optional.value.slug, help: optional.value.help, order: optional.value.order, showInMenu: optional.value.showInMenu, taxonomyAttachments: optional.value.taxonomyAttachments, fieldGroups: groups } });
    assert.deepEqual(tightened.ok ? undefined : tightened.error.code, "CONTENT_TYPE_BREAKING_CHANGE");
    const after = opened.value.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("custom field defaults must be canonical, addressable and compatible with required", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    let counter = 0x40;
    const administration = createContentTypeAdministration({ persistence: opened.value, newStableId: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}` });
    const catalog = await administration.list();
    assert.equal(catalog.ok, true);
    if (!catalog.ok) return;
    const create = async (field: Readonly<Record<string, unknown>>): Promise<string> => {
      const current = await administration.list();
      if (!current.ok) return current.error.code;
      const created = await administration.create({ contract: "content-type-create-request/v1", expectedStateDigest: current.value.stateDigest, label: `預設值型別 ${String(counter)}`, help: "", order: 0, showInMenu: false, fieldGroups: [{ label: "主要", help: "", order: 0, fields: [field] }], taxonomyAttachments: [] });
      return created.ok ? "ok" : created.error.code;
    };

    // datetime 必須是 RFC 3339 且日曆有效的完整形狀。
    for (const value of ["2026-09-16Z", "2026-09-16 12:00:00Z", "2026-02-30T12:00:00Z", "2026-09-16T12:00Z"]) {
      assert.equal(await create({ kind: "datetime", label: "時間", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {}, defaultValue: value }), "INVALID_CONTENT_TYPE_DEFINITION", value);
    }
    assert.equal(await create({ kind: "datetime", label: "時間", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {}, defaultValue: "2026-09-16T12:00:00+08:00" }), "ok");

    // media default 必須是可被 /v1/media/:assetId 定址的 identity。
    assert.equal(await create({ kind: "single-media", label: "圖", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: "asset-1" }), "ok");
    for (const value of ["my photo.png", "a/b", "", "."]) {
      assert.equal(await create({ kind: "single-media", label: "圖", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: value }), "INVALID_CONTENT_TYPE_DEFINITION", value);
    }

    // required 的空 default 是自相矛盾的 definition。
    assert.equal(await create({ kind: "text", label: "標語", help: "", order: 0, required: true, showInGenericTemplate: false, constraints: {}, defaultValue: "" }), "INVALID_CONTENT_TYPE_DEFINITION");
    assert.equal(await create({ kind: "multi-media", label: "媒體", help: "", order: 0, required: true, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: [] }), "INVALID_CONTENT_TYPE_DEFINITION");
    assert.equal(await create({ kind: "text", label: "標語", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {}, defaultValue: "" }), "ok");

    // 寫入路徑會把 multi-media default 正規化為升冪且唯一的順序。
    const latest = await administration.list();
    const sorted = await administration.create({ contract: "content-type-create-request/v1", expectedStateDigest: latest.ok ? latest.value.stateDigest : catalog.value.stateDigest, label: "多媒體預設", help: "", order: 0, showInMenu: false, fieldGroups: [{ label: "主要", help: "", order: 0, fields: [{ kind: "multi-media", label: "相簿", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: ["b-asset", "a-asset"] }] }], taxonomyAttachments: [] });
    assert.equal(sorted.ok, true);
    if (sorted.ok) assert.deepEqual(sorted.value.fieldGroups[0]!.fields[0]!.defaultValue, ["a-asset", "b-asset"]);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("a persisted definition keeps its stored bytes and digest even when a legacy default is unordered", async () => {
  const fixture = databasePath();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const administration = createContentTypeAdministration({ persistence: opened.value, newStableId: () => "00000000-0000-4000-8000-0000000000a1" });
    const typeId = "00000000-0000-4000-8000-0000000000a1";
    // WI-003 之前寫入的 definition：multi-media default 保留 caller 順序（未排序）。
    const legacy = { contract: "content-type-definition/v1", typeId, label: "舊定義", slug: "legacy-default", help: "", order: 0, showInMenu: false, systemFields: ["title", "body", "slug", "excerpt", "featuredMedia", "categories", "tags", "seo", "status", "publishedAt"], fieldGroups: [{ groupId: "00000000-0000-4000-8000-0000000000a2", label: "主要", help: "", order: 0, fields: [{ fieldId: "00000000-0000-4000-8000-0000000000a3", kind: "multi-media", label: "相簿", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: ["b-asset", "a-asset"] }] }], taxonomyAttachments: [] };
    const bytes = canonicalJsonBytes(legacy);
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    const digest = sha256Digest(bytes.value);
    assert.equal(opened.value.runTransaction((transaction) => transaction.createCurrentContentType({ typeId, definitionBytes: bytes.value, definitionDigest: digest })).ok, true);

    const read = await administration.get({ typeId });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    // 讀取必須忠實反映 stored bytes：順序不變，且 stateDigest 與 stored bytes 相符。
    assert.deepEqual(read.value.fieldGroups[0]!.fields[0]!.defaultValue, ["b-asset", "a-asset"]);
    assert.equal(read.value.stateDigest, digest);
    assert.deepEqual(Object.fromEntries(Object.entries(read.value).filter(([key]) => key !== "stateDigest")), legacy);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
