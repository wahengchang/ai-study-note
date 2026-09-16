import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCurrentEntryAdministration, type CptEntryCatalogV1, type CptEntryCreateRequestV1, type CptEntryDeleteRequestV1, type CptEntrySaveRequestV1, type CptEntryV1, type CurrentEntryAdministration } from "../../../core/application/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";

const articleTypeId = "00000000-0000-4000-8000-000000000001";
const entryIds = ["00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"];

type Fixture = Readonly<{ directory: string; store: PersistenceStore; administration: CurrentEntryAdministration; setNow(value: string): void; ids: string[] }>;

function fixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "entry-administration-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence did not open");
  const ids = [...entryIds];
  let current = "2026-09-16T02:00:00.000Z";
  return {
    directory,
    store: opened.value,
    ids,
    setNow(value: string) { current = value; },
    administration: createCurrentEntryAdministration({ persistence: opened.value, newStableId: () => ids.shift() ?? "00000000-0000-4000-8000-0000000000ff", now: () => new Date(current) }),
  };
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

function content(input: Readonly<{ title: string; text?: string; excerpt?: string }>): Readonly<Record<string, unknown>> {
  return { contract: "cpt-content/v1", typeId: articleTypeId, title: input.title, blocks: [{ kind: "article", text: input.text ?? `${input.title} 內文` }], excerpt: input.excerpt ?? "", seo: {} };
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
