import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue, type MessageRemediation } from "../foundation/index.js";
import type { PersistenceStore, SchemaMigrationImpactReport, SchemaMigrationPointerPolicyInput } from "../persistence/index.js";
import type { RevisionSchemaValidator } from "./contracts.js";
import type { ContentTypeDefinitionValidator } from "./authoring-read.js";

export type ContentTypeMigrationPolicy = Readonly<{ entryId: string; pointer: "current" | "published"; policy: "move" | "pin" }>;
export type ContentTypeMigrationMapping = Readonly<{ sourceRevision: Readonly<{ entryId: string; revisionId: string }>; replacement: JsonValue }>;
export type ContentTypeMigrationProposal = Readonly<{ contract: "content-type-migration/v1"; kind: "proposal"; sourceVersion: number; targetSchema: JsonValue; pointerPolicies: readonly ContentTypeMigrationPolicy[]; mappings: readonly ContentTypeMigrationMapping[] }>;
export type ContentTypeMigrationCommand = Readonly<Omit<ContentTypeMigrationProposal, "kind"> & { kind: "command"; expectedStateDigest: Digest; operationId: string; replacements: readonly Readonly<{ sourceRevision: Readonly<{ entryId: string; revisionId: string }>; replacementRevisionId: string }>[] }>;
export type ContentTypeMigrationImpact = Readonly<{ contract: "content-type-migration/v1"; kind: "preview" | "blocked"; sourceSchemaIdentity: Readonly<{ schemaId: string; version: number }>; targetSchemaIdentity: Readonly<{ schemaId: string; version: number }>; mappingIdentity: Digest; affectedPointers: SchemaMigrationImpactReport["affectedPointers"]; historicalRevisions: SchemaMigrationImpactReport["historicalRevisions"]; mapping: SchemaMigrationImpactReport["mapping"]; blockedRows: SchemaMigrationImpactReport["blockedRows"]; stateDigest: Digest }>;
export type ContentTypeMigrationExecution = Readonly<Omit<ContentTypeMigrationImpact, "kind"> & { kind: "execution"; operationId: string; replacements: readonly Readonly<{ sourceRevision: Readonly<{ entryId: string; revisionId: string }>; replacementRevision: Readonly<{ entryId: string; revisionId: string }> }>[]; pointers: readonly Readonly<{ entryId: string; pointer: "current" | "published"; sourceRevisionId: string; policy: "move" | "pin"; resultRevisionId: string }>[]; afterDigest: Digest }>;
export type ContentTypeMigrationFailureCode = "CONTENT_TYPE_NOT_FOUND" | "CONTENT_TYPE_MIGRATION_STALE" | "INVALID_CONTENT_TYPE_MIGRATION" | "CONTENT_TYPE_MIGRATION_FAILED";
export type ContentTypeMigrationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: ContentTypeMigrationFailureCode; owner: "ContentTypeMigration"; subjectIds: readonly string[]; remediation: MessageRemediation }> }>;
export interface ContentTypeMigrationAdministration { preview(schemaId: string, proposal: unknown): Promise<ContentTypeMigrationResult<ContentTypeMigrationImpact>>; execute(schemaId: string, command: unknown): Promise<ContentTypeMigrationResult<ContentTypeMigrationImpact | ContentTypeMigrationExecution>>; }

type MigrationRecord = Readonly<Record<string, unknown>>;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
function fail<T>(code: ContentTypeMigrationFailureCode, schemaId: string): ContentTypeMigrationResult<T> { return { ok: false, error: { code, owner: "ContentTypeMigration", subjectIds: [schemaId], remediation: { kind: "message", message: "Content Type migration 未完成；canonical state 未變更。" } } }; }
function key(value: Readonly<{ entryId: string; revisionId: string }>): string { return `${value.entryId}\u0000${value.revisionId}`; }
function validId(value: string): boolean { return /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u.test(value); }
function exactRecord(value: unknown, keys: readonly string[]): MigrationRecord | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    if (actual.some((key) => typeof key !== "string")) return undefined;
    const orderedActual = (actual as string[]).sort();
    const wanted = [...keys].sort();
    if (orderedActual.length !== wanted.length || orderedActual.some((key, index) => key !== wanted[index])) return undefined;
    if (!wanted.every((key) => { const descriptor = descriptors[key]; return descriptor !== undefined && descriptor.enumerable && "value" in descriptor; })) return undefined;
    return value as MigrationRecord;
  } catch {
    return undefined;
  }
}
function jsonCopy(value: unknown): JsonValue | undefined {
  const bytes = canonicalJsonBytes(value);
  if (!bytes.ok) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes.value)) as JsonValue;
  } catch {
    return undefined;
  }
}
function revisionIdentity(value: unknown): Readonly<{ entryId: string; revisionId: string }> | undefined {
  const record = exactRecord(value, ["entryId", "revisionId"]);
  return record !== undefined && typeof record.entryId === "string" && typeof record.revisionId === "string" && validId(record.entryId) && validId(record.revisionId) ? Object.freeze({ entryId: record.entryId, revisionId: record.revisionId }) : undefined;
}
function policies(value: unknown): readonly ContentTypeMigrationPolicy[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>(); const parsed: ContentTypeMigrationPolicy[] = [];
  for (const item of value) {
    const record = exactRecord(item, ["entryId", "pointer", "policy"]);
    if (record === undefined || typeof record.entryId !== "string" || !validId(record.entryId) || (record.pointer !== "current" && record.pointer !== "published") || (record.policy !== "move" && record.policy !== "pin")) return undefined;
    const identity = `${record.entryId}\u0000${record.pointer}`;
    if (seen.has(identity)) return undefined;
    seen.add(identity); parsed.push(Object.freeze({ entryId: record.entryId, pointer: record.pointer, policy: record.policy }));
  }
  return Object.freeze(parsed);
}
function mappings(value: unknown): readonly ContentTypeMigrationMapping[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>(); const parsed: ContentTypeMigrationMapping[] = [];
  for (const item of value) {
    const record = exactRecord(item, ["sourceRevision", "replacement"]); const sourceRevision = record === undefined ? undefined : revisionIdentity(record.sourceRevision); const replacement = record === undefined ? undefined : jsonCopy(record.replacement);
    if (sourceRevision === undefined || replacement === undefined || seen.has(key(sourceRevision))) return undefined;
    seen.add(key(sourceRevision)); parsed.push(Object.freeze({ sourceRevision, replacement }));
  }
  return Object.freeze(parsed);
}
function proposal(value: unknown): ContentTypeMigrationProposal | undefined {
  try {
    const record = exactRecord(value, ["contract", "kind", "sourceVersion", "targetSchema", "pointerPolicies", "mappings"]);
    if (record === undefined || record.contract !== "content-type-migration/v1" || record.kind !== "proposal" || typeof record.sourceVersion !== "number" || !Number.isSafeInteger(record.sourceVersion) || record.sourceVersion < 1 || record.sourceVersion === Number.MAX_SAFE_INTEGER) return undefined;
    const targetSchema = jsonCopy(record.targetSchema); const pointerPolicies = policies(record.pointerPolicies); const migrationMappings = mappings(record.mappings);
    return targetSchema === undefined || pointerPolicies === undefined || migrationMappings === undefined ? undefined : Object.freeze({ contract: "content-type-migration/v1", kind: "proposal", sourceVersion: record.sourceVersion, targetSchema, pointerPolicies, mappings: migrationMappings });
  } catch {
    return undefined;
  }
}
function command(value: unknown): ContentTypeMigrationCommand | undefined {
  try {
    const record = exactRecord(value, ["contract", "kind", "sourceVersion", "targetSchema", "pointerPolicies", "mappings", "expectedStateDigest", "operationId", "replacements"]);
    if (record === undefined || record.kind !== "command" || typeof record.expectedStateDigest !== "string" || !digestPattern.test(record.expectedStateDigest) || typeof record.operationId !== "string" || !validId(record.operationId) || !Array.isArray(record.replacements)) return undefined;
    const prepared = proposal({ contract: record.contract, kind: "proposal", sourceVersion: record.sourceVersion, targetSchema: record.targetSchema, pointerPolicies: record.pointerPolicies, mappings: record.mappings });
    const seenSources = new Set<string>(); const seenReplacements = new Set<string>(); const replacements: Array<Readonly<{ sourceRevision: Readonly<{ entryId: string; revisionId: string }>; replacementRevisionId: string }>> = [];
    for (const item of record.replacements) {
      const replacement = exactRecord(item, ["sourceRevision", "replacementRevisionId"]); const sourceRevision = replacement === undefined ? undefined : revisionIdentity(replacement.sourceRevision);
      if (sourceRevision === undefined || typeof replacement?.replacementRevisionId !== "string" || !validId(replacement.replacementRevisionId) || seenSources.has(key(sourceRevision)) || seenReplacements.has(`${sourceRevision.entryId}\u0000${replacement.replacementRevisionId}`)) return undefined;
      seenSources.add(key(sourceRevision)); seenReplacements.add(`${sourceRevision.entryId}\u0000${replacement.replacementRevisionId}`); replacements.push(Object.freeze({ sourceRevision, replacementRevisionId: replacement.replacementRevisionId }));
    }
    return prepared === undefined ? undefined : Object.freeze({ ...prepared, kind: "command", expectedStateDigest: record.expectedStateDigest as Digest, operationId: record.operationId, replacements: Object.freeze(replacements) });
  } catch {
    return undefined;
  }
}
function persistenceFailure(code: string): ContentTypeMigrationFailureCode {
  return code === "STALE_SCHEMA_MIGRATION_REPORT" || code === "SCHEMA_VERSION_CONFLICT" ? "CONTENT_TYPE_MIGRATION_STALE" : code === "INVALID_SCHEMA_MIGRATION_REQUEST" ? "INVALID_CONTENT_TYPE_MIGRATION" : "CONTENT_TYPE_MIGRATION_FAILED";
}
function impact(report: SchemaMigrationImpactReport, stateDigest: Digest): ContentTypeMigrationImpact { return { contract: "content-type-migration/v1", kind: report.status === "blocked" ? "blocked" : "preview", sourceSchemaIdentity: { ...report.sourceSchemaIdentity }, targetSchemaIdentity: { ...report.targetSchemaIdentity }, mappingIdentity: report.mappingIdentity, affectedPointers: report.affectedPointers, historicalRevisions: report.historicalRevisions, mapping: report.mapping, blockedRows: report.blockedRows, stateDigest }; }

export function createContentTypeMigrationAdministration(input: Readonly<{ persistence: PersistenceStore; validator: ContentTypeDefinitionValidator & RevisionSchemaValidator }>): ContentTypeMigrationAdministration {
  const preflight = (schemaId: string, request: ContentTypeMigrationProposal): ContentTypeMigrationResult<Readonly<{ report: SchemaMigrationImpactReport; stateDigest: Digest }>> => {
    if (!validId(schemaId) || !input.validator.validateSchema(request.targetSchema).ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const source = input.persistence.getSchemaVersion({ schemaId, version: request.sourceVersion });
    if (!source.ok) return fail(source.error.code === "SCHEMA_VERSION_NOT_FOUND" ? "CONTENT_TYPE_NOT_FOUND" : persistenceFailure(source.error.code), schemaId);
    const targetBytes = canonicalJsonBytes(request.targetSchema);
    if (!targetBytes.ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const mappingBytes = canonicalJsonBytes({ sourceVersion: request.sourceVersion, targetSchema: request.targetSchema, pointerPolicies: request.pointerPolicies, mappings: request.mappings });
    if (!mappingBytes.ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const before = input.persistence.canonicalState();
    if (!before.ok) return fail("CONTENT_TYPE_MIGRATION_FAILED", schemaId);
    const report = input.persistence.preflightSchemaMigration({
      sourceSchemaIdentity: { schemaId, version: request.sourceVersion },
      targetSchema: { identity: { schemaId, version: request.sourceVersion + 1 }, schemaBytes: targetBytes.value, schemaDigest: sha256Digest(targetBytes.value) },
      mappingIdentity: sha256Digest(mappingBytes.value),
      pointerPolicies: request.pointerPolicies as readonly SchemaMigrationPointerPolicyInput[],
      mapper: { map(context) { const mapping = request.mappings.find((item) => key(item.sourceRevision) === key(context.sourceRevision.identity)); if (mapping === undefined) return { ok: false as const, code: "MAPPING_NOT_PROVIDED" as const }; const bytes = canonicalJsonBytes(mapping.replacement); return bytes.ok ? { ok: true as const, contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value) } : { ok: false as const, code: "MAPPING_NOT_PROVIDED" as const }; } },
      validator: { validate(value) { return input.validator.validate(value).ok ? { ok: true as const } : { ok: false as const, issues: [{ code: "TARGET_SCHEMA_REJECTED" as const, schemaPath: "$" }] }; } },
    });
    if (!report.ok) return fail(persistenceFailure(report.error.code), schemaId);
    const reportedMappings: Record<string, true> = Object.create(null);
    for (const item of report.value.mapping) reportedMappings[key(item.sourceRevision)] = true;
    if (request.mappings.some((item) => !Object.prototype.hasOwnProperty.call(reportedMappings, key(item.sourceRevision)))) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    return { ok: true, value: { report: report.value, stateDigest: before.value.digest } };
  };
  return {
    async preview(schemaId, request) { const parsed = proposal(request); if (parsed === undefined) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId); const prepared = preflight(schemaId, parsed); return prepared.ok ? { ok: true, value: impact(prepared.value.report, prepared.value.stateDigest) } : prepared; },
    async execute(schemaId, request) {
      const parsed = command(request); if (parsed === undefined) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
      const prepared = preflight(schemaId, { contract: parsed.contract, kind: "proposal", sourceVersion: parsed.sourceVersion, targetSchema: parsed.targetSchema, pointerPolicies: parsed.pointerPolicies, mappings: parsed.mappings }); if (!prepared.ok) return prepared;
      if (prepared.value.stateDigest !== parsed.expectedStateDigest) return fail("CONTENT_TYPE_MIGRATION_STALE", schemaId);
      if (prepared.value.report.status === "blocked") return { ok: true, value: impact(prepared.value.report, prepared.value.stateDigest) };
      const executed = input.persistence.executeSchemaMigration({ evidence: prepared.value.report.evidence, operationId: parsed.operationId, replacements: parsed.replacements });
      if (!executed.ok) return fail(persistenceFailure(executed.error.code), schemaId);
      const after = input.persistence.canonicalState(); if (!after.ok) return fail("CONTENT_TYPE_MIGRATION_FAILED", schemaId);
      return { ok: true, value: { ...impact(prepared.value.report, prepared.value.stateDigest), kind: "execution", operationId: executed.value.operationId, replacements: executed.value.replacements, pointers: executed.value.pointers, afterDigest: after.value.digest } };
    },
  };
}
