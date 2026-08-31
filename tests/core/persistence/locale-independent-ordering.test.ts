import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { migrateDatabase, openPersistence } from "../../../core/persistence/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";

// `/école` 與 `/facile`、`note-a` 與 `note_a` 在 ICU collation 下的順序與 code-unit 順序相反，
// 因此可分辨 store 是否讓 locale／ICU 版本決定 record 排序與 canonical state digest。
const childMarker = "PERSISTENCE_LOCALE_CHILD";
const divergentLocale = "da_DK.UTF-8";
const accented = "/école";
const owners = ["note-a", "note_a", "notea"] as const;

function withStore(prefix: string, body: (store: PersistenceStore) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  const databasePath = path.join(directory, "cms.sqlite");
  try {
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const opened = openPersistence({ databasePath });
    assert.equal(opened.ok, true);
    if (!opened.ok) throw new Error("openPersistence");
    try { body(opened.value); } finally { opened.value.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function seed(store: PersistenceStore, routes: readonly (readonly [string, string])[]): void {
  const schema = canonicalJsonBytes({ type: "object" });
  const content = canonicalJsonBytes({ title: "ordering" });
  assert.equal(schema.ok && content.ok, true);
  if (!schema.ok || !content.ok) throw new Error("canonicalJsonBytes");
  assert.equal(store.registerSchemaVersion({ identity: { schemaId: "note", version: 1 }, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) }).ok, true);
  for (const [owner] of routes) {
    assert.equal(store.createRevision({ identity: { entryId: owner, revisionId: "r1" }, schemaIdentity: { schemaId: "note", version: 1 }, contentBytes: content.value, contentDigest: sha256Digest(content.value), lineage: { operationId: `save-${owner}`, operationKind: "SaveRevision" } }).ok, true);
  }
  for (const [owner, normalizedRoute] of routes) {
    assert.equal(store.replaceRouteClaim({ graph: "current", normalizedRoute, owner, sourceRevisionId: "r1" }).ok, true);
  }
}

function codeUnitSorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

test("listRouteClaims orders claims by code unit, not by host collation", () => {
  withStore("persistence-order-claims-", (store) => {
    seed(store, [[owners[2], accented], [owners[0], "/facile"], [owners[1], "/a-b"]]);
    const listed = store.listRouteClaims("current");
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("listRouteClaims");
    // ICU 會把 `/école` 排在 `/facile` 之前；code-unit 順序則相反。
    assert.deepEqual(listed.value.map((claim) => claim.normalizedRoute), ["/a-b", "/facile", accented]);
  });
});

test("listRouteClaims breaks route ties by owner in code-unit order", () => {
  withStore("persistence-order-owners-", (store) => {
    // 同一 graph 的 route 必須唯一，因此以共同前綴讓 owner 順序成為可觀察的排序輸出。
    seed(store, owners.map((owner) => [owner, `/r/${owner}`] as const));
    const listed = store.listRouteClaims("current");
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("listRouteClaims");
    assert.deepEqual(listed.value.map((claim) => claim.owner), codeUnitSorted(owners));
  });
});

test("canonical state bytes order every record set by code unit and stay insertion-order independent", () => {
  const digests: string[] = [];
  for (const order of [[0, 1, 2], [2, 1, 0]] as const) {
    withStore("persistence-order-canonical-", (store) => {
      const routes = [[owners[2], accented], [owners[0], "/facile"], [owners[1], "/a-b"]] as const;
      seed(store, order.map((index) => routes[index]!));
      const state = store.canonicalState();
      assert.equal(state.ok, true);
      if (!state.ok) throw new Error("canonicalState");
      const decoded = new TextDecoder().decode(state.value.bytes);
      const claimOrder = [...decoded.matchAll(/"normalizedRoute":"([^"]*)"/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
      assert.deepEqual(claimOrder, ["/a-b", "/facile", accented]);
      const revisionOrder = [...decoded.matchAll(/"entryId":"([^"]*)"/g)].map((match) => match[1]!);
      assert.deepEqual([...new Set(revisionOrder)], codeUnitSorted(owners));
      digests.push(state.value.digest);
    });
  }
  assert.equal(digests[0], digests[1]);
});

test("the same ordering contract holds under a collation-divergent locale", { skip: process.env[childMarker] === "1" }, () => {
  const { NODE_TEST_CONTEXT, NODE_TEST_WORKER_ID, ...inherited } = process.env;
  void NODE_TEST_CONTEXT;
  void NODE_TEST_WORKER_ID;
  // child 必須是獨立的 runner；沿用 test-runner context 會讓巢狀 `--test` 回報 exit code 0。
  execFileSync(process.execPath, ["--import", "tsx", "--test", fileURLToPath(import.meta.url)], {
    cwd: process.cwd(),
    env: { ...inherited, [childMarker]: "1", LANG: divergentLocale, LC_ALL: divergentLocale },
    stdio: ["ignore", "pipe", "pipe"],
  });
});
