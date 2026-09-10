import type { Digest, MessageRemediation } from "../foundation/index.js";
import type {
  PersistenceStore,
  RevisionIdentity,
  RevisionTaxonomyBindingUsage,
  RevisionTaxonomyTermBinding,
  TaxonomyRecord,
  TaxonomyTermEvidence,
  TaxonomyTermIdentity,
  TaxonomyTermRecord,
} from "../persistence/index.js";

export type {
  RevisionIdentity,
  RevisionTaxonomyBindingUsage,
  RevisionTaxonomyTermBinding,
  TaxonomyRecord,
  TaxonomyTermEvidence,
  TaxonomyTermIdentity,
  TaxonomyTermRecord,
};

export type TaxonomyUsageImpact = Readonly<{
  current: readonly RevisionTaxonomyBindingUsage[];
  published: readonly RevisionTaxonomyBindingUsage[];
}>;
export type TaxonomySnapshot = Readonly<{
  contract: "taxonomy/v1";
  taxonomy: TaxonomyRecord;
  terms: readonly TaxonomyTermRecord[];
  stateDigest: Digest;
}>;
export type TaxonomyCatalog = Readonly<{
  contract: "taxonomy-catalog/v1";
  taxonomies: readonly Readonly<{ taxonomy: TaxonomyRecord; stateDigest: Digest }>[];
}>;
export type CreateTaxonomyRequest = Readonly<{
  contract: "taxonomy-create-request/v1";
  taxonomyId: string;
  label: string;
}>;
type TaxonomyCommandBase = Readonly<{
  contract: "taxonomy-command/v1";
  expectedStateDigest: Digest;
}>;
export type CreateTermCommand = TaxonomyCommandBase & Readonly<{
  kind: "create-term";
  termId: string;
  label: string;
  slug: string;
  order: number;
}>;
export type RenameTermCommand = TaxonomyCommandBase & Readonly<{
  kind: "rename-term";
  termId: string;
  label: string;
}>;
export type RetireTermCommand = TaxonomyCommandBase & Readonly<{
  kind: "retire-term";
  termId: string;
}>;
export type DeleteTermCommand = TaxonomyCommandBase & Readonly<{
  kind: "delete-term";
  termId: string;
}>;
export type TaxonomyBindingMigrationMapping = Readonly<{
  source: TaxonomyTermIdentity;
  replacement: TaxonomyTermIdentity;
}>;
export type TaxonomyBindingMigrationReplacement = Readonly<{
  entryId: string;
  sourceRevisionId: string;
  replacementRevisionId: string;
}>;
export type MigrateBindingsCommand = TaxonomyCommandBase & Readonly<{
  kind: "migrate-bindings";
  operationId: string;
  mappings: readonly TaxonomyBindingMigrationMapping[];
  replacements: readonly TaxonomyBindingMigrationReplacement[];
}>;
export type TaxonomyCommand =
  | CreateTermCommand
  | RenameTermCommand
  | RetireTermCommand
  | DeleteTermCommand
  | MigrateBindingsCommand;
export type TaxonomyMigrationResult = Readonly<{
  operationId: string;
  replacements: readonly Readonly<{ source: RevisionIdentity; replacement: RevisionIdentity }>[];
}>;
export type TaxonomyCommandResult = Readonly<{
  snapshot: TaxonomySnapshot;
  impact: TaxonomyUsageImpact;
  migration?: TaxonomyMigrationResult;
}>;
export type TaxonomyFailureCode =
  | "INVALID_TAXONOMY_REQUEST"
  | "TAXONOMY_NOT_FOUND"
  | "TAXONOMY_CONFLICT"
  | "TAXONOMY_STATE_CONFLICT"
  | "TERM_NOT_FOUND"
  | "TERM_ACTIVE_USAGE"
  | "TAXONOMY_MAPPING_UNRESOLVABLE"
  | "TAXONOMY_FAILED";
export type TaxonomyFailure = Readonly<{
  code: TaxonomyFailureCode;
  owner: "Taxonomy";
  subjectIds: readonly string[];
  remediation: MessageRemediation;
}>;
export type TaxonomyResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: TaxonomyFailure }>;
export interface Taxonomy {
  listTaxonomies(): TaxonomyResult<TaxonomyCatalog>;
  getTaxonomy(taxonomyId: string): TaxonomyResult<TaxonomySnapshot>;
  createTaxonomy(request: CreateTaxonomyRequest): TaxonomyResult<TaxonomySnapshot>;
  executeCommand(taxonomyId: string, command: TaxonomyCommand): TaxonomyResult<TaxonomyCommandResult>;
}
export type CreateTaxonomyInput = Readonly<{ persistence: PersistenceStore }>;
