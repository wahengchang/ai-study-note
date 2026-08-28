import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest, type Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import type { CurrentRouteClaimProposal, PublishedRouteClaimProposal, RouteClaim, SiteDefinition, SiteDefinitionResult, SiteDefinitionTransaction, ValidatedCurrentRouteClaim, ValidatedPublishedRouteClaim } from "../../../core/site-definition/index.js";

type ClaimProposal = CurrentRouteClaimProposal | PublishedRouteClaimProposal;
type ClaimCase = Readonly<{
  name: string;
  prepare: (site: SiteDefinition) => SiteDefinitionResult<ClaimProposal>;
  validate: (site: SiteDefinition, proposal: ClaimProposal, transaction: SiteDefinitionTransaction) => SiteDefinitionResult<unknown>;
}>;
type MutableProposal = { claim: { graph: "current" | "published"; normalizedRoute: string; owner: string; sourceRevisionId: string }; baselineDigests: { current: Digest; published: Digest }; resultingDigests: { current: Digest; published: Digest }; nextCurrentBytes?: Uint8Array; nextPublishedBytes?: Uint8Array };

function withSite(prefix: string, body: (store: PersistenceStore, site: SiteDefinition) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    const databasePath = path.join(directory, "cms.sqlite");
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) throw new Error("openPersistence");
    const store = opened.value;
    try {
      seedRevisions(store);
      body(store, createSiteDefinition({ persistence: store }));
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function seedRevisions(store: PersistenceStore): void {
  const schema = canonicalJsonBytes({ type: "object" });
  const content = canonicalJsonBytes({ title: "route claim" });
  assert.equal(schema.ok && content.ok, true);
  if (!schema.ok || !content.ok) throw new Error("canonicalJsonBytes");
  assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
  for (const entryId of ["entry-a", "entry-b", "entry-c"]) {
    for (const revisionId of ["r1", "r2"]) {
      assert.equal(store.createRevision({ identity: { entryId, revisionId }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: `save-${entryId}-${revisionId}`, operationKind: "SaveRevision" } }).ok, true);
    }
  }
}

function snapshots(site: SiteDefinition) {
  const current = site.snapshot("current");
  const published = site.snapshot("published");
  assert.equal(current.ok && published.ok, true);
  if (!current.ok || !published.ok) throw new Error("snapshot");
  return { current: current.value, published: published.value };
}

function canonicalDigest(store: PersistenceStore): Digest {
  const state = store.canonicalState();
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error("canonicalState");
  return state.value.digest;
}

function assertStale(result: SiteDefinitionResult<unknown>): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STALE_ROUTE_PROPOSAL");
}

function validateInTransaction(site: SiteDefinition, proposal: ClaimProposal, validate: ClaimCase["validate"], store: PersistenceStore): SiteDefinitionResult<unknown> {
  const result = store.runTransaction((transaction) => ({ ok: true as const, value: validate(site, proposal, transaction) }));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("runTransaction");
  return result.value;
}

test("published proposal binds both graph digests; cross-graph key coexists and target mutation stays isolated", () => {
  withSite("published-route-isolation-", (store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/Straße", sourceRevisionId: "r1" }).ok, true);
    const before = snapshots(site);
    const prepared = site.preparePublishedClaim({ owner: "entry-b", route: "/STRASSE/", sourceRevisionId: "r1" });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(prepared.value.contract, "published-route-claim-proposal/v1");
    assert.equal(prepared.value.claim.graph, "published");
    assert.deepEqual(prepared.value.baselineDigests, { current: before.current.digest, published: before.published.digest });
    assert.equal(prepared.value.resultingDigests.current, before.current.digest);
    assert.equal(prepared.value.resultingDigests.published, sha256Digest(prepared.value.nextPublishedBytes));
    assert.equal(site.createPublishedClaim({ owner: "entry-b", route: "/STRASSE/", sourceRevisionId: "r1" }).ok, true);
    const after = snapshots(site);
    assert.deepEqual(after.current.bytes, before.current.bytes);
    assert.equal(after.current.digest, before.current.digest);
    assert.equal(after.published.digest, prepared.value.resultingDigests.published);
    assert.equal(sha256Digest(after.published.bytes), after.published.digest);
    assert.deepEqual(after.current.claims.map((claim) => claim.normalizedRoute), ["/strasse"]);
    assert.deepEqual(after.published.claims.map((claim) => claim.normalizedRoute), ["/strasse"]);
    const canonicalBeforeConflict = canonicalDigest(store);
    const conflict = site.createPublishedClaim({ owner: "entry-c", route: "/strasse", sourceRevisionId: "r1" });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "ROUTE_CONFLICT");
    assert.deepEqual(snapshots(site), after);
    assert.equal(canonicalDigest(store), canonicalBeforeConflict);
  });
});

test("same owner may use independent routes across graphs and published attribution replaces only target claim", () => {
  withSite("published-route-attribution-", (store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/current-only", sourceRevisionId: "r1" }).ok, true);
    const currentBefore = snapshots(site).current;
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/published-only", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/published-only", sourceRevisionId: "r2" }).ok, true);
    const after = snapshots(site);
    assert.deepEqual(after.current, currentBefore);
    assert.deepEqual(after.published.claims, [{ graph: "published", normalizedRoute: "/published-only", owner: "entry-a", sourceRevisionId: "r2" }]);
    const beforeFailure = { snapshots: after, canonical: canonicalDigest(store) };
    const missingRevision = site.createPublishedClaim({ owner: "entry-a", route: "/published-only", sourceRevisionId: "missing" });
    assert.equal(missingRevision.ok, false);
    if (!missingRevision.ok) assert.equal(missingRevision.error.code, "SITE_DEFINITION_STORAGE_FAILURE");
    assert.deepEqual(snapshots(site), beforeFailure.snapshots);
    assert.equal(canonicalDigest(store), beforeFailure.canonical);
  });
});

test("published equivalent Unicode collision is escaped and leaves both graphs plus canonical state intact", () => {
  withSite("published-route-conflict-", (store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/current", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/Café", sourceRevisionId: "r1" }).ok, true);
    const before = { snapshots: snapshots(site), canonical: canonicalDigest(store) };
    const conflict = site.createPublishedClaim({ owner: "entry-b", route: "/Cafe\u0301/", sourceRevisionId: "r1" });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) {
      assert.equal(conflict.error.code, "ROUTE_CONFLICT");
      assert.deepEqual(conflict.error.subjectIds, ["entry-b", "/Cafe\\u{301}/"]);
      assert.equal(conflict.error.subjectIds.some((subject) => subject.includes("é") || subject.includes("\u0301")), false);
    }
    assert.deepEqual(snapshots(site), before.snapshots);
    assert.equal(canonicalDigest(store), before.canonical);
  });
});

test("current and published proposals reject foreign copies and every public-field rewrite", () => {
  const cases: readonly ClaimCase[] = [
    { name: "current", prepare: (site) => site.prepareCurrentClaim({ owner: "entry-a", route: "/current", sourceRevisionId: "r1" }), validate: (site, proposal, transaction) => site.validateCurrentClaimInTransaction(proposal as CurrentRouteClaimProposal, transaction) },
    { name: "published", prepare: (site) => site.preparePublishedClaim({ owner: "entry-a", route: "/published", sourceRevisionId: "r1" }), validate: (site, proposal, transaction) => site.validatePublishedClaimInTransaction(proposal as PublishedRouteClaimProposal, transaction) },
  ];
  for (const claimCase of cases) {
    withSite(`proposal-${claimCase.name}-`, (store, site) => {
      const prepared = claimCase.prepare(site);
      assert.equal(prepared.ok, true);
      if (!prepared.ok) return;
      const original = prepared.value;
      const originalBytes = "nextCurrentBytes" in original ? original.nextCurrentBytes : original.nextPublishedBytes;
      const bytesKey = "nextCurrentBytes" in original ? "nextCurrentBytes" : "nextPublishedBytes";
      const alteredBytes = new Uint8Array(originalBytes);
      const firstByte = alteredBytes.at(0);
      if (firstByte === undefined) throw new Error("proposal bytes");
      alteredBytes[0] = firstByte ^ 1;
      const rewrites: readonly ClaimProposal[] = [
        { ...original } as ClaimProposal,
        { ...original, claim: { ...original.claim, graph: original.claim.graph === "current" ? "published" : "current" } } as ClaimProposal,
        { ...original, claim: { ...original.claim, owner: "entry-b" } } as ClaimProposal,
        { ...original, claim: { ...original.claim, sourceRevisionId: "r2" } } as ClaimProposal,
        { ...original, baselineDigests: { ...original.baselineDigests, current: original.baselineDigests.published } } as ClaimProposal,
        { ...original, resultingDigests: { ...original.resultingDigests, published: original.resultingDigests.current } } as ClaimProposal,
        { ...original, [bytesKey]: alteredBytes } as ClaimProposal,
      ];
      const before = { snapshots: snapshots(site), canonical: canonicalDigest(store) };
      for (const rewrite of rewrites) assertStale(validateInTransaction(site, rewrite, claimCase.validate, store));
      const mutations: readonly ((proposal: MutableProposal) => void)[] = [
        (proposal) => { proposal.claim.graph = proposal.claim.graph === "current" ? "published" : "current"; },
        (proposal) => { proposal.claim.owner = "entry-b"; },
        (proposal) => { proposal.claim.sourceRevisionId = "r2"; },
        (proposal) => { proposal.baselineDigests.current = proposal.baselineDigests.published; },
        (proposal) => { proposal.resultingDigests.published = proposal.resultingDigests.current; },
        (proposal) => {
          const bytes = proposal.nextCurrentBytes ?? proposal.nextPublishedBytes;
          const byte = bytes?.at(0);
          if (bytes === undefined || byte === undefined) throw new Error("proposal bytes");
          bytes[0] = byte ^ 1;
        },
      ];
      for (const mutate of mutations) {
        const issued = claimCase.prepare(site);
        assert.equal(issued.ok, true);
        if (!issued.ok) return;
        mutate(issued.value as unknown as MutableProposal);
        assertStale(validateInTransaction(site, issued.value, claimCase.validate, store));
      }
      assert.deepEqual(snapshots(site), before.snapshots);
      assert.equal(canonicalDigest(store), before.canonical);
    });
  }
});

test("any graph baseline change stales proposal; tokens bind graph and transaction then become single-use", () => {
  withSite("published-route-tokens-", (store, site) => {
    const currentPrepared = site.prepareCurrentClaim({ owner: "entry-a", route: "/current", sourceRevisionId: "r1" });
    assert.equal(currentPrepared.ok, true);
    if (!currentPrepared.ok) return;
    assert.equal(site.createPublishedClaim({ owner: "entry-b", route: "/published", sourceRevisionId: "r1" }).ok, true);
    assertStale(validateInTransaction(site, currentPrepared.value, (subject, proposal, transaction) => subject.validateCurrentClaimInTransaction(proposal as CurrentRouteClaimProposal, transaction), store));
    const publishedPrepared = site.preparePublishedClaim({ owner: "entry-c", route: "/published-c", sourceRevisionId: "r1" });
    assert.equal(publishedPrepared.ok, true);
    if (!publishedPrepared.ok) return;
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/current", sourceRevisionId: "r1" }).ok, true);
    assertStale(validateInTransaction(site, publishedPrepared.value, (subject, proposal, transaction) => subject.validatePublishedClaimInTransaction(proposal as PublishedRouteClaimProposal, transaction), store));

    const boundProposal = site.preparePublishedClaim({ owner: "entry-c", route: "/bound", sourceRevisionId: "r1" });
    assert.equal(boundProposal.ok, true);
    if (!boundProposal.ok) return;
    const bound = store.runTransaction<SiteDefinitionResult<ValidatedPublishedRouteClaim>, never>((transaction) => ({ ok: true as const, value: site.validatePublishedClaimInTransaction(boundProposal.value, transaction) }));
    assert.equal(bound.ok, true);
    if (!bound.ok) return;
    const boundToken = bound.value;
    if (!boundToken.ok) return;
    const beforeForeignApply = { snapshots: snapshots(site), canonical: canonicalDigest(store) };
    const foreignTransaction = store.runTransaction((transaction) => ({ ok: true as const, value: site.applyValidatedPublishedClaimInTransaction(boundToken.value, transaction) }));
    assert.equal(foreignTransaction.ok, true);
    if (!foreignTransaction.ok) return;
    assertStale(foreignTransaction.value);
    const repeatedForeignApply = store.runTransaction((transaction) => ({ ok: true as const, value: site.applyValidatedPublishedClaimInTransaction(boundToken.value, transaction) }));
    assert.equal(repeatedForeignApply.ok, true);
    if (!repeatedForeignApply.ok) return;
    assertStale(repeatedForeignApply.value);
    assert.deepEqual(snapshots(site), beforeForeignApply.snapshots);
    assert.equal(canonicalDigest(store), beforeForeignApply.canonical);

    const wrongGraphProposal = site.preparePublishedClaim({ owner: "entry-c", route: "/wrong-graph", sourceRevisionId: "r1" });
    assert.equal(wrongGraphProposal.ok, true);
    if (!wrongGraphProposal.ok) return;
    const wrongGraph = store.runTransaction<SiteDefinitionResult<unknown>, never>((transaction) => {
      const token = site.validatePublishedClaimInTransaction(wrongGraphProposal.value, transaction);
      const applied = token.ok ? site.applyValidatedCurrentClaimInTransaction(token.value as unknown as ValidatedCurrentRouteClaim, transaction) : token as unknown as SiteDefinitionResult<unknown>;
      return { ok: true as const, value: applied };
    });
    assert.equal(wrongGraph.ok, true);
    if (!wrongGraph.ok) return;
    assertStale(wrongGraph.value);

    const acceptedProposal = site.preparePublishedClaim({ owner: "entry-c", route: "/accepted", sourceRevisionId: "r1" });
    assert.equal(acceptedProposal.ok, true);
    if (!acceptedProposal.ok) return;
    const applied = store.runTransaction<Readonly<{ first: SiteDefinitionResult<RouteClaim>; second: SiteDefinitionResult<RouteClaim> }>, never>((transaction) => {
      const token = site.validatePublishedClaimInTransaction(acceptedProposal.value, transaction);
      if (!token.ok) {
        const failure = token as unknown as SiteDefinitionResult<RouteClaim>;
        return { ok: true as const, value: { first: failure, second: failure } };
      }
      const first = site.applyValidatedPublishedClaimInTransaction(token.value, transaction);
      const second = site.applyValidatedPublishedClaimInTransaction(token.value, transaction);
      return { ok: true as const, value: { first, second } };
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.value.first.ok, true);
    assertStale(applied.value.second);
    assert.deepEqual(snapshots(site).published.claims, [
      { graph: "published", normalizedRoute: "/accepted", owner: "entry-c", sourceRevisionId: "r1" },
      { graph: "published", normalizedRoute: "/published", owner: "entry-b", sourceRevisionId: "r1" },
    ]);
  });
});
