import { Ajv2020 } from "ajv/dist/2020.js";

import type { ContentTypeDefinitionValidator, RevisionSchemaValidator } from "../../core/application/index.js";
import type { JsonValue } from "../../core/foundation/index.js";

type CompiledValidator = Readonly<{ $async?: unknown }> & ((value: unknown) => unknown);

function isAsyncSchema(schema: JsonValue): boolean {
  return typeof schema === "object" && schema !== null && !Array.isArray(schema) && (schema as Readonly<Record<string, unknown>>).$async === true;
}

function compile(schema: JsonValue): CompiledValidator | undefined {
  if (schema === null || Array.isArray(schema) || typeof schema !== "object" || isAsyncSchema(schema)) return undefined;
  try {
    const validator = new Ajv2020({ allErrors: false, strict: true }).compile(schema) as CompiledValidator;
    return validator.$async === true ? undefined : validator;
  } catch {
    return undefined;
  }
}

/** Application adapter owns Ajv; definition checks are isolated and runtime validators cache by immutable schema digest. */
export function createAjvSchemaValidator(): ContentTypeDefinitionValidator & RevisionSchemaValidator {
  const runtimeValidators = new Map<string, CompiledValidator>();
  return {
    validateSchema(schema: JsonValue) {
      return compile(schema) === undefined ? { ok: false } : { ok: true };
    },
    validate(input) {
      try {
        let validator = runtimeValidators.get(input.schema.schemaDigest);
        if (validator === undefined) {
          validator = compile(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.schema.schemaBytes)) as JsonValue);
          if (validator === undefined) return { ok: false };
          runtimeValidators.set(input.schema.schemaDigest, validator);
        }
        const content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.contentBytes));
        return validator(content) === true ? { ok: true } : { ok: false };
      } catch {
        return { ok: false };
      }
    },
  };
}
