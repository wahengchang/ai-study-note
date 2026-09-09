import { canonicalJsonBytes, sha256Digest, type JsonValue } from "../foundation/index.js";
import type { AssetVersionIdentity, EntryPointerRecord, PersistenceFailure, PersistenceReadSnapshot, PersistenceStore, RevisionRecord, RouteClaimRecord, SchemaVersionIdentity, SchemaVersionRecord, TransactionDecision } from "../persistence/index.js";

export type AuthoringContentType = Readonly<{ schemaIdentity: SchemaVersionIdentity; schema: JsonValue; schemaDigest: string }>;
export type AuthoringEntrySummary = Readonly<{ entryId: string; currentRevisionId: string; publishedRevisionId?: string }>;
export type AuthoringEntryRevision = Readonly<{ revisionId: string; schemaIdentity: SchemaVersionIdentity; content: JsonValue; contentDigest: string; route: string; lineage: Readonly<{ operationId: string; operationKind: string }>; references: readonly AssetVersionIdentity[]; restoredFromRevisionId?: string }>;
export type AuthoringEntryDetail = Readonly<{ entryId: string; current: AuthoringEntryRevision; published?: AuthoringEntryRevision }>;
export type AuthoringReadFailureCode = "INVALID_CONTENT_TYPE" | "CONTENT_TYPE_CONFLICT" | "CONTENT_TYPE_NOT_FOUND" | "ENTRY_NOT_FOUND" | "AUTHORING_READ_FAILED";
export type AuthoringReadFailure = Readonly<{ code: AuthoringReadFailureCode; owner: "AuthoringReadFacade"; subjectIds: readonly string[] }>;
export type AuthoringReadResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: AuthoringReadFailure }>;
export interface AuthoringReadFacade {
  createContentType(input: Readonly<{ schemaIdentity: SchemaVersionIdentity; schema: JsonValue }>): AuthoringReadResult<AuthoringContentType>;
  listContentTypes(): AuthoringReadResult<readonly AuthoringContentType[]>;
  getContentType(schemaId: string): AuthoringReadResult<AuthoringContentType>;
  listEntries(): AuthoringReadResult<readonly AuthoringEntrySummary[]>;
  getEntry(entryId: string): AuthoringReadResult<AuthoringEntryDetail>;
  listEntryRevisions(entryId: string): AuthoringReadResult<readonly AuthoringEntryRevision[]>;
}

const ARTICLE_IDENTITY: SchemaVersionIdentity = Object.freeze({ schemaId: "article", version: 1 });
const ARTICLE_SCHEMA: JsonValue = Object.freeze({ contract: "article-schema/v1", contentContract: "site-content/v1" });
const articleSchemaBytes = canonicalJsonBytes(ARTICLE_SCHEMA);
if (!articleSchemaBytes.ok) throw new Error("ARTICLE_SCHEMA_CANONICALIZATION_FAILED");
const ARTICLE_SCHEMA_BYTES = articleSchemaBytes.value;

function failure<T>(code: AuthoringReadFailureCode, subjectIds: readonly string[] = []): AuthoringReadResult<T> { return { ok: false, error: Object.freeze({ code, owner: "AuthoringReadFacade", subjectIds: Object.freeze([...subjectIds]) }) }; }
function persistence<T>(result: Readonly<{ ok: false; error: PersistenceFailure | AuthoringReadFailure }>): AuthoringReadResult<T> {
  if (result.error.owner !== "Persistence") return { ok: false, error: result.error };
  if (result.error.code === "SCHEMA_VERSION_CONFLICT") return failure("CONTENT_TYPE_CONFLICT");
  if (result.error.code === "SCHEMA_VERSION_NOT_FOUND") return failure("CONTENT_TYPE_NOT_FOUND");
  if (result.error.code === "ENTRY_POINTER_NOT_FOUND" || result.error.code === "REVISION_NOT_FOUND") return failure("ENTRY_NOT_FOUND");
  return failure("AUTHORING_READ_FAILED");
}
function readResult<T>(result: TransactionDecision<T, AuthoringReadFailure | PersistenceFailure>): AuthoringReadResult<T> {
  if (result.ok) return { ok: true, value: result.value };
  return result.error.owner === "Persistence" ? persistence(result) : { ok: false, error: result.error };
}
function codeUnit(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function equalBytes(left: Uint8Array, right: Uint8Array): boolean { if (left.byteLength !== right.byteLength) return false; for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false; return true; }
function parseCanonical(bytes: Uint8Array, digest: string): JsonValue | undefined {
  if (sha256Digest(bytes) !== digest) return undefined;
  let value: JsonValue;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as JsonValue; } catch { return undefined; }
  const canonical = canonicalJsonBytes(value);
  return canonical.ok && equalBytes(canonical.value, bytes) ? immutableJson(value) : undefined;
}
function immutableJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(immutableJson));
  const copy: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value)) copy[key] = immutableJson(nested);
  return Object.freeze(copy);
}
function contentType(record: SchemaVersionRecord): AuthoringContentType | undefined {
  const schema = parseCanonical(record.schemaBytes, record.schemaDigest);
  return schema === undefined ? undefined : Object.freeze({ schemaIdentity: Object.freeze({ ...record.identity }), schema, schemaDigest: record.schemaDigest });
}
function routeFor(claims: readonly RouteClaimRecord[], entryId: string, revisionId: string): string | undefined {
  return claims.find((claim) => claim.owner === entryId && claim.sourceRevisionId === revisionId)?.normalizedRoute;
}
function revision(snapshot: PersistenceReadSnapshot, record: RevisionRecord, route: string | undefined): AuthoringReadResult<AuthoringEntryRevision> {
  if (route === undefined) return failure("AUTHORING_READ_FAILED", [record.identity.entryId, record.identity.revisionId]);
  const content = parseCanonical(record.contentBytes, record.contentDigest);
  if (content === undefined) return failure("AUTHORING_READ_FAILED", [record.identity.entryId, record.identity.revisionId]);
  const references = snapshot.getRevisionReferences(record.identity);
  if (!references.ok) return persistence(references);
  return { ok: true, value: Object.freeze({ revisionId: record.identity.revisionId, schemaIdentity: Object.freeze({ ...record.schemaIdentity }), content, contentDigest: record.contentDigest, route, lineage: Object.freeze({ ...record.lineage }), references: Object.freeze(references.value.map((item) => Object.freeze({ ...item.assetVersion })).sort((left, right) => codeUnit(left.assetId, right.assetId) || codeUnit(left.assetVersionId, right.assetVersionId))), ...(record.restoredFromRevisionId === undefined ? {} : { restoredFromRevisionId: record.restoredFromRevisionId }) }) };
}

export function createAuthoringReadFacade(input: Readonly<{ persistence: PersistenceStore }>): AuthoringReadFacade {
  const { persistence: store } = input;
  return Object.freeze({
    createContentType(request: Readonly<{ schemaIdentity: SchemaVersionIdentity; schema: JsonValue }>): AuthoringReadResult<AuthoringContentType> {
      if (request.schemaIdentity.schemaId !== ARTICLE_IDENTITY.schemaId || request.schemaIdentity.version !== ARTICLE_IDENTITY.version) return failure("INVALID_CONTENT_TYPE");
      const schema = canonicalJsonBytes(request.schema);
      if (!schema.ok || !equalBytes(schema.value, ARTICLE_SCHEMA_BYTES)) return failure("INVALID_CONTENT_TYPE");
      const created = store.registerSchemaVersion({ identity: ARTICLE_IDENTITY, schemaBytes: schema.value, schemaDigest: sha256Digest(schema.value) });
      if (!created.ok) return persistence(created);
      const value = contentType(created.value);
      return value === undefined ? failure("AUTHORING_READ_FAILED") : { ok: true, value };
    },
    listContentTypes(): AuthoringReadResult<readonly AuthoringContentType[]> {
      return readResult(store.runReadSnapshot((snapshot) => {
        const records = snapshot.listLatestSchemaVersions();
        if (!records.ok) return persistence<readonly AuthoringContentType[]>(records);
        const values: AuthoringContentType[] = [];
        for (const record of records.value) {
          const value = contentType(record);
          if (value === undefined) return failure<readonly AuthoringContentType[]>("AUTHORING_READ_FAILED");
          values.push(value);
        }
        return { ok: true, value: Object.freeze(values.sort((left, right) => codeUnit(left.schemaIdentity.schemaId, right.schemaIdentity.schemaId) || left.schemaIdentity.version - right.schemaIdentity.version)) };
      }));
    },
    getContentType(schemaId: string): AuthoringReadResult<AuthoringContentType> {
      return readResult(store.runReadSnapshot((snapshot) => {
        const record = snapshot.getLatestSchemaVersion(schemaId);
        if (!record.ok) return persistence<AuthoringContentType>(record);
        const value = contentType(record.value);
        return value === undefined ? failure<AuthoringContentType>("AUTHORING_READ_FAILED") : { ok: true, value };
      }));
    },
    listEntries(): AuthoringReadResult<readonly AuthoringEntrySummary[]> {
      return readResult(store.runReadSnapshot((snapshot) => {
        const pointers = snapshot.listEntryPointers();
        if (!pointers.ok) return persistence<readonly AuthoringEntrySummary[]>(pointers);
        const values = pointers.value.map((pointer: EntryPointerRecord) => Object.freeze({ ...pointer })).sort((left, right) => codeUnit(left.entryId, right.entryId));
        return { ok: true, value: Object.freeze(values) };
      }));
    },
    getEntry(entryId: string): AuthoringReadResult<AuthoringEntryDetail> {
      return readResult(store.runReadSnapshot((snapshot) => {
        const pointers = snapshot.getEntryPointers(entryId);
        if (!pointers.ok) return persistence<AuthoringEntryDetail>(pointers);
        const current = snapshot.getRevision({ entryId, revisionId: pointers.value.currentRevisionId });
        if (!current.ok) return persistence<AuthoringEntryDetail>(current);
        const currentClaims = snapshot.listRouteClaims("current");
        if (!currentClaims.ok) return persistence<AuthoringEntryDetail>(currentClaims);
        const currentDto = revision(snapshot, current.value, routeFor(currentClaims.value, entryId, current.value.identity.revisionId));
        if (!currentDto.ok) return currentDto;
        if (pointers.value.publishedRevisionId === undefined) return { ok: true, value: Object.freeze({ entryId, current: currentDto.value }) };
        const published = snapshot.getRevision({ entryId, revisionId: pointers.value.publishedRevisionId });
        if (!published.ok) return persistence<AuthoringEntryDetail>(published);
        const publishedClaims = snapshot.listRouteClaims("published");
        if (!publishedClaims.ok) return persistence<AuthoringEntryDetail>(publishedClaims);
        const publishedDto = revision(snapshot, published.value, routeFor(publishedClaims.value, entryId, published.value.identity.revisionId));
        if (!publishedDto.ok) return publishedDto;
        return { ok: true, value: Object.freeze({ entryId, current: currentDto.value, published: publishedDto.value }) };
      }));
    },
    listEntryRevisions(entryId: string): AuthoringReadResult<readonly AuthoringEntryRevision[]> {
      return readResult(store.runReadSnapshot((snapshot) => {
        const pointers = snapshot.getEntryPointers(entryId);
        if (!pointers.ok) return persistence<readonly AuthoringEntryRevision[]>(pointers);
        const records = snapshot.listEntryRevisions(entryId);
        if (!records.ok) return persistence<readonly AuthoringEntryRevision[]>(records);
        const currentClaims = snapshot.listRouteClaims("current");
        if (!currentClaims.ok) return persistence<readonly AuthoringEntryRevision[]>(currentClaims);
        const publishedClaims = snapshot.listRouteClaims("published");
        if (!publishedClaims.ok) return persistence<readonly AuthoringEntryRevision[]>(publishedClaims);
        const claims = [...currentClaims.value, ...publishedClaims.value];
        const values: AuthoringEntryRevision[] = [];
        for (const record of records.value) {
          const value = revision(snapshot, record, routeFor(claims, entryId, record.identity.revisionId));
          if (!value.ok) return value;
          values.push(value.value);
        }
        return { ok: true, value: Object.freeze(values.sort((left, right) => codeUnit(left.revisionId, right.revisionId))) };
      }));
    },
  });
}
