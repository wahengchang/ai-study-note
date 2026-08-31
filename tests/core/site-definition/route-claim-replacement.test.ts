import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createSiteDefinition } from "../../../core/site-definition/index.js";
import type { RouteClaimReplacementProposal, SiteDefinition, SiteDefinitionResult } from "../../../core/site-definition/index.js";

function withSite(prefix: string, body: (databasePath: string, store: PersistenceStore, site: SiteDefinition) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  const databasePath = path.join(directory, "cms.sqlite");
  try {
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) throw new Error("openPersistence");
    try {
      seedRevisions(opened.value);
      body(databasePath, opened.value, createSiteDefinition({ persistence: opened.value }));
    } finally { opened.value.close(); }
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

function assertFailure(result: SiteDefinitionResult<unknown>, code: string, subjectIds?: readonly string[]): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
    if (subjectIds !== undefined) assert.deepEqual(result.error.subjectIds, subjectIds);
  }
}

function validateReplacement(site: SiteDefinition, proposal: RouteClaimReplacementProposal, store: PersistenceStore) {
  const result = store.runTransaction((transaction) => ({ ok: true as const, value: site.validateRouteClaimReplacementInTransaction(proposal, transaction) }));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("transaction");
  return result.value;
}

test("replacement moves one graph claim, returns complete retained impact, and leaves other graph bytes untouched", () => {
  withSite("route-replacement-move-", (_databasePath, _store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/old", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createCurrentClaim({ owner: "entry-b", route: "/B", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-c", route: "/published", sourceRevisionId: "r1" }).ok, true);
    const before = snapshots(site);
    const result = site.replaceRouteClaim({ graph: "current", owner: "entry-a", route: "/NEW/", sourceRevisionId: "r2" });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("replacement");
    const after = snapshots(site);
    assert.deepEqual(after.current.claims, [
      { graph: "current", normalizedRoute: "/b", owner: "entry-b", sourceRevisionId: "r1" },
      { graph: "current", normalizedRoute: "/new", owner: "entry-a", sourceRevisionId: "r2" },
    ]);
    assert.equal(after.published.digest, before.published.digest);
    assert.deepEqual(after.published.bytes, before.published.bytes);
    assert.equal(sha256Digest(after.current.bytes), after.current.digest);
    assert.deepEqual(result.value.impact, [
      { change: "retained", graph: "current", owner: "entry-b", from: "/b", to: "/b", resultingSourceRevisionId: "r1" },
      { change: "route-move", graph: "current", owner: "entry-a", from: "/old", to: "/new", resultingSourceRevisionId: "r2" },
      { change: "retained", graph: "published", owner: "entry-c", from: "/published", to: "/published", resultingSourceRevisionId: "r1" },
    ]);
  });
});

test("replacement classifies same normalized route attribution and rejects missing, no-op, invalid, conflict, and legacy route moves", () => {
  withSite("route-replacement-failures-", (_databasePath, _store, site) => {
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/café", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-b", route: "/taken", sourceRevisionId: "r1" }).ok, true);
    const baseline = snapshots(site);
    const attribution = site.replaceRouteClaim({ graph: "published", owner: "entry-a", route: "/cafe\u0301/", sourceRevisionId: "r2" });
    assert.equal(attribution.ok, true);
    if (!attribution.ok) throw new Error("attribution");
    assert.equal(attribution.value.impact.find((item) => item.owner === "entry-a")?.change, "attribution-only");
    assert.deepEqual(snapshots(site).published.claims.filter((item) => item.owner === "entry-a"), [{ graph: "published", normalizedRoute: "/café", owner: "entry-a", sourceRevisionId: "r2" }]);
    assertFailure(site.replaceRouteClaim({ graph: "current", owner: "entry-c", route: "/missing", sourceRevisionId: "r1" }), "ROUTE_CLAIM_NOT_FOUND", ["current", "entry-c"]);
    assertFailure(site.replaceRouteClaim({ graph: "published", owner: "entry-a", route: "/café", sourceRevisionId: "r2" }), "ROUTE_REPLACEMENT_REQUIRED", ["published", "entry-a"]);
    assertFailure(site.replaceRouteClaim({ graph: "published", owner: "entry-a", route: "/bad%2froute", sourceRevisionId: "r1" }), "INVALID_ROUTE", ["entry-a"]);
    assertFailure(site.replaceRouteClaim({ graph: "published", owner: "entry-a", route: "/taken", sourceRevisionId: "r1" }), "ROUTE_CONFLICT");
    assertFailure(site.preparePublishedClaim({ owner: "entry-a", route: "/moved", sourceRevisionId: "r2" }), "ROUTE_CHANGE_REQUIRED", ["entry-a"]);
    assert.equal(snapshots(site).current.digest, baseline.current.digest);
  });
});

test("replacement proposals are issuer-bound, byte-bound, fresh, and their valid token remains usable after rejected context", () => {
  withSite("route-replacement-proposal-", (_databasePath, store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/old", sourceRevisionId: "r1" }).ok, true);
    const prepared = site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/next", sourceRevisionId: "r2" });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("prepare");
    const clone = { ...prepared.value, claim: { ...prepared.value.claim }, impact: prepared.value.impact.map((item) => ({ ...item })), nextTargetBytes: prepared.value.nextTargetBytes.slice() };
    assertFailure(validateReplacement(site, clone, store), "STALE_ROUTE_PROPOSAL");
    const mutated = prepared.value as unknown as { impact: Array<{ owner: string }> };
    mutated.impact[0]!.owner = "forged";
    assertFailure(validateReplacement(site, prepared.value, store), "STALE_ROUTE_PROPOSAL");
    const fresh = site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/next", sourceRevisionId: "r2" });
    assert.equal(fresh.ok, true);
    if (!fresh.ok) throw new Error("fresh");
    const tokenResult = validateReplacement(site, fresh.value, store);
    assert.equal(tokenResult.ok, true);
    if (!tokenResult.ok) throw new Error("validate");
    const applied = store.runTransaction((transaction) => {
      const wrong = site.applyValidatedRouteClaimReplacementInTransaction(tokenResult.value, transaction);
      assertFailure(wrong, "STALE_ROUTE_PROPOSAL");
      return { ok: true as const, value: undefined };
    });
    assert.equal(applied.ok, true);
    const committed = store.runTransaction((transaction) => {
      const token = site.validateRouteClaimReplacementInTransaction(fresh.value, transaction);
      if (!token.ok) return { ok: true as const, value: token };
      return { ok: true as const, value: site.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction) };
    });
    assert.equal(committed.ok, true);
    if (!committed.ok) throw new Error("commit");
    assert.equal(committed.value.ok, true);
  });
});

test("configured store owns all SiteDefinition proposal transactions and apply rechecks the baseline", () => {
  withSite("route-replacement-ownership-", (databasePath, store, site) => {
    const otherOpened = openPersistence({ databasePath });
    assert.equal(otherOpened.ok, true);
    if (!otherOpened.ok) throw new Error("other store");
    try {
      const other = otherOpened.value;
      const current = site.prepareCurrentClaim({ owner: "entry-a", route: "/current", sourceRevisionId: "r1" });
      const published = site.preparePublishedClaim({ owner: "entry-a", route: "/published", sourceRevisionId: "r1" });
      assert.equal(current.ok && published.ok, true);
      if (!current.ok || !published.ok) throw new Error("create proposal");
      assertFailure(site.validateCurrentClaimInTransaction(current.value, store), "STALE_ROUTE_PROPOSAL");
      const arbitraryTransaction = { listRouteClaims() { throw new Error("unreachable"); }, replaceRouteClaim() { throw new Error("unreachable"); } };
      assertFailure(site.validateCurrentClaimInTransaction(current.value, arbitraryTransaction), "STALE_ROUTE_PROPOSAL");
      let expiredTransaction: Parameters<Parameters<PersistenceStore["runTransaction"]>[0]>[0] | undefined;
      const captured = store.runTransaction((transaction) => {
        expiredTransaction = transaction;
        return { ok: true as const, value: undefined };
      });
      assert.equal(captured.ok, true);
      if (expiredTransaction === undefined) throw new Error("expired transaction");
      assertFailure(site.validateCurrentClaimInTransaction(current.value, expiredTransaction), "STALE_ROUTE_PROPOSAL");
      const foreign = other.runTransaction((transaction) => ({ ok: true as const, value: site.validateCurrentClaimInTransaction(current.value, transaction) }));
      assert.equal(foreign.ok, true);
      if (!foreign.ok) throw new Error("foreign");
      assertFailure(foreign.value, "STALE_ROUTE_PROPOSAL");
      const foreignPublished = other.runTransaction((transaction) => ({ ok: true as const, value: site.validatePublishedClaimInTransaction(published.value, transaction) }));
      assert.equal(foreignPublished.ok, true);
      if (!foreignPublished.ok) throw new Error("foreign published");
      assertFailure(foreignPublished.value, "STALE_ROUTE_PROPOSAL");
      assert.equal(site.createCurrentClaim({ owner: "entry-b", route: "/retained", sourceRevisionId: "r1" }).ok, true);
      const replacement = site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-b", route: "/moved", sourceRevisionId: "r2" });
      assert.equal(replacement.ok, true);
      if (!replacement.ok) throw new Error("replacement");
      const foreignReplacement = other.runTransaction((transaction) => ({ ok: true as const, value: site.validateRouteClaimReplacementInTransaction(replacement.value, transaction) }));
      assert.equal(foreignReplacement.ok, true);
      if (!foreignReplacement.ok) throw new Error("foreign replacement");
      assertFailure(foreignReplacement.value, "STALE_ROUTE_PROPOSAL");
      const stale = store.runTransaction<never, unknown>((transaction) => {
        const token = site.validateRouteClaimReplacementInTransaction(replacement.value, transaction);
        if (!token.ok) return { ok: false as const, error: token.error };
        assert.equal(transaction.replaceRouteClaim({ graph: "current", normalizedRoute: "/other", owner: "entry-c", sourceRevisionId: "r1" }).ok, true);
        const applying = site.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
        assertFailure(applying, "STALE_ROUTE_PROPOSAL");
        if (applying.ok) throw new Error("stale apply");
        return { ok: false as const, error: applying.error };
      });
      assert.equal(stale.ok, false);
      assert.deepEqual(snapshots(site).current.claims, [{ graph: "current", normalizedRoute: "/retained", owner: "entry-b", sourceRevisionId: "r1" }]);
    } finally { otherOpened.value.close(); }
  });
});

test("accepted replacement reports digests reproducible from the public snapshots on both sides of the commit", () => {
  withSite("route-replacement-digests-", (_databasePath, _store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/old", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-b", route: "/kept", sourceRevisionId: "r1" }).ok, true);
    const before = snapshots(site);
    const result = site.replaceRouteClaim({ graph: "current", owner: "entry-a", route: "/new", sourceRevisionId: "r2" });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("replacement");
    const after = snapshots(site);
    assert.deepEqual(result.value.baselineDigests, { current: before.current.digest, published: before.published.digest });
    assert.deepEqual(result.value.resultingDigests, { current: after.current.digest, published: after.published.digest });
    // 兩圖 digest 都必須能由 public snapshot bytes 重算，非目標圖維持 baseline。
    assert.equal(sha256Digest(after.current.bytes), result.value.resultingDigests.current);
    assert.equal(sha256Digest(after.published.bytes), result.value.resultingDigests.published);
    assert.equal(result.value.resultingDigests.published, result.value.baselineDigests.published);
    assert.notEqual(result.value.resultingDigests.current, result.value.baselineDigests.current);
  });
});

test("every rejected replacement leaves the target graph as untouched as the other graph", () => {
  withSite("route-replacement-rejected-", (_databasePath, _store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/a", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createCurrentClaim({ owner: "entry-b", route: "/taken", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/a", sourceRevisionId: "r1" }).ok, true);
    const baseline = snapshots(site);
    const rejections = [
      ["ROUTE_CLAIM_NOT_FOUND", { graph: "current", owner: "entry-c", route: "/missing", sourceRevisionId: "r1" }],
      ["ROUTE_REPLACEMENT_REQUIRED", { graph: "current", owner: "entry-a", route: "/a", sourceRevisionId: "r1" }],
      ["INVALID_ROUTE", { graph: "current", owner: "entry-a", route: "/bad%2froute", sourceRevisionId: "r2" }],
      ["ROUTE_CONFLICT", { graph: "current", owner: "entry-a", route: "/taken", sourceRevisionId: "r2" }],
      ["INVALID_SITE_DEFINITION_INPUT", { graph: "sketch", owner: "entry-a", route: "/a", sourceRevisionId: "r2" }],
      ["INVALID_SITE_DEFINITION_INPUT", { graph: "current", owner: "entry-a", route: "/a", sourceRevisionId: "" }],
    ] as const;
    for (const [code, input] of rejections) {
      assertFailure(site.replaceRouteClaim(input as never), code);
      const after = snapshots(site);
      for (const graph of ["current", "published"] as const) {
        assert.equal(after[graph].digest, baseline[graph].digest, `${code} moved the ${graph} digest`);
        assert.deepEqual(after[graph].bytes, baseline[graph].bytes, `${code} moved the ${graph} bytes`);
      }
    }
  });
});

test("a faulted commit rolls both graphs back to their pre-command digests", () => {
  withSite("route-replacement-fault-", (_databasePath, store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/old", sourceRevisionId: "r1" }).ok, true);
    assert.equal(site.createPublishedClaim({ owner: "entry-a", route: "/old", sourceRevisionId: "r1" }).ok, true);
    const baseline = snapshots(site);
    const assertBaseline = (label: string) => {
      const after = snapshots(site);
      for (const graph of ["current", "published"] as const) {
        assert.equal(after[graph].digest, baseline[graph].digest, `${label} left the ${graph} digest moved`);
        assert.deepEqual(after[graph].bytes, baseline[graph].bytes, `${label} left the ${graph} bytes moved`);
      }
    };
    // 已 apply 但 caller 讓 transaction 失敗：write-set 必須整批回滾。
    const aborted = site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/aborted", sourceRevisionId: "r2" });
    assert.equal(aborted.ok, true);
    if (!aborted.ok) throw new Error("aborted proposal");
    const abortedCommit = store.runTransaction<never, string>((transaction) => {
      const token = site.validateRouteClaimReplacementInTransaction(aborted.value, transaction);
      if (!token.ok) return { ok: false as const, error: `validate:${token.error.code}` };
      const applied = site.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
      return { ok: false as const, error: applied.ok ? "caller-abort" : `apply:${applied.error.code}` };
    });
    assert.equal(abortedCommit.ok, false);
    if (!abortedCommit.ok) assert.equal(abortedCommit.error, "caller-abort");
    assertBaseline("caller abort");
    // apply 前 baseline 已被同一 transaction 內的其他 writer 移動：必須拒絕且不留下部分 write。
    const raced = site.prepareRouteClaimReplacement({ graph: "current", owner: "entry-a", route: "/raced", sourceRevisionId: "r2" });
    assert.equal(raced.ok, true);
    if (!raced.ok) throw new Error("raced proposal");
    const racedCommit = store.runTransaction<never, string>((transaction) => {
      const token = site.validateRouteClaimReplacementInTransaction(raced.value, transaction);
      if (!token.ok) return { ok: false as const, error: `validate:${token.error.code}` };
      const injected = transaction.replaceRouteClaim({ graph: "current", normalizedRoute: "/injected", owner: "entry-b", sourceRevisionId: "r1" });
      if (!injected.ok) return { ok: false as const, error: "injected-write-refused" };
      const applied = site.applyValidatedRouteClaimReplacementInTransaction(token.value, transaction);
      return { ok: false as const, error: applied.ok ? "applied" : applied.error.code };
    });
    assert.equal(racedCommit.ok, false);
    if (!racedCommit.ok) assert.equal(racedCommit.error, "STALE_ROUTE_PROPOSAL");
    assertBaseline("stale apply");
  });
});

test("a consumed token cannot be applied twice even when the commit left both digests unchanged", () => {
  withSite("route-replacement-single-use-", (_databasePath, store, site) => {
    assert.equal(site.createCurrentClaim({ owner: "entry-a", route: "/stable", sourceRevisionId: "r1" }).ok, true);
    // 同 route 同 source revision 的 proposal 讓 resulting 與 baseline digest 相同，
    // 因此只有 token 的單次使用限制能阻止重複 apply。
    const proposal = site.prepareCurrentClaim({ owner: "entry-a", route: "/stable", sourceRevisionId: "r1" });
    assert.equal(proposal.ok, true);
    if (!proposal.ok) throw new Error("prepare");
    assert.equal(proposal.value.resultingDigests.current, proposal.value.baselineDigests.current);
    const replayed = store.runTransaction((transaction) => {
      const token = site.validateCurrentClaimInTransaction(proposal.value, transaction);
      if (!token.ok) return { ok: true as const, value: { first: token, second: token } };
      const first = site.applyValidatedCurrentClaimInTransaction(token.value, transaction);
      const second = site.applyValidatedCurrentClaimInTransaction(token.value, transaction);
      return { ok: true as const, value: { first, second } };
    });
    assert.equal(replayed.ok, true);
    if (!replayed.ok) throw new Error("transaction");
    assert.equal(replayed.value.first.ok, true);
    assertFailure(replayed.value.second, "STALE_ROUTE_PROPOSAL");
  });
});
