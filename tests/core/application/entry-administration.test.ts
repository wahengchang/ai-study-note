import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createContentTypeAdministration, createCurrentEntryAdministration, type ContentTypeDefinitionV1, type CptEntryCatalogV1, type CptEntryCreateRequestV1, type CptEntryDeleteRequestV1, type CptEntrySaveRequestV1, type CptEntryV1, type CurrentEntryAdministration } from "../../../core/application/index.js";
import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";

const articleTypeId = "00000000-0000-4000-8000-000000000001";
const entryIds = ["00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"];

type Fixture = Readonly<{ directory: string; store: PersistenceStore; administration: CurrentEntryAdministration; setNow(value: string): void; ids: string[]; newStableId(): string }>;

function fixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "entry-administration-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence did not open");
  const ids = [...entryIds];
  let counter = 0x100;
  let current = "2026-09-16T02:00:00.000Z";
  const newStableId = (): string => ids.shift() ?? `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`;
  return {
    directory,
    store: opened.value,
    ids,
    newStableId,
    setNow(value: string) { current = value; },
    administration: createCurrentEntryAdministration({ persistence: opened.value, newStableId, now: () => new Date(current) }),
  };
}

/** 建立一個帶 custom fields 的 Content Type，回傳它的 stable ID 與 definition 供 entry 測試使用。 */
async function customContentType(context: Fixture, fields: readonly Readonly<Record<string, unknown>>[]): Promise<Readonly<{ typeId: string; definition: ContentTypeDefinitionV1 }>> {
  const contentTypes = createContentTypeAdministration({ persistence: context.store, newStableId: context.newStableId });
  const catalog = unwrap(await contentTypes.list());
  const created = unwrap(await contentTypes.create({ contract: "content-type-create-request/v1", expectedStateDigest: catalog.stateDigest, label: "範例型別", help: "", order: 0, showInMenu: false, fieldGroups: [{ label: "主要", help: "", order: 0, fields: [...fields] }], taxonomyAttachments: [] }));
  return { typeId: created.typeId, definition: created };
}

/** 取 definition 內某個 field 的 stable ID；測試用它證明 readback 以 stable ID 為 identity。 */
function fieldIdOf(definition: ContentTypeDefinitionV1, label: string): string {
  const field = definition.fieldGroups.flatMap((group) => group.fields).find((candidate) => candidate.label === label);
  if (field === undefined) throw new Error(`field ${label} not found`);
  return field.fieldId;
}

function optionIdOf(definition: ContentTypeDefinitionV1, label: string, optionLabel: string): string {
  const field = definition.fieldGroups.flatMap((group) => group.fields).find((candidate) => candidate.label === label);
  const option = field?.options?.find((candidate) => candidate.label === optionLabel);
  if (option === undefined) throw new Error(`option ${optionLabel} not found`);
  return option.optionId;
}

function customContent(input: Readonly<{ typeId: string; title: string; customValues: readonly Readonly<{ fieldId: string; value: unknown }>[] }>): Readonly<Record<string, unknown>> {
  return { contract: "cpt-content/v1", typeId: input.typeId, title: input.title, blocks: [{ kind: "article", text: `${input.title} 內文` }], excerpt: "", seo: {}, customValues: [...input.customValues] };
}

/** 只送 customValues 的 create/save request；其他必填 system field 由 helper 補齊。 */
function customCreateRequest(catalog: CptEntryCatalogV1, input: Readonly<{ typeId: string; title: string; status?: string; customValues?: readonly Readonly<{ fieldId: string; value: unknown }>[] }>): CptEntryCreateRequestV1 {
  return { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, content: customContent({ typeId: input.typeId, title: input.title, customValues: input.customValues ?? [] }), status: input.status ?? "draft" };
}

function customSaveRequest(entry: CptEntryV1, input: Readonly<{ status?: string; customValues?: readonly Readonly<{ fieldId: string; value: unknown }>[] }>): CptEntrySaveRequestV1 {
  return { contract: "cpt-entry-save-request/v1", expectedStateDigest: entry.stateDigest, slug: entry.slug, content: customContent({ typeId: entry.typeId, title: entry.content.title, customValues: input.customValues ?? [] }), status: input.status ?? entry.status };
}

function valuesOf(entry: CptEntryV1): Readonly<Record<string, unknown>> {
  return Object.fromEntries(entry.content.customValues.map((item) => [item.fieldId, item.value]));
}

type StableResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: string }> }>;

function unwrap<T>(result: StableResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error.code);
}

function failureCode<T>(result: StableResult<T>): string {
  assert.equal(result.ok, false, "expected a stable failure");
  return result.ok ? "" : result.error.code;
}

/** 刻意建構不合法的 request payload：型別由呼叫端聲明，實際驗證一律由 Application 負責。 */
function rawRequest<T>(payload: Readonly<Record<string, unknown>>): T {
  return payload as T;
}

function content(input: Readonly<{ title: string; text?: string; excerpt?: string; customValues?: readonly Readonly<{ fieldId: string; value: unknown }>[] }>): Readonly<Record<string, unknown>> {
  return { contract: "cpt-content/v1", typeId: articleTypeId, title: input.title, blocks: [{ kind: "article", text: input.text ?? `${input.title} 內文` }], excerpt: input.excerpt ?? "", seo: {}, customValues: input.customValues ?? [] };
}

function createRequest(catalog: CptEntryCatalogV1, input: Readonly<{ title: string; slug?: string; status?: string; text?: string; excerpt?: string }>): CptEntryCreateRequestV1 {
  return { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, ...(input.slug === undefined ? {} : { slug: input.slug }), content: content(input), status: input.status ?? "draft" };
}

function deleteRequest(digest: string): CptEntryDeleteRequestV1 {
  return { contract: "cpt-entry-delete-request/v1", expectedStateDigest: digest };
}

function bodyText(entry: CptEntryV1): string {
  const article = entry.content.blocks.find((block) => block.kind === "article");
  return article === undefined ? "" : article.text;
}

function saveRequest(entry: CptEntryV1, input: Readonly<{ title?: string; slug?: string; status?: string; digest?: string; text?: string; excerpt?: string }>): CptEntrySaveRequestV1 {
  return { contract: "cpt-entry-save-request/v1", expectedStateDigest: input.digest ?? entry.stateDigest, slug: input.slug ?? entry.slug, content: content({ title: input.title ?? entry.content.title, text: input.text ?? bodyText(entry), excerpt: input.excerpt ?? entry.content.excerpt }), status: input.status ?? entry.status };
}

test("create derives the actual slug, returns cpt-entry/v1 readback, and lists it in the type catalog", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    assert.deepEqual(empty.items, []);
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: " 盛夏 記事 ", text: "盛夏 內文", excerpt: "摘要" }) }));
    assert.equal(created.contract, "cpt-entry/v1");
    assert.equal(created.entryId, entryIds[0]);
    assert.equal(created.typeId, articleTypeId);
    assert.equal(created.slug, "盛夏-記事");
    assert.equal(created.status, "draft");
    assert.equal(created.publishedAt, undefined);
    assert.equal(created.content.title, "盛夏 記事");
    assert.equal(created.content.excerpt, "摘要");
    assert.deepEqual(created.content.blocks, [{ kind: "article", text: "盛夏 內文" }]);

    const read = unwrap(await context.administration.get({ typeId: articleTypeId, entryId: created.entryId }));
    assert.deepEqual(read, created);
    const catalog = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    assert.deepEqual(catalog.items, [{ entryId: created.entryId, slug: created.slug, title: "盛夏 記事", status: "draft", stateDigest: created.stateDigest }]);
    assert.equal(unwrap(context.store.getCurrentEntry(created.entryId)).authoringRoute, "/盛夏-記事");
    assert.equal(unwrap(context.store.getGlobalSlugClaimByEntity({ entityKind: "entry", entityId: created.entryId })).slug, "盛夏-記事");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("save replaces content and status together and renames the global slug without leaving the old claim", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "第一個標題", slug: "first-post" }) }));
    context.setNow("2026-09-16T03:00:00.000Z");
    const saved = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(created, { title: "第二個標題", slug: "second-post", status: "published" }) }));
    assert.equal(saved.slug, "second-post");
    assert.equal(saved.status, "published");
    assert.equal(saved.publishedAt, "2026-09-16T03:00:00.000Z");
    assert.equal(saved.lastPublishedDigest, saved.content && unwrap(context.store.getCurrentEntry(created.entryId)).contentDigest);
    assert.equal(unwrap(context.store.getCurrentEntry(created.entryId)).authoringRoute, "/second-post");
    assert.equal(context.store.getGlobalSlugClaim("first-post").ok, false);

    const reused = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const next = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(reused, { title: "另一個", slug: "first-post" }) }));
    assert.equal(next.slug, "first-post");
    const conflicting = await context.administration.create({ typeId: articleTypeId, request: { ...createRequest(reused, { title: "衝突" }), slug: "second-post" } });
    assert.equal(failureCode(conflicting), "ENTRY_STATE_CONFLICT");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("publishedAt only advances when the publishable content digest really changes", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "發布流程", status: "published" }) }));
    assert.equal(created.publishedAt, "2026-09-16T02:00:00.000Z");

    context.setNow("2026-09-16T04:00:00.000Z");
    const identical = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(created, { status: "published" }) }));
    assert.equal(identical.stateDigest, created.stateDigest);
    assert.equal(identical.publishedAt, "2026-09-16T02:00:00.000Z");

    context.setNow("2026-09-16T05:00:00.000Z");
    const changed = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(created, { status: "published", text: "改過的內文" }) }));
    assert.equal(changed.publishedAt, "2026-09-16T05:00:00.000Z");
    assert.notEqual(changed.stateDigest, created.stateDigest);

    context.setNow("2026-09-16T06:00:00.000Z");
    const drafted = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(changed, { status: "draft" }) }));
    assert.equal(drafted.status, "draft");
    assert.equal(drafted.publishedAt, "2026-09-16T05:00:00.000Z");
    assert.equal(unwrap(await context.administration.get({ typeId: articleTypeId, entryId: created.entryId })).status, "draft");

    context.setNow("2026-09-16T07:00:00.000Z");
    const republished = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(drafted, { status: "published" }) }));
    assert.equal(republished.publishedAt, "2026-09-16T05:00:00.000Z");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("stale expectedStateDigest fails with 409 semantics and zero durable writes", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "衝突目標", slug: "conflict-target" }) }));
    const before = unwrap(context.store.canonicalState()).digest;

    const stale = await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(created, { title: "不該寫入", slug: "not-written", status: "published", digest: `sha256:${"0".repeat(64)}` }) });
    assert.equal(failureCode(stale), "ENTRY_STATE_CONFLICT");
    assert.equal(failureCode(await context.administration.delete({ typeId: articleTypeId, entryId: created.entryId, request: deleteRequest(`sha256:${"0".repeat(64)}`) })), "ENTRY_STATE_CONFLICT");
    assert.equal(unwrap(context.store.canonicalState()).digest, before);
    assert.deepEqual(unwrap(await context.administration.get({ typeId: articleTypeId, entryId: created.entryId })), created);
    assert.equal(unwrap(context.store.getGlobalSlugClaimByEntity({ entityKind: "entry", entityId: created.entryId })).slug, "conflict-target");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("the catalog digest tracks every entry generation so stale creates are refused", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "摘要目標" }) }));
    const afterCreate = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const changed = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: created.entryId, request: saveRequest(created, { excerpt: "只有摘要改變" }) }));
    assert.notEqual(changed.stateDigest, created.stateDigest);
    const afterSave = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    assert.notEqual(afterSave.stateDigest, afterCreate.stateDigest);
    assert.equal(failureCode(await context.administration.create({ typeId: articleTypeId, request: createRequest(afterCreate, { title: "過期建立" }) })), "ENTRY_STATE_CONFLICT");
    assert.equal(unwrap(await context.administration.catalog({ typeId: articleTypeId })).items.length, 1);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("title, slug and a non-empty body are required on every save, while drafts may omit later required values", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const invalid = [
      rawRequest<CptEntryCreateRequestV1>({ ...createRequest(empty, { title: "缺內文" }), content: { ...content({ title: "缺內文" }), blocks: [{ kind: "article", text: "   " }] } }),
      rawRequest<CptEntryCreateRequestV1>({ ...createRequest(empty, { title: "缺標題" }), content: { ...content({ title: "缺標題" }), title: "   " } }),
      rawRequest<CptEntryCreateRequestV1>({ ...createRequest(empty, { title: "壞 slug" }), slug: "bad/slug" }),
      rawRequest<CptEntryCreateRequestV1>({ ...createRequest(empty, { title: "未知欄位" }), content: { ...content({ title: "未知欄位" }), extra: true } }),
      rawRequest<CptEntryCreateRequestV1>({ ...createRequest(empty, { title: "未知 status" }), status: "scheduled" }),
    ];
    for (const request of invalid) assert.equal(failureCode(await context.administration.create({ typeId: articleTypeId, request })), "INVALID_ENTRY_CONTENT");
    assert.deepEqual(unwrap(await context.administration.catalog({ typeId: articleTypeId })).items, []);

    const draft = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "草稿可缺摘要" }) }));
    assert.equal(draft.content.excerpt, "");
    assert.equal(failureCode(await context.administration.save({ typeId: articleTypeId, entryId: draft.entryId, request: saveRequest(draft, { digest: `sha256:${"0".repeat(64)}` }) })), "ENTRY_STATE_CONFLICT");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("delete really removes entry, slug claim and route evidence, and the entry is not found afterwards", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "待刪除", slug: "doomed" }) }));
    const deleted = unwrap(await context.administration.delete({ typeId: articleTypeId, entryId: created.entryId, request: deleteRequest(created.stateDigest) }));
    assert.deepEqual(deleted, { contract: "cpt-entry-deleted/v1", entryId: created.entryId });
    assert.equal(failureCode(await context.administration.get({ typeId: articleTypeId, entryId: created.entryId })), "ENTRY_NOT_FOUND");
    assert.deepEqual(unwrap(await context.administration.catalog({ typeId: articleTypeId })).items, []);
    assert.equal(context.store.getCurrentEntry(created.entryId).ok, false);
    assert.equal(context.store.getGlobalSlugClaim("doomed").ok, false);

    const reuse = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(unwrap(await context.administration.catalog({ typeId: articleTypeId })), { title: "重用 slug", slug: "doomed" }) }));
    assert.equal(reuse.slug, "doomed");
    assert.equal(unwrap(context.store.getCurrentEntry(reuse.entryId)).authoringRoute, "/doomed");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("entry reads and saves are scoped to the path content type", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    const created = unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "型別範圍" }) }));
    assert.equal(failureCode(await context.administration.catalog({ typeId: "00000000-0000-4000-8000-0000000000fe" })), "CONTENT_TYPE_NOT_FOUND");
    assert.equal(failureCode(await context.administration.get({ typeId: "00000000-0000-4000-8000-0000000000fe", entryId: created.entryId })), "ENTRY_NOT_FOUND");
    assert.equal(failureCode(await context.administration.save({ typeId: "00000000-0000-4000-8000-0000000000fe", entryId: created.entryId, request: saveRequest(created, {}) })), "ENTRY_NOT_FOUND");
    assert.equal(failureCode(await context.administration.delete({ typeId: "00000000-0000-4000-8000-0000000000fe", entryId: created.entryId, request: deleteRequest(created.stateDigest) })), "ENTRY_NOT_FOUND");
    assert.equal(unwrap(await context.administration.get({ typeId: articleTypeId, entryId: created.entryId })).stateDigest, created.stateDigest);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("current entries keep the Content Type non-breaking gate in force", async () => {
  const context = fixture();
  try {
    const empty = unwrap(await context.administration.catalog({ typeId: articleTypeId }));
    unwrap(await context.administration.create({ typeId: articleTypeId, request: createRequest(empty, { title: "使用中" }) }));
    assert.equal(unwrap(context.store.contentTypeHasCurrentEntries(articleTypeId)), true);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("custom field defaults initialize a new entry exactly once and never backfill a save", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [
      { kind: "text", label: "副標", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: {}, defaultValue: "預設副標" },
      { kind: "boolean", label: "精選", help: "", order: 1, required: false, showInGenericTemplate: false, constraints: {}, defaultValue: false },
      { kind: "number", label: "排序分數", help: "", order: 2, required: false, showInGenericTemplate: false, constraints: {}, defaultValue: 0 },
      { kind: "text", label: "必填標語", help: "", order: 3, required: true, showInGenericTemplate: false, constraints: { minLength: 2 } },
    ]);
    const subtitle = fieldIdOf(type.definition, "副標");
    const featured = fieldIdOf(type.definition, "精選");
    const score = fieldIdOf(type.definition, "排序分數");
    const required = fieldIdOf(type.definition, "必填標語");

    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));
    const created = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "新內容" }) }));
    assert.deepEqual(created.content.customValues.map((item) => item.fieldId), [subtitle, featured, score].sort());
    assert.deepEqual(valuesOf(created), { [subtitle]: "預設副標", [featured]: false, [score]: 0 });
    // draft 可缺少 required 值。
    assert.equal(required in valuesOf(created), false);

    // save 是 complete replacement：未提供的值不會被 default 回填。
    const saved = unwrap(await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(created, { customValues: [{ fieldId: featured, value: true }] }) }));
    assert.deepEqual(valuesOf(saved), { [featured]: true });
    const reread = unwrap(await context.administration.get({ typeId: type.typeId, entryId: created.entryId }));
    assert.deepEqual(reread, saved);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("custom values are read back sorted by field ID and multi values are canonicalized", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [
      { kind: "text", label: "甲", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {} },
      { kind: "multi-select", label: "乙", help: "", order: 1, required: false, showInGenericTemplate: false, constraints: {}, options: [{ newOptionKey: "o1", label: "一", order: 0 }, { newOptionKey: "o2", label: "二", order: 1 }] },
      { kind: "number", label: "丙", help: "", order: 2, required: false, showInGenericTemplate: false, constraints: {} },
    ]);
    const first = fieldIdOf(type.definition, "甲");
    const second = fieldIdOf(type.definition, "乙");
    const third = fieldIdOf(type.definition, "丙");
    const optionOne = optionIdOf(type.definition, "乙", "一");
    const optionTwo = optionIdOf(type.definition, "乙", "二");

    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));
    const created = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "排序", customValues: [{ fieldId: third, value: 7 }, { fieldId: second, value: [optionTwo, optionOne] }, { fieldId: first, value: "值" }] }) }));
    assert.deepEqual(created.content.customValues, [{ fieldId: first, value: "值" }, { fieldId: second, value: [optionOne, optionTwo] }, { fieldId: third, value: 7 }]);

    const duplicateField = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(created, { customValues: [{ fieldId: first, value: "a" }, { fieldId: first, value: "b" }] }) });
    assert.equal(failureCode(duplicateField), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(duplicateField.ok ? [] : duplicateField.error.subjectIds, [first]);
    const duplicateElement = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(created, { customValues: [{ fieldId: second, value: [optionOne, optionOne] }] }) });
    assert.equal(failureCode(duplicateElement), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(duplicateElement.ok ? [] : duplicateElement.error.subjectIds, [second]);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("published save validates every custom constraint and writes nothing when it fails", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [
      { kind: "text", label: "標語", help: "", order: 0, required: true, showInGenericTemplate: false, constraints: { minLength: 3, maxLength: 5 } },
      { kind: "number", label: "分數", help: "", order: 1, required: false, showInGenericTemplate: false, constraints: { minimum: 1, maximum: 10 } },
      { kind: "url", label: "連結", help: "", order: 2, required: false, showInGenericTemplate: false, constraints: {} },
      { kind: "date", label: "日期", help: "", order: 3, required: false, showInGenericTemplate: false, constraints: {} },
      { kind: "datetime", label: "時間", help: "", order: 4, required: false, showInGenericTemplate: false, constraints: {} },
      { kind: "single-select", label: "選項", help: "", order: 5, required: false, showInGenericTemplate: false, constraints: {}, options: [{ newOptionKey: "o1", label: "一", order: 0 }] },
      { kind: "multi-media", label: "媒體", help: "", order: 6, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"], maxItems: 1 } },
    ]);
    const slogan = fieldIdOf(type.definition, "標語");
    const score = fieldIdOf(type.definition, "分數");
    const link = fieldIdOf(type.definition, "連結");
    const day = fieldIdOf(type.definition, "日期");
    const moment = fieldIdOf(type.definition, "時間");
    const choice = fieldIdOf(type.definition, "選項");
    const media = fieldIdOf(type.definition, "媒體");
    const optionId = optionIdOf(type.definition, "選項", "一");

    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));
    // draft 允許缺少 required、也允許不符 constraints 的值。
    const draft = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "驗證", customValues: [{ fieldId: slogan, value: "a" }, { fieldId: score, value: 99 }, { fieldId: link, value: "not-a-url" }, { fieldId: day, value: "2026-13-01" }, { fieldId: moment, value: "明天" }, { fieldId: choice, value: "unknown-option" }, { fieldId: media, value: ["asset-1", "asset-2"] }] }) }));
    assert.equal(draft.status, "draft");
    const before = unwrap(context.store.canonicalState()).digest;

    const cases: readonly Readonly<{ value: unknown; fieldId: string }>[] = [
      { fieldId: slogan, value: "ab" },
      { fieldId: score, value: 0 },
      { fieldId: link, value: "example.com" },
      { fieldId: day, value: "2026-02-30" },
      { fieldId: moment, value: "2026-09-16" },
      { fieldId: choice, value: "unknown-option" },
      { fieldId: media, value: ["asset-1", "asset-2"] },
    ];
    for (const item of cases) {
      const selected: Record<string, unknown> = { [slogan]: "有效標語", [item.fieldId]: item.value };
      const failed = await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: Object.entries(selected).map(([fieldId, value]) => ({ fieldId, value })) }) });
      assert.equal(failureCode(failed), "INVALID_ENTRY_CUSTOM_VALUES", `${item.fieldId} 應該被拒絕`);
      assert.deepEqual(failed.ok ? [] : failed.error.subjectIds, [item.fieldId]);
      assert.equal(unwrap(context.store.canonicalState()).digest, before, "失敗的 published save 必須零寫入");
    }
    const missingRequired = await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: [{ fieldId: score, value: 5 }] }) });
    assert.equal(failureCode(missingRequired), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(missingRequired.ok ? [] : missingRequired.error.subjectIds, [slogan]);

    const published = unwrap(await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: [{ fieldId: slogan, value: "有效標語" }, { fieldId: score, value: 10 }, { fieldId: link, value: "https://example.com/a" }, { fieldId: day, value: "2026-09-16" }, { fieldId: moment, value: "2026-09-16T12:00:00.000Z" }, { fieldId: choice, value: optionId }, { fieldId: media, value: ["asset-1"] }] }) }));
    assert.equal(published.status, "published");
    assert.equal(typeof published.publishedAt, "string");
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("unknown field IDs and unsupported value shapes fail without writing", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [{ kind: "number", label: "數量", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {} }]);
    const quantity = fieldIdOf(type.definition, "數量");
    const foreign = "00000000-0000-4000-8000-00000000ffff";
    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));
    const created = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "型別檢查" }) }));

    const unknown = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(created, { customValues: [{ fieldId: foreign, value: 1 }] }) });
    assert.equal(failureCode(unknown), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(unknown.ok ? [] : unknown.error.subjectIds, [foreign]);
    const shape = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(created, { customValues: [{ fieldId: quantity, value: "三" }] }) });
    assert.equal(failureCode(shape), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(shape.ok ? [] : shape.error.subjectIds, [quantity]);

    // record 層的 payload 形狀錯誤仍是 INVALID_ENTRY_CONTENT，且不洩漏為 field 層錯誤。
    const container = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: rawRequest<CptEntrySaveRequestV1>({ ...customSaveRequest(created, {}), content: { ...customContent({ typeId: type.typeId, title: created.content.title, customValues: [] }), customValues: { [quantity]: 1 } } }) });
    assert.equal(failureCode(container), "INVALID_ENTRY_CONTENT");
    const unknownProperty = await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: rawRequest<CptEntrySaveRequestV1>({ ...customSaveRequest(created, {}), content: { ...customContent({ typeId: type.typeId, title: created.content.title, customValues: [] }), customValues: [{ fieldId: quantity, value: 1, extra: true }] } }) });
    assert.equal(failureCode(unknownProperty), "INVALID_ENTRY_CONTENT");
    assert.deepEqual(unwrap(await context.administration.get({ typeId: type.typeId, entryId: created.entryId })), created);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("definition additions and label edits keep existing entry values bound to stable IDs", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [{ kind: "single-select", label: "狀態", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: {}, options: [{ newOptionKey: "o1", label: "草稿中", order: 0 }, { newOptionKey: "o2", label: "已完成", order: 1 }] }]);
    const status = fieldIdOf(type.definition, "狀態");
    const draftOption = optionIdOf(type.definition, "狀態", "草稿中");
    const doneOption = optionIdOf(type.definition, "狀態", "已完成");
    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));
    const created = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "語意", status: "published", customValues: [{ fieldId: status, value: draftOption }] }) }));
    assert.deepEqual(valuesOf(created), { [status]: draftOption });

    const contentTypes = createContentTypeAdministration({ persistence: context.store, newStableId: context.newStableId });
    const replaced = unwrap(await contentTypes.replace({ typeId: type.typeId, definition: { contract: "content-type-replace-request/v1", expectedStateDigest: type.definition.stateDigest, label: type.definition.label, slug: type.definition.slug, help: "", order: 0, showInMenu: false, taxonomyAttachments: type.definition.taxonomyAttachments, fieldGroups: [{ groupId: type.definition.fieldGroups[0]!.groupId, label: "主要", help: "", order: 0, fields: [{ fieldId: status, kind: "single-select", label: "進度", help: "", order: 0, required: false, showInGenericTemplate: true, constraints: {}, options: [{ optionId: draftOption, label: "進行中", order: 0 }, { optionId: doneOption, label: "已完成", order: 1 }] }, { kind: "text", label: "備註", help: "", order: 1, required: false, showInGenericTemplate: false, constraints: {} }] }] } }));
    assert.equal(replaced.fieldGroups[0]!.fields.length, 2);

    const afterReplace = unwrap(await context.administration.get({ typeId: type.typeId, entryId: created.entryId }));
    assert.deepEqual(afterReplace, created, "definition 變更不得改寫既有 entry 的 custom values");
    // 既有 option ID 與新增欄位仍可一起發布。
    const saved = unwrap(await context.administration.save({ typeId: type.typeId, entryId: created.entryId, request: customSaveRequest(afterReplace, { status: "published", customValues: [{ fieldId: status, value: draftOption }, { fieldId: fieldIdOf(replaced, "備註"), value: "備註文字" }] }) }));
    assert.deepEqual(valuesOf(saved), { [status]: draftOption, [fieldIdOf(replaced, "備註")]: "備註文字" });
    assert.equal(replaced.fieldGroups[0]!.fields.find((field) => field.fieldId === status)?.showInGenericTemplate, true);
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("content bytes written without customValues stay readable, savable and deletable", async () => {
  const context = fixture();
  try {
    const legacyId = "00000000-0000-4000-8000-0000000000e9";
    const legacyContent = { contract: "cpt-content/v1", typeId: articleTypeId, title: "舊格式", blocks: [{ kind: "article", text: "舊格式內文" }], excerpt: "", seo: {} };
    const bytes = canonicalJsonBytes(legacyContent);
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    const seeded = context.store.runTransaction((transaction) => {
      const claim = transaction.allocateGlobalSlug({ requestedSlug: "legacy-shape", entityKind: "entry", entityId: legacyId });
      if (!claim.ok) return claim;
      return transaction.createCurrentEntry({ entryId: legacyId, typeId: articleTypeId, authoringRoute: "/legacy-shape", contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value), status: "published", publishedAt: "2026-09-16T01:00:00.000Z", lastPublishedDigest: sha256Digest(bytes.value) });
    });
    assert.equal(seeded.ok, true);

    const read = unwrap(await context.administration.get({ typeId: articleTypeId, entryId: legacyId }));
    assert.deepEqual(read.content.customValues, []);
    assert.equal(read.publishedAt, "2026-09-16T01:00:00.000Z");
    assert.equal(unwrap(await context.administration.catalog({ typeId: articleTypeId })).items.length, 1);

    // 升級後第一次 Save 會因 payload 形狀換代而前進 `publishedAt`，第二次相同 bytes 不再前進。
    context.setNow("2026-09-16T08:00:00.000Z");
    const first = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: legacyId, request: saveRequest(read, {}) }));
    assert.equal(first.publishedAt, "2026-09-16T08:00:00.000Z");
    context.setNow("2026-09-16T09:00:00.000Z");
    const second = unwrap(await context.administration.save({ typeId: articleTypeId, entryId: legacyId, request: saveRequest(first, {}) }));
    assert.equal(second.publishedAt, "2026-09-16T08:00:00.000Z");
    assert.equal(second.stateDigest, first.stateDigest);

    const deleted = unwrap(await context.administration.delete({ typeId: articleTypeId, entryId: legacyId, request: deleteRequest(second.stateDigest) }));
    assert.deepEqual(deleted, { contract: "cpt-entry-deleted/v1", entryId: legacyId });
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("draft keeps shape-only string lists while published rejects unusable identities", async () => {
  const context = fixture();
  try {
    const type = await customContentType(context, [
      { kind: "multi-select", label: "標籤", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: {}, options: [{ newOptionKey: "o1", label: "一", order: 0 }] },
      { kind: "datetime", label: "時間", help: "", order: 1, required: false, showInGenericTemplate: false, constraints: {} },
    ]);
    const tags = fieldIdOf(type.definition, "標籤");
    const moment = fieldIdOf(type.definition, "時間");
    const empty = unwrap(await context.administration.catalog({ typeId: type.typeId }));

    // 空字串元素仍滿足 string-list 的形狀，draft 不得因此降級成 record 層錯誤。
    const draft = unwrap(await context.administration.create({ typeId: type.typeId, request: customCreateRequest(empty, { typeId: type.typeId, title: "形狀", customValues: [{ fieldId: tags, value: [""] }] }) }));
    assert.deepEqual(valuesOf(draft), { [tags]: [""] });
    const before = unwrap(context.store.canonicalState()).digest;
    const published = await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: [{ fieldId: tags, value: [""] }] }) });
    assert.equal(failureCode(published), "INVALID_ENTRY_CUSTOM_VALUES");
    assert.deepEqual(published.ok ? [] : published.error.subjectIds, [tags]);
    assert.equal(unwrap(context.store.canonicalState()).digest, before);

    // datetime 的完整形狀與日曆有效性由 published 驗證。
    for (const value of ["2026-09-16Z", "2026-09-16 12:00:00Z", "2026-02-30T12:00:00Z", "2026-09-16T12:00"]) {
      const failed = await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: [{ fieldId: moment, value }] }) });
      assert.equal(failureCode(failed), "INVALID_ENTRY_CUSTOM_VALUES", value);
      assert.deepEqual(failed.ok ? [] : failed.error.subjectIds, [moment]);
    }
    const accepted = unwrap(await context.administration.save({ typeId: type.typeId, entryId: draft.entryId, request: customSaveRequest(draft, { status: "published", customValues: [{ fieldId: moment, value: "2026-09-16T12:00:00+08:00" }] }) }));
    assert.deepEqual(valuesOf(accepted), { [moment]: "2026-09-16T12:00:00+08:00" });
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("a legacy unordered multi-media default is read faithfully but materialized canonically", async () => {
  const context = fixture();
  try {
    const typeId = "00000000-0000-4000-8000-0000000000b1";
    const legacy = { contract: "content-type-definition/v1", typeId, label: "舊定義", slug: "legacy-media-default", help: "", order: 0, showInMenu: false, systemFields: ["title", "body", "slug", "excerpt", "featuredMedia", "categories", "tags", "seo", "status", "publishedAt"], fieldGroups: [{ groupId: "00000000-0000-4000-8000-0000000000b2", label: "主要", help: "", order: 0, fields: [{ fieldId: "00000000-0000-4000-8000-0000000000b3", kind: "multi-media", label: "相簿", help: "", order: 0, required: false, showInGenericTemplate: false, constraints: { mimeTypes: ["image/png"] }, defaultValue: ["b-asset", "a-asset"] }] }], taxonomyAttachments: [] };
    const bytes = canonicalJsonBytes(legacy);
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    assert.equal(context.store.runTransaction((transaction) => transaction.createCurrentContentType({ typeId, definitionBytes: bytes.value, definitionDigest: sha256Digest(bytes.value) })).ok, true);

    // definition 讀取忠實反映 stored bytes（順序不變）。
    const contentTypes = createContentTypeAdministration({ persistence: context.store, newStableId: context.newStableId });
    const definition = unwrap(await contentTypes.get({ typeId }));
    assert.deepEqual(definition.fieldGroups[0]!.fields[0]!.defaultValue, ["b-asset", "a-asset"]);

    // 新 entry 的 materialized default 仍是 canonical 升冪。
    const empty = unwrap(await context.administration.catalog({ typeId }));
    const created = unwrap(await context.administration.create({ typeId, request: customCreateRequest(empty, { typeId, title: "舊預設" }) }));
    assert.deepEqual(valuesOf(created), { "00000000-0000-4000-8000-0000000000b3": ["a-asset", "b-asset"] });
    const published = unwrap(await context.administration.save({ typeId, entryId: created.entryId, request: customSaveRequest(created, { status: "published", customValues: [{ fieldId: "00000000-0000-4000-8000-0000000000b3", value: ["a-asset", "b-asset"] }] }) }));
    assert.deepEqual(valuesOf(published), { "00000000-0000-4000-8000-0000000000b3": ["a-asset", "b-asset"] });
  } finally {
    context.store.close();
    rmSync(context.directory, { recursive: true, force: true });
  }
});
