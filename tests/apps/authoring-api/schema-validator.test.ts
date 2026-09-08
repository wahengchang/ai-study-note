import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import type { Digest } from "../../../core/foundation/index.js";
import type { SchemaVersionRecord } from "../../../core/persistence/index.js";
import { createAjvSchemaValidator } from "../../../apps/authoring-api/index.js";

const encoder = new TextEncoder();
function bytes(value: unknown): Uint8Array {
  const canonical = canonicalJsonBytes(value as never);
  if (!canonical.ok) throw new Error(canonical.error.code);
  return canonical.value;
}
function record(schema: unknown, digest?: Digest): SchemaVersionRecord {
  const schemaBytes = bytes(schema);
  return { identity: { schemaId: "article", version: 1 }, schemaBytes, schemaDigest: digest ?? sha256Digest(schemaBytes) };
}

test("Ajv adapter 拒絕不可編譯與 $async schema，並只接受符合 schema 的 content", () => {
  const validator = createAjvSchemaValidator();
  const schema = { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string", minLength: 1 } } };

  assert.equal(validator.validateSchema(schema as never).ok, true);
  for (const rejected of [null, 42, "object", [], { $async: true, type: "object" }, { type: "not-a-type" }, { unknownKeyword: 1 }]) {
    assert.equal(validator.validateSchema(rejected as never).ok, false, JSON.stringify(rejected));
  }

  const schemaRecord = record(schema);
  const accepted = bytes({ title: "文章" });
  assert.equal(validator.validate({ schema: schemaRecord, contentBytes: accepted, contentDigest: sha256Digest(accepted) }).ok, true);
  for (const rejected of [{ title: "" }, { title: 1 }, { title: "文章", extra: true }, {}]) {
    const contentBytes = bytes(rejected);
    assert.equal(validator.validate({ schema: schemaRecord, contentBytes, contentDigest: sha256Digest(contentBytes) }).ok, false, JSON.stringify(rejected));
  }
  const notJson = encoder.encode("{");
  assert.equal(validator.validate({ schema: schemaRecord, contentBytes: notJson, contentDigest: sha256Digest(notJson) }).ok, false);
  const notCompilable = record({ type: "not-a-type" });
  assert.equal(validator.validate({ schema: notCompilable, contentBytes: accepted, contentDigest: sha256Digest(accepted) }).ok, false);
});

/** compiled validator 由 immutable schema digest 定址：cache 命中後不得再讀 schema bytes。 */
test("Ajv adapter 以 schema digest 快取 compiled validator，且不同 digest 各自編譯", () => {
  const validator = createAjvSchemaValidator();
  const strict = record({ type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string" } } });
  const accepted = bytes({ title: "文章" });
  assert.equal(validator.validate({ schema: strict, contentBytes: accepted, contentDigest: sha256Digest(accepted) }).ok, true);

  const poisoned: SchemaVersionRecord = { identity: strict.identity, schemaBytes: encoder.encode("{"), schemaDigest: strict.schemaDigest };
  assert.equal(validator.validate({ schema: poisoned, contentBytes: accepted, contentDigest: sha256Digest(accepted) }).ok, true);

  const loose = record({ type: "object" });
  assert.notEqual(loose.schemaDigest, strict.schemaDigest);
  const extra = bytes({ title: "文章", extra: true });
  assert.equal(validator.validate({ schema: strict, contentBytes: extra, contentDigest: sha256Digest(extra) }).ok, false);
  assert.equal(validator.validate({ schema: loose, contentBytes: extra, contentDigest: sha256Digest(extra) }).ok, true);
});
