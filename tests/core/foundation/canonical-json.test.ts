import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes } from "../../../core/foundation/index.js";

function bytes(value: unknown): string {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return new TextDecoder().decode(result.value);
}

test("canonical JSON sorts keys without Unicode normalization", () => {
  assert.equal(bytes({ b: 1, a: "\u00e9" }), '{"a":"é","b":1}');
  assert.equal(bytes({ "\u00e9": 1, "e\u0301": 2 }), '{"é":2,"é":1}');
});

test("supports null-prototype, frozen records, and __proto__ data keys", () => {
  const record = Object.create(null) as Record<string, unknown>;
  const nested = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(nested, "__proto__", { configurable: true, enumerable: true, value: 1, writable: true });
  Object.defineProperty(record, "__proto__", { configurable: true, enumerable: true, value: nested, writable: true });
  record.value = 2;
  assert.equal(bytes(Object.freeze(record)), '{"__proto__":{"__proto__":1},"value":2}');
});

test("rejects proxies and accessors without invoking traps or getters", () => {
  let traps = 0;
  const proxy = new Proxy({}, { ownKeys() { traps += 1; return []; } });
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { traps += 1; return 1; } });
  assert.equal(canonicalJsonBytes(proxy).ok, false);
  assert.equal(canonicalJsonBytes(accessor).ok, false);
  assert.equal(traps, 0);
});

test("rejects cycles, lone surrogates, holes, and invalid prototypes", () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.equal(canonicalJsonBytes(cycle).ok, false);
  assert.equal(canonicalJsonBytes("\ud800").ok, false);
  assert.equal(canonicalJsonBytes([, 1]).ok, false);
  assert.equal(canonicalJsonBytes(new Date()).ok, false);
});

test("returns independent evidence", () => {
  const input = { nested: [1] };
  const result = canonicalJsonBytes(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  input.nested[0] = 2;
  assert.equal(new TextDecoder().decode(result.value), '{"nested":[1]}');
});
