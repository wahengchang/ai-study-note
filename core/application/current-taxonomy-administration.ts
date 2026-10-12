import { randomUUID } from "node:crypto";
import { canonicalJsonBytes, sha256Digest, type Digest, type MessageRemediation } from "../foundation/index.js";
import { readContentTypeDefinition } from "./content-type-administration.js";
import { globalSlug, suggestGlobalSlug, type CurrentTaxonomyRecord, type CurrentTaxonomyTermRecord, type PersistenceFailure, type PersistenceReadSnapshot, type PersistenceStore, type PersistenceTransaction, type TransactionDecision } from "../persistence/index.js";

export type CurrentTaxonomySnapshot = Readonly<{ contract: "taxonomy/v2"; taxonomy: CurrentTaxonomyRecord; terms: readonly CurrentTaxonomyTermRecord[]; stateDigest: Digest }>;
export type CurrentTaxonomyCatalog = Readonly<{ contract: "taxonomy-catalog/v2"; taxonomies: readonly Readonly<{ taxonomy: CurrentTaxonomyRecord; stateDigest: Digest }>[]; stateDigest: Digest }>;
export type CurrentTaxonomyCreateRequest = Readonly<{ contract: "taxonomy-create-request/v2"; expectedStateDigest: string; label: string; slug?: string | undefined; hierarchical: boolean }>;
export type CurrentTaxonomyDeleteRequest = Readonly<{ contract: "taxonomy-delete-request/v1"; expectedStateDigest: string }>;
export type CurrentTaxonomyDeleted = Readonly<{ contract: "taxonomy-deleted/v1"; taxonomyId: string; releasedSlug: string }>;
export type CurrentTaxonomyCommand = Readonly<{ contract: "taxonomy-command/v2"; expectedStateDigest: string } & (
  { kind: "replace-taxonomy"; label: string; slug: string; hierarchical: boolean } |
  { kind: "create-term"; label: string; slug?: string | undefined; parentTermId?: string | undefined; order: number } |
  { kind: "replace-term"; termId: string; label: string; slug: string; parentTermId?: string | undefined; order: number; state: "live" | "retired" } |
  { kind: "delete-term"; termId: string }
)>;
export type CurrentTaxonomyFailureCode = "INVALID_TAXONOMY" | "TAXONOMY_NOT_FOUND" | "TAXONOMY_STATE_CONFLICT" | "TAXONOMY_IN_USE" | "TAXONOMY_PROTECTED" | "TERM_NOT_FOUND" | "TERM_IN_USE" | "TAXONOMY_FAILED";
export type CurrentTaxonomyFailure = Readonly<{ code: CurrentTaxonomyFailureCode; owner: "CurrentTaxonomyAdministration"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type CurrentTaxonomyResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: CurrentTaxonomyFailure }>;
export interface CurrentTaxonomyAdministration {
  list(): Promise<CurrentTaxonomyResult<CurrentTaxonomyCatalog>>;
  get(taxonomyId: string): Promise<CurrentTaxonomyResult<CurrentTaxonomySnapshot>>;
  create(request: CurrentTaxonomyCreateRequest): Promise<CurrentTaxonomyResult<CurrentTaxonomySnapshot>>;
  command(taxonomyId: string, command: CurrentTaxonomyCommand): Promise<CurrentTaxonomyResult<CurrentTaxonomySnapshot>>;
  delete(taxonomyId: string, request: CurrentTaxonomyDeleteRequest): Promise<CurrentTaxonomyResult<CurrentTaxonomyDeleted>>;
}

function fail<T>(code: CurrentTaxonomyFailureCode, ids: readonly string[] = []): CurrentTaxonomyResult<T> {
  const message = code === "TAXONOMY_IN_USE" ? "Taxonomy 仍有 term 或被內容類型附掛，請先移除引用。" : code === "TAXONOMY_PROTECTED" ? "系統分類與標籤不可刪除。" : "請重新載入並檢查分類與 term 設定。";
  return { ok: false, error: { code, owner: "CurrentTaxonomyAdministration", subjectIds: ids, remediation: { kind: "message", message } } };
}
function currentResult<T>(result: TransactionDecision<T, CurrentTaxonomyFailure | PersistenceFailure>): CurrentTaxonomyResult<T> {
  if (result.ok || result.error.owner === "CurrentTaxonomyAdministration") return result as CurrentTaxonomyResult<T>;
  return fail("TAXONOMY_FAILED");
}
function digest(value: unknown): Digest | undefined {
  const bytes = canonicalJsonBytes(value);
  return bytes.ok ? sha256Digest(bytes.value) : undefined;
}
function validLabel(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.isWellFormed(); }
function validOrder(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function snapshot(reader: Pick<PersistenceReadSnapshot, "getCurrentTaxonomy" | "listCurrentTaxonomyTerms">, taxonomyId: string): CurrentTaxonomyResult<CurrentTaxonomySnapshot> {
  const taxonomy = reader.getCurrentTaxonomy(taxonomyId);
  if (!taxonomy.ok) return fail("TAXONOMY_NOT_FOUND", [taxonomyId]);
  const terms = reader.listCurrentTaxonomyTerms(taxonomyId);
  if (!terms.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
  const state = digest({ contract: "taxonomy/v2", taxonomy: taxonomy.value, terms: terms.value });
  return state === undefined ? fail("TAXONOMY_FAILED", [taxonomyId]) : { ok: true, value: { contract: "taxonomy/v2", taxonomy: taxonomy.value, terms: terms.value, stateDigest: state } };
}
function catalog(reader: Pick<PersistenceReadSnapshot, "listCurrentTaxonomies" | "listCurrentTaxonomyTerms" | "getCurrentTaxonomy">): CurrentTaxonomyResult<CurrentTaxonomyCatalog> {
  const listed = reader.listCurrentTaxonomies();
  if (!listed.ok) return fail("TAXONOMY_FAILED");
  const taxonomies: Array<{ taxonomy: CurrentTaxonomyRecord; stateDigest: Digest }> = [];
  for (const taxonomy of listed.value) {
    const item = snapshot(reader, taxonomy.taxonomyId);
    if (!item.ok) return item;
    taxonomies.push({ taxonomy, stateDigest: item.value.stateDigest });
  }
  const state = digest({ contract: "taxonomy-catalog/v2", taxonomies });
  return state === undefined ? fail("TAXONOMY_FAILED") : { ok: true, value: { contract: "taxonomy-catalog/v2", taxonomies, stateDigest: state } };
}
function parentValid(transaction: PersistenceTransaction, taxonomy: CurrentTaxonomyRecord, termId: string | undefined, parentTermId: string | undefined): boolean {
  if (parentTermId === undefined) return true;
  if (!taxonomy.hierarchical || parentTermId === termId) return false;
  let cursor: string | undefined = parentTermId;
  const visited = new Set<string>();
  while (cursor !== undefined) {
    if (visited.has(cursor) || cursor === termId) return false;
    visited.add(cursor);
    const parent = transaction.getCurrentTaxonomyTerm({ taxonomyId: taxonomy.taxonomyId, termId: cursor });
    if (!parent.ok || parent.value.state !== "live") return false;
    cursor = parent.value.parentTermId;
  }
  return true;
}
export function createCurrentTaxonomyAdministration(input: Readonly<{ persistence: PersistenceStore; newStableId?: () => string }>): CurrentTaxonomyAdministration {
  const allocate = input.newStableId ?? randomUUID;
  return {
    async list() { return currentResult(input.persistence.runReadSnapshot((reader) => catalog(reader))); },
    async get(taxonomyId) { return currentResult(input.persistence.runReadSnapshot((reader) => snapshot(reader, taxonomyId))); },
    async create(request) {
      return currentResult(input.persistence.runTransaction((transaction) => {
        const before = catalog(transaction);
        if (!before.ok) return before;
        if (request.contract !== "taxonomy-create-request/v2" || before.value.stateDigest !== request.expectedStateDigest) return fail("TAXONOMY_STATE_CONFLICT");
        if (!validLabel(request.label) || typeof request.hierarchical !== "boolean") return fail("INVALID_TAXONOMY");
        const slug = request.slug === undefined ? suggestGlobalSlug(request.label) : globalSlug(request.slug);
        if (slug === undefined) return fail("INVALID_TAXONOMY");
        const taxonomyId = allocate();
        const claim = transaction.allocateGlobalSlug({ requestedSlug: slug.slug, entityKind: "taxonomy", entityId: taxonomyId });
        if (!claim.ok) return fail("TAXONOMY_FAILED");
        const created = transaction.createCurrentTaxonomy({ taxonomyId, label: request.label.trim(), slug: claim.value.slug, hierarchical: request.hierarchical });
        return created.ok ? snapshot(transaction, taxonomyId) : fail("TAXONOMY_FAILED");
      }));
    },
    async command(taxonomyId, command) {
      return currentResult(input.persistence.runTransaction((transaction) => {
        const before = snapshot(transaction, taxonomyId);
        if (!before.ok) return before;
        if (command.contract !== "taxonomy-command/v2" || command.expectedStateDigest !== before.value.stateDigest) return fail("TAXONOMY_STATE_CONFLICT", [taxonomyId]);
        const taxonomy = before.value.taxonomy;
        if (command.kind === "replace-taxonomy") {
          if (!validLabel(command.label) || command.hierarchical !== taxonomy.hierarchical) return fail("INVALID_TAXONOMY", [taxonomyId]);
          const slug = globalSlug(command.slug); if (slug === undefined) return fail("INVALID_TAXONOMY", [taxonomyId]);
          const claim = transaction.allocateGlobalSlug({ requestedSlug: slug.slug, entityKind: "taxonomy", entityId: taxonomyId });
          if (!claim.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
          const replaced = transaction.replaceCurrentTaxonomy({ ...taxonomy, label: command.label.trim(), slug: claim.value.slug });
          if (!replaced.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
        } else if (command.kind === "create-term") {
          if (!validLabel(command.label) || !validOrder(command.order) || !parentValid(transaction, taxonomy, undefined, command.parentTermId)) return fail("INVALID_TAXONOMY", [taxonomyId]);
          const slug = command.slug === undefined ? suggestGlobalSlug(command.label) : globalSlug(command.slug);
          if (slug === undefined) return fail("INVALID_TAXONOMY", [taxonomyId]);
          const termId = allocate();
          const claim = transaction.allocateGlobalSlug({ requestedSlug: slug.slug, entityKind: "term", entityId: termId });
          if (!claim.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
          const created = transaction.createCurrentTaxonomyTerm({ taxonomyId, termId, label: command.label.trim(), slug: claim.value.slug, ...(command.parentTermId === undefined ? {} : { parentTermId: command.parentTermId }), order: command.order, state: "live" });
          if (!created.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
        } else if (command.kind === "replace-term") {
          const current = transaction.getCurrentTaxonomyTerm({ taxonomyId, termId: command.termId });
          if (!current.ok) return fail("TERM_NOT_FOUND", [command.termId]);
          if (!validLabel(command.label) || !validOrder(command.order) || (command.state !== "live" && command.state !== "retired") || !parentValid(transaction, taxonomy, command.termId, command.parentTermId)) return fail("INVALID_TAXONOMY", [command.termId]);
          const slug = globalSlug(command.slug); if (slug === undefined) return fail("INVALID_TAXONOMY", [command.termId]);
          const claim = transaction.allocateGlobalSlug({ requestedSlug: slug.slug, entityKind: "term", entityId: command.termId });
          if (!claim.ok) return fail("TAXONOMY_FAILED", [command.termId]);
          const replaced = transaction.replaceCurrentTaxonomyTerm({ taxonomyId, termId: command.termId, label: command.label.trim(), slug: claim.value.slug, ...(command.parentTermId === undefined ? {} : { parentTermId: command.parentTermId }), order: command.order, state: command.state });
          if (!replaced.ok) return fail("TAXONOMY_FAILED", [command.termId]);
        } else if (command.kind === "delete-term") {
          const term = transaction.getCurrentTaxonomyTerm({ taxonomyId, termId: command.termId });
          if (!term.ok) return fail("TERM_NOT_FOUND", [command.termId]);
          const usage = transaction.listCurrentTermUsage({ taxonomyId, termId: command.termId });
          if (!usage.ok || usage.value.length > 0 || before.value.terms.some((item) => item.parentTermId === command.termId)) return fail("TERM_IN_USE", [command.termId]);
          const deleted = transaction.deleteCurrentTaxonomyTerm({ taxonomyId, termId: command.termId });
          if (!deleted.ok) return fail("TAXONOMY_FAILED", [command.termId]);
          const released = transaction.releaseGlobalSlug({ entityKind: "term", entityId: command.termId });
          if (!released.ok) return fail("TAXONOMY_FAILED", [command.termId]);
        } else return fail("INVALID_TAXONOMY", [taxonomyId]);
        return snapshot(transaction, taxonomyId);
      }));
    },
    async delete(taxonomyId, request) {
      return currentResult(input.persistence.runTransaction((transaction) => {
        const before = snapshot(transaction, taxonomyId);
        if (!before.ok) return before;
        if (request.contract !== "taxonomy-delete-request/v1" || request.expectedStateDigest !== before.value.stateDigest) return fail("TAXONOMY_STATE_CONFLICT", [taxonomyId]);
        if (taxonomyId === "00000000-0000-4000-8000-000000000002" || taxonomyId === "00000000-0000-4000-8000-000000000003") return fail("TAXONOMY_PROTECTED", [taxonomyId]);
        if (before.value.terms.length > 0) return fail("TAXONOMY_IN_USE", before.value.terms.map((term) => term.termId));
        const types = transaction.listCurrentContentTypes();
        if (!types.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
        for (const record of types.value) {
          const definition = readContentTypeDefinition(record);
          if (definition === undefined) return fail("TAXONOMY_FAILED", [taxonomyId]);
          for (const attachment of definition.taxonomyAttachments) {
            if (typeof attachment !== "object" || attachment === null || Array.isArray(attachment) || !("taxonomyId" in attachment) || typeof attachment.taxonomyId !== "string") return fail("TAXONOMY_FAILED", [taxonomyId]);
            if (attachment.taxonomyId === taxonomyId) return fail("TAXONOMY_IN_USE", [record.typeId]);
          }
        }
        const deleted = transaction.deleteCurrentTaxonomy(taxonomyId);
        if (!deleted.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
        const released = transaction.releaseGlobalSlug({ entityKind: "taxonomy", entityId: taxonomyId });
        return released.ok ? { ok: true, value: { contract: "taxonomy-deleted/v1" as const, taxonomyId, releasedSlug: before.value.taxonomy.slug } } : fail("TAXONOMY_FAILED", [taxonomyId]);
      }));
    },
  };
}
