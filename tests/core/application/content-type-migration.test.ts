import assert from "node:assert/strict";
import test from "node:test";

import { createContentTypeMigrationAdministration } from "../../../core/application/index.js";
import type { PersistenceStore } from "../../../core/persistence/index.js";
import { createAjvSchemaValidator } from "../../../apps/authoring-api/index.js";

test("Content Type migration 直接 Application 呼叫對 malformed nested DTO fail closed", async () => {
  let persistenceCalls = 0;
  const persistence = new Proxy({}, { get() { persistenceCalls += 1; throw new Error("malformed DTO 不得碰觸 Persistence"); } }) as PersistenceStore;
  const administration = createContentTypeMigrationAdministration({ persistence, validator: createAjvSchemaValidator() });
  const malformed = [
    { contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [{}] },
    { contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [{ entryId: "entry", pointer: "current", policy: "move" }, { entryId: "entry", pointer: "current", policy: "pin" }], mappings: [] },
    { contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [], extra: true },
  ];
  for (const request of malformed) {
    const result = await administration.preview("note", request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "INVALID_CONTENT_TYPE_MIGRATION");
  }
  const accessor = Object.defineProperty({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [] }, "mappings", { enumerable: true, get() { return []; } });
  const withSymbol = Object.assign({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [] }, { [Symbol("extra")]: true });
  const inherited = Object.assign(Object.create({ inherited: true }), { contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [] });
  const nonEnumerable = Object.defineProperty({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [] }, "mappings", { value: [], enumerable: false });
  for (const request of [accessor, withSymbol, inherited, nonEnumerable]) {
    const result = await administration.preview("note", request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "INVALID_CONTENT_TYPE_MIGRATION");
  }
  const hostile = await administration.preview("note", new Proxy({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [] }, { get() { throw new Error("hostile getter"); } }));
  assert.equal(hostile.ok, false);
  if (!hostile.ok) assert.equal(hostile.error.code, "INVALID_CONTENT_TYPE_MIGRATION");
  const command = await administration.execute("note", { contract: "content-type-migration/v1", kind: "command", sourceVersion: 1, targetSchema: { type: "object" }, pointerPolicies: [], mappings: [], expectedStateDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", operationId: "migration", replacements: [{ sourceRevision: { entryId: "entry", revisionId: "r1" }, replacementRevisionId: "r2" }, { sourceRevision: { entryId: "entry", revisionId: "r1" }, replacementRevisionId: "r3" }] });
  assert.equal(command.ok, false);
  if (!command.ok) assert.equal(command.error.code, "INVALID_CONTENT_TYPE_MIGRATION");
  assert.equal(persistenceCalls, 0);
});
