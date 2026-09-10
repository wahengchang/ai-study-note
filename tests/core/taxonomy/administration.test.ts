import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence, type PersistenceStore } from "../../../core/persistence/index.js";
import { createTaxonomy, type Taxonomy, type TaxonomyCommandResult, type TaxonomySnapshot } from "../../../core/taxonomy/index.js";

type Harness = Readonly<{ directory: string; store: PersistenceStore; taxonomy: Taxonomy }>;

function start(): Harness {
  const directory = mkdtempSync(path.join(tmpdir(), "taxonomy-administration-"));
  const databasePath = path.join(directory, "cms.sqlite");
  assert.equal(migrateDatabase({ databasePath }).ok, true);
  const opened = openPersistence({ databasePath });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("openPersistence failed");
  const schemaBytes = canonicalJsonBytes({ type: "object" });
  assert.equal(schemaBytes.ok, true);
  if (!schemaBytes.ok) throw new Error("canonicalJsonBytes failed");
  assert.equal(opened.value.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schemaBytes.value, schemaDigest: sha256Digest(schemaBytes.value) }).ok, true);
  return { directory, store: opened.value, taxonomy: createTaxonomy({ persistence: opened.value }) };
}

function snapshot(taxonomy: Taxonomy, taxonomyId = "topics"): TaxonomySnapshot {
  const result = taxonomy.getTaxonomy(taxonomyId);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("taxonomy get failed");
  return result.value;
}

function command(taxonomy: Taxonomy, value: Readonly<Record<string, unknown>>, taxonomyId = "topics"): TaxonomyCommandResult {
  const result = taxonomy.executeCommand(taxonomyId, { ...value, expectedStateDigest: snapshot(taxonomy, taxonomyId).stateDigest } as unknown as Parameters<Taxonomy["executeCommand"]>[1]);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("taxonomy command failed");
  return result.value;
}

function appendRevision(store: PersistenceStore, revisionId: string, taxonomyTerms: readonly Readonly<{ taxonomyId: string; termId: string }>[]): void {
  const contentBytes = canonicalJsonBytes({ title: revisionId });
  assert.equal(contentBytes.ok, true);
  if (!contentBytes.ok) throw new Error("canonicalJsonBytes failed");
  assert.equal(store.createRevisionWithReferences({
    revision: {
      identity: { entryId: "entry", revisionId }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: contentBytes.value, contentDigest: sha256Digest(contentBytes.value),
      lineage: { operationId: `save-${revisionId}`, operationKind: "SaveRevision" },
    },
    assetVersions: [], taxonomyTerms,
  }).ok, true);
}

function setupTerms(taxonomy: Taxonomy): void {
  const created = taxonomy.createTaxonomy({ contract: "taxonomy-create-request/v1", taxonomyId: "topics", label: "Topics" });
  assert.equal(created.ok, true);
  command(taxonomy, { contract: "taxonomy-command/v1", kind: "create-term", termId: "alpha", label: "Alpha", slug: "alpha", order: 10 });
  command(taxonomy, { contract: "taxonomy-command/v1", kind: "create-term", termId: "beta", label: "Beta", slug: "beta", order: 20 });
}

function stateDigest(store: PersistenceStore): string {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonicalState failed");
  return state.value.digest;
}

test("taxonomy is flat, orders live terms deterministically, and captures immutable revision evidence", () => {
  const value = start();
  try {
    setupTerms(value.taxonomy);
    const listed = snapshot(value.taxonomy);
    assert.deepEqual(listed.terms.map((term) => [term.termId, term.slug, term.order, Object.hasOwn(term, "parentTermId")]), [["alpha", "alpha", 10, false], ["beta", "beta", 20, false]]);

    const duplicateSlug = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", termId: "duplicate-slug", label: "Duplicate slug", slug: "alpha", order: 30, expectedStateDigest: listed.stateDigest });
    assert.equal(duplicateSlug.ok, false);
    if (!duplicateSlug.ok) { assert.equal(duplicateSlug.error.code, "TAXONOMY_CONFLICT"); assert.equal(duplicateSlug.error.owner, "Taxonomy"); }
    const duplicateOrder = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", termId: "duplicate-order", label: "Duplicate order", slug: "duplicate-order", order: 10, expectedStateDigest: listed.stateDigest });
    assert.equal(duplicateOrder.ok, false);
    if (!duplicateOrder.ok) { assert.equal(duplicateOrder.error.code, "TAXONOMY_CONFLICT"); assert.equal(duplicateOrder.error.owner, "Taxonomy"); }

    appendRevision(value.store, "historical", [{ taxonomyId: "topics", termId: "alpha" }]);
    const before = value.store.getRevisionTaxonomyBindings({ entryId: "entry", revisionId: "historical" });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.deepEqual(before.value[0]?.evidence, { taxonomyId: "topics", termId: "alpha", label: "Alpha", slug: "alpha", order: 10 });

    command(value.taxonomy, { contract: "taxonomy-command/v1", kind: "rename-term", termId: "alpha", label: "Renamed Alpha" });
    command(value.taxonomy, { contract: "taxonomy-command/v1", kind: "retire-term", termId: "alpha" });
    const after = value.store.getRevisionTaxonomyBindings({ entryId: "entry", revisionId: "historical" });
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.deepEqual(after.value, before.value);
    const retired = snapshot(value.taxonomy).terms.find((term) => term.termId === "alpha");
    assert.deepEqual(retired, { taxonomyId: "topics", termId: "alpha", label: "Renamed Alpha", slug: "alpha", order: 10, state: "retired" });
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("taxonomy reports current and published impact separately and refuses active deletion without a write", () => {
  const value = start();
  try {
    setupTerms(value.taxonomy);
    appendRevision(value.store, "active", [{ taxonomyId: "topics", termId: "alpha" }]);
    assert.equal(value.store.setEntryPointers({ entryId: "entry", currentRevisionId: "active", publishedRevisionId: "active", lineage: { revisionId: "active", operationId: "publish-active", operationKind: "PublishRevision" } }).ok, true);

    const renamed = command(value.taxonomy, { contract: "taxonomy-command/v1", kind: "rename-term", termId: "alpha", label: "Current and published" });
    assert.deepEqual(renamed.impact.current, [{ entryId: "entry", revisionId: "active", pointer: "current" }]);
    assert.deepEqual(renamed.impact.published, [{ entryId: "entry", revisionId: "active", pointer: "published" }]);

    const before = stateDigest(value.store);
    const deleted = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "delete-term", termId: "alpha", expectedStateDigest: renamed.snapshot.stateDigest });
    assert.equal(deleted.ok, false);
    if (!deleted.ok) { assert.equal(deleted.error.code, "TERM_ACTIVE_USAGE"); assert.equal(deleted.error.owner, "Taxonomy"); }
    assert.equal(stateDigest(value.store), before);
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("taxonomy stale and duplicate commands are semantic Taxonomy conflicts", () => {
  const value = start();
  try {
    setupTerms(value.taxonomy);
    const staleDigest = snapshot(value.taxonomy).stateDigest;
    command(value.taxonomy, { contract: "taxonomy-command/v1", kind: "create-term", termId: "gamma", label: "Gamma", slug: "gamma", order: 30 });
    const stale = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", termId: "delta", label: "Delta", slug: "delta", order: 40, expectedStateDigest: staleDigest });
    assert.equal(stale.ok, false);
    if (!stale.ok) { assert.equal(stale.error.code, "TAXONOMY_STATE_CONFLICT"); assert.equal(stale.error.owner, "Taxonomy"); }

    const current = snapshot(value.taxonomy);
    const duplicate = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "create-term", termId: "gamma", label: "Gamma again", slug: "gamma-again", order: 50, expectedStateDigest: current.stateDigest });
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) { assert.equal(duplicate.error.code, "TAXONOMY_CONFLICT"); assert.equal(duplicate.error.owner, "Taxonomy"); }
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("taxonomy migration rejects unresolved mappings atomically and appends replacement revisions before moving pointers", () => {
  const value = start();
  try {
    setupTerms(value.taxonomy);
    appendRevision(value.store, "source", [{ taxonomyId: "topics", termId: "alpha" }]);
    assert.equal(value.store.setEntryPointers({ entryId: "entry", currentRevisionId: "source", publishedRevisionId: "source", lineage: { revisionId: "source", operationId: "publish-source", operationKind: "PublishRevision" } }).ok, true);

    const beforeUnresolved = stateDigest(value.store);
    const unresolved = value.taxonomy.executeCommand("topics", { contract: "taxonomy-command/v1", kind: "migrate-bindings", operationId: "unresolved", mappings: [{ source: { taxonomyId: "topics", termId: "alpha" }, replacement: { taxonomyId: "topics", termId: "missing" } }], replacements: [{ entryId: "entry", sourceRevisionId: "source", replacementRevisionId: "replacement" }], expectedStateDigest: snapshot(value.taxonomy).stateDigest });
    assert.equal(unresolved.ok, false);
    if (!unresolved.ok) { assert.equal(unresolved.error.code, "TAXONOMY_MAPPING_UNRESOLVABLE"); assert.equal(unresolved.error.owner, "Taxonomy"); }
    assert.equal(stateDigest(value.store), beforeUnresolved);

    const migrated = command(value.taxonomy, {
      contract: "taxonomy-command/v1", kind: "migrate-bindings", operationId: "migrate-alpha-to-beta",
      mappings: [{ source: { taxonomyId: "topics", termId: "alpha" }, replacement: { taxonomyId: "topics", termId: "beta" } }],
      replacements: [{ entryId: "entry", sourceRevisionId: "source", replacementRevisionId: "replacement" }],
    });
    assert.deepEqual(migrated.migration, { operationId: "migrate-alpha-to-beta", replacements: [{ source: { entryId: "entry", revisionId: "source" }, replacement: { entryId: "entry", revisionId: "replacement" } }] });
    assert.equal(value.store.getRevision({ entryId: "entry", revisionId: "source" }).ok, true);
    const replacement = value.store.getRevisionTaxonomyBindings({ entryId: "entry", revisionId: "replacement" });
    assert.equal(replacement.ok, true);
    if (!replacement.ok) return;
    assert.deepEqual(replacement.value.map((binding) => binding.termId), ["beta"]);
    const pointers = value.store.getEntryPointers("entry");
    assert.equal(pointers.ok, true);
    if (!pointers.ok) return;
    assert.equal(pointers.value.currentRevisionId, "replacement");
    assert.equal(pointers.value.publishedRevisionId, "replacement");
  } finally {
    value.store.close();
    rmSync(value.directory, { recursive: true, force: true });
  }
});
