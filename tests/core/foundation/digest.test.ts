import assert from "node:assert/strict";
import test from "node:test";

import { copyBytes, isDigest, sha256Digest } from "../../../core/foundation/index.js";

test("sha256Digest uses exact bytes and lower-case hex", () => {
  assert.equal(sha256Digest(new TextEncoder().encode("abc")), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(isDigest("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), true);
  assert.equal(isDigest("sha256:BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"), false);
});

test("copyBytes owns independent storage", () => {
  const source = new Uint8Array([1, 2]);
  const copy = copyBytes(source);
  source[0] = 9;
  assert.deepEqual(copy, new Uint8Array([1, 2]));
  copy[1] = 8;
  assert.deepEqual(source, new Uint8Array([9, 2]));
});
