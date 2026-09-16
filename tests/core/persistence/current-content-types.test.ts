import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import { openSqliteAdapter } from "../../../core/persistence/sqlite-adapter.js";

const articleTypeId = "00000000-0000-4000-8000-000000000001";
const categoriesTaxonomyId = "00000000-0000-4000-8000-000000000002";
const tagsTaxonomyId = "00000000-0000-4000-8000-000000000003";

function temporaryDatabase(): Readonly<{ directory: string; databasePath: string }> {
  const directory = mkdtempSync(path.join(tmpdir(), "current-content-types-"));
  return { directory, databasePath: path.join(directory, "cms.sqlite") };
}

test("0012 seeds one current Article definition and global claims exactly once", () => {
  const fixture = temporaryDatabase();
  try {
    assert.deepEqual(migrateDatabase({ databasePath: fixture.databasePath }), {
      ok: true,
      value: {
        appliedMigrationIds: [
          "0001-create-persistence-storage",
          "0002-add-persistence-query-indexes",
          "0003-add-entry-pointers",
          "0004-add-route-claims",
          "0005-add-media-storage",
          "0006-add-revision-references",
          "0007-add-plugin-activation-state",
          "0008-add-schema-migration-lineage",
          "0009-add-theme-activation-state",
          "0010-add-plugin-settings-state",
          "0011-add-taxonomy-storage",
          "0012-add-current-content-types-and-global-slugs",
          "0013-add-current-entries",
        ],
        currentMigrationId: "0013-add-current-entries",
      },
    });

    const database = openSqliteAdapter(fixture.databasePath);
    const article = database.get("SELECT definition_bytes, definition_digest, legacy_schema_id FROM current_content_types WHERE type_id = ?", articleTypeId);
    assert.notEqual(article, undefined);
    assert.equal(article?.legacy_schema_id, "site-content");
    assert.deepEqual(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(article?.definition_bytes as Uint8Array)), {
      contract: "content-type-definition/v1",
      typeId: articleTypeId,
      label: "文章",
      slug: "articles",
      help: "",
      order: 0,
      showInMenu: true,
      systemFields: ["title", "body", "slug", "excerpt", "featuredMedia", "categories", "tags", "seo", "status", "publishedAt"],
      fieldGroups: [],
      taxonomyAttachments: [
        { taxonomyId: categoriesTaxonomyId, cardinality: "one", required: false, allowTermCreation: true },
        { taxonomyId: tagsTaxonomyId, cardinality: "many", required: false, allowTermCreation: true },
      ],
    });
    assert.equal(typeof article?.definition_digest, "string");
    assert.deepEqual(
      [...database.all("SELECT slug, entity_kind, entity_id FROM global_slug_claims ORDER BY namespace_key")].map((row) => ({ ...row })),
      [
        { slug: "articles", entity_kind: "content-type", entity_id: articleTypeId },
        { slug: "categories", entity_kind: "taxonomy", entity_id: categoriesTaxonomyId },
        { slug: "tags", entity_kind: "taxonomy", entity_id: tagsTaxonomyId },
      ],
    );
    database.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});


test("global slug allocation is cross-kind, suffixes deterministically, and releases claims", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "分類", entityKind: "content-type", entityId: "alpha" }), {
      ok: true,
      value: { namespaceKey: "分類", slug: "分類", entityKind: "content-type", entityId: "alpha" },
    });
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "分類", entityKind: "taxonomy", entityId: "beta" }), {
      ok: true,
      value: { namespaceKey: "分類-2", slug: "分類-2", entityKind: "taxonomy", entityId: "beta" },
    });
    assert.deepEqual(store.releaseGlobalSlug({ entityKind: "content-type", entityId: "alpha" }), { ok: true, value: undefined });
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "分類", entityKind: "media", entityId: "gamma" }), {
      ok: true,
      value: { namespaceKey: "分類", slug: "分類", entityKind: "media", entityId: "gamma" },
    });
    store.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("global slug keys use full Unicode case folding and fill released suffix gaps", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const store = opened.value;
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "Straße", entityKind: "content-type", entityId: "first" }).ok, true);
    const folded = store.allocateGlobalSlug({ requestedSlug: "STRASSE", entityKind: "taxonomy", entityId: "second" });
    assert.deepEqual(folded.ok && { slug: folded.value.slug, namespaceKey: folded.value.namespaceKey }, { slug: "STRASSE-2", namespaceKey: "strasse-2" });
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "item", entityKind: "entry", entityId: "third" }).ok, true);
    assert.deepEqual(store.allocateGlobalSlug({ requestedSlug: "item", entityKind: "media", entityId: "fourth" }).ok, true);
    assert.deepEqual(store.releaseGlobalSlug({ entityKind: "media", entityId: "fourth" }), { ok: true, value: undefined });
    const reused = store.allocateGlobalSlug({ requestedSlug: "item", entityKind: "taxonomy", entityId: "fifth" });
    assert.deepEqual(reused.ok && reused.value.slug, "item-2");
    store.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("renaming an entity releases its previous global slug without self-suffixing", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.deepEqual(opened.value.allocateGlobalSlug({ requestedSlug: "before", entityKind: "content-type", entityId: "rename-me" }).ok, true);
    const renamed = opened.value.allocateGlobalSlug({ requestedSlug: "after", entityKind: "content-type", entityId: "rename-me" });
    assert.deepEqual(renamed.ok && renamed.value.slug, "after");
    const reused = opened.value.allocateGlobalSlug({ requestedSlug: "before", entityKind: "taxonomy", entityId: "reuse-before" });
    assert.deepEqual(reused.ok && reused.value.slug, "before");
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("current Content Type records require server-issued UUIDv4 identities", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const bytes = canonicalJsonBytes({ contract: "content-type-definition/v1" });
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    const before = opened.value.canonicalState();
    assert.equal(before.ok, true);
    const rejected = opened.value.createCurrentContentType({ typeId: "client-chosen", definitionBytes: bytes.value, definitionDigest: sha256Digest(bytes.value) });
    assert.deepEqual(rejected.ok ? undefined : rejected.error.code, "INVALID_PERSISTENCE_INPUT");
    const after = opened.value.canonicalState();
    assert.equal(after.ok, true);
    if (before.ok && after.ok) assert.equal(after.value.digest, before.value.digest);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("current Content Type reads verify canonical evidence and return defensive bytes", () => {
  const fixture = temporaryDatabase();
  try {
    assert.equal(migrateDatabase({ databasePath: fixture.databasePath }).ok, true);
    const opened = openPersistence({ databasePath: fixture.databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const first = opened.value.getCurrentContentType(articleTypeId);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const baselineByte = first.value.definitionBytes[0];
    first.value.definitionBytes[0] = baselineByte === 0 ? 1 : 0;
    const second = opened.value.getCurrentContentType(articleTypeId);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.value.definitionBytes[0], baselineByte);
    opened.value.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});