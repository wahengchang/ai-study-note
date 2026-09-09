import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue, type MessageRemediation } from "../foundation/index.js";
import { isSiteContentSchemaIdentity, type PublishedContentReadModel, type StructuredContent } from "../content/index.js";
import type { DataMedia } from "../media/index.js";
import type { EntryPointerLineageRecord, EntryPointerRecord, PersistenceStore, RevisionRecord, SchemaVersionRecord } from "../persistence/index.js";
import type { SiteDefinition } from "../site-definition/index.js";

export type ContentTypeDocument = Readonly<{ contract: "content-type/v1"; schemaIdentity: Readonly<{ schemaId: string; version: number }>; schema: JsonValue; schemaDigest: Digest }>;
export type ContentTypeCatalog = Readonly<{ contract: "content-type-catalog/v1"; items: readonly ContentTypeDocument[]; stateDigest: Digest }>;
export type EntryStatus = "draft" | "published" | "published-with-draft";
export type EntryRevisionDocument = Readonly<{ revisionId: string; schemaIdentity: Readonly<{ schemaId: string; version: number }>; content: StructuredContent; contentDigest: Digest; lineage: Readonly<{ operationId: string; operationKind: string }>; restoredFromRevisionId?: string; references: readonly Readonly<{ assetId: string; assetVersionId: string; availability: "ready" | "archived" | "missing" }>[] }>;
export type EntrySelectionDocument = Readonly<{ revision: EntryRevisionDocument; route: Readonly<{ normalizedRoute: string; sourceRevisionId: string }> }>;
export type EntrySummary = Readonly<{ entryId: string; title: string; status: EntryStatus; current: Readonly<{ revisionId: string; contentDigest: Digest; normalizedRoute: string }>; published?: Readonly<{ revisionId: string; contentDigest: Digest; normalizedRoute: string }> }>;
export type EntryCatalog = Readonly<{ contract: "entry-catalog/v1"; items: readonly EntrySummary[]; routeGraphs: Readonly<{ current: Readonly<{ digest: Digest; claims: readonly unknown[] }>; published: Readonly<{ digest: Digest; claims: readonly unknown[] }> }>; stateDigest: Digest }>;
export type EntryDetail = Readonly<{ contract: "entry-detail/v1"; entryId: string; status: EntryStatus; pointer: EntryPointerRecord; current: EntrySelectionDocument; published?: EntrySelectionDocument; pointerLineage: readonly EntryPointerLineageRecord[]; routeGraphs: EntryCatalog["routeGraphs"]; stateDigest: Digest }>;
export type EntryRevisionCatalog = Readonly<{ contract: "entry-revision-catalog/v1"; entryId: string; items: readonly EntryRevisionDocument[]; stateDigest: Digest }>;
export type AuthoringReadFailureCode = "INVALID_AUTHORING_READ_INPUT" | "CONTENT_TYPE_NOT_FOUND" | "ENTRY_NOT_FOUND" | "AUTHORING_CONTENT_UNSUPPORTED" | "AUTHORING_READ_STATE_STALE" | "AUTHORING_READ_FAILED";
export type AuthoringReadFailure = Readonly<{ code: AuthoringReadFailureCode; owner: "AuthoringReadFacade"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type AuthoringReadResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: AuthoringReadFailure }>;
export interface AuthoringReadFacade { listContentTypes(): Promise<AuthoringReadResult<ContentTypeCatalog>>; getContentType(input: Readonly<{ schemaId: string }>): Promise<AuthoringReadResult<ContentTypeDocument>>; listEntries(): Promise<AuthoringReadResult<EntryCatalog>>; getEntry(input: Readonly<{ entryId: string }>): Promise<AuthoringReadResult<EntryDetail>>; listEntryRevisions(input: Readonly<{ entryId: string }>): Promise<AuthoringReadResult<EntryRevisionCatalog>>; }
export type CreateAuthoringReadFacadeInput = Readonly<{ persistence: PersistenceStore; siteDefinition: SiteDefinition; dataMedia: DataMedia; contentReadModel: PublishedContentReadModel }>;
export interface ContentTypeDefinitionValidator { validateSchema(schema: JsonValue): Readonly<{ ok: true }> | Readonly<{ ok: false }>; }
export type ContentTypeAdministrationFailureCode = "INVALID_CONTENT_TYPE" | "CONTENT_TYPE_CONFLICT" | "CONTENT_TYPE_ADMINISTRATION_FAILED";
export type ContentTypeAdministrationFailure = Readonly<{ code: ContentTypeAdministrationFailureCode; owner: "ContentTypeAdministration"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type ContentTypeAdministrationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: ContentTypeAdministrationFailure }>;
export interface ContentTypeAdministration { createInitial(input: Readonly<{ schemaId: string; schema: JsonValue }>): Promise<ContentTypeAdministrationResult<ContentTypeDocument>>; }

const remediation = (message: string): MessageRemediation => ({ kind: "message", message });
function fail<T>(code: AuthoringReadFailureCode, subjectIds: readonly string[] = []): AuthoringReadResult<T> { return { ok: false, error: { code, owner: "AuthoringReadFacade", subjectIds, remediation: remediation("無法安全讀取目前 Authoring state。") } }; }
function adminFail<T>(code: ContentTypeAdministrationFailureCode, subjectIds: readonly string[] = []): ContentTypeAdministrationResult<T> { return { ok: false, error: { code, owner: "ContentTypeAdministration", subjectIds, remediation: remediation("無法建立 content type。") } }; }
function validId(value: string): boolean { return typeof value === "string" && /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u.test(value); }
function schemaDocument(record: SchemaVersionRecord): ContentTypeDocument | undefined { try { const schema = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.schemaBytes)) as JsonValue; return { contract: "content-type/v1", schemaIdentity: { ...record.identity }, schema, schemaDigest: record.schemaDigest }; } catch { return undefined; } }
function status(pointer: EntryPointerRecord): EntryStatus { return pointer.publishedRevisionId === undefined ? "draft" : pointer.publishedRevisionId === pointer.currentRevisionId ? "published" : "published-with-draft"; }

export function createContentTypeAdministration(input: Readonly<{ persistence: PersistenceStore; validator: ContentTypeDefinitionValidator }>): ContentTypeAdministration {
  return { async createInitial(request) {
    if (!validId(request.schemaId) || !input.validator.validateSchema(request.schema).ok) return adminFail("INVALID_CONTENT_TYPE", [request.schemaId]);
    const bytes = canonicalJsonBytes(request.schema); if (!bytes.ok) return adminFail("INVALID_CONTENT_TYPE", [request.schemaId]);
    const result = input.persistence.registerSchemaVersion({ identity: { schemaId: request.schemaId, version: 1 }, schemaBytes: bytes.value, schemaDigest: sha256Digest(bytes.value) });
    if (!result.ok) return adminFail(result.error.code === "SCHEMA_VERSION_CONFLICT" ? "CONTENT_TYPE_CONFLICT" : "CONTENT_TYPE_ADMINISTRATION_FAILED", [request.schemaId]);
    const document = schemaDocument(result.value); return document === undefined ? adminFail("CONTENT_TYPE_ADMINISTRATION_FAILED", [request.schemaId]) : { ok: true, value: document };
  } };
}

export function createAuthoringReadFacade(input: CreateAuthoringReadFacadeInput): AuthoringReadFacade {
  const stable = <T>(work: (digest: Digest) => AuthoringReadResult<T>): AuthoringReadResult<T> => {
    const before = input.persistence.canonicalState(); if (!before.ok) return fail("AUTHORING_READ_FAILED");
    const result = work(before.value.digest); if (!result.ok) return result;
    const after = input.persistence.canonicalState(); if (!after.ok) return fail("AUTHORING_READ_FAILED");
    return after.value.digest === before.value.digest ? result : fail("AUTHORING_READ_STATE_STALE");
  };
  const graphs = (): AuthoringReadResult<EntryCatalog["routeGraphs"]> => {
    const current = input.siteDefinition.snapshot("current"), published = input.siteDefinition.snapshot("published");
    if (!current.ok || !published.ok) return fail("AUTHORING_READ_FAILED");
    return { ok: true, value: { current: { digest: current.value.digest, claims: current.value.claims.map((claim) => ({ ...claim })) }, published: { digest: published.value.digest, claims: published.value.claims.map((claim) => ({ ...claim })) } } };
  };
  const revision = (record: RevisionRecord): AuthoringReadResult<EntryRevisionDocument> => {
    if (!isSiteContentSchemaIdentity(record.schemaIdentity)) return fail("AUTHORING_CONTENT_UNSUPPORTED", [record.identity.entryId, record.identity.revisionId]);
    const content = input.contentReadModel.read({ schemaIdentity: record.schemaIdentity, contentBytes: record.contentBytes, contentDigest: record.contentDigest });
    if (!content.ok) return fail("AUTHORING_CONTENT_UNSUPPORTED", [record.identity.entryId, record.identity.revisionId]);
    const refs = input.persistence.getRevisionReferences(record.identity); if (!refs.ok) return fail("AUTHORING_READ_FAILED", [record.identity.entryId, record.identity.revisionId]);
    const references: Array<{ assetId: string; assetVersionId: string; availability: "ready" | "archived" | "missing" }> = [];
    for (const item of refs.value) { const asset = input.persistence.getAssetVersion(item.assetVersion); if (!asset.ok) return fail("AUTHORING_READ_FAILED", [item.assetVersion.assetId, item.assetVersion.assetVersionId]); if (asset.value.availability === "ready" && !input.dataMedia.getReadyAssetVersion(item.assetVersion).ok) return fail("AUTHORING_READ_FAILED", [item.assetVersion.assetId, item.assetVersion.assetVersionId]); references.push({ assetId: item.assetVersion.assetId, assetVersionId: item.assetVersion.assetVersionId, availability: asset.value.availability }); }
    return { ok: true, value: { revisionId: record.identity.revisionId, schemaIdentity: { ...record.schemaIdentity }, content: content.value.content, contentDigest: record.contentDigest, lineage: { ...record.lineage }, ...(record.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: record.restoredFromRevisionId }), references } };
  };
  const selection = (pointer: EntryPointerRecord, kind: "current" | "published", routeGraphs: EntryCatalog["routeGraphs"]): AuthoringReadResult<EntrySelectionDocument> => {
    const revisionId = kind === "current" ? pointer.currentRevisionId : pointer.publishedRevisionId; if (revisionId === undefined) return fail("ENTRY_NOT_FOUND", [pointer.entryId]);
    const record = input.persistence.getRevision({ entryId: pointer.entryId, revisionId }); if (!record.ok) return fail("AUTHORING_READ_FAILED", [pointer.entryId, revisionId]);
    const document = revision(record.value); if (!document.ok) return document;
    const claim = (kind === "current" ? routeGraphs.current.claims : routeGraphs.published.claims).find((value) => typeof value === "object" && value !== null && "owner" in value && (value as { owner: unknown }).owner === pointer.entryId) as { normalizedRoute?: unknown; sourceRevisionId?: unknown } | undefined;
    return typeof claim?.normalizedRoute === "string" && claim.sourceRevisionId === revisionId ? { ok: true, value: { revision: document.value, route: { normalizedRoute: claim.normalizedRoute, sourceRevisionId: claim.sourceRevisionId } } } : fail("AUTHORING_READ_FAILED", [pointer.entryId]);
  };
  return {
    async listContentTypes() { return stable((stateDigest) => { const records = input.persistence.listSchemaVersions(); if (!records.ok) return fail("AUTHORING_READ_FAILED"); const items: ContentTypeDocument[] = []; for (const item of records.value) { const document = schemaDocument(item); if (document === undefined) return fail("AUTHORING_READ_FAILED", [item.identity.schemaId]); items.push(document); } return { ok: true, value: { contract: "content-type-catalog/v1", items, stateDigest } }; }); },
    async getContentType(request) { return stable(() => { if (!validId(request.schemaId)) return fail("INVALID_AUTHORING_READ_INPUT", [request.schemaId]); const records = input.persistence.listSchemaVersions(); if (!records.ok) return fail("AUTHORING_READ_FAILED"); const record = records.value.findLast((item) => item.identity.schemaId === request.schemaId); if (record === undefined) return fail("CONTENT_TYPE_NOT_FOUND", [request.schemaId]); const document = schemaDocument(record); return document === undefined ? fail("AUTHORING_READ_FAILED", [request.schemaId]) : { ok: true, value: document }; }); },
    async listEntries() { return stable((stateDigest) => { const pointers = input.persistence.listEntryPointers(), routeGraphs = graphs(); if (!pointers.ok || !routeGraphs.ok) return fail("AUTHORING_READ_FAILED"); const items: EntrySummary[] = []; for (const pointer of pointers.value) { const current = selection(pointer, "current", routeGraphs.value); if (!current.ok) return current; const published = pointer.publishedRevisionId === undefined ? undefined : selection(pointer, "published", routeGraphs.value); if (published !== undefined && !published.ok) return published; items.push({ entryId: pointer.entryId, title: current.value.revision.content.title, status: status(pointer), current: { revisionId: current.value.revision.revisionId, contentDigest: current.value.revision.contentDigest, normalizedRoute: current.value.route.normalizedRoute }, ...(published === undefined ? {} : { published: { revisionId: published.value.revision.revisionId, contentDigest: published.value.revision.contentDigest, normalizedRoute: published.value.route.normalizedRoute } }) }); } return { ok: true, value: { contract: "entry-catalog/v1", items, routeGraphs: routeGraphs.value, stateDigest } }; }); },
    async getEntry(request) { return stable((stateDigest) => { if (!validId(request.entryId)) return fail("INVALID_AUTHORING_READ_INPUT", [request.entryId]); const pointer = input.persistence.getEntryPointers(request.entryId); if (!pointer.ok) return fail(pointer.error.code === "ENTRY_POINTER_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "AUTHORING_READ_FAILED", [request.entryId]); const routeGraphs = graphs(); if (!routeGraphs.ok) return routeGraphs; const current = selection(pointer.value, "current", routeGraphs.value); if (!current.ok) return current; const published = pointer.value.publishedRevisionId === undefined ? undefined : selection(pointer.value, "published", routeGraphs.value); if (published !== undefined && !published.ok) return published; const lineage = input.persistence.listEntryPointerLineage(request.entryId); if (!lineage.ok) return fail("AUTHORING_READ_FAILED", [request.entryId]); return { ok: true, value: { contract: "entry-detail/v1", entryId: request.entryId, status: status(pointer.value), pointer: pointer.value, current: current.value, ...(published === undefined ? {} : { published: published.value }), pointerLineage: lineage.value, routeGraphs: routeGraphs.value, stateDigest } }; }); },
    async listEntryRevisions(request) { return stable((stateDigest) => { if (!validId(request.entryId)) return fail("INVALID_AUTHORING_READ_INPUT", [request.entryId]); const records = input.persistence.listEntryRevisions(request.entryId); if (!records.ok) return fail("AUTHORING_READ_FAILED", [request.entryId]); const pointer = input.persistence.getEntryPointers(request.entryId); if (!pointer.ok) { if (pointer.error.code === "ENTRY_POINTER_NOT_FOUND" && records.value.length === 0) return fail("ENTRY_NOT_FOUND", [request.entryId]); return fail("AUTHORING_READ_FAILED", [request.entryId]); } const items: EntryRevisionDocument[] = []; for (const record of records.value) { const document = revision(record); if (!document.ok) return document; items.push(document.value); } return { ok: true, value: { contract: "entry-revision-catalog/v1", entryId: request.entryId, items, stateDigest } }; }); },
  };
}
