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
export interface ContentTypeMigrationAdministration { preview(schemaId: string, proposal: ContentTypeMigrationProposal): Promise<ContentTypeMigrationResult<ContentTypeMigrationImpact>>; execute(schemaId: string, command: ContentTypeMigrationCommand): Promise<ContentTypeMigrationResult<ContentTypeMigrationImpact | ContentTypeMigrationExecution>>; }

const remediation = (message: string): MessageRemediation => ({ kind: "message", message });
function fail<T>(code: ContentTypeMigrationFailureCode, schemaId: string): ContentTypeMigrationResult<T> { return { ok: false, error: { code, owner: "ContentTypeMigration", subjectIds: [schemaId], remediation: remediation("Content Type migration 未完成；canonical state 未變更。") } }; }
function key(value: Readonly<{ entryId: string; revisionId: string }>): string { return `${value.entryId}\u0000${value.revisionId}`; }
function validId(value: string): boolean { return /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u.test(value); }
function impact(report: SchemaMigrationImpactReport, stateDigest: Digest): ContentTypeMigrationImpact { return { contract: "content-type-migration/v1", kind: report.status === "blocked" ? "blocked" : "preview", sourceSchemaIdentity: { ...report.sourceSchemaIdentity }, targetSchemaIdentity: { ...report.targetSchemaIdentity }, mappingIdentity: report.mappingIdentity, affectedPointers: report.affectedPointers, historicalRevisions: report.historicalRevisions, mapping: report.mapping, blockedRows: report.blockedRows, stateDigest }; }

export function createContentTypeMigrationAdministration(input: Readonly<{ persistence: PersistenceStore; validator: ContentTypeDefinitionValidator & RevisionSchemaValidator }>): ContentTypeMigrationAdministration {
  const preflight = (schemaId: string, proposal: ContentTypeMigrationProposal): ContentTypeMigrationResult<Readonly<{ report: SchemaMigrationImpactReport; stateDigest: Digest }>> => {
    if (!validId(schemaId) || proposal.contract !== "content-type-migration/v1" || proposal.kind !== "proposal" || !Number.isSafeInteger(proposal.sourceVersion) || proposal.sourceVersion < 1 || proposal.sourceVersion === Number.MAX_SAFE_INTEGER || !input.validator.validateSchema(proposal.targetSchema).ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const source = input.persistence.getSchemaVersion({ schemaId, version: proposal.sourceVersion });
    if (!source.ok) return fail(source.error.code === "SCHEMA_VERSION_NOT_FOUND" ? "CONTENT_TYPE_NOT_FOUND" : "CONTENT_TYPE_MIGRATION_FAILED", schemaId);
    const targetBytes = canonicalJsonBytes(proposal.targetSchema);
    if (!targetBytes.ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const identities: Record<string, true> = Object.create(null);
    for (const mapping of proposal.mappings) { const identity = key(mapping.sourceRevision); if (Object.prototype.hasOwnProperty.call(identities, identity)) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId); identities[identity] = true; }
    const mappingBytes = canonicalJsonBytes({ sourceVersion: proposal.sourceVersion, targetSchema: proposal.targetSchema, pointerPolicies: proposal.pointerPolicies, mappings: proposal.mappings });
    if (!mappingBytes.ok) return fail("INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    const before = input.persistence.canonicalState();
    if (!before.ok) return fail("CONTENT_TYPE_MIGRATION_FAILED", schemaId);
    const report = input.persistence.preflightSchemaMigration({
      sourceSchemaIdentity: { schemaId, version: proposal.sourceVersion },
      targetSchema: { identity: { schemaId, version: proposal.sourceVersion + 1 }, schemaBytes: targetBytes.value, schemaDigest: sha256Digest(targetBytes.value) },
      mappingIdentity: sha256Digest(mappingBytes.value),
      pointerPolicies: proposal.pointerPolicies as readonly SchemaMigrationPointerPolicyInput[],
      mapper: { map(context) { const mapping = proposal.mappings.find((item) => key(item.sourceRevision) === key(context.sourceRevision.identity)); if (mapping === undefined) return { ok: false as const, code: "MAPPING_NOT_PROVIDED" as const }; const bytes = canonicalJsonBytes(mapping.replacement); return bytes.ok ? { ok: true as const, contentBytes: bytes.value, contentDigest: sha256Digest(bytes.value) } : { ok: false as const, code: "MAPPING_NOT_PROVIDED" as const }; } },
      validator: { validate(value) { return input.validator.validate(value).ok ? { ok: true as const } : { ok: false as const, issues: [{ code: "TARGET_SCHEMA_REJECTED" as const, schemaPath: "$" }] }; } },
    });
    if (!report.ok) return fail(report.error.code === "STALE_SCHEMA_MIGRATION_REPORT" ? "CONTENT_TYPE_MIGRATION_STALE" : "INVALID_CONTENT_TYPE_MIGRATION", schemaId);
    return { ok: true, value: { report: report.value, stateDigest: before.value.digest } };
  };
  return {
    async preview(schemaId, proposal) { const prepared = preflight(schemaId, proposal); return prepared.ok ? { ok: true, value: impact(prepared.value.report, prepared.value.stateDigest) } : prepared; },
    async execute(schemaId, command) {
      const proposal: ContentTypeMigrationProposal = { contract: command.contract, kind: "proposal", sourceVersion: command.sourceVersion, targetSchema: command.targetSchema, pointerPolicies: command.pointerPolicies, mappings: command.mappings };
      const prepared = preflight(schemaId, proposal); if (!prepared.ok) return prepared;
      if (prepared.value.stateDigest !== command.expectedStateDigest) return fail("CONTENT_TYPE_MIGRATION_STALE", schemaId);
      if (prepared.value.report.status === "blocked") return { ok: true, value: impact(prepared.value.report, prepared.value.stateDigest) };
      const executed = input.persistence.executeSchemaMigration({ evidence: prepared.value.report.evidence, operationId: command.operationId, replacements: command.replacements });
      if (!executed.ok) return fail(executed.error.code === "STALE_SCHEMA_MIGRATION_REPORT" ? "CONTENT_TYPE_MIGRATION_STALE" : executed.error.code === "INVALID_SCHEMA_MIGRATION_REQUEST" ? "INVALID_CONTENT_TYPE_MIGRATION" : "CONTENT_TYPE_MIGRATION_FAILED", schemaId);
      const after = input.persistence.canonicalState(); if (!after.ok) return fail("CONTENT_TYPE_MIGRATION_FAILED", schemaId);
      return { ok: true, value: { ...impact(prepared.value.report, prepared.value.stateDigest), kind: "execution", operationId: executed.value.operationId, replacements: executed.value.replacements, pointers: executed.value.pointers, afterDigest: after.value.digest } };
    },
  };
}
