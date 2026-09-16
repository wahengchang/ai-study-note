import { randomUUID } from "node:crypto";
import { canonicalJsonBytes, sha256Digest, type Digest, type JsonValue, type MessageRemediation } from "../foundation/index.js";
import { isMediaAssetId } from "../media/index.js";
import { globalSlug, suggestGlobalSlug, type PersistenceReadSnapshot, type PersistenceStore } from "../persistence/index.js";
import { createContentTypeAdministration as createLegacyAdministration, type ContentTypeDefinitionValidator } from "./authoring-read.js";

const systemFields = ["title", "body", "slug", "excerpt", "featuredMedia", "categories", "tags", "seo", "status", "publishedAt"] as const;
const categoriesTaxonomyId = "00000000-0000-4000-8000-000000000002";
const tagsTaxonomyId = "00000000-0000-4000-8000-000000000003";
const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;


const fieldKinds = new Set(["text", "textarea", "number", "boolean", "url", "date", "datetime", "single-select", "multi-select", "single-media", "multi-media"]);
const optionKey = /^[A-Za-z0-9._~-]{1,64}$/u;
const mimeType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

export type ContentTypeFieldKind = "text" | "textarea" | "number" | "boolean" | "url" | "date" | "datetime" | "single-select" | "multi-select" | "single-media" | "multi-media";
export type ContentTypeFieldOption = Readonly<{ optionId: string; label: string; order: number }>;
export type ContentTypeFieldDefinition = Readonly<{ fieldId: string; kind: ContentTypeFieldKind; label: string; help: string; order: number; required: boolean; showInGenericTemplate: boolean; constraints: Record<string, JsonValue>; options?: readonly ContentTypeFieldOption[]; defaultValue?: JsonValue; }>;
export type ContentTypeFieldGroup = Readonly<{ groupId: string; label: string; help: string; order: number; fields: readonly ContentTypeFieldDefinition[] }>;
type FieldKind = ContentTypeFieldKind;
type FieldOption = ContentTypeFieldOption;
type FieldDefinition = ContentTypeFieldDefinition;
type FieldGroup = ContentTypeFieldGroup;
type ContentTypeRecordReader = Pick<PersistenceReadSnapshot, "listCurrentContentTypes">;
type DefinitionRecord = Readonly<{ typeId: string; definitionBytes: Uint8Array; definitionDigest: Digest }>;

/** 每個 kind 的 value 都只有一種可表示的 JSON 形態；entry 驗證與 definition normalization 共用同一份分類。 */
export type ContentTypeFieldValueShape = "string" | "string-list" | "number" | "boolean";
export function contentTypeFieldValueShape(kind: ContentTypeFieldKind): ContentTypeFieldValueShape {
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  return kind === "multi-select" || kind === "multi-media" ? "string-list" : "string";
}
/** persisted value 的量測一律是 Unicode scalar count 且不 trim（definition 與 entry 兩側一致）。 */
export function scalarLength(value: string): number { return Array.from(value).length; }
/** date／datetime／url 的 canonical 判定只有這一份：definition default 與 entry value 不得各自實作。 */
export function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const rfc3339Datetime = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|z|[+-]\d{2}:\d{2})$/u;
/** RFC 3339 的完整形狀與日曆有效性：日期／時間必須與指定 offset 表示的瞬間完全一致（`2026-02-30` 不得被 rollover 接受）。 */
export function isCanonicalDatetime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = rfc3339Datetime.exec(value);
  if (match === null) return false;
  const offset = match[7] as string;
  const offsetHour = offset === "Z" || offset === "z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" || offset === "z" ? 0 : Number(offset.slice(4, 6));
  if (offsetHour > 23 || offsetMinute > 59) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const signedOffset = offset === "Z" || offset === "z" ? 0 : (offset.startsWith("-") ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  const local = new Date(parsed.getTime() + signedOffset * 60_000).toISOString();
  return local.slice(0, 19) === `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}
export function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ContentTypeDefinitionV1 = Readonly<{ contract: "content-type-definition/v1"; typeId: string; label: string; slug: string; help: string; order: number; showInMenu: boolean; systemFields: readonly string[]; fieldGroups: readonly ContentTypeFieldGroup[]; taxonomyAttachments: readonly unknown[]; stateDigest: Digest }>;
export type ContentTypeCatalogV1 = Readonly<{ contract: "content-type-catalog/v1"; items: readonly Readonly<{ typeId: string; label: string; slug: string; order: number; showInMenu: boolean; stateDigest: Digest }>[]; stateDigest: Digest }>;
export type ContentTypeCreateRequestV1 = Readonly<{ contract: "content-type-create-request/v1"; expectedStateDigest: string; label: string; slug?: string | undefined; help: string; order: number; showInMenu: boolean; fieldGroups: readonly unknown[]; taxonomyAttachments: readonly unknown[] }>;
export type ContentTypeReplaceRequestV1 = Readonly<{ contract: "content-type-replace-request/v1"; expectedStateDigest: string; label: string; slug: string; help: string; order: number; showInMenu: boolean; fieldGroups: readonly unknown[]; taxonomyAttachments: readonly unknown[] }>;
export type ContentTypeAdministrationFailureCode = "INVALID_CONTENT_TYPE_DEFINITION" | "CONTENT_TYPE_NOT_FOUND" | "CONTENT_TYPE_STATE_CONFLICT" | "CONTENT_TYPE_BREAKING_CHANGE" | "CONTENT_TYPE_ADMINISTRATION_FAILED";
export type ContentTypeAdministrationFailure = Readonly<{ code: ContentTypeAdministrationFailureCode; owner: "ContentTypeAdministration"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type ContentTypeAdministrationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: ContentTypeAdministrationFailure }>;
export interface ContentTypeAdministration {
  createInitial(input: Readonly<{ schemaId: string; schema: JsonValue }>): Promise<ContentTypeAdministrationResult<unknown>>;
  list(): Promise<ContentTypeAdministrationResult<ContentTypeCatalogV1>>;
  get(input: Readonly<{ typeId: string }>): Promise<ContentTypeAdministrationResult<ContentTypeDefinitionV1>>;
  create(input: ContentTypeCreateRequestV1): Promise<ContentTypeAdministrationResult<ContentTypeDefinitionV1>>;
  replace(input: Readonly<{ typeId: string; definition: ContentTypeReplaceRequestV1 }>): Promise<ContentTypeAdministrationResult<ContentTypeDefinitionV1>>;
}

function failure<T>(code: ContentTypeAdministrationFailureCode, subjectIds: readonly string[] = []): ContentTypeAdministrationResult<T> {
  return { ok: false, error: { code, owner: "ContentTypeAdministration", subjectIds, remediation: { kind: "message", message: "內容類型操作未完成。" } } };
}

/**
 * persisted definition 的唯一 reader：解出 typed field groups，供 Content Type 讀取、entry Save 的
 * default materialization／publishable 驗證、以及 replace 的 entry-usage gate 共用。它解的是
 * **persisted 形狀**（select 帶已 materialize 的 `defaultValue`、沒有 `defaultOptionRef(s)`），
 * 因此不得回用只接受 request 形狀的 `normalizedGroups`。任何不符即回 undefined（fail closed）。
 */
export function readContentTypeDefinition(record: DefinitionRecord): ContentTypeDefinitionV1 | undefined {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.definitionBytes));
  } catch {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.contract !== "content-type-definition/v1" || typeof candidate.typeId !== "string" || typeof candidate.label !== "string" || typeof candidate.slug !== "string" || typeof candidate.help !== "string" || typeof candidate.order !== "number" || typeof candidate.showInMenu !== "boolean" || !Array.isArray(candidate.systemFields) || !Array.isArray(candidate.fieldGroups) || !Array.isArray(candidate.taxonomyAttachments)) return undefined;
  const fieldGroups = decodedGroups(candidate.fieldGroups);
  if (fieldGroups === undefined) return undefined;
  return { contract: "content-type-definition/v1", typeId: candidate.typeId, label: candidate.label, slug: candidate.slug, help: candidate.help, order: candidate.order, showInMenu: candidate.showInMenu, systemFields: [...candidate.systemFields] as string[], fieldGroups, taxonomyAttachments: [...candidate.taxonomyAttachments], stateDigest: record.definitionDigest };
}

function decodedGroups(value: readonly unknown[]): readonly FieldGroup[] | undefined {
  const groups: FieldGroup[] = [];
  for (const groupValue of value) {
    if (groupValue === null || typeof groupValue !== "object" || Array.isArray(groupValue)) return undefined;
    const group = groupValue as Record<string, unknown>;
    if (!hasOnlyKeys(group, ["groupId", "label", "help", "order", "fields"]) || typeof group.groupId !== "string" || !stableId.test(group.groupId) || typeof group.label !== "string" || typeof group.help !== "string" || !Number.isSafeInteger(group.order) || !Array.isArray(group.fields)) return undefined;
    const fields: FieldDefinition[] = [];
    for (const fieldValue of group.fields) {
      const field = decodedField(fieldValue);
      if (field === undefined) return undefined;
      fields.push(field);
    }
    groups.push({ groupId: group.groupId, label: group.label, help: group.help, order: group.order as number, fields });
  }
  return groups;
}

function decodedField(value: unknown): FieldDefinition | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = value as Record<string, unknown>;
  if (!hasOnlyKeys(field, ["fieldId", "kind", "label", "help", "order", "required", "showInGenericTemplate", "constraints", "options", "defaultValue"])) return undefined;
  if (typeof field.fieldId !== "string" || !stableId.test(field.fieldId) || typeof field.kind !== "string" || !fieldKinds.has(field.kind) || typeof field.label !== "string" || typeof field.help !== "string" || !Number.isSafeInteger(field.order) || typeof field.required !== "boolean" || typeof field.showInGenericTemplate !== "boolean") return undefined;
  const kind = field.kind as FieldKind;
  const constraints = normalizeConstraints(kind, field.constraints);
  if (constraints === undefined) return undefined;
  const definition: { fieldId: string; kind: FieldKind; label: string; help: string; order: number; required: boolean; showInGenericTemplate: boolean; constraints: Record<string, JsonValue>; options?: readonly FieldOption[]; defaultValue?: JsonValue } = { fieldId: field.fieldId, kind, label: field.label, help: field.help, order: field.order as number, required: field.required, showInGenericTemplate: field.showInGenericTemplate, constraints };
  if (kind === "single-select" || kind === "multi-select") {
    if (!Array.isArray(field.options) || field.options.length === 0) return undefined;
    const options: FieldOption[] = [];
    for (const optionValue of field.options) {
      if (optionValue === null || typeof optionValue !== "object" || Array.isArray(optionValue)) return undefined;
      const option = optionValue as Record<string, unknown>;
      if (!hasOnlyKeys(option, ["optionId", "label", "order"]) || typeof option.optionId !== "string" || !stableId.test(option.optionId) || typeof option.label !== "string" || !Number.isSafeInteger(option.order) || options.some((item) => item.optionId === option.optionId)) return undefined;
      options.push({ optionId: option.optionId, label: option.label, order: option.order as number });
    }
    definition.options = options.sort((left, right) => left.order - right.order || (left.optionId < right.optionId ? -1 : left.optionId > right.optionId ? 1 : 0));
    if (field.defaultValue !== undefined) {
      const materialized = kind === "single-select" ? [field.defaultValue] : field.defaultValue;
      if (!Array.isArray(materialized) || materialized.length === 0 || (kind === "single-select" && materialized.length !== 1) || new Set(materialized).size !== materialized.length || materialized.some((item) => typeof item !== "string" || !options.some((option) => option.optionId === item))) return undefined;
      definition.defaultValue = kind === "single-select" ? materialized[0] as string : materialized as string[];
      if (definition.required && !defaultSatisfiesRequired(kind, definition.defaultValue)) return undefined;
    }
    return definition;
  }
  if (field.options !== undefined) return undefined;
  if (field.defaultValue !== undefined) {
    const defaultValue = persistedDefault(kind, field.defaultValue, constraints);
    if (defaultValue === undefined || (field.required && !defaultSatisfiesRequired(kind, defaultValue))) return undefined;
    definition.defaultValue = defaultValue;
  }
  return definition;
}

function contentTypeCatalog(persistence: ContentTypeRecordReader): ContentTypeAdministrationResult<ContentTypeCatalogV1> {
  const records = persistence.listCurrentContentTypes();
  if (!records.ok) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED");
  const items: Array<{ typeId: string; label: string; slug: string; order: number; showInMenu: boolean; stateDigest: Digest }> = [];
  for (const record of records.value) {
    const parsed = readContentTypeDefinition(record);
    if (parsed === undefined || parsed.typeId !== record.typeId) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [record.typeId]);
    items.push({ typeId: parsed.typeId, label: parsed.label, slug: parsed.slug, order: parsed.order, showInMenu: parsed.showInMenu, stateDigest: parsed.stateDigest });
  }
  const ordered = items.sort((left, right) => left.typeId < right.typeId ? -1 : left.typeId > right.typeId ? 1 : 0);
  const bytes = canonicalJsonBytes({ contract: "content-type-catalog/v1", items: ordered });
  return bytes.ok ? { ok: true, value: { contract: "content-type-catalog/v1", items: ordered, stateDigest: sha256Digest(bytes.value) } } : failure("CONTENT_TYPE_ADMINISTRATION_FAILED");
}

function sameStructure(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalJsonBytes(left);
  const rightBytes = canonicalJsonBytes(right);
  return leftBytes.ok && rightBytes.ok && sha256Digest(leftBytes.value) === sha256Digest(rightBytes.value);
}

function normalizedMetadata(input: Readonly<{ label: string; help: string; order: number }>): Readonly<{ label: string; help: string; order: number }> | undefined {
  if (!input.label.isWellFormed() || !input.help.isWellFormed() || !Number.isSafeInteger(input.order)) return undefined;
  const label = input.label.trim();
  const help = input.help.trim();
  return Array.from(label).length >= 1 && Array.from(label).length <= 120 && Array.from(help).length <= 1_000 ? { label, help, order: input.order } : undefined;
}


function normalizedText(value: unknown, allowEmpty: boolean): string | undefined {
  if (typeof value !== "string" || !value.isWellFormed()) return undefined;
  const normalized = value.trim();
  return (allowEmpty || normalized.length > 0) && Array.from(normalized).length <= (allowEmpty ? 1_000 : 120) ? normalized : undefined;
}

function normalizedInteger(value: unknown, positive = false): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && (!positive || value > 0) ? value : undefined;
}

function normalizeConstraints(kind: FieldKind, value: unknown): Record<string, JsonValue> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const allowed = kind === "text" || kind === "textarea" ? ["minLength", "maxLength"] : kind === "number" ? ["minimum", "maximum"] : kind === "multi-media" ? ["mimeTypes", "maxItems"] : kind === "single-media" ? ["mimeTypes"] : kind.includes("select") ? [] : [];
  if (keys.some((key) => !allowed.includes(key))) return undefined;
  if (kind === "text" || kind === "textarea") {
    const minLength = candidate.minLength === undefined ? undefined : normalizedInteger(candidate.minLength);
    const maxLength = candidate.maxLength === undefined ? undefined : normalizedInteger(candidate.maxLength);
    if ((candidate.minLength !== undefined && minLength === undefined) || (candidate.maxLength !== undefined && maxLength === undefined) || (minLength !== undefined && maxLength !== undefined && minLength > maxLength)) return undefined;
    return { ...(minLength === undefined ? {} : { minLength }), ...(maxLength === undefined ? {} : { maxLength }) };
  }
  if (kind === "number") {
    const minimum = candidate.minimum;
    const maximum = candidate.maximum;
    if ((minimum !== undefined && (typeof minimum !== "number" || !Number.isFinite(minimum))) || (maximum !== undefined && (typeof maximum !== "number" || !Number.isFinite(maximum))) || (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum)) return undefined;
    return { ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) };
  }
  if (kind === "single-media" || kind === "multi-media") {
    if (!Array.isArray(candidate.mimeTypes) || candidate.mimeTypes.length === 0 || candidate.mimeTypes.some((entry) => typeof entry !== "string" || !mimeType.test(entry)) || new Set(candidate.mimeTypes).size !== candidate.mimeTypes.length) return undefined;
    const mimeTypes = [...candidate.mimeTypes].sort();
    const maxItems = candidate.maxItems === undefined ? undefined : normalizedInteger(candidate.maxItems, true);
    if ((candidate.maxItems !== undefined && maxItems === undefined) || (kind === "single-media" && maxItems !== undefined)) return undefined;
    return { mimeTypes, ...(maxItems === undefined ? {} : { maxItems }) };
  }
  return keys.length === 0 ? {} : undefined;
}

function normalizedDefault(kind: FieldKind, value: unknown, constraints: Record<string, JsonValue>): JsonValue | undefined {
  if (kind === "text" || kind === "textarea") {
    if (typeof value !== "string" || !value.isWellFormed()) return undefined;
    const length = Array.from(value).length;
    return (typeof constraints.minLength !== "number" || length >= constraints.minLength) && (typeof constraints.maxLength !== "number" || length <= constraints.maxLength) ? value : undefined;
  }
  if (kind === "number") return typeof value === "number" && Number.isFinite(value) && (typeof constraints.minimum !== "number" || value >= constraints.minimum) && (typeof constraints.maximum !== "number" || value <= constraints.maximum) ? value : undefined;
  if (kind === "boolean") return typeof value === "boolean" ? value : undefined;
  if (kind === "url") return isAbsoluteHttpUrl(value) ? value : undefined;
  if (kind === "date") return isCanonicalDate(value) ? value : undefined;
  if (kind === "datetime") return isCanonicalDatetime(value) ? value : undefined;
  if (kind === "single-media") return isMediaAssetId(value) ? value : undefined;
  if (kind === "multi-media" && Array.isArray(value) && value.every((item) => isMediaAssetId(item)) && new Set(value).size === value.length && (typeof constraints.maxItems !== "number" || value.length <= constraints.maxItems)) return [...value as readonly string[]].sort() as unknown as JsonValue;
  return undefined;
}

/** `required` 的 field 其 default 必須本身滿足 required 語意，否則 definition 自相矛盾（entry create 必然無法發布）。 */
function defaultSatisfiesRequired(kind: FieldKind, value: JsonValue): boolean {
  const shape = contentTypeFieldValueShape(kind);
  if (shape === "string") return scalarLength(value as string) >= 1;
  if (shape === "string-list") return (value as readonly string[]).length >= 1;
  return true;
}

/**
 * persisted default 的解碼只驗 shape 與 identity，**不做 canonical 轉換、也不排序**：讀取必須忠實反映 stored
 * bytes，否則公開 definition 會與它的 `stateDigest` 不一致（digest 是 stored bytes 的 JCS SHA-256）。
 * canonical 形式（排序、url／date／datetime 格式）由寫入路徑的 `normalizedDefault` 負責。
 */
function persistedDefault(kind: FieldKind, value: unknown, constraints: Record<string, JsonValue>): JsonValue | undefined {
  const shape = contentTypeFieldValueShape(kind);
  if (shape === "boolean") return typeof value === "boolean" ? value : undefined;
  if (shape === "number") return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  if (shape === "string") {
    if (typeof value !== "string" || !value.isWellFormed()) return undefined;
    return kind === "single-media" && !isMediaAssetId(value) ? undefined : value;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !(item as string).isWellFormed())) return undefined;
  const items = value as readonly string[];
  if (new Set(items).size !== items.length) return undefined;
  if (kind === "multi-media" && (!items.every((item) => isMediaAssetId(item)) || (typeof constraints.maxItems === "number" && items.length > constraints.maxItems))) return undefined;
  return items as unknown as JsonValue;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizedGroups(
  value: readonly unknown[],
  allocate: () => string,
  existing: Readonly<{ groupIds: ReadonlySet<string>; fieldIds: ReadonlySet<string>; optionIds: ReadonlySet<string> }> | undefined,
): readonly FieldGroup[] | undefined {
  const groups: FieldGroup[] = [];
  const allFieldIds = new Set<string>();
  const allOptionIds = new Set<string>();
  const allNewOptionKeys = new Set<string>();
  for (const groupValue of value) {
    if (groupValue === null || typeof groupValue !== "object" || Array.isArray(groupValue)) return undefined;
    const group = groupValue as Record<string, unknown>;
    const label = normalizedText(group.label, false);
    const help = normalizedText(group.help, true);
    const order = normalizedInteger(group.order);
    const groupId = group.groupId === undefined ? allocate() : group.groupId;
    if (!hasOnlyKeys(group, ["groupId", "label", "help", "order", "fields"])) return undefined;
    if (label === undefined || help === undefined || order === undefined || typeof groupId !== "string" || !stableId.test(groupId) || (group.groupId !== undefined && (existing === undefined || !existing.groupIds.has(groupId))) || !Array.isArray(group.fields) || groups.some((item) => item.groupId === groupId)) return undefined;
    const fields: FieldDefinition[] = [];
    for (const fieldValue of group.fields) {
      if (fieldValue === null || typeof fieldValue !== "object" || Array.isArray(fieldValue)) return undefined;
      const field = fieldValue as Record<string, unknown>;
      if (!hasOnlyKeys(field, ["fieldId", "kind", "label", "help", "order", "required", "showInGenericTemplate", "constraints", "options", "defaultValue", "defaultOptionRef", "defaultOptionRefs"])) return undefined;
      const fieldId = field.fieldId === undefined ? allocate() : field.fieldId;
      const fieldLabel = normalizedText(field.label, false);
      const fieldHelp = normalizedText(field.help, true);
      const fieldOrder = normalizedInteger(field.order);
      if (typeof fieldId !== "string" || !stableId.test(fieldId) || allFieldIds.has(fieldId) || (field.fieldId !== undefined && (existing === undefined || !existing.fieldIds.has(fieldId))) || typeof field.kind !== "string" || !fieldKinds.has(field.kind) || fieldLabel === undefined || fieldHelp === undefined || fieldOrder === undefined || typeof field.required !== "boolean" || typeof field.showInGenericTemplate !== "boolean") return undefined;
      allFieldIds.add(fieldId);
      const kind = field.kind as FieldKind;
      const constraints = normalizeConstraints(kind, field.constraints);
      if (constraints === undefined) return undefined;
      const definition: { fieldId: string; kind: FieldKind; label: string; help: string; order: number; required: boolean; showInGenericTemplate: boolean; constraints: Record<string, JsonValue>; options?: readonly FieldOption[]; defaultValue?: JsonValue } = { fieldId, kind, label: fieldLabel, help: fieldHelp, order: fieldOrder, required: field.required, showInGenericTemplate: field.showInGenericTemplate, constraints };
      if (kind === "single-select" || kind === "multi-select") {
        if (!Array.isArray(field.options) || field.options.length === 0) return undefined;
        const options: FieldOption[] = [];
        const newOptionIds = new Map<string, string>();
        for (const optionValue of field.options) {
          if (optionValue === null || typeof optionValue !== "object" || Array.isArray(optionValue)) return undefined;
          const option = optionValue as Record<string, unknown>;
          const newOptionKey = option.newOptionKey;
          if (!hasOnlyKeys(option, ["optionId", "newOptionKey", "label", "order"])) return undefined;
          if ((option.optionId === undefined) === (newOptionKey === undefined)) return undefined;
          const optionId = option.optionId === undefined ? newOptionKey === undefined ? undefined : allocate() : option.optionId;
          const optionLabel = normalizedText(option.label, false);
          const optionOrder = normalizedInteger(option.order);
          if (typeof optionId !== "string" || !stableId.test(optionId) || allOptionIds.has(optionId) || optionLabel === undefined || optionOrder === undefined || (option.optionId !== undefined && (existing === undefined || !existing.optionIds.has(optionId))) || (option.optionId === undefined && (typeof newOptionKey !== "string" || !optionKey.test(newOptionKey) || allNewOptionKeys.has(newOptionKey))) || options.some((item) => item.optionId === optionId)) return undefined;
          allOptionIds.add(optionId);
          if (typeof newOptionKey === "string") allNewOptionKeys.add(newOptionKey);
          if (typeof newOptionKey === "string") newOptionIds.set(newOptionKey, optionId);
          options.push({ optionId, label: optionLabel, order: optionOrder });
        }
        if (field.defaultValue !== undefined) return undefined;
        definition.options = options.sort((left, right) => left.order - right.order || (left.optionId < right.optionId ? -1 : left.optionId > right.optionId ? 1 : 0));
        const references = kind === "single-select" ? field.defaultOptionRef === undefined ? [] : [field.defaultOptionRef] : field.defaultOptionRefs === undefined ? [] : field.defaultOptionRefs;
        if (!Array.isArray(references)) return undefined;
        const parsedReferences = references.map((reference) => reference !== null && typeof reference === "object" && !Array.isArray(reference) ? reference as Record<string, unknown> : undefined);
        if (parsedReferences.some((reference) => reference === undefined || !hasOnlyKeys(reference, ["optionId", "newOptionKey"]) || (reference.optionId === undefined) === (reference.newOptionKey === undefined) || typeof (reference.optionId ?? reference.newOptionKey) !== "string")) return undefined;
        const resolved = parsedReferences.map((reference) => reference?.optionId ?? newOptionIds.get(reference?.newOptionKey as string));
        if (resolved.some((reference) => typeof reference !== "string" || !options.some((option) => option.optionId === reference)) || (kind === "single-select" && resolved.length > 1) || (kind === "multi-select" && new Set(resolved).size !== resolved.length)) return undefined;
        if (resolved.length > 0) definition.defaultValue = kind === "single-select" ? resolved[0] as string : resolved as string[];
      } else if (field.options !== undefined || field.defaultOptionRef !== undefined || field.defaultOptionRefs !== undefined) return undefined;
      else if (field.defaultValue !== undefined) {
        const defaultValue = normalizedDefault(kind, field.defaultValue, constraints);
        if (defaultValue === undefined) return undefined;
        definition.defaultValue = defaultValue;
      }
      if (definition.required && definition.defaultValue !== undefined && !defaultSatisfiesRequired(kind, definition.defaultValue)) return undefined;
      fields.push(definition);
    }
    groups.push({ groupId, label, help, order, fields: fields.sort((left, right) => left.order - right.order || (left.fieldId < right.fieldId ? -1 : left.fieldId > right.fieldId ? 1 : 0)) });
  }
  return groups.sort((left, right) => left.order - right.order || (left.groupId < right.groupId ? -1 : left.groupId > right.groupId ? 1 : 0));
}

function existingNestedIds(groups: readonly unknown[]): Readonly<{ groupIds: ReadonlySet<string>; fieldIds: ReadonlySet<string>; optionIds: ReadonlySet<string> }> {
  const groupIds = new Set<string>();
  const fieldIds = new Set<string>();
  const optionIds = new Set<string>();
  for (const group of groups) if (group !== null && typeof group === "object" && !Array.isArray(group)) {
    const record = group as Record<string, unknown>;
    if (typeof record.groupId === "string") groupIds.add(record.groupId);
    if (Array.isArray(record.fields)) for (const field of record.fields) if (field !== null && typeof field === "object" && !Array.isArray(field)) {
      const fieldRecord = field as Record<string, unknown>;
      if (typeof fieldRecord.fieldId === "string") fieldIds.add(fieldRecord.fieldId);
      if (Array.isArray(fieldRecord.options)) for (const option of fieldRecord.options) if (option !== null && typeof option === "object" && !Array.isArray(option)) {
        const optionId = (option as Record<string, unknown>).optionId;
        if (typeof optionId === "string") optionIds.add(optionId);
      }
    }
  }
  return { groupIds, fieldIds, optionIds };
}

function relaxedLower(before: unknown, after: unknown): boolean {
  return before === undefined ? after === undefined : after === undefined || typeof before === "number" && typeof after === "number" && after <= before;
}

function relaxedUpper(before: unknown, after: unknown): boolean {
  return before === undefined ? after === undefined : after === undefined || typeof before === "number" && typeof after === "number" && after >= before;
}
function nonBreakingField(before: FieldDefinition, after: FieldDefinition): boolean {
  if (before.kind !== after.kind || (before.required === false && after.required)) return false;
  if ((before.kind === "text" || before.kind === "textarea") && (!relaxedLower(before.constraints.minLength, after.constraints.minLength) || !relaxedUpper(before.constraints.maxLength, after.constraints.maxLength))) return false;
  if (before.kind === "number" && (!relaxedLower(before.constraints.minimum, after.constraints.minimum) || !relaxedUpper(before.constraints.maximum, after.constraints.maximum))) return false;
  if (before.kind === "single-media" || before.kind === "multi-media") {
    const beforeMime = before.constraints.mimeTypes;
    const afterMime = after.constraints.mimeTypes;
    if (!Array.isArray(beforeMime) || !Array.isArray(afterMime) || beforeMime.some((value) => !afterMime.includes(value)) || (before.kind === "multi-media" && !relaxedUpper(before.constraints.maxItems, after.constraints.maxItems))) return false;
  }
  if (before.kind === "single-select" || before.kind === "multi-select") {
    const afterOptions = new Set((after.options ?? []).map((option) => option.optionId));
    if ((before.options ?? []).some((option) => !afterOptions.has(option.optionId))) return false;
  }
  return true;
}

function nonBreakingDefinition(before: readonly FieldGroup[], afterGroups: readonly FieldGroup[], beforeAttachments: readonly unknown[], afterAttachments: readonly TaxonomyAttachment[]): boolean {
  const afterFields = new Map(afterGroups.flatMap((group) => group.fields).map((field) => [field.fieldId, field]));
  const afterGroupIds = new Set(afterGroups.map((group) => group.groupId));
  if (before.some((group) => !afterGroupIds.has(group.groupId))) return false;
  for (const group of before) for (const field of group.fields) {
    const after = afterFields.get(field.fieldId);
    if (after === undefined || !nonBreakingField(field, after)) return false;
  }
  for (const field of afterFields.values()) if (!before.flatMap((group) => group.fields).some((candidate) => candidate.fieldId === field.fieldId) && field.required) return false;
  const beforeByTaxonomy = new Map((beforeAttachments as readonly TaxonomyAttachment[]).map((attachment) => [attachment.taxonomyId, attachment]));
  const afterByTaxonomy = new Map(afterAttachments.map((attachment) => [attachment.taxonomyId, attachment]));
  for (const [taxonomyId, oldAttachment] of beforeByTaxonomy) {
    const attachment = afterByTaxonomy.get(taxonomyId);
    if (attachment === undefined || (oldAttachment.cardinality === "many" && attachment.cardinality !== "many") || (oldAttachment.required === false && attachment.required) || (oldAttachment.allowTermCreation && !attachment.allowTermCreation)) return false;
  }
  return afterAttachments.every((attachment) => beforeByTaxonomy.has(attachment.taxonomyId) || !attachment.required);
}
type TaxonomyAttachment = Readonly<{ taxonomyId: string; cardinality: "one" | "many"; required: boolean; allowTermCreation: boolean }>;
const defaultAttachments: readonly TaxonomyAttachment[] = [
  { taxonomyId: categoriesTaxonomyId, cardinality: "one", required: false, allowTermCreation: true },
  { taxonomyId: tagsTaxonomyId, cardinality: "many", required: false, allowTermCreation: true },
];

function normalizedAttachments(value: readonly unknown[], requireDefaults: boolean): readonly TaxonomyAttachment[] | undefined {
  const attachments: TaxonomyAttachment[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined;
    const candidate = item as Record<string, unknown>;
    const taxonomyId = candidate.taxonomyId;
    if (typeof taxonomyId !== "string" || taxonomyId.length === 0 || (candidate.cardinality !== "one" && candidate.cardinality !== "many") || typeof candidate.required !== "boolean" || typeof candidate.allowTermCreation !== "boolean") return undefined;
    if (attachments.some((attachment) => attachment.taxonomyId === taxonomyId)) return undefined;
    attachments.push({ taxonomyId, cardinality: candidate.cardinality, required: candidate.required, allowTermCreation: candidate.allowTermCreation });
  }
  for (const fixed of defaultAttachments) {
    const existing = attachments.find((attachment) => attachment.taxonomyId === fixed.taxonomyId);
    if (existing === undefined) {
      if (requireDefaults) return undefined;
      attachments.push(fixed);
    } else if (!sameStructure(existing, fixed)) return undefined;
  }
  return attachments.sort((left, right) => left.taxonomyId < right.taxonomyId ? -1 : left.taxonomyId > right.taxonomyId ? 1 : 0);
}

function attachmentTaxonomiesExist(persistence: Pick<PersistenceStore, "getTaxonomy">, attachments: readonly TaxonomyAttachment[]): boolean {
  return attachments.every((attachment) => persistence.getTaxonomy(attachment.taxonomyId).ok);
}


export function createContentTypeAdministration(input: Readonly<{ persistence: PersistenceStore; newStableId?: () => string; validator?: ContentTypeDefinitionValidator }>): ContentTypeAdministration {
  const legacy = input.validator === undefined ? undefined : createLegacyAdministration({ persistence: input.persistence, validator: input.validator });
  return {
    async createInitial(request) {
      return legacy === undefined ? failure("INVALID_CONTENT_TYPE_DEFINITION", [request.schemaId]) : legacy.createInitial(request) as unknown as ContentTypeAdministrationResult<unknown>;
    },
    async list() { return contentTypeCatalog(input.persistence); },
    async get(request) {
      const record = input.persistence.getCurrentContentType(request.typeId);
      if (!record.ok) return failure(record.error.code === "CURRENT_CONTENT_TYPE_NOT_FOUND" ? "CONTENT_TYPE_NOT_FOUND" : "CONTENT_TYPE_ADMINISTRATION_FAILED", [request.typeId]);
      const parsed = readContentTypeDefinition(record.value);
      return parsed === undefined || parsed.typeId !== request.typeId ? failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [request.typeId]) : { ok: true, value: parsed };
    },
    async create(request) {
      const result = input.persistence.runTransaction((transaction): ContentTypeAdministrationResult<ContentTypeDefinitionV1> => {
        const baseline = contentTypeCatalog(transaction);
        if (!baseline.ok) return baseline;
        if (request.expectedStateDigest !== baseline.value.stateDigest) return failure("CONTENT_TYPE_STATE_CONFLICT");
        const metadata = normalizedMetadata(request);
        const attachments = normalizedAttachments(request.taxonomyAttachments, false);
        const requestedSlug = request.slug === undefined ? suggestGlobalSlug(metadata?.label ?? "") : globalSlug(request.slug);
        const allocate = input.newStableId ?? randomUUID;
        const groups = normalizedGroups(request.fieldGroups, allocate, undefined);
        const typeId = allocate();
        if (metadata === undefined || attachments === undefined || groups === undefined || typeof request.showInMenu !== "boolean" || typeId === undefined || !stableId.test(typeId) || requestedSlug === undefined || !attachmentTaxonomiesExist(transaction, attachments)) return failure("INVALID_CONTENT_TYPE_DEFINITION");
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "content-type", entityId: typeId });
        if (!claim.ok) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [typeId]);
        const base = { contract: "content-type-definition/v1" as const, typeId, label: metadata.label, slug: claim.value.slug, help: metadata.help, order: metadata.order, showInMenu: request.showInMenu, systemFields: [...systemFields], fieldGroups: groups, taxonomyAttachments: attachments };
        const bytes = canonicalJsonBytes(base);
        if (!bytes.ok) return failure("INVALID_CONTENT_TYPE_DEFINITION", [typeId]);
        const digest = sha256Digest(bytes.value);
        const created = transaction.createCurrentContentType({ typeId, definitionBytes: bytes.value, definitionDigest: digest });
        return created.ok ? { ok: true, value: { ...base, stateDigest: digest } } : failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [typeId]);
      });
      if (result.ok) return result;
      return result.error.owner === "ContentTypeAdministration" ? { ok: false, error: result.error } : failure("CONTENT_TYPE_ADMINISTRATION_FAILED");
    },
    async replace(inputRequest) {
      const result = input.persistence.runTransaction((transaction): ContentTypeAdministrationResult<ContentTypeDefinitionV1> => {
        const current = transaction.getCurrentContentType(inputRequest.typeId);
        if (!current.ok) return failure(current.error.code === "CURRENT_CONTENT_TYPE_NOT_FOUND" ? "CONTENT_TYPE_NOT_FOUND" : "CONTENT_TYPE_ADMINISTRATION_FAILED", [inputRequest.typeId]);
        const before = readContentTypeDefinition(current.value);
        if (before === undefined || before.typeId !== inputRequest.typeId) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [inputRequest.typeId]);
        const request = inputRequest.definition;
        if (request.expectedStateDigest !== before.stateDigest) return failure("CONTENT_TYPE_STATE_CONFLICT", [inputRequest.typeId]);
        const metadata = normalizedMetadata(request);
        const attachments = normalizedAttachments(request.taxonomyAttachments, true);
        const requestedSlug = globalSlug(request.slug);
        const groups = normalizedGroups(request.fieldGroups, input.newStableId ?? randomUUID, existingNestedIds(before.fieldGroups));
        if (metadata === undefined || attachments === undefined || groups === undefined || typeof request.showInMenu !== "boolean" || requestedSlug === undefined || !attachmentTaxonomiesExist(transaction, attachments)) return failure("INVALID_CONTENT_TYPE_DEFINITION", [inputRequest.typeId]);
        const hasEntries = transaction.contentTypeHasCurrentEntries(before.typeId);
        if (!hasEntries.ok) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [before.typeId]);
        if (hasEntries.value && !nonBreakingDefinition(before.fieldGroups, groups, before.taxonomyAttachments, attachments)) return failure("CONTENT_TYPE_BREAKING_CHANGE", [before.typeId]);
        const claim = transaction.allocateGlobalSlug({ requestedSlug: requestedSlug.slug, entityKind: "content-type", entityId: before.typeId });
        if (!claim.ok) return failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [before.typeId]);
        const base = { contract: "content-type-definition/v1" as const, typeId: before.typeId, label: metadata.label, slug: claim.value.slug, help: metadata.help, order: metadata.order, showInMenu: request.showInMenu, systemFields: [...systemFields], fieldGroups: groups, taxonomyAttachments: attachments };
        const bytes = canonicalJsonBytes(base);
        if (!bytes.ok) return failure("INVALID_CONTENT_TYPE_DEFINITION", [before.typeId]);
        const digest = sha256Digest(bytes.value);
        const replaced = transaction.replaceCurrentContentType({ typeId: before.typeId, definitionBytes: bytes.value, definitionDigest: digest, ...(current.value.legacySchemaId === undefined ? {} : { legacySchemaId: current.value.legacySchemaId }) });
        return replaced.ok ? { ok: true, value: { ...base, stateDigest: digest } } : failure("CONTENT_TYPE_ADMINISTRATION_FAILED", [before.typeId]);
      });
      if (result.ok) return result;
      return result.error.owner === "ContentTypeAdministration" ? { ok: false, error: result.error } : failure("CONTENT_TYPE_ADMINISTRATION_FAILED");
    },
  };
}
