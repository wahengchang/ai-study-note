import { canonicalize } from "json-canonicalize";
import { types } from "node:util";

import { invalidCanonicalJsonFailure, type CoreResult } from "./result.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

function hasOnlyUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function dataDescriptorValue(
  descriptor: PropertyDescriptor | undefined,
): { valid: true; value: unknown } | { valid: false } {
  if (descriptor === undefined || !("value" in descriptor)) return { valid: false };
  return { valid: true, value: descriptor.value };
}

function snapshot(value: unknown, active: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return hasOnlyUnicodeScalars(value) ? value : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object" || types.isProxy(value)) return undefined;

  if (active.has(value)) return undefined;
  active.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    const descriptors = keys.map((key) => [key, Reflect.getOwnPropertyDescriptor(value, key)] as const);

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return undefined;
      const expectedLength = descriptors.find(([key]) => key === "length")?.[1];
      const lengthValue = dataDescriptorValue(expectedLength);
      if (!lengthValue.valid || typeof lengthValue.value !== "number") return undefined;
      const length = lengthValue.value;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) return undefined;
      const output: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const entry = descriptors[index];
        if (entry === undefined || entry[0] !== String(index)) return undefined;
        const descriptor = dataDescriptorValue(entry[1]);
        if (!descriptor.valid || entry[1]?.enumerable !== true) return undefined;
        const nested = snapshot(descriptor.value, active);
        if (nested === undefined) return undefined;
        output.push(nested);
      }
      if (descriptors[length]?.[0] !== "length") return undefined;
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const [key, rawDescriptor] of descriptors) {
      // `toJSON` 是合法 I-JSON key：序列化全程自行處理 object／array，不會把 object 交給 library，
      // 因此不需要、也不得因此拒絕輸入。
      if (typeof key !== "string" || !hasOnlyUnicodeScalars(key)) return undefined;
      const descriptor = dataDescriptorValue(rawDescriptor);
      if (!descriptor.valid || rawDescriptor?.enumerable !== true) return undefined;
      const nested = snapshot(descriptor.value, active);
      if (nested === undefined) return undefined;
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: nested,
        writable: true,
      });
    }
    return output;
  } finally {
    active.delete(value);
  }
}

function serializeSnapshot(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return canonicalize(value);
  }
  if (Array.isArray(value)) return `[${value.map(serializeSnapshot).join(",")}]`;
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record).sort().map((key) => `${canonicalize(key)}:${serializeSnapshot(record[key] as JsonValue)}`).join(",")}}`;
}

export function canonicalJsonBytes(value: unknown): CoreResult<Uint8Array> {
  try {
    const copied = snapshot(value, new WeakSet<object>());
    if (copied === undefined) return { ok: false, error: invalidCanonicalJsonFailure() };
    return { ok: true, value: new TextEncoder().encode(serializeSnapshot(copied)) };
  } catch {
    return { ok: false, error: invalidCanonicalJsonFailure() };
  }
}
