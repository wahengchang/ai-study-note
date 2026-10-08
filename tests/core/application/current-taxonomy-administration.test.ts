import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCurrentEntryAdministration, createCurrentTaxonomyAdministration } from "../../../core/application/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";

const articleTypeId = "00000000-0000-4000-8000-000000000001";
const categoriesId = "00000000-0000-4000-8000-000000000002";
const ids = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3", "00000000-0000-4000-8000-0000000000a4"];

function unwrap<T>(result: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: string }> }>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

test("current taxonomy hierarchy, usage, CAS and entry filtering are atomic", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "current-taxonomy-"));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const store = unwrap(openPersistence({ databasePath }));
    try {
      const nextId = (): string => ids.shift() ?? "00000000-0000-4000-8000-0000000000ff";
      const taxonomy = createCurrentTaxonomyAdministration({ persistence: store, newStableId: nextId });
      const entries = createCurrentEntryAdministration({ persistence: store, newStableId: nextId });
      const initial = unwrap(await taxonomy.get(categoriesId));
      assert.equal(initial.taxonomy.hierarchical, true);
      const parent = unwrap(await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "create-term", expectedStateDigest: initial.stateDigest, label: "工程", order: 0 }));
      const parentId = parent.terms[0]!.termId;
      const child = unwrap(await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "create-term", expectedStateDigest: parent.stateDigest, label: "AI", parentTermId: parentId, order: 1 }));
      const childId = child.terms.find((term) => term.label === "AI")!.termId;
      const cycle = await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "replace-term", expectedStateDigest: child.stateDigest, termId: parentId, label: "工程", slug: "engineering", parentTermId: childId, order: 0, state: "live" });
      assert.equal(cycle.ok, false);
      assert.equal(unwrap(await taxonomy.get(categoriesId)).stateDigest, child.stateDigest);
      const catalog = unwrap(await entries.catalog({ typeId: articleTypeId }));
      const created = unwrap(await entries.create({ typeId: articleTypeId, request: { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, content: { contract: "cpt-content/v1", typeId: articleTypeId, title: "AI 筆記", blocks: [{ kind: "article", text: "內文" }], excerpt: "", seo: {}, customValues: [] }, taxonomyTerms: [{ taxonomyId: categoriesId, termId: childId }], status: "published" } }));
      assert.deepEqual(created.taxonomyTerms, [{ taxonomyId: categoriesId, termId: childId }]);
      const found = unwrap(await entries.search({ typeId: articleTypeId, request: { contract: "entry-search-request/v1", typeId: articleTypeId, search: "AI", statuses: ["published"], taxonomyFilters: [{ taxonomyId: categoriesId, termIds: [childId] }], page: 1 } }));
      assert.equal(found.totalItems, 1);
      assert.equal(found.items[0]!.entryId, created.entryId);
      const parentOnly = unwrap(await entries.search({ typeId: articleTypeId, request: { contract: "entry-search-request/v1", typeId: articleTypeId, search: "", statuses: [], taxonomyFilters: [{ taxonomyId: categoriesId, termIds: [parentId] }], page: 1 } }));
      assert.equal(parentOnly.totalItems, 0);
      const inUse = await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "delete-term", expectedStateDigest: child.stateDigest, termId: childId });
      assert.equal(inUse.ok, false);
      assert.equal(inUse.ok ? "" : inUse.error.code, "TERM_IN_USE");
      const retired = unwrap(await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "replace-term", expectedStateDigest: child.stateDigest, termId: childId, label: "AI", slug: "ai", parentTermId: parentId, order: 1, state: "retired" }));
      const same = unwrap(await entries.save({ typeId: articleTypeId, entryId: created.entryId, request: { contract: "cpt-entry-save-request/v1", expectedStateDigest: created.stateDigest, slug: created.slug, content: created.content, taxonomyTerms: created.taxonomyTerms, status: "draft" } }));
      assert.deepEqual(same.taxonomyTerms, created.taxonomyTerms);
      const removed = unwrap(await entries.delete({ typeId: articleTypeId, entryId: same.entryId, request: { contract: "cpt-entry-delete-request/v1", expectedStateDigest: same.stateDigest } }));
      assert.equal(removed.entryId, created.entryId);
      const deleted = unwrap(await taxonomy.command(categoriesId, { contract: "taxonomy-command/v2", kind: "delete-term", expectedStateDigest: retired.stateDigest, termId: childId }));
      assert.equal(deleted.terms.some((term) => term.termId === childId), false);
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
