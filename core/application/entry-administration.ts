import { randomUUID } from "node:crypto";

import { canonicalJsonBytes, sha256Digest, type Digest, type MessageRemediation } from "../foundation/index.js";
import { parseCmsBodyBlocks, type CmsBodyBlock } from "../content/index.js";
import { globalSlug, suggestGlobalSlug, type CurrentEntryRecord, type CurrentEntryStatus, type PersistenceFailure, type PersistenceReadSnapshot, type PersistenceStore, type TransactionDecision } from "../persistence/index.js";

/**
 * WI-002 的 current-only entry authoring：一次 Save 同時寫入完整 `cpt-content/v1` 與 `draft|published` status。
 *
 * 這個 owner 不擁有 Revision、Publish、Restore 或第二份 snapshot；`publishedAt` 只是「最後一次實質 published
 * Save」的時間證據，目前是否發布一律由 `status` 決定。`cpt-content/v1` 本輪只納入可真正驗證與持久化的欄位，
 * custom field values、featured／custom media 與 taxonomy binding 由對應的後續切片擴充同一個 payload。
 */

export type CptSeo = Readonly<{ title?: string; description?: string; canonicalPath?: string }>;
export type CptContentV1 = Readonly<{ contract: "cpt-content/v1"; typeId: string; title: string; blocks: readonly CmsBodyBlock[]; excerpt: string; seo: CptSeo }>;
export type CptEntryV1 = Readonly<{
  contract: "cpt-entry/v1";
  entryId: string;
  typeId: string;
  slug: string;
  content: CptContentV1;
  status: CurrentEntryStatus;
  publishedAt?: string;
  lastPublishedDigest?: Digest;
  stateDigest: Digest;
}>;
export type CptEntrySummaryV1 = Readonly<{ entryId: string; slug: string; title: string; status: CurrentEntryStatus; publishedAt?: string; stateDigest: Digest }>;
export type CptEntryCatalogV1 = Readonly<{ contract: "cpt-entry-catalog/v1"; typeId: string; items: readonly CptEntrySummaryV1[]; stateDigest: Digest }>;
export type CptEntryCreateRequestV1 = Readonly<{ contract: "cpt-entry-create-request/v1"; expectedStateDigest: string; slug?: string | undefined; content: unknown; status: string }>;
export type CptEntrySaveRequestV1 = Readonly<{ contract: "cpt-entry-save-request/v1"; expectedStateDigest: string; slug: string; content: unknown; status: string }>;
export type CptEntryDeleteRequestV1 = Readonly<{ contract: "cpt-entry-delete-request/v1"; expectedStateDigest: string }>;
export type CptEntryDeletedV1 = Readonly<{ contract: "cpt-entry-deleted/v1"; entryId: string }>;
export type CurrentEntryAdministrationFailureCode = "INVALID_ENTRY_CONTENT" | "ENTRY_NOT_FOUND" | "CONTENT_TYPE_NOT_FOUND" | "ENTRY_STATE_CONFLICT" | "ENTRY_ADMINISTRATION_FAILED";
export type CurrentEntryAdministrationFailure = Readonly<{ code: CurrentEntryAdministrationFailureCode; owner: "CurrentEntryAdministration"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type CurrentEntryAdministrationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: CurrentEntryAdministrationFailure }>;
export interface CurrentEntryAdministration {
  catalog(input: Readonly<{ typeId: string }>): Promise<CurrentEntryAdministrationResult<CptEntryCatalogV1>>;
  get(input: Readonly<{ typeId: string; entryId: string }>): Promise<CurrentEntryAdministrationResult<CptEntryV1>>;
  create(input: Readonly<{ typeId: string; request: CptEntryCreateRequestV1 }>): Promise<CurrentEntryAdministrationResult<CptEntryV1>>;
  save(input: Readonly<{ typeId: string; entryId: string; request: CptEntrySaveRequestV1 }>): Promise<CurrentEntryAdministrationResult<CptEntryV1>>;
  delete(input: Readonly<{ typeId: string; entryId: string; request: CptEntryDeleteRequestV1 }>): Promise<CurrentEntryAdministrationResult<CptEntryDeletedV1>>;
}

const seoKeys = ["title", "description", "canonicalPath"] as const;
const contentKeys = ["contract", "typeId", "title", "blocks", "excerpt", "seo"] as const;
type EntryReader = Pick<PersistenceReadSnapshot, "getCurrentContentType" | "getCurrentEntry" | "listCurrentEntries" | "getGlobalSlugClaimByEntity">;

function failure<T>(code: CurrentEntryAdministrationFailureCode, subjectIds: readonly string[] = []): CurrentEntryAdministrationResult<T> {
  return { ok: false, error: { code, owner: "CurrentEntryAdministration", subjectIds, remediation: { kind: "message", message: "內容項目操作未完成。" } } };
}

function storageFailure<T>(code: string, subjectIds: readonly string[]): CurrentEntryAdministrationResult<T> {
  if (code === "CURRENT_ENTRY_NOT_FOUND" || code === "ENTRY_POINTER_NOT_FOUND") return failure("ENTRY_NOT_FOUND", subjectIds);
  if (code === "CURRENT_CONTENT_TYPE_NOT_FOUND") return failure("CONTENT_TYPE_NOT_FOUND", subjectIds);
  if (code === "CURRENT_ENTRY_CONFLICT") return failure("ENTRY_STATE_CONFLICT", subjectIds);
  if (code === "INVALID_PERSISTENCE_INPUT" || code === "NON_CANONICAL_BYTES" || code === "DIGEST_MISMATCH" || code === "GLOBAL_SLUG_CONFLICT") return failure("INVALID_ENTRY_CONTENT", subjectIds);
  return failure("ENTRY_ADMINISTRATION_FAILED", subjectIds);
}

function normalizedText(value: unknown, allowEmpty: boolean): string | undefined {
  if (typeof value !== "string" || !value.isWellFormed()) return undefined;
  const trimmed = value.trim();
  return allowEmpty || trimmed.length > 0 ? trimmed : undefined;
}

function normalizedSeo(value: unknown): CptSeo | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!Object.keys(candidate).every((key) => (seoKeys as readonly string[]).includes(key))) return undefined;
  const seo: { title?: string; description?: string; canonicalPath?: string } = {};
  for (const key of seoKeys) {
    if (!Object.hasOwn(candidate, key)) continue;
    const normalized = normalizedText(candidate[key], false);
    if (normalized === undefined) return undefined;
    seo[key] = normalized;
  }
  return seo;
}

/** title、slug 與非空 body 是每一次 Save 的條件；draft 尚可缺少後續切片才引入的 custom／taxonomy／media 必填值。 */
function normalizedContent(value: unknown, typeId: string): CptContentV1 | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!Object.keys(candidate).every((key) => (contentKeys as readonly string[]).includes(key))) return undefined;
  if (candidate.contract !== "cpt-content/v1" || candidate.typeId !== typeId) return undefined;
  const title = normalizedText(candidate.title, false);
  const excerpt = normalizedText(candidate.excerpt, true);
  const blocks = parseCmsBodyBlocks(candidate.blocks);
  const seo = normalizedSeo(candidate.seo);
  if (title === undefined || excerpt === undefined || blocks === undefined || seo === undefined) return undefined;
  const body = blocks.find((block) => block.kind === "article");
  if (body === undefined || body.text.trim() === "") return undefined;
  return { contract: "cpt-content/v1", typeId, title, blocks, excerpt, seo };
}

function decodedContent(record: CurrentEntryRecord): CptContentV1 | undefined {
  try {
    return normalizedContent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.contentBytes)), record.typeId);
  } catch {
    return undefined;
  }
}

function entryStateDigest(entry: Omit<CptEntryV1, "stateDigest">): Digest | undefined {
  const bytes = canonicalJsonBytes(entry);
  return bytes.ok ? sha256Digest(bytes.value) : undefined;
}

function entryDocument(record: CurrentEntryRecord, slug: string): CptEntryV1 | undefined {
  const content = decodedContent(record);
  if (content === undefined) return undefined;
  const base = {
    contract: "cpt-entry/v1" as const,
    entryId: record.entryId,
    typeId: record.typeId,
    slug,
    content,
    status: record.status,
    ...(record.publishedAt === undefined ? {} : { publishedAt: record.publishedAt }),
    ...(record.lastPublishedDigest === undefined ? {} : { lastPublishedDigest: record.lastPublishedDigest }),
  };
  const stateDigest = entryStateDigest(base);
  return stateDigest === undefined ? undefined : { ...base, stateDigest };
}

function entrySlug(reader: EntryReader, entryId: string): CurrentEntryAdministrationResult<string> {
  const claim = reader.getGlobalSlugClaimByEntity({ entityKind: "entry", entityId: entryId });
  if (claim.ok) return { ok: true, value: claim.value.slug };
  return claim.error.code === "GLOBAL_SLUG_CONFLICT" ? failure("ENTRY_ADMINISTRATION_FAILED", [entryId]) : failure("ENTRY_ADMINISTRATION_FAILED", [entryId]);
}

function entryDocuments(reader: EntryReader, typeId: string): CurrentEntryAdministrationResult<readonly CptEntryV1[]> {
  const records = reader.listCurrentEntries(typeId);
  if (!records.ok) return failure("ENTRY_ADMINISTRATION_FAILED", [typeId]);
  const documents: CptEntryV1[] = [];
  for (const record of records.value) {
    const slug = entrySlug(reader, record.entryId);
    if (!slug.ok) return slug;
    const document = entryDocument(record, slug.value);
    if (document === undefined) return failure("ENTRY_ADMINISTRATION_FAILED", [record.entryId]);
    documents.push(document);
  }
  return { ok: true, value: documents };
}

function contentCatalog(typeId: string, documents: readonly CptEntryV1[]): CurrentEntryAdministrationResult<CptEntryCatalogV1> {
  const items = documents
    .map((document) => ({ entryId: document.entryId, slug: document.slug, title: document.content.title, status: document.status, ...(document.publishedAt === undefined ? {} : { publishedAt: document.publishedAt }), stateDigest: document.stateDigest }))
    .sort((left, right) => (left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0));
  const bytes = canonicalJsonBytes({ contract: "cpt-entry-catalog/v1", typeId, items });
  return bytes.ok ? { ok: true, value: { contract: "cpt-entry-catalog/v1", typeId, items, stateDigest: sha256Digest(bytes.value) } } : failure("ENTRY_ADMINISTRATION_FAILED", [typeId]);
}

function entryStatus(value: unknown): CurrentEntryStatus | undefined {
  return value === "draft" || value === "published" ? value : undefined;
}

/** 只有 status=`published` 且 publishable content digest 實質改變時才前進 `publishedAt`；改回 draft 或相同 bytes 都保留既有值。 */
function publishedState(status: CurrentEntryStatus, contentDigest: Digest, previous: CurrentEntryRecord | undefined, now: () => Date): Readonly<{ publishedAt?: string; lastPublishedDigest?: Digest }> {
  if (status === "published" && previous?.lastPublishedDigest !== contentDigest) return { publishedAt: now().toISOString(), lastPublishedDigest: contentDigest };
  return previous?.publishedAt === undefined || previous.lastPublishedDigest === undefined ? {} : { publishedAt: previous.publishedAt, lastPublishedDigest: previous.lastPublishedDigest };
}

function entryRecord(input: Readonly<{ entryId: string; typeId: string; slug: string; content: CptContentV1; status: CurrentEntryStatus; previous?: CurrentEntryRecord; now: () => Date }>): CurrentEntryAdministrationResult<CurrentEntryRecord> {
  const bytes = canonicalJsonBytes(input.content);
  if (!bytes.ok) return failure("INVALID_ENTRY_CONTENT", [input.entryId]);
  const contentDigest = sha256Digest(bytes.value);
  return { ok: true, value: { entryId: input.entryId, typeId: input.typeId, authoringRoute: `/${input.slug}`, contentBytes: bytes.value, contentDigest, status: input.status, ...publishedState(input.status, contentDigest, input.previous, input.now) } };
}

export function createCurrentEntryAdministration(input: Readonly<{ persistence: PersistenceStore; newStableId?: () => string; now?: () => Date }>): CurrentEntryAdministration {
  const allocate = input.newStableId ?? randomUUID;
  const now = input.now ?? (() => new Date());
  const resolved = <T>(decision: TransactionDecision<T, CurrentEntryAdministrationFailure | PersistenceFailure>): CurrentEntryAdministrationResult<T> => {
    if (decision.ok) return { ok: true, value: decision.value };
    return decision.error.owner === "CurrentEntryAdministration" ? { ok: false, error: decision.error } : failure("ENTRY_ADMINISTRATION_FAILED");
  };
  return {
    async catalog(request) {
      return resolved(input.persistence.runReadSnapshot((snapshot) => {
        const type = snapshot.getCurrentContentType(request.typeId);
        if (!type.ok) return type.error.code === "CURRENT_CONTENT_TYPE_NOT_FOUND" ? failure<CptEntryCatalogV1>("CONTENT_TYPE_NOT_FOUND", [request.typeId]) : failure<CptEntryCatalogV1>("ENTRY_ADMINISTRATION_FAILED", [request.typeId]);
        const documents = entryDocuments(snapshot, request.typeId);
        return documents.ok ? contentCatalog(request.typeId, documents.value) : documents;
      }));
    },
    async get(request) {
      return resolved(input.persistence.runReadSnapshot((snapshot) => {
        const record = snapshot.getCurrentEntry(request.entryId);
        if (!record.ok) return failure<CptEntryV1>(record.error.code === "CURRENT_ENTRY_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
        if (record.value.typeId !== request.typeId) return failure<CptEntryV1>("ENTRY_NOT_FOUND", [request.entryId]);
        const slug = entrySlug(snapshot, request.entryId);
        if (!slug.ok) return slug;
        const document = entryDocument(record.value, slug.value);
        return document === undefined ? failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [request.entryId]) : { ok: true as const, value: document };
      }));
    },
    async create(request) {
      return resolved(input.persistence.runTransaction((transaction) => {
        const type = transaction.getCurrentContentType(request.typeId);
        if (!type.ok) return type.error.code === "CURRENT_CONTENT_TYPE_NOT_FOUND" ? failure<CptEntryV1>("CONTENT_TYPE_NOT_FOUND", [request.typeId]) : failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [request.typeId]);
        const documents = entryDocuments(transaction, request.typeId);
        if (!documents.ok) return documents;
        const catalog = contentCatalog(request.typeId, documents.value);
        if (!catalog.ok) return catalog;
        if (request.request.expectedStateDigest !== catalog.value.stateDigest) return failure<CptEntryV1>("ENTRY_STATE_CONFLICT", [request.typeId]);
        const content = normalizedContent(request.request.content, request.typeId);
        const status = entryStatus(request.request.status);
        if (content === undefined || status === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.typeId]);
        const requestedSlug = request.request.slug === undefined ? suggestGlobalSlug(content.title) : globalSlug(request.request.slug);
        if (requestedSlug === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.typeId]);
        const entryId = allocate();
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "entry", entityId: entryId });
        if (!claim.ok) return storageFailure<CptEntryV1>(claim.error.code, [entryId]);
        const record = entryRecord({ entryId, typeId: request.typeId, slug: claim.value.slug, content, status, now });
        if (!record.ok) return record;
        const created = transaction.createCurrentEntry(record.value);
        if (!created.ok) return storageFailure<CptEntryV1>(created.error.code, [entryId]);
        const document = entryDocument(created.value, claim.value.slug);
        return document === undefined ? failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [entryId]) : { ok: true as const, value: document };
      }));
    },
    async save(request) {
      return resolved(input.persistence.runTransaction((transaction) => {
        const current = transaction.getCurrentEntry(request.entryId);
        if (!current.ok) return failure<CptEntryV1>(current.error.code === "CURRENT_ENTRY_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
        if (current.value.typeId !== request.typeId) return failure<CptEntryV1>("ENTRY_NOT_FOUND", [request.entryId]);
        const slug = entrySlug(transaction, request.entryId);
        if (!slug.ok) return slug;
        const before = entryDocument(current.value, slug.value);
        if (before === undefined) return failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
        // CAS 必須早於 slug 配置與任何 durable write：stale caller 不得推進 content、status、slug 或 route evidence。
        if (request.request.expectedStateDigest !== before.stateDigest) return failure<CptEntryV1>("ENTRY_STATE_CONFLICT", [request.entryId]);
        const content = normalizedContent(request.request.content, request.typeId);
        const status = entryStatus(request.request.status);
        const requestedSlug = globalSlug(request.request.slug);
        if (content === undefined || status === undefined || requestedSlug === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.entryId]);
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "entry", entityId: request.entryId });
        if (!claim.ok) return storageFailure<CptEntryV1>(claim.error.code, [request.entryId]);
        const record = entryRecord({ entryId: request.entryId, typeId: request.typeId, slug: claim.value.slug, content, status, previous: current.value, now });
        if (!record.ok) return record;
        const replaced = transaction.replaceCurrentEntry(record.value);
        if (!replaced.ok) return storageFailure<CptEntryV1>(replaced.error.code, [request.entryId]);
        const document = entryDocument(replaced.value, claim.value.slug);
        return document === undefined ? failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [request.entryId]) : { ok: true as const, value: document };
      }));
    },
    async delete(request) {
      return resolved(input.persistence.runTransaction((transaction) => {
        const current = transaction.getCurrentEntry(request.entryId);
        if (!current.ok) return failure<CptEntryDeletedV1>(current.error.code === "CURRENT_ENTRY_NOT_FOUND" ? "ENTRY_NOT_FOUND" : "ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
        if (current.value.typeId !== request.typeId) return failure<CptEntryDeletedV1>("ENTRY_NOT_FOUND", [request.entryId]);
        const slug = entrySlug(transaction, request.entryId);
        if (!slug.ok) return slug;
        const before = entryDocument(current.value, slug.value);
        if (before === undefined) return failure<CptEntryDeletedV1>("ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
        if (request.request.expectedStateDigest !== before.stateDigest) return failure<CptEntryDeletedV1>("ENTRY_STATE_CONFLICT", [request.entryId]);
        const removed = transaction.deleteCurrentEntry(request.entryId);
        if (!removed.ok) return storageFailure<CptEntryDeletedV1>(removed.error.code, [request.entryId]);
        const released = transaction.releaseGlobalSlug({ entityKind: "entry", entityId: request.entryId });
        return released.ok ? { ok: true as const, value: { contract: "cpt-entry-deleted/v1" as const, entryId: request.entryId } } : failure<CptEntryDeletedV1>("ENTRY_ADMINISTRATION_FAILED", [request.entryId]);
      }));
    },
  };
}
