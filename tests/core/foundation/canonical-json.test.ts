import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonBytes } from "../../../core/foundation/index.js";

function bytes(value: unknown): string {
  const result = canonicalJsonBytes(value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return new TextDecoder().decode(result.value);
}

test("matches the RFC 8785 structure vector", () => {
  // RFC 8785 §3.2.3 的 Unicode key 排序範例：以 UTF-16 code unit 排序，且不做正規化。
  assert.equal(
    bytes({
      "€": "Euro Sign",
      "\r": "Carriage Return",
      "דּ": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "": "Control",
      "ö": "Latin Small Letter O With Diaeresis",
    }),
    '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis",' +
      '"€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
  );
  assert.equal(bytes({ literals: [null, true, false] }), '{"literals":[null,true,false]}');
});

test("matches the RFC 8785 number serialization vectors", () => {
  assert.equal(bytes(0), "0");
  assert.equal(bytes(-0), "0");
  assert.equal(bytes(1e30), "1e+30");
  assert.equal(bytes(1e21), "1e+21");
  assert.equal(bytes(1e-7), "1e-7");
  assert.equal(bytes(5e-324), "5e-324");
  assert.equal(bytes(333333333.33333329), "333333333.3333333");
  assert.equal(bytes(9007199254740992), "9007199254740992");
  assert.equal(bytes(-1.7976931348623157e308), "-1.7976931348623157e+308");
  assert.equal(canonicalJsonBytes(Number.NaN).ok, false);
  assert.equal(canonicalJsonBytes(Number.POSITIVE_INFINITY).ok, false);
});

test("emits byte-identical output for ordinary, null-prototype, and frozen records", () => {
  const plain = { b: 1, a: [true, null] };
  const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { b: 1, a: [true, null] });
  const frozen = Object.freeze({ b: 1, a: Object.freeze([true, null]) });
  const expected = '{"a":[true,null],"b":1}';
  assert.equal(bytes(plain), expected);
  assert.equal(bytes(nullPrototype), expected);
  assert.equal(bytes(frozen), expected);
});

test("canonical JSON sorts keys without Unicode normalization", () => {
  assert.equal(bytes({ b: 1, a: "\u00e9" }), '{"a":"\u00e9","b":1}');
  // NFC \u00e9 與 NFD e+\u0301 是不同 key，排序後不得被正規化合併。
  assert.equal(bytes({ "\u00e9": 1, "e\u0301": 2 }), '{"e\u0301":2,"\u00e9":1}');
});

test("supports null-prototype, frozen records, and __proto__ data keys", () => {
  const record = Object.create(null) as Record<string, unknown>;
  const nested = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(nested, "__proto__", { configurable: true, enumerable: true, value: 1, writable: true });
  Object.defineProperty(record, "__proto__", { configurable: true, enumerable: true, value: nested, writable: true });
  record.value = 2;
  assert.equal(bytes(Object.freeze(record)), '{"__proto__":{"__proto__":1},"value":2}');
});

test("treats toJSON as an ordinary data key", () => {
  // `toJSON` 是合法 I-JSON key；序列化不把 object 交給 library，因此不得被誤判為 invalid。
  assert.equal(bytes({ toJSON: 1 }), '{"toJSON":1}');
  assert.equal(bytes({ a: { toJSON: "x" } }), '{"a":{"toJSON":"x"}}');
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
  assert.equal(canonicalJsonBytes({ "\udc00": 1 }).ok, false);
  assert.equal(canonicalJsonBytes([, 1]).ok, false);
  assert.equal(canonicalJsonBytes(new Date()).ok, false);
  assert.equal(canonicalJsonBytes(new Map()).ok, false);
  assert.equal(canonicalJsonBytes(undefined).ok, false);
  assert.equal(canonicalJsonBytes(() => 1).ok, false);
});

test("returns independent evidence", () => {
  const input = { nested: [1] };
  const result = canonicalJsonBytes(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  input.nested[0] = 2;
  assert.equal(new TextDecoder().decode(result.value), '{"nested":[1]}');
});
