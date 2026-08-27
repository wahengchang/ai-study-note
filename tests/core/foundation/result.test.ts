import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes, type CoreResult } from "../../../core/foundation/index.js";

test("invalid canonical JSON has the exact safe failure", () => {
  const result = canonicalJsonBytes(undefined);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error, {
      code: "INVALID_CANONICAL_JSON",
      owner: "CoreFoundation",
      subjectIds: [],
      remediation: { kind: "message", message: "請提供有效的 I-JSON 值。" },
    });
  }
});

test("CoreResult is discriminated", () => {
  const invalid = canonicalJsonBytes(undefined);
  assert.equal(invalid.ok, false);
  if (invalid.ok) throw new Error("unreachable");
  const result: CoreResult<number> = { ok: false, error: invalid.error };
  assert.equal(result.ok, false);
});
