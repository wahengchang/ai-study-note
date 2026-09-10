import { canonicalJsonBytes, isDigest, sha256Digest } from "../foundation/index.js";
import type {
  PersistenceFailure,
  PersistenceTransaction,
  RevisionIdentity,
  RevisionRecord,
  RevisionTaxonomyBindingUsage,
  RevisionTaxonomyTermBinding,
  TaxonomyTermIdentity,
  TaxonomyTermRecord,
} from "../persistence/index.js";

import type {
  CreateTaxonomyInput,
  CreateTaxonomyRequest,
  MigrateBindingsCommand,
  Taxonomy,
  TaxonomyBindingMigrationMapping,
  TaxonomyCommand,
  TaxonomyCommandResult,
  TaxonomyFailure,
  TaxonomyFailureCode,
  TaxonomyMigrationResult,
  TaxonomyResult,
  TaxonomySnapshot,
  TaxonomyUsageImpact,
} from "./contracts.js";

const messages: Record<TaxonomyFailureCode, string> = {
  INVALID_TAXONOMY_REQUEST: "請提供符合 taxonomy/v1 的有效請求。",
  TAXONOMY_NOT_FOUND: "找不到指定的 taxonomy。",
  TAXONOMY_CONFLICT: "Taxonomy 或 term 已存在，或其生命週期狀態不允許此操作。",
  TAXONOMY_STATE_CONFLICT: "Taxonomy state 已變更，請重新讀取後再執行。",
  TERM_NOT_FOUND: "找不到指定的 taxonomy term。",
  TERM_ACTIVE_USAGE: "Term 仍被 current、published 或歷史 Revision 使用，無法完成此操作。",
  TAXONOMY_MAPPING_UNRESOLVABLE: "每個受影響的 immutable binding 都必須有一個明確且可用的 live replacement。",
  TAXONOMY_FAILED: "Taxonomy 操作未完成。",
};

type MigrationPlan = Readonly<{
  source: RevisionIdentity;
  replacement: RevisionIdentity;
  pointers: Readonly<{ current: boolean; published: boolean }>;
  revision: RevisionRecord;
  taxonomyTerms: readonly TaxonomyTermIdentity[];
  assetVersions: readonly Readonly<{ assetId: string; assetVersionId: string }>[];
}>;

export function createTaxonomy(input: CreateTaxonomyInput): Taxonomy {
  const persistence = input.persistence;
  const fail = <T>(code: TaxonomyFailureCode, subjectIds: readonly string[] = []): TaxonomyResult<T> => ({
    ok: false,
    error: {
      code,
      owner: "Taxonomy",
      subjectIds: [...subjectIds],
      remediation: { kind: "message", message: messages[code] },
    },
  });
  const inTransaction = <T>(operation: (transaction: PersistenceTransaction) => TaxonomyResult<T>): TaxonomyResult<T> => {
    try {
      const result = persistence.runTransaction<T, TaxonomyFailure>((transaction) => operation(transaction));
      if (result.ok) return result;
      return isTaxonomyFailure(result.error) ? { ok: false, error: result.error } : fail("TAXONOMY_FAILED");
    } catch {
      return fail("TAXONOMY_FAILED");
    }
  };
  const snapshot = (transaction: PersistenceTransaction, taxonomyId: string): TaxonomyResult<TaxonomySnapshot> => {
    const taxonomy = transaction.getTaxonomy(taxonomyId);
    if (!taxonomy.ok) return persistenceNotFound(taxonomy.error) ? fail("TAXONOMY_NOT_FOUND", [taxonomyId]) : fail("TAXONOMY_FAILED", [taxonomyId]);
    const terms = transaction.listTaxonomyTerms(taxonomyId);
    if (!terms.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
    const orderedTerms = terms.value.map(copyTerm);
    const bytes = canonicalJsonBytes({
      contract: "taxonomy/v1",
      taxonomy: copyTaxonomy(taxonomy.value),
      terms: orderedTerms,
    });
    if (!bytes.ok) return fail("TAXONOMY_FAILED", [taxonomyId]);
    return {
      ok: true,
      value: {
        contract: "taxonomy/v1",
        taxonomy: copyTaxonomy(taxonomy.value),
        terms: orderedTerms,
        stateDigest: sha256Digest(bytes.value),
      },
    };
  };
  const impact = (transaction: PersistenceTransaction, identities: readonly TaxonomyTermIdentity[]): TaxonomyResult<TaxonomyUsageImpact> => {
    const seen = new Set<string>();
    const usages: RevisionTaxonomyBindingUsage[] = [];
    for (const identity of identities) {
      const key = identityKey(identity);
      if (seen.has(key)) continue;
      seen.add(key);
      const result = transaction.listTaxonomyTermUsages(identity);
      if (!result.ok) return fail("TAXONOMY_FAILED", [identity.taxonomyId, identity.termId]);
      usages.push(...result.value.map(copyUsage));
    }
    const ordered = uniqueUsages(usages);
    return {
      ok: true,
      value: {
        current: ordered.filter((usage) => usage.pointer === "current"),
        published: ordered.filter((usage) => usage.pointer === "published"),
      },
    };
  };
  const term = (transaction: PersistenceTransaction, identity: TaxonomyTermIdentity): TaxonomyResult<TaxonomyTermRecord> => {
    const result = transaction.getTaxonomyTerm(identity);
    if (result.ok) return { ok: true, value: copyTerm(result.value) };
    return persistenceNotFound(result.error)
      ? fail("TERM_NOT_FOUND", [identity.taxonomyId, identity.termId])
      : fail("TAXONOMY_FAILED", [identity.taxonomyId, identity.termId]);
  };

  return {
    listTaxonomies() {
      return inTransaction((transaction) => {
        const listed = transaction.listTaxonomies();
        if (!listed.ok) return fail("TAXONOMY_FAILED");
        const taxonomies: { taxonomy: Readonly<{ taxonomyId: string; label: string }>; stateDigest: TaxonomySnapshot["stateDigest"] }[] = [];
        for (const item of listed.value) {
          const itemSnapshot = snapshot(transaction, item.taxonomyId);
          if (!itemSnapshot.ok) return itemSnapshot;
          taxonomies.push({ taxonomy: copyTaxonomy(itemSnapshot.value.taxonomy), stateDigest: itemSnapshot.value.stateDigest });
        }
        taxonomies.sort((left, right) => compareCodeUnits(left.taxonomy.taxonomyId, right.taxonomy.taxonomyId));
        return { ok: true, value: { contract: "taxonomy-catalog/v1", taxonomies } };
      });
    },

    getTaxonomy(taxonomyId) {
      if (!validText(taxonomyId)) return fail("INVALID_TAXONOMY_REQUEST");
      return inTransaction((transaction) => snapshot(transaction, taxonomyId));
    },

    createTaxonomy(request) {
      if (!isCreateRequest(request)) return fail("INVALID_TAXONOMY_REQUEST");
      return inTransaction((transaction) => {
        const created = transaction.createTaxonomy({ taxonomyId: request.taxonomyId, label: request.label });
        if (!created.ok) return fail("TAXONOMY_CONFLICT", [request.taxonomyId]);
        return snapshot(transaction, request.taxonomyId);
      });
    },

    executeCommand(taxonomyId, command) {
      if (!validText(taxonomyId) || !isCommand(command)) return fail("INVALID_TAXONOMY_REQUEST", validText(taxonomyId) ? [taxonomyId] : []);
      return inTransaction((transaction) => {
        const before = snapshot(transaction, taxonomyId);
        if (!before.ok) return before;
        if (command.expectedStateDigest !== before.value.stateDigest) return fail("TAXONOMY_STATE_CONFLICT", [taxonomyId]);

        switch (command.kind) {
          case "create-term": {
            if (!validTermCommand(command)) return fail("INVALID_TAXONOMY_REQUEST", [taxonomyId]);
            const created = transaction.createTaxonomyTerm({ taxonomyId, termId: command.termId, label: command.label, slug: command.slug, order: command.order });
            if (!created.ok) return fail("TAXONOMY_CONFLICT", [taxonomyId, command.termId]);
            return commandResult(transaction, taxonomyId, [{ taxonomyId, termId: command.termId }]);
          }
          case "rename-term": {
            if (!validText(command.termId) || !validText(command.label)) return fail("INVALID_TAXONOMY_REQUEST", [taxonomyId]);
            const identity = { taxonomyId, termId: command.termId };
            const existing = term(transaction, identity);
            if (!existing.ok) return existing;
            const beforeImpact = impact(transaction, [identity]);
            if (!beforeImpact.ok) return beforeImpact;
            const updated = transaction.updateTaxonomyTerm({ ...identity, label: command.label });
            if (!updated.ok) return fail("TAXONOMY_CONFLICT", [taxonomyId, command.termId]);
            return commandResult(transaction, taxonomyId, [identity], undefined, beforeImpact.value);
          }
          case "retire-term": {
            if (!validText(command.termId)) return fail("INVALID_TAXONOMY_REQUEST", [taxonomyId]);
            const identity = { taxonomyId, termId: command.termId };
            const existing = term(transaction, identity);
            if (!existing.ok) return existing;
            const beforeImpact = impact(transaction, [identity]);
            if (!beforeImpact.ok) return beforeImpact;
            if (hasUsage(beforeImpact.value)) return fail("TERM_ACTIVE_USAGE", [taxonomyId, command.termId]);
            const updated = transaction.updateTaxonomyTerm({ ...identity, state: "retired" });
            if (!updated.ok) return fail("TAXONOMY_CONFLICT", [taxonomyId, command.termId]);
            return commandResult(transaction, taxonomyId, [identity], undefined, beforeImpact.value);
          }
          case "delete-term": {
            if (!validText(command.termId)) return fail("INVALID_TAXONOMY_REQUEST", [taxonomyId]);
            const identity = { taxonomyId, termId: command.termId };
            const existing = term(transaction, identity);
            if (!existing.ok) return existing;
            const beforeImpact = impact(transaction, [identity]);
            if (!beforeImpact.ok) return beforeImpact;
            if (hasUsage(beforeImpact.value)) return fail("TERM_ACTIVE_USAGE", [taxonomyId, command.termId]);
            const deleted = transaction.deleteTaxonomyTerm(identity);
            if (!deleted.ok) return fail("TERM_ACTIVE_USAGE", [taxonomyId, command.termId]);
            return commandResult(transaction, taxonomyId, [identity], undefined, beforeImpact.value);
          }
          case "migrate-bindings": {
            if (!validMigrateCommand(command, taxonomyId)) return fail("INVALID_TAXONOMY_REQUEST", [taxonomyId]);
            const planned = prepareMigration(transaction, taxonomyId, command, term, impact, fail);
            if (!planned.ok) return planned;
            for (const plan of planned.value.plans) {
              const created = transaction.createRevisionWithReferences({
                revision: {
                  identity: plan.replacement,
                  schemaIdentity: plan.revision.schemaIdentity,
                  contentBytes: new Uint8Array(plan.revision.contentBytes),
                  contentDigest: plan.revision.contentDigest,
                  lineage: { operationId: command.operationId, operationKind: "MigrateTaxonomyBindings" },
                },
                assetVersions: plan.assetVersions.map((assetVersion) => ({ ...assetVersion })),
                taxonomyTerms: plan.taxonomyTerms.map((identity) => ({ ...identity })),
              });
              if (!created.ok) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [plan.source.entryId, plan.source.revisionId]);
              const pointers = transaction.getEntryPointers(plan.source.entryId);
              if (!pointers.ok) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [plan.source.entryId, plan.source.revisionId]);
              const currentRevisionId = plan.pointers.current ? plan.replacement.revisionId : pointers.value.currentRevisionId;
              const publishedRevisionId = plan.pointers.published ? plan.replacement.revisionId : pointers.value.publishedRevisionId;
              if ((plan.pointers.current && pointers.value.currentRevisionId !== plan.source.revisionId) || (plan.pointers.published && pointers.value.publishedRevisionId !== plan.source.revisionId)) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [plan.source.entryId, plan.source.revisionId]);
              const updated = transaction.setEntryPointers({
                entryId: plan.source.entryId,
                currentRevisionId,
                ...(publishedRevisionId === undefined ? {} : { publishedRevisionId }),
                lineage: { revisionId: plan.replacement.revisionId, operationId: command.operationId, operationKind: "MigrateTaxonomyBindings" },
              });
              if (!updated.ok) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [plan.source.entryId, plan.source.revisionId]);
            }
            const migration: TaxonomyMigrationResult = {
              operationId: command.operationId,
              replacements: planned.value.plans.map((plan) => ({ source: { ...plan.source }, replacement: { ...plan.replacement } })),
            };
            return commandResult(transaction, taxonomyId, planned.value.sourceTerms, migration, planned.value.impact);
          }
        }
      });
    },
  };
}

function prepareMigration(
  transaction: PersistenceTransaction,
  taxonomyId: string,
  command: MigrateBindingsCommand,
  getTerm: (transaction: PersistenceTransaction, identity: TaxonomyTermIdentity) => TaxonomyResult<TaxonomyTermRecord>,
  getImpact: (transaction: PersistenceTransaction, identities: readonly TaxonomyTermIdentity[]) => TaxonomyResult<TaxonomyUsageImpact>,
  fail: <T>(code: TaxonomyFailureCode, subjectIds?: readonly string[]) => TaxonomyResult<T>,
): TaxonomyResult<Readonly<{ plans: readonly MigrationPlan[]; sourceTerms: readonly TaxonomyTermIdentity[]; impact: TaxonomyUsageImpact }>> {
  const mappings = new Map<string, TaxonomyTermIdentity>();
  for (const mapping of command.mappings) {
    const sourceKey = identityKey(mapping.source);
    if (mappings.has(sourceKey) || mapping.source.taxonomyId !== taxonomyId || sourceKey === identityKey(mapping.replacement)) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [taxonomyId]);
    const source = getTerm(transaction, mapping.source);
    const replacement = getTerm(transaction, mapping.replacement);
    if (!source.ok || !replacement.ok || replacement.value.state !== "live") return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [mapping.source.taxonomyId, mapping.source.termId]);
    mappings.set(sourceKey, { ...mapping.replacement });
  }
  const sourceTerms = command.mappings.map((mapping) => ({ ...mapping.source }));
  const usage = getImpact(transaction, sourceTerms);
  if (!usage.ok) return usage;
  const expected = new Map<string, Readonly<{ source: RevisionIdentity; pointers: { current: boolean; published: boolean } }>>();
  for (const item of [...usage.value.current, ...usage.value.published]) {
    const key = revisionKey({ entryId: item.entryId, revisionId: item.revisionId });
    const existing = expected.get(key) ?? { source: { entryId: item.entryId, revisionId: item.revisionId }, pointers: { current: false, published: false } };
    existing.pointers[item.pointer] = true;
    expected.set(key, existing);
  }
  const replacements = new Map<string, MigrateBindingsCommand["replacements"][number]>();
  const replacementIdentities = new Set<string>();
  for (const replacement of command.replacements) {
    const source: RevisionIdentity = { entryId: replacement.entryId, revisionId: replacement.sourceRevisionId };
    const key = revisionKey(source);
    const replacementKey = revisionKey({ entryId: replacement.entryId, revisionId: replacement.replacementRevisionId });
    if (replacements.has(key) || replacementIdentities.has(replacementKey) || replacement.sourceRevisionId === replacement.replacementRevisionId) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [replacement.entryId, replacement.sourceRevisionId]);
    replacements.set(key, replacement);
    replacementIdentities.add(replacementKey);
  }
  if (replacements.size !== expected.size || [...expected.keys()].some((key) => !replacements.has(key))) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [taxonomyId]);

  const plans: MigrationPlan[] = [];
  for (const [key, affected] of expected) {
    const descriptor = replacements.get(key)!;
    const source = affected.source;
    const revision = transaction.getRevision(source);
    const references = transaction.getRevisionReferences(source);
    const bindings = transaction.getRevisionTaxonomyBindings(source);
    if (!revision.ok || !references.ok || !bindings.ok || !validBindings(bindings.ok ? bindings.value : [])) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [source.entryId, source.revisionId]);
    const taxonomyTerms = bindings.value.map((binding) => mappings.get(identityKey(binding)) ?? { taxonomyId: binding.taxonomyId, termId: binding.termId });
    if (hasDuplicateIdentities(taxonomyTerms)) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [source.entryId, source.revisionId]);
    for (const binding of bindings.value) {
      const sourceIdentity = { taxonomyId: binding.taxonomyId, termId: binding.termId };
      const current = getTerm(transaction, sourceIdentity);
      if (!current.ok) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [sourceIdentity.taxonomyId, sourceIdentity.termId]);
      if (!mappings.has(identityKey(binding)) && (
        current.value.label !== binding.evidence.label
        || current.value.slug !== binding.evidence.slug
        || current.value.order !== binding.evidence.order
      )) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [binding.taxonomyId, binding.termId]);
      const replacementIdentity = mappings.get(identityKey(binding));
      if (replacementIdentity !== undefined) {
        const replacement = getTerm(transaction, replacementIdentity);
        if (!replacement.ok || replacement.value.state !== "live") return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [replacementIdentity.taxonomyId, replacementIdentity.termId]);
      }
    }
    const mappedSource = bindings.value.some((binding) => mappings.has(identityKey(binding)));
    if (!mappedSource) return fail("TAXONOMY_MAPPING_UNRESOLVABLE", [source.entryId, source.revisionId]);
    plans.push({
      source: { ...source },
      replacement: { entryId: descriptor.entryId, revisionId: descriptor.replacementRevisionId },
      pointers: { ...affected.pointers },
      revision: copyRevision(revision.value),
      taxonomyTerms: taxonomyTerms.map((identity) => ({ ...identity })),
      assetVersions: references.value.map((reference) => ({ ...reference.assetVersion })),
    });
  }
  plans.sort((left, right) => compareCodeUnits(left.source.entryId, right.source.entryId) || compareCodeUnits(left.source.revisionId, right.source.revisionId));
  return { ok: true, value: { plans, sourceTerms, impact: usage.value } };
}

function commandResult(
  transaction: PersistenceTransaction,
  taxonomyId: string,
  identities: readonly TaxonomyTermIdentity[],
  migration?: TaxonomyMigrationResult,
  usage?: TaxonomyUsageImpact,
): TaxonomyResult<TaxonomyCommandResult> {
  const taxonomy = transaction.getTaxonomy(taxonomyId);
  if (!taxonomy.ok) return persistenceNotFound(taxonomy.error) ? taxonomyFailure("TAXONOMY_NOT_FOUND", [taxonomyId]) : taxonomyFailure("TAXONOMY_FAILED", [taxonomyId]);
  const terms = transaction.listTaxonomyTerms(taxonomyId);
  if (!terms.ok) return taxonomyFailure("TAXONOMY_FAILED", [taxonomyId]);
  const orderedTerms = terms.value.map(copyTerm);
  const bytes = canonicalJsonBytes({ contract: "taxonomy/v1", taxonomy: copyTaxonomy(taxonomy.value), terms: orderedTerms });
  if (!bytes.ok) return taxonomyFailure("TAXONOMY_FAILED", [taxonomyId]);
  const resolvedImpact: TaxonomyResult<TaxonomyUsageImpact> = usage === undefined ? collectImpact(transaction, identities) : { ok: true, value: usage };
  if (!resolvedImpact.ok) return resolvedImpact;
  return {
    ok: true,
    value: {
      snapshot: { contract: "taxonomy/v1", taxonomy: copyTaxonomy(taxonomy.value), terms: orderedTerms, stateDigest: sha256Digest(bytes.value) },
      impact: resolvedImpact.value,
      ...(migration === undefined ? {} : { migration }),
    },
  };
}

function collectImpact(transaction: PersistenceTransaction, identities: readonly TaxonomyTermIdentity[]): TaxonomyResult<TaxonomyUsageImpact> {
  const seen = new Set<string>();
  const usages: RevisionTaxonomyBindingUsage[] = [];
  for (const identity of identities) {
    const key = identityKey(identity);
    if (seen.has(key)) continue;
    seen.add(key);
    const listed = transaction.listTaxonomyTermUsages(identity);
    if (!listed.ok) return taxonomyFailure("TAXONOMY_FAILED", [identity.taxonomyId, identity.termId]);
    usages.push(...listed.value.map(copyUsage));
  }
  const ordered = uniqueUsages(usages);
  return { ok: true, value: { current: ordered.filter((usage) => usage.pointer === "current"), published: ordered.filter((usage) => usage.pointer === "published") } };
}

function isCreateRequest(value: unknown): value is CreateTaxonomyRequest {
  return isObject(value) && value.contract === "taxonomy-create-request/v1" && validText(value.taxonomyId) && validText(value.label);
}

function isCommand(value: unknown): value is TaxonomyCommand {
  return isObject(value)
    && value.contract === "taxonomy-command/v1"
    && isDigestValue(value.expectedStateDigest)
    && (value.kind === "create-term" || value.kind === "rename-term" || value.kind === "retire-term" || value.kind === "delete-term" || value.kind === "migrate-bindings");
}

function validTermCommand(command: TaxonomyCommand): command is Extract<TaxonomyCommand, { kind: "create-term" }> {
  return command.kind === "create-term" && validText(command.termId) && validText(command.label) && typeof command.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(command.slug) && Number.isSafeInteger(command.order);
}

function validMigrateCommand(command: TaxonomyCommand, taxonomyId: string): command is MigrateBindingsCommand {
  return command.kind === "migrate-bindings"
    && validText(command.operationId)
    && Array.isArray(command.mappings)
    && command.mappings.length > 0
    && command.mappings.every((mapping) => validMapping(mapping, taxonomyId))
    && Array.isArray(command.replacements)
    && command.replacements.every((replacement) => isObject(replacement) && validText(replacement.entryId) && validText(replacement.sourceRevisionId) && validText(replacement.replacementRevisionId));
}

function validMapping(value: unknown, taxonomyId: string): value is TaxonomyBindingMigrationMapping {
  return isObject(value) && validIdentity(value.source) && validIdentity(value.replacement) && value.source.taxonomyId === taxonomyId;
}

function validBindings(bindings: readonly RevisionTaxonomyTermBinding[]): boolean {
  return bindings.every((binding) => {
    if (!validIdentity(binding) || !isDigestValue(binding.evidenceDigest) || !isObject(binding.evidence) || !validEvidence(binding.evidence)) return false;
    if (binding.evidence.taxonomyId !== binding.taxonomyId || binding.evidence.termId !== binding.termId) return false;
    const bytes = canonicalJsonBytes(binding.evidence);
    return bytes.ok && sha256Digest(bytes.value) === binding.evidenceDigest;
  });
}

function validEvidence(value: Record<PropertyKey, unknown>): boolean {
  const { label, slug, order } = value;
  return validIdentity(value) && validText(label) && typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) && Number.isSafeInteger(order);
}

function validIdentity(value: unknown): value is TaxonomyTermIdentity {
  return isObject(value) && validText(value.taxonomyId) && validText(value.termId);
}

function isDigestValue(value: unknown): value is TaxonomySnapshot["stateDigest"] {
  return typeof value === "string" && isDigest(value);
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasUsage(impact: TaxonomyUsageImpact): boolean {
  return impact.current.length > 0 || impact.published.length > 0;
}

function hasDuplicateIdentities(identities: readonly TaxonomyTermIdentity[]): boolean {
  const seen = new Set<string>();
  return identities.some((identity) => {
    const key = identityKey(identity);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function uniqueUsages(usages: readonly RevisionTaxonomyBindingUsage[]): readonly RevisionTaxonomyBindingUsage[] {
  const unique = new Map<string, RevisionTaxonomyBindingUsage>();
  for (const usage of usages) unique.set(`${usage.entryId}\u0000${usage.revisionId}\u0000${usage.pointer}`, copyUsage(usage));
  return [...unique.values()].sort((left, right) => compareCodeUnits(left.entryId, right.entryId) || compareCodeUnits(left.revisionId, right.revisionId) || compareCodeUnits(left.pointer, right.pointer));
}

function copyTaxonomy(value: Readonly<{ taxonomyId: string; label: string }>) {
  return { taxonomyId: value.taxonomyId, label: value.label };
}

function copyTerm(value: TaxonomyTermRecord): TaxonomyTermRecord {
  return { taxonomyId: value.taxonomyId, termId: value.termId, label: value.label, slug: value.slug, order: value.order, state: value.state };
}

function copyUsage(value: RevisionTaxonomyBindingUsage): RevisionTaxonomyBindingUsage {
  return { entryId: value.entryId, revisionId: value.revisionId, pointer: value.pointer };
}

function copyRevision(value: RevisionRecord): RevisionRecord {
  return {
    identity: { ...value.identity },
    schemaIdentity: { ...value.schemaIdentity },
    contentBytes: new Uint8Array(value.contentBytes),
    contentDigest: value.contentDigest,
    ...(value.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: value.restoredFromRevisionId }),
    lineage: { ...value.lineage },
  };
}

function identityKey(identity: TaxonomyTermIdentity | RevisionTaxonomyTermBinding): string {
  return `${identity.taxonomyId}\u0000${identity.termId}`;
}

function revisionKey(identity: RevisionIdentity): string {
  return `${identity.entryId}\u0000${identity.revisionId}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function persistenceNotFound(error: PersistenceFailure): boolean {
  return error.code === "REVISION_NOT_FOUND";
}

function taxonomyFailure<T>(code: TaxonomyFailureCode, subjectIds: readonly string[] = []): TaxonomyResult<T> {
  return { ok: false, error: { code, owner: "Taxonomy", subjectIds: [...subjectIds], remediation: { kind: "message", message: messages[code] } } };
}

function isTaxonomyFailure(value: unknown): value is TaxonomyFailure {
  return isObject(value) && value.owner === "Taxonomy" && typeof value.code === "string" && Object.hasOwn(messages, value.code);
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
