import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type CurrentEntryRecord, type PersistenceResult, type PersistenceStore } from "../../../core/persistence/index.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

const articleTypeId = "00000000-0000-4000-8000-000000000001";
const entryId = "00000000-0000-4000-8000-0000000000e1";
const otherEntryId = "00000000-0000-4000-8000-0000000000e2";

function temporaryDatabase(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "current-entries-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

function openStore(databasePath: string): PersistenceStore {
  const migrated = migrateDatabase({ databasePath });
  assert.equal(migrated.ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("persistence did not open");
  return opened.value;
}

function unwrap<T>(result: PersistenceResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error.code);
}

function entry(input: Readonly<{ entryId?: string; slug: string; title: string; status?: "draft" | "published"; publishedAt?: string }>): Readonly<{ record: CurrentEntryRecord; digest: Digest }> {
  const bytes = canonicalJsonBytes({ contract: "cpt-content/v1", typeId: articleTypeId, title: input.title, blocks: [{ kind: "article", text: `${input.title} body` }], excerpt: "", seo: {} });
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error("content is not canonical");
  const digest = sha256Digest(bytes.value);
  return {
    digest,
    record: {
      entryId: input.entryId ?? entryId,
      typeId: articleTypeId,
      authoringRoute: `/${input.slug}`,
      contentBytes: bytes.value,
      contentDigest: digest,
      status: input.status ?? "draft",
      ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt, lastPublishedDigest: digest }),
    },
  };
}

function rejection(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return String(error);
  }
  return "no-error";
}

test("0013 is a shipped migration and current entries survive create, replace and real delete", () => {
  const fixture = temporaryDatabase();
  try {
    assert.deepEqual(migrateDatabase({ databasePath: fixture.databasePath }), {
      ok: true,
      value: { appliedMigrationIds: ["0001-create-persistence-storage", "0002-add-persistence-query-indexes", "0003-add-entry-pointers", "0004-add-route-claims", "0005-add-media-storage", "0006-add-revision-references", "0007-add-plugin-activation-state", "0008-add-schema-migration-lineage", "0009-add-theme-activation-state", "0010-add-plugin-settings-state", "0011-add-taxonomy-storage", "0012-add-current-content-types-and-global-slugs", "0013-add-current-entries"], currentMigrationId: "0013-add-current-entries" },
    });
    const store = openStore(fixture.databasePath);
    try {
      const created = entry({ slug: "first-post", title: "第一篇" });
      unwrap(store.allocateGlobalSlug({ requestedSlug: "first-post", entityKind: "entry", entityId: entryId }));
      assert.equal(unwrap(store.createCurrentEntry(created.record)).entryId, entryId);
      assert.deepEqual(unwrap(store.listCurrentEntries(articleTypeId)).map((record) => record.entryId), [entryId]);

      const renamed = entry({ slug: "renamed-post", title: "改標題", publishedAt: "2026-09-16T02:00:00.000Z", status: "published" });
      const replaced = unwrap(store.runTransaction((transaction) => {
        unwrap(transaction.allocateGlobalSlug({ requestedSlug: "renamed-post", entityKind: "entry", entityId: entryId }));
        const replaced = transaction.replaceCurrentEntry(renamed.record);
        return replaced.ok ? { ok: true as const, value: replaced.value } : { ok: false as const, error: replaced.error };
      }));
      assert.equal(replaced.authoringRoute, "/renamed-post");
      assert.equal(replaced.status, "published");
      assert.equal(replaced.publishedAt, "2026-09-16T02:00:00.000Z");
      assert.equal(replaced.lastPublishedDigest, renamed.digest);
      assert.equal(unwrap(store.getGlobalSlugClaimByEntity({ entityKind: "entry", entityId: entryId })).slug, "renamed-post");

      unwrap(store.deleteCurrentEntry(entryId));
      const missing = store.getCurrentEntry(entryId);
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.equal(missing.error.code, "CURRENT_ENTRY_NOT_FOUND");
      assert.deepEqual(unwrap(store.listCurrentEntries(articleTypeId)), []);
    } finally {
      store.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("current entries reject non-canonical bytes, route evidence, timestamps and unknown content types", () => {
  const fixture = temporaryDatabase();
  try {
    const store = openStore(fixture.databasePath);
    try {
      const valid = entry({ slug: "valid-post", title: "有效" });
      const cases: readonly Readonly<{ record: CurrentEntryRecord; code: string }>[] = [
        { record: { ...valid.record, contentDigest: `sha256:${"0".repeat(64)}` }, code: "DIGEST_MISMATCH" },
        { record: { ...valid.record, authoringRoute: "/bad route?x" }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, authoringRoute: "/bad/slash" }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, authoringRoute: "valid-post" }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, typeId: "00000000-0000-4000-8000-0000000000ff" }, code: "CONSTRAINT_VIOLATION" },
        { record: { ...valid.record, status: "published" }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, publishedAt: "2026-09-16T02:00:00.000+08:00", lastPublishedDigest: valid.digest }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, publishedAt: "2026-13-40T02:00:00.000Z", lastPublishedDigest: valid.digest }, code: "INVALID_PERSISTENCE_INPUT" },
        { record: { ...valid.record, publishedAt: "2026-09-16T02:00:00.000Z" }, code: "INVALID_PERSISTENCE_INPUT" },
      ];
      for (const item of cases) {
        const created = store.createCurrentEntry(item.record);
        assert.equal(created.ok, false, `${item.code} case must be refused`);
        if (!created.ok) assert.equal(created.error.code, item.code, `${item.code} case`);
      }
      assert.equal(store.getCurrentEntry(entryId).ok, false);
    } finally {
      store.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("current entry relational constraints reject malformed rows and unknown content types", () => {
  const fixture = temporaryDatabase();
  try {
    openStore(fixture.databasePath).close();
    const database = openSqliteAdapter(fixture.databasePath);
    try {
      const valid = entry({ slug: "valid-post", title: "有效" });
      const insert = "INSERT INTO current_entries (entry_id,type_id,authoring_route,content_bytes,content_digest,status,published_at,last_published_digest) VALUES (?,?,?,?,?,?,?,?)";
      assert.match(rejection(() => database.run(insert, otherEntryId, articleTypeId, "/bad route?x", valid.record.contentBytes, valid.digest, "draft", null, null)), /CHECK/u);
      assert.match(rejection(() => database.run(insert, otherEntryId, articleTypeId, "/ok", valid.record.contentBytes, valid.digest, "published", "2026-99-99T99:99:99.999Z", valid.digest)), /CHECK/u);
      assert.match(rejection(() => database.run(insert, otherEntryId, articleTypeId, "/ok", valid.record.contentBytes, valid.digest, "draft", "2026-09-16T02:00:00.000Z", null)), /CHECK/u);
      assert.match(rejection(() => database.run(insert, otherEntryId, "00000000-0000-4000-8000-0000000000ff", "/ok", valid.record.contentBytes, valid.digest, "draft", null, null)), /FOREIGN KEY/u);
      database.run(insert, otherEntryId, articleTypeId, "/ok", valid.record.contentBytes, valid.digest, "published", "2026-09-16T02:00:00.000Z", valid.digest);
      assert.equal(database.get("SELECT 1 FROM current_entries WHERE entry_id=?", otherEntryId) !== undefined, true);
    } finally {
      database.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("entry usage evidence and canonical state cover current entries", () => {
  const fixture = temporaryDatabase();
  try {
    const store = openStore(fixture.databasePath);
    try {
      assert.equal(unwrap(store.contentTypeHasCurrentEntries(articleTypeId)), false);
      const before = unwrap(store.canonicalState());
      const created = entry({ slug: "usage-post", title: "用到" });
      unwrap(store.allocateGlobalSlug({ requestedSlug: "usage-post", entityKind: "entry", entityId: entryId }));
      unwrap(store.createCurrentEntry(created.record));
      assert.equal(unwrap(store.contentTypeHasCurrentEntries(articleTypeId)), true);
      const after = unwrap(store.canonicalState());
      assert.equal(after.counts.currentEntries, 1);
      assert.notEqual(after.digest, before.digest);
      unwrap(store.deleteCurrentEntry(entryId));
      assert.equal(unwrap(store.canonicalState()).counts.currentEntries, 0);
    } finally {
      store.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("a failed entry write inside one transaction rolls back its slug claim", () => {
  const fixture = temporaryDatabase();
  try {
    const store = openStore(fixture.databasePath);
    try {
      unwrap(store.allocateGlobalSlug({ requestedSlug: "kept-slug", entityKind: "entry", entityId: entryId }));
      unwrap(store.createCurrentEntry(entry({ slug: "kept-slug", title: "保留" }).record));
      const before = unwrap(store.canonicalState()).digest;

      const renamed = entry({ slug: "renamed-post", title: "改名" });
      const decision = store.runTransaction((transaction) => {
        unwrap(transaction.allocateGlobalSlug({ requestedSlug: "renamed-post", entityKind: "entry", entityId: entryId }));
        assert.equal(transaction.replaceCurrentEntry({ ...renamed.record, contentDigest: `sha256:${"0".repeat(64)}` }).ok, false);
        return { ok: true as const, value: "must-not-survive" };
      });
      assert.equal(decision.ok, false);
      assert.equal(unwrap(store.canonicalState()).digest, before);
      assert.equal(unwrap(store.getGlobalSlugClaimByEntity({ entityKind: "entry", entityId: entryId })).slug, "kept-slug");
      assert.equal(store.getGlobalSlugClaim("renamed-post").ok, false);
    } finally {
      store.close();
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
