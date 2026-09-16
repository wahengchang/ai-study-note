import { randomUUID } from "node:crypto";

import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue, type MessageRemediation } from "../foundation/index.js";
import { isMediaAssetId } from "../media/index.js";
import { parseCmsBodyBlocks, type CmsBodyBlock } from "../content/index.js";
import { globalSlug, suggestGlobalSlug, type CurrentEntryRecord, type CurrentEntryStatus, type PersistenceFailure, type PersistenceReadSnapshot, type PersistenceStore, type TransactionDecision } from "../persistence/index.js";
import { contentTypeFieldValueShape, isAbsoluteHttpUrl, isCanonicalDate, isCanonicalDatetime, readContentTypeDefinition, scalarLength, type ContentTypeFieldDefinition } from "./content-type-administration.js";

/**
 * WI-002 的 current-only entry authoring：一次 Save 同時寫入完整 `cpt-content/v1` 與 `draft|published` status。
 * WI-003 在同一個 payload 加入按 field ID 排序的 custom values：draft 只要求結構可表示，published 才對
 * required、長度、範圍、格式、option identity 與 media count 做完整驗證。
 *
 * 這個 owner 不擁有 Revision、Publish、Restore 或第二份 snapshot；`publishedAt` 只是「最後一次實質 published
 * Save」的時間證據，目前是否發布一律由 `status` 決定。taxonomy binding 與 media 的存在性／usage 由後續切片擴充。
 */

export type CptSeo = Readonly<{ title?: string; description?: string; canonicalPath?: string }>;
export type CptCustomValue = Readonly<{ fieldId: string; value: JsonValue }>;
export type CptContentV1 = Readonly<{ contract: "cpt-content/v1"; typeId: string; title: string; blocks: readonly CmsBodyBlock[]; excerpt: string; seo: CptSeo; customValues: readonly CptCustomValue[] }>;
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
export type CurrentEntryAdministrationFailureCode = "INVALID_ENTRY_CONTENT" | "INVALID_ENTRY_CUSTOM_VALUES" | "ENTRY_NOT_FOUND" | "CONTENT_TYPE_NOT_FOUND" | "ENTRY_STATE_CONFLICT" | "ENTRY_ADMINISTRATION_FAILED";
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
const contentKeys = ["contract", "typeId", "title", "blocks", "excerpt", "seo", "customValues"] as const;
const customValueKeys = ["fieldId", "value"] as const;
type EntryReader = Pick<PersistenceReadSnapshot, "getCurrentContentType" | "getCurrentEntry" | "listCurrentEntries" | "getGlobalSlugClaimByEntity">;

function failure<T>(code: CurrentEntryAdministrationFailureCode, subjectIds: readonly string[] = []): CurrentEntryAdministrationResult<T> {
  return { ok: false, error: { code, owner: "CurrentEntryAdministration", subjectIds, remediation: { kind: "message", message: code === "INVALID_ENTRY_CUSTOM_VALUES" ? "發布前請修正未通過驗證的自訂欄位。" : "內容項目操作未完成。" } } };
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

/**
 * custom values 的結構正規化與 definition 完全無關：它只判斷這個 value 能否被表示，以及把最外層
 * 依 fieldId、multi 元素依 code-unit 排序。排序是輸出保證；重複的 fieldId 或重複元素屬於可指認到
 * 欄位的失敗，由 `customValuesFailures` 判定，不在這裡降級成 record 層錯誤。
 */
function decodedCustomValue(value: unknown): CptCustomValue | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!Object.hasOwn(candidate, "value") || !Object.keys(candidate).every((key) => (customValueKeys as readonly string[]).includes(key))) return undefined;
  const fieldId = candidate.fieldId;
  if (typeof fieldId !== "string" || fieldId.length === 0 || !fieldId.isWellFormed()) return undefined;
  const raw = candidate.value;
  if (typeof raw === "string") return raw.isWellFormed() ? { fieldId, value: raw } : undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? { fieldId, value: raw } : undefined;
  if (typeof raw === "boolean") return { fieldId, value: raw };
  if (!Array.isArray(raw)) return undefined;
  const items: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.isWellFormed()) return undefined;
    items.push(item);
  }
  return { fieldId, value: [...items].sort() as unknown as JsonValue };
}

function decodedCustomValues(input: unknown): readonly CptCustomValue[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values: CptCustomValue[] = [];
  for (const item of input) {
    const decoded = decodedCustomValue(item);
    if (decoded === undefined) return undefined;
    values.push(decoded);
  }
  return values.sort((left, right) => left.fieldId < right.fieldId ? -1 : left.fieldId > right.fieldId ? 1 : 0);
}

/** `stored` 讀取允許 persisted payload 省略 `customValues`（WI-002 期間寫入的 row），request 一律要求完整欄位。 */
function normalizedContent(value: unknown, typeId: string, stored: boolean): CptContentV1 | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!Object.keys(candidate).every((key) => (contentKeys as readonly string[]).includes(key))) return undefined;
  if (candidate.contract !== "cpt-content/v1" || candidate.typeId !== typeId) return undefined;
  const title = normalizedText(candidate.title, false);
  const excerpt = normalizedText(candidate.excerpt, true);
  const blocks = parseCmsBodyBlocks(candidate.blocks);
  const seo = normalizedSeo(candidate.seo);
  const customValues = Object.hasOwn(candidate, "customValues") ? decodedCustomValues(candidate.customValues) : stored ? [] : undefined;
  if (title === undefined || excerpt === undefined || blocks === undefined || seo === undefined || customValues === undefined) return undefined;
  const body = blocks.find((block) => block.kind === "article");
  if (body === undefined || body.text.trim() === "") return undefined;
  return { contract: "cpt-content/v1", typeId, title, blocks, excerpt, seo, customValues };
}

function decodedContent(record: CurrentEntryRecord): CptContentV1 | undefined {
  try {
    return normalizedContent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.contentBytes)), record.typeId, true);
  } catch {
    return undefined;
  }
}

/** persisted definition 是唯一的 field 來源；解不出來代表 storage 與 Application 不一致，一律 fail closed。 */
function definitionFields(record: Readonly<{ typeId: string; definitionBytes: Uint8Array; definitionDigest: Digest }>): ReadonlyMap<string, ContentTypeFieldDefinition> | undefined {
  const definition = readContentTypeDefinition(record);
  if (definition === undefined) return undefined;
  const fields = new Map<string, ContentTypeFieldDefinition>();
  for (const group of definition.fieldGroups) for (const field of group.fields) fields.set(field.fieldId, field);
  return fields;
}

function kindShapeMatches(field: ContentTypeFieldDefinition, value: JsonValue): boolean {
  switch (contentTypeFieldValueShape(field.kind)) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "string-list": return Array.isArray(value);
  }
}

/** 可由 fieldId 指認的失敗一律回 `INVALID_ENTRY_CUSTOM_VALUES`，並讓 caller 能聚焦到該欄位。 */
function customValuesFailures(fields: ReadonlyMap<string, ContentTypeFieldDefinition>, values: readonly CptCustomValue[]): readonly string[] {
  const failed = new Set<string>();
  const seen = new Set<string>();
  for (const item of values) {
    if (seen.has(item.fieldId)) failed.add(item.fieldId);
    seen.add(item.fieldId);
    const field = fields.get(item.fieldId);
    if (field === undefined || !kindShapeMatches(field, item.value)) failed.add(item.fieldId);
    if (Array.isArray(item.value) && new Set(item.value).size !== item.value.length) failed.add(item.fieldId);
  }
  return [...failed].sort();
}

function withinTextBounds(field: ContentTypeFieldDefinition, value: string): boolean {
  const length = scalarLength(value);
  return (typeof field.constraints.minLength !== "number" || length >= field.constraints.minLength) && (typeof field.constraints.maxLength !== "number" || length <= field.constraints.maxLength);
}

/** 只有 `status === "published"` 才執行的完整驗證：required、長度、範圍、格式、option identity 與 media count。 */
function publishableFieldFailure(field: ContentTypeFieldDefinition, value: CptCustomValue | undefined): boolean {
  if (value === undefined) return field.required;
  const raw = value.value;
  switch (field.kind) {
    case "text":
    case "textarea": return typeof raw !== "string" || (field.required && scalarLength(raw) === 0) || !withinTextBounds(field, raw);
    case "number": return typeof raw === "number" && ((typeof field.constraints.minimum === "number" && raw < field.constraints.minimum) || (typeof field.constraints.maximum === "number" && raw > field.constraints.maximum));
    case "url": return typeof raw === "string" && !isAbsoluteHttpUrl(raw);
    case "date": return typeof raw === "string" && !isCanonicalDate(raw);
    case "datetime": return typeof raw === "string" && !isCanonicalDatetime(raw);
    case "single-select": return typeof raw === "string" && !(field.options ?? []).some((option) => option.optionId === raw);
    case "multi-select": return Array.isArray(raw) && ((field.required && raw.length === 0) || raw.some((item) => !(field.options ?? []).some((option) => option.optionId === item)));
    case "single-media": return typeof raw === "string" && !isMediaAssetId(raw);
    case "multi-media": return Array.isArray(raw) && ((field.required && raw.length === 0) || raw.some((item) => !isMediaAssetId(item)) || (typeof field.constraints.maxItems === "number" && raw.length > field.constraints.maxItems));
    case "boolean": return false;
  }
}

function publishableCustomValueFailures(fields: ReadonlyMap<string, ContentTypeFieldDefinition>, values: readonly CptCustomValue[]): readonly string[] {
  const byFieldId = new Map(values.map((value) => [value.fieldId, value]));
  const failed = new Set<string>();
  for (const [fieldId, field] of fields) if (publishableFieldFailure(field, byFieldId.get(fieldId))) failed.add(fieldId);
  return [...failed].sort();
}

/** Default 只在 create 初始化一次：request 以 key presence 表示是否已提供該 field，save 永不回填。 */
function withMaterializedDefaults(fields: ReadonlyMap<string, ContentTypeFieldDefinition>, values: readonly CptCustomValue[]): readonly CptCustomValue[] {
  const provided = new Set(values.map((value) => value.fieldId));
  const defaults: CptCustomValue[] = [];
  // persisted default 忠實保留 stored 順序；entry 的 multi 值仍必須以升冪 code-unit 保存。
  for (const [fieldId, field] of fields) if (field.defaultValue !== undefined && !provided.has(fieldId)) defaults.push({ fieldId, value: Array.isArray(field.defaultValue) ? [...field.defaultValue].sort() : field.defaultValue });
  return [...values, ...defaults].sort((left, right) => left.fieldId < right.fieldId ? -1 : left.fieldId > right.fieldId ? 1 : 0);
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
  /**
   * content 的完整判定順序：materialize defaults（僅 create）→ definition 依賴的結構與 identity 檢查 →
   * published 的完整驗證。任何一步失敗都回 stable failure，transaction 因 non-ok decision 整筆回滾。
   */
  const resolvedContent = (
    record: Readonly<{ typeId: string; definitionBytes: Uint8Array; definitionDigest: Digest }>,
    raw: unknown,
    status: CurrentEntryStatus,
    applyDefaults: boolean,
    subjectIds: readonly string[],
  ): CurrentEntryAdministrationResult<CptContentV1> => {
    const fields = definitionFields(record);
    if (fields === undefined) return failure("ENTRY_ADMINISTRATION_FAILED", [record.typeId]);
    const content = normalizedContent(raw, record.typeId, false);
    if (content === undefined) return failure("INVALID_ENTRY_CONTENT", subjectIds);
    const identityFailures = customValuesFailures(fields, content.customValues);
    if (identityFailures.length > 0) return failure("INVALID_ENTRY_CUSTOM_VALUES", identityFailures);
    const customValues = applyDefaults ? withMaterializedDefaults(fields, content.customValues) : content.customValues;
    if (status === "published") {
      const publishableFailures = publishableCustomValueFailures(fields, customValues);
      if (publishableFailures.length > 0) return failure("INVALID_ENTRY_CUSTOM_VALUES", publishableFailures);
    }
    return { ok: true, value: { ...content, customValues } };
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
        const status = entryStatus(request.request.status);
        if (status === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.typeId]);
        const content = resolvedContent(type.value, request.request.content, status, true, [request.typeId]);
        if (!content.ok) return content;
        const requestedSlug = request.request.slug === undefined ? suggestGlobalSlug(content.value.title) : globalSlug(request.request.slug);
        if (requestedSlug === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.typeId]);
        const entryId = allocate();
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "entry", entityId: entryId });
        if (!claim.ok) return storageFailure<CptEntryV1>(claim.error.code, [entryId]);
        const record = entryRecord({ entryId, typeId: request.typeId, slug: claim.value.slug, content: content.value, status, now });
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
        const status = entryStatus(request.request.status);
        const requestedSlug = globalSlug(request.request.slug);
        if (status === undefined || requestedSlug === undefined) return failure<CptEntryV1>("INVALID_ENTRY_CONTENT", [request.entryId]);
        const type = transaction.getCurrentContentType(request.typeId);
        if (!type.ok) return failure<CptEntryV1>("ENTRY_ADMINISTRATION_FAILED", [request.typeId]);
        const content = resolvedContent(type.value, request.request.content, status, false, [request.entryId]);
        if (!content.ok) return content;
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "entry", entityId: request.entryId });
        if (!claim.ok) return storageFailure<CptEntryV1>(claim.error.code, [request.entryId]);
        const record = entryRecord({ entryId: request.entryId, typeId: request.typeId, slug: claim.value.slug, content: content.value, status, previous: current.value, now });
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
