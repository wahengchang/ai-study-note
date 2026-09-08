import { sha256Digest } from "../../core/foundation/index.js";
import type { RevisionSchemaValidator } from "../../core/application/index.js";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function valid(value: unknown, schema: unknown): boolean {
  if (!record(schema)) return false;
  if (schema.const !== undefined && !Object.is(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((candidate) => valid(value, candidate))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((candidate) => valid(value, candidate)).length !== 1) return false;
  const type = schema.type;
  if (type === "object") {
    if (!record(value)) return false;
    if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(value, key))) return false;
    if (schema.properties !== undefined && !record(schema.properties)) return false;
    const properties = record(schema.properties) ? schema.properties : {};
    for (const [key, property] of Object.entries(properties)) if (Object.hasOwn(value, key) && !valid(value[key], property)) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
    return true;
  }
  if (type === "array") return Array.isArray(value) && (schema.items === undefined || value.every((item) => valid(item, schema.items)));
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return type === undefined;
}

export function createJsonSchemaRevisionValidator(): RevisionSchemaValidator {
  return Object.freeze({
    validate(input: Parameters<RevisionSchemaValidator["validate"]>[0]) {
      if (sha256Digest(input.contentBytes) !== input.contentDigest) return { ok: false };
      try {
        const schema: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.schema.schemaBytes));
        const content: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.contentBytes));
        return valid(content, schema) ? { ok: true } : { ok: false };
      } catch { return { ok: false }; }
    },
  });
}
