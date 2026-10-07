import { createRoot } from "react-dom/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { z, type ZodType } from "zod";

import "./tokens.css";
import { openAuthoringSession, type AuthoringSession } from "./session.js";

const AUTHORING_RESOURCE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const jsonContent = z.unknown().refine((value) => value !== undefined);
const remediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
const authoringErrorSchema = z.object({ contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string(), owner: z.string(), subjectIds: z.array(z.string()), remediation: remediationSchema }).strict();
const mediaUsageV2Schema = z.object({ entryId: z.string().min(1), status: z.enum(["draft", "published"]) }).strict();
/**
 * 被 entry 引用的 current media asset 不得 Replace／Delete。這個 failure 帶完整 usage evidence，
 * generic `authoring-error/v1` 無法承載，因此以 exact contract 單獨驗證並保留給 UI 顯示。
 */
const mediaAssetReferencedErrorSchema = z.object({ contract: z.literal("media-asset-referenced/v2"), requestId: z.string(), code: z.literal("MEDIA_ASSET_REFERENCED"), owner: z.literal("DataMedia"), subjectIds: z.array(z.string()), remediation: remediationSchema, usage: z.array(mediaUsageV2Schema).nonempty() }).strict();
const contentFieldKindSchema = z.enum(["text", "textarea", "number", "boolean", "url", "date", "datetime", "single-select", "multi-select", "single-media", "multi-media"]);
const contentFieldOptionSchema = z.object({ optionId: z.string(), label: z.string(), order: z.number().int().safe() }).strict();
/**
 * persisted definition 的 field 形狀必須在 client 端完整解析：Builder 與 entry editor 都以同一份
 * parser 為唯一解讀路徑，解析失敗一律 fail closed，不得退化成「沒有欄位群組」。
 */
const contentFieldSchema = z.object({ fieldId: z.string(), kind: contentFieldKindSchema, label: z.string(), help: z.string(), order: z.number().int().safe(), required: z.boolean(), showInGenericTemplate: z.boolean(), constraints: z.record(z.string(), jsonContent), options: z.array(contentFieldOptionSchema).optional(), defaultValue: jsonContent.optional() }).strict();
const contentFieldGroupSchema = z.object({ groupId: z.string(), label: z.string(), help: z.string(), order: z.number().int().safe(), fields: z.array(contentFieldSchema) }).strict();
type ContentFieldKind = Readonly<z.infer<typeof contentFieldKindSchema>>;
type ContentField = Readonly<z.infer<typeof contentFieldSchema>>;
type ContentFieldGroup = Readonly<z.infer<typeof contentFieldGroupSchema>>;
const contentTypeSummarySchema = z.object({ typeId: z.string().uuid(), label: z.string(), slug: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), stateDigest: digestSchema }).strict();
const contentTypeSchema = z.object({ contract: z.literal("content-type-definition/v1"), typeId: z.string().uuid(), label: z.string(), slug: z.string(), help: z.string(), order: z.number().int().safe(), showInMenu: z.boolean(), systemFields: z.array(z.string()), fieldGroups: z.array(contentFieldGroupSchema), taxonomyAttachments: z.array(z.object({ taxonomyId: z.string().min(1), cardinality: z.enum(["one", "many"]), required: z.boolean(), allowTermCreation: z.boolean() }).strict()), stateDigest: digestSchema }).strict();
const contentTypeCatalogSchema = z.object({ contract: z.literal("content-type-catalog/v1"), items: z.array(contentTypeSummarySchema), stateDigest: digestSchema }).strict();
const currentTaxonomyRecordSchema = z.object({ taxonomyId: z.string().uuid(), label: z.string(), slug: z.string(), hierarchical: z.boolean() }).strict();
const taxonomyTermSchema = z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid(), label: z.string(), slug: z.string(), parentTermId: z.string().uuid().optional(), order: z.number().int().safe(), state: z.enum(["live", "retired"]) }).strict();
const taxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v2"), taxonomy: currentTaxonomyRecordSchema, terms: z.array(taxonomyTermSchema), stateDigest: digestSchema }).strict();
const taxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v2"), taxonomies: z.array(z.object({ taxonomy: currentTaxonomyRecordSchema, stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
const mediaImageV2Schema = z.object({ width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaThumbnailV2Schema = z.object({ digest: digestSchema, byteLength: z.number().int().nonnegative(), width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaAssetV2Schema = z.object({ contract: z.literal("media-asset/v2"), assetId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), altText: z.string().nullable(), caption: z.string(), description: z.string(), originalFilename: z.string().min(1), mimeType: z.string().min(1), byteLength: z.number().int().nonnegative(), checksum: digestSchema, uploadedAt: z.string().min(1), image: mediaImageV2Schema.nullable(), thumbnail: mediaThumbnailV2Schema.nullable(), stateDigest: digestSchema }).strict();
const mediaCatalogV2Schema = z.object({ contract: z.literal("media-catalog/v2"), items: z.array(mediaAssetV2Schema), stateDigest: digestSchema }).strict();
const mediaAssetDetailV2Schema = z.object({ contract: z.literal("media-asset-detail/v2"), asset: mediaAssetV2Schema, usage: z.array(mediaUsageV2Schema) }).strict();
const mediaDeleteReceiptV2Schema = z.object({ contract: z.literal("media-delete-receipt/v2"), assetId: z.string().min(1), releasedSlug: z.string().min(1) }).strict();
const interactiveDemoBlockSchema = z.object({
  kind: z.literal("interactive-demo"),
  identity: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  hook: z.literal("cms/editor-block/resolve"),
  manifestHash: digestSchema,
  source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(),
  staticFallback: z.string().min(1),
}).strict();
const articleBlockSchema = z.object({ kind: z.literal("article"), text: z.string().min(1) }).strict();
const cptEntrySchema = z.object({ contract: z.literal("cpt-entry/v1"), entryId: z.string(), typeId: z.string(), slug: z.string(), content: z.object({ contract: z.literal("cpt-content/v1"), typeId: z.string(), title: z.string(), blocks: z.array(z.discriminatedUnion("kind", [articleBlockSchema, interactiveDemoBlockSchema])).min(1), excerpt: z.string(), seo: z.object({ title: z.string().optional(), description: z.string().optional(), canonicalPath: z.string().optional() }).strict(), featuredMedia: z.string().optional(), customValues: z.array(z.object({ fieldId: z.string(), value: jsonContent }).strict()) }).strict(), taxonomyTerms: z.array(z.object({ taxonomyId: z.string().uuid(), termId: z.string().uuid() }).strict()), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), lastPublishedDigest: digestSchema.optional(), stateDigest: digestSchema }).strict();
const cptEntryCatalogSchema = z.object({ contract: z.literal("cpt-entry-catalog/v1"), typeId: z.string(), items: z.array(z.object({ entryId: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
const cptEntrySearchResultSchema = z.object({ contract: z.literal("entry-search-result/v1"), typeId: z.string(), page: z.number().int().positive(), pageSize: z.literal(20), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), items: cptEntryCatalogSchema.shape.items, stateDigest: digestSchema }).strict();
const cptEntryDeletedSchema = z.object({ contract: z.literal("cpt-entry-deleted/v1"), entryId: z.string() }).strict();
type CptEntryDto = Readonly<z.infer<typeof cptEntrySchema>>;
type CptEntryCatalogDto = Readonly<z.infer<typeof cptEntryCatalogSchema>>;
type CptEntrySearchResultDto = Readonly<z.infer<typeof cptEntrySearchResultSchema>>;
type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
type TaxonomySnapshotDto = Readonly<z.infer<typeof taxonomySnapshotSchema>>;
type TaxonomyCatalogDto = Readonly<z.infer<typeof taxonomyCatalogSchema>>;
type MediaAssetV2Dto = Readonly<z.infer<typeof mediaAssetV2Schema>>;
type MediaCatalogV2Dto = Readonly<z.infer<typeof mediaCatalogV2Schema>>;
type MediaAssetDetailV2Dto = Readonly<z.infer<typeof mediaAssetDetailV2Schema>>;
type MediaUsageV2Dto = Readonly<z.infer<typeof mediaUsageV2Schema>>;
type StructuredBlock = CptEntryDto["content"]["blocks"][number];

type TaxonomyTermIdentity = Readonly<{ taxonomyId: string; termId: string }>;
type TaxonomyAttachment = ContentTypeDto["taxonomyAttachments"][number];
export { openAuthoringSession } from "./session.js";

export class CmsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly remediation: string, readonly usage: readonly MediaUsageV2Dto[] = [], readonly subjectIds: readonly string[] = []) {
    super(remediation);
  }
}

function message(reason: unknown): string {
  return reason instanceof CmsApiError ? reason.remediation : "無法完成 CMS request。";
}

/**
 * ACF-like 自訂欄位的 Builder draft。`order` 由陣列位置推導（不要求使用者輸入數字），
 * 既有項目保留 server 配置的 stable ID，新項目省略 ID 並改用 request-local 的 draft key。
 */
type FieldOptionDraft = Readonly<{ key: string; optionId: string | undefined; label: string }>;
type FieldDraft = Readonly<{
  key: string;
  fieldId: string | undefined;
  kind: ContentFieldKind;
  label: string;
  help: string;
  required: boolean;
  showInGenericTemplate: boolean;
  minLength: string;
  maxLength: string;
  minimum: string;
  maximum: string;
  mimeTypes: string;
  maxItems: string;
  options: readonly FieldOptionDraft[];
  defaultText: string;
  defaultBoolean: "unset" | "true" | "false";
  defaultOptionKey: string;
  defaultOptionKeys: readonly string[];
}>;
type FieldGroupDraft = Readonly<{ key: string; groupId: string | undefined; label: string; help: string; fields: readonly FieldDraft[] }>;

const fieldKindLabels: Readonly<Record<ContentFieldKind, string>> = { text: "單行文字", textarea: "多行文字", number: "數字", boolean: "是／否", url: "網址", date: "日期", datetime: "日期時間", "single-select": "單選", "multi-select": "多選", "single-media": "單一媒體", "multi-media": "多媒體" };
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

function draftKey(): string { return crypto.randomUUID(); }
function isTextKind(kind: ContentFieldKind): boolean { return kind === "text" || kind === "textarea"; }
function isSelectKind(kind: ContentFieldKind): boolean { return kind === "single-select" || kind === "multi-select"; }
function isMediaKind(kind: ContentFieldKind): boolean { return kind === "single-media" || kind === "multi-media"; }
function scalarCount(value: string): number { return Array.from(value).length; }
function numericText(value: unknown): string { return typeof value === "number" ? String(value) : ""; }

function constraintNumber(field: ContentField, key: string): string { return numericText(field.constraints[key]); }
function constraintMimeTypes(field: ContentField): string { return Array.isArray(field.constraints.mimeTypes) ? (field.constraints.mimeTypes as readonly string[]).join("\n") : ""; }
function mediaLinesOf(text: string): readonly string[] { return text.split("\n").map((line) => line.trim()).filter((line) => line !== ""); }

function defaultTextOf(field: ContentField): string {
  if (isSelectKind(field.kind) || field.kind === "boolean" || field.defaultValue === undefined) return "";
  const value = field.defaultValue;
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function fieldDraftOf(field: ContentField): FieldDraft {
  return {
    key: field.fieldId,
    fieldId: field.fieldId,
    kind: field.kind,
    label: field.label,
    help: field.help,
    required: field.required,
    showInGenericTemplate: field.showInGenericTemplate,
    minLength: constraintNumber(field, "minLength"),
    maxLength: constraintNumber(field, "maxLength"),
    minimum: constraintNumber(field, "minimum"),
    maximum: constraintNumber(field, "maximum"),
    mimeTypes: constraintMimeTypes(field),
    maxItems: constraintNumber(field, "maxItems"),
    options: (field.options ?? []).map((option) => ({ key: option.optionId, optionId: option.optionId, label: option.label })),
    defaultText: defaultTextOf(field),
    defaultBoolean: typeof field.defaultValue === "boolean" ? (field.defaultValue ? "true" : "false") : "unset",
    defaultOptionKey: field.kind === "single-select" && typeof field.defaultValue === "string" ? field.defaultValue : "",
    defaultOptionKeys: field.kind === "multi-select" && Array.isArray(field.defaultValue) ? (field.defaultValue as readonly string[]) : [],
  };
}

function groupDraftsOf(groups: readonly ContentFieldGroup[]): readonly FieldGroupDraft[] {
  return groups.map((group) => ({ key: group.groupId, groupId: group.groupId, label: group.label, help: group.help, fields: group.fields.map(fieldDraftOf) }));
}

function optionReference(option: FieldOptionDraft): Record<string, unknown> {
  return option.optionId === undefined ? { newOptionKey: option.key } : { optionId: option.optionId };
}

function fieldConstraintsRequest(field: FieldDraft): Record<string, unknown> {
  if (isTextKind(field.kind)) return { ...(field.minLength.trim() === "" ? {} : { minLength: Number(field.minLength) }), ...(field.maxLength.trim() === "" ? {} : { maxLength: Number(field.maxLength) }) };
  if (field.kind === "number") return { ...(field.minimum.trim() === "" ? {} : { minimum: Number(field.minimum) }), ...(field.maximum.trim() === "" ? {} : { maximum: Number(field.maximum) }) };
  if (field.kind === "single-media") return { mimeTypes: mediaLinesOf(field.mimeTypes) };
  if (field.kind === "multi-media") return { mimeTypes: mediaLinesOf(field.mimeTypes), ...(field.maxItems.trim() === "" ? {} : { maxItems: Number(field.maxItems) }) };
  return {};
}

/** 空白的 default 輸入代表「未設定」；server 亦不會把未提供的 optional field 補成預設值。 */
function defaultValueRequest(field: FieldDraft): Record<string, unknown> {
  if (isSelectKind(field.kind)) return {};
  if (field.kind === "boolean") return field.defaultBoolean === "unset" ? {} : { defaultValue: field.defaultBoolean === "true" };
  if (field.kind === "number") return field.defaultText.trim() === "" ? {} : { defaultValue: Number(field.defaultText) };
  if (field.kind === "multi-media") {
    const ids = mediaLinesOf(field.defaultText);
    return ids.length === 0 ? {} : { defaultValue: ids };
  }
  return field.defaultText.trim() === "" ? {} : { defaultValue: field.defaultText };
}

function defaultOptionRequest(field: FieldDraft): Record<string, unknown> {
  if (field.kind === "single-select") {
    const option = field.options.find((item) => item.key === field.defaultOptionKey);
    return option === undefined ? {} : { defaultOptionRef: optionReference(option) };
  }
  if (field.kind === "multi-select") {
    const references = field.options.filter((item) => field.defaultOptionKeys.includes(item.key)).map(optionReference);
    return references.length === 0 ? {} : { defaultOptionRefs: references };
  }
  return {};
}

/** persisted 形狀（`defaultValue`）與 request 形狀（`defaultOptionRef(s)`）只有這一條轉換路徑。 */
function fieldGroupsRequest(groups: readonly FieldGroupDraft[]): readonly unknown[] {
  return groups.map((group, groupIndex) => ({
    ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
    label: group.label,
    help: group.help,
    order: groupIndex,
    fields: group.fields.map((field, fieldIndex) => ({
      ...(field.fieldId === undefined ? {} : { fieldId: field.fieldId }),
      kind: field.kind,
      label: field.label,
      help: field.help,
      order: fieldIndex,
      required: field.required,
      showInGenericTemplate: field.showInGenericTemplate,
      constraints: fieldConstraintsRequest(field),
      ...(isSelectKind(field.kind)
        ? { options: field.options.map((option, optionIndex) => ({ ...optionReference(option), label: option.label, order: optionIndex })), ...defaultOptionRequest(field) }
        : defaultValueRequest(field)),
    })),
  }));
}

/**
 * Builder 的先行檢查：只覆蓋 Builder 自己寫入的 constraints，讓常見錯誤在送出前就有欄位層級訊息。
 * server 仍是唯一 authority，任何未被這裡攔下的失敗都以 form 層訊息呈現。
 */
function fieldGroupsIssues(groups: readonly FieldGroupDraft[]): ReadonlyMap<string, string> {
  const issues = new Map<string, string>();
  const labelIssue = (value: string, empty: string): string | undefined => value.trim() === "" ? empty : scalarCount(value.trim()) > 120 ? "名稱不得超過 120 個字元。" : undefined;
  const helpIssue = (value: string): string | undefined => scalarCount(value.trim()) > 1_000 ? "說明不得超過 1000 個字元。" : undefined;
  for (const group of groups) {
    const issue = labelIssue(group.label, "請輸入欄位群組名稱。") ?? helpIssue(group.help);
    if (issue !== undefined) issues.set(group.key, issue);
    for (const field of group.fields) {
      const fieldIssue = labelIssue(field.label, "請輸入欄位名稱。") ?? helpIssue(field.help)
        ?? (isTextKind(field.kind) && field.minLength.trim() !== "" && field.maxLength.trim() !== "" && Number(field.minLength) > Number(field.maxLength) ? "最小長度不得大於最大長度。" : undefined)
        ?? (field.kind === "number" && field.minimum.trim() !== "" && field.maximum.trim() !== "" && Number(field.minimum) > Number(field.maximum) ? "最小值不得大於最大值。" : undefined)
        ?? (field.kind === "multi-media" && field.maxItems.trim() !== "" && !(Number.isSafeInteger(Number(field.maxItems)) && Number(field.maxItems) > 0) ? "數量上限必須是正整數。" : undefined)
        ?? (isSelectKind(field.kind) && field.options.length === 0 ? "選項欄位至少需要一個選項。" : undefined)
        ?? (isMediaKind(field.kind) && mediaLinesOf(field.mimeTypes).length === 0 ? "媒體欄位至少需要一個 MIME type。" : undefined)
        ?? (isMediaKind(field.kind) && mediaLinesOf(field.mimeTypes).some((mime) => !MIME_PATTERN.test(mime)) ? "MIME type 必須是 type/subtype 格式。" : undefined)
        ?? (isMediaKind(field.kind) && new Set(mediaLinesOf(field.mimeTypes)).size !== mediaLinesOf(field.mimeTypes).length ? "MIME type 不得重複。" : undefined);
      if (fieldIssue !== undefined) issues.set(field.key, fieldIssue);
      for (const option of field.options) if (option.label.trim() === "") issues.set(`${field.key}:${option.key}`, "請輸入選項名稱。");
    }
  }
  return issues;
}

function moveWithin<T>(items: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const moved = next.splice(index, 1)[0] as T;
  next.splice(target, 0, moved);
  return next;
}

/** entry editor 的 wire 值轉換：未編輯的欄位原樣保留，datetime 只在實際編輯時轉成 RFC 3339 UTC。 */
function datetimeLocalToIso(value: string): string | undefined {
  if (value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isoToDatetimeLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function customDefaultsOf(definition: ContentTypeDto): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const group of definition.fieldGroups) for (const field of group.fields) if (field.defaultValue !== undefined) values[field.fieldId] = field.defaultValue;
  return values;
}

function customValuesOf(entry: CptEntryDto): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const item of entry.content.customValues) values[item.fieldId] = item.value;
  return values;
}

function customValuesRequest(values: Readonly<Record<string, unknown>>): readonly Readonly<{ fieldId: string; value: unknown }>[] {
  return Object.keys(values).sort().map((fieldId) => ({ fieldId, value: values[fieldId] }));
}

/** 欄位層級的說明文字一律由 definition metadata 組成，client 不重算任何驗證規則。 */
function customFieldDescription(field: ContentField): string {
  const parts: string[] = [];
  if (field.required) parts.push("發布前必填");
  if (isTextKind(field.kind)) {
    const { minLength, maxLength } = field.constraints;
    if (typeof minLength === "number" || typeof maxLength === "number") parts.push(`長度 ${typeof minLength === "number" ? minLength : 0}–${typeof maxLength === "number" ? maxLength : "不限"}`);
  }
  if (field.kind === "number") {
    const { minimum, maximum } = field.constraints;
    if (typeof minimum === "number" || typeof maximum === "number") parts.push(`範圍 ${typeof minimum === "number" ? minimum : "不限"}–${typeof maximum === "number" ? maximum : "不限"}`);
  }
  if (isMediaKind(field.kind)) {
    const mimeTypes = Array.isArray(field.constraints.mimeTypes) ? (field.constraints.mimeTypes as readonly string[]) : [];
    if (mimeTypes.length > 0) parts.push(`允許 ${mimeTypes.join("、")}`);
    if (typeof field.constraints.maxItems === "number") parts.push(`最多 ${field.constraints.maxItems} 個`);
  }
  if (field.help !== "") parts.push(field.help);
  return parts.join("；");
}

type MediaMetadataFields = Readonly<{ title: string; slug: string; altText: string; caption: string; description: string }>;
type MediaImportMetadata = Readonly<{ contract: "media-import-metadata/v2"; title: string; slug?: string; altText: string | null; caption: string; description: string }>;

function mediaFields(asset: MediaAssetV2Dto): MediaMetadataFields {
  return { title: asset.title, slug: asset.slug, altText: asset.altText ?? "", caption: asset.caption, description: asset.description };
}

/**
 * `media-import-metadata/v2` 要求 title 非空，表單留白時以檔名墊上；slug 留白則由 server 依 title 推導。
 * Replace 必須明確帶回目前 slug，否則同一 asset 會被要求重新配置一次 slug。
 */
function mediaImportMetadata(fields: MediaMetadataFields, filename: string, slug: string | undefined = undefined): MediaImportMetadata {
  const title = fields.title.trim() === "" ? filename : fields.title.trim();
  return { contract: "media-import-metadata/v2", title, ...(slug === undefined ? {} : { slug }), altText: fields.altText === "" ? null : fields.altText, caption: fields.caption, description: fields.description };
}

class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  listMedia(): Promise<MediaCatalogV2Dto> { return this.json("/v1/media", mediaCatalogV2Schema); }
  getMedia(assetId: string): Promise<MediaAssetDetailV2Dto> { return this.json(`/v1/media/${this.resourceId(assetId)}`, mediaAssetDetailV2Schema); }
  saveMediaMetadata(request: Readonly<{ assetId: string; expectedStateDigest: string; title: string; slug: string; altText: string | null; caption: string; description: string }>): Promise<MediaAssetV2Dto> {
    return this.json(`/v1/media/${this.resourceId(request.assetId)}/metadata`, mediaAssetV2Schema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "media-metadata-save-request/v2", ...request }) });
  }
  deleteMedia(request: Readonly<{ assetId: string; expectedStateDigest: string }>): Promise<Readonly<z.infer<typeof mediaDeleteReceiptV2Schema>>> {
    return this.json(`/v1/media/${this.resourceId(request.assetId)}/delete`, mediaDeleteReceiptV2Schema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "media-delete-request/v2", ...request }) });
  }
  /**
   * multipart 上傳只能走 XHR：`Content-Type` 必須由瀏覽器帶 boundary（手動設定會讓 framing 失敗），
   * 且只有 XHR 能在 file part 尚未送完前回報 upload progress。`assetId` 為 null 代表 import，否則為 replace。
   */
  uploadMedia(assetId: string | null, expectedStateDigest: string | null, file: File, metadata: MediaImportMetadata, options: Readonly<{ onProgress?: (sent: number, progressTotal: number) => void; signal?: AbortSignal }> = {}): Promise<MediaAssetV2Dto> {
    const path = assetId === null ? "/v1/media/import" : `/v1/media/${this.resourceId(assetId)}/replace`;
    const envelope: unknown = assetId === null || expectedStateDigest === null ? metadata : { contract: "media-replace-request/v2", assetId, expectedStateDigest, metadata };
    const form = new FormData();
    // metadata part 不得帶 filename：server 的 multipart framing 只接受單一無檔名 metadata part。
    form.append("metadata", JSON.stringify(envelope));
    form.append("file", file, file.name);
    return new Promise<MediaAssetV2Dto>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const signal = options.signal;
      if (signal?.aborted === true) { reject(new CmsApiError("CMS_REQUEST_ABORTED", 0, "上傳已取消。")); return; }
      request.open("POST", path);
      request.withCredentials = false;
      request.responseType = "text";
      request.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
      const abort = (): void => { request.abort(); };
      signal?.addEventListener("abort", abort, { once: true });
      request.onabort = () => reject(new CmsApiError("CMS_REQUEST_ABORTED", 0, "上傳已取消。"));
      request.onerror = () => reject(new CmsApiError("CMS_NETWORK_FAILURE", 0, "無法連線本機 CMS。"));
      request.onload = () => {
        signal?.removeEventListener("abort", abort);
        const value: unknown = ((): unknown => { try { return JSON.parse(request.responseText) as unknown; } catch { return undefined; } })();
        if (request.status < 200 || request.status >= 300) {
          const referenced = mediaAssetReferencedErrorSchema.safeParse(value);
          if (referenced.success) { reject(new CmsApiError(referenced.data.code, request.status, referenced.data.remediation.message, referenced.data.usage)); return; }
          const error = authoringErrorSchema.safeParse(value);
          if (error.success) { reject(new CmsApiError(error.data.code, request.status, error.data.remediation.message)); return; }
          reject(new CmsApiError("CMS_RESPONSE_INVALID", request.status, "CMS response 無法驗證。")); return;
        }
        const parsed = mediaAssetV2Schema.safeParse(value);
        if (!parsed.success) { reject(new CmsApiError("CMS_RESPONSE_INVALID", request.status, "CMS response 無法驗證。")); return; }
        resolve(parsed.data);
      };
      request.send(form);
    });
  }
  contentTypes(): Promise<ContentTypeCatalogDto> { return this.json("/v1/content-types", contentTypeCatalogSchema); }
  contentType(typeId: string): Promise<ContentTypeDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}`, contentTypeSchema); }
  createContentType(request: Record<string, unknown>): Promise<ContentTypeDto> { return this.json("/v1/content-types", contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  replaceContentType(typeId: string, request: Record<string, unknown>): Promise<ContentTypeDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}`, contentTypeSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  taxonomies(): Promise<TaxonomyCatalogDto> { return this.json("/v1/taxonomies", taxonomyCatalogSchema); }
  createTaxonomy(request: Readonly<{ expectedStateDigest: string; label: string; slug?: string; hierarchical: boolean }>): Promise<TaxonomySnapshotDto> { return this.json("/v1/taxonomies", taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-create-request/v2", ...request }) }); }
  taxonomy(taxonomyId: string): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}`, taxonomySnapshotSchema); }
  taxonomyCommand(taxonomyId: string, command: Readonly<Record<string, unknown>>): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}/commands`, taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-command/v2", ...command }) }); }
  entryCatalog(typeId: string): Promise<CptEntryCatalogDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntryCatalogSchema); }
  searchEntries(typeId: string, request: Readonly<{ search: string; statuses: readonly ("draft" | "published")[]; taxonomyFilters: readonly Readonly<{ taxonomyId: string; termIds: readonly string[] }>[]; page: number }>): Promise<CptEntrySearchResultDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/search`, cptEntrySearchResultSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "entry-search-request/v1", typeId, ...request }) }); }
  entry(typeId: string, entryId: string): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema); }
  createEntry(typeId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  saveEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  deleteEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<unknown> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}/delete`, cptEntryDeletedSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }

  private resourceId(value: string): string {
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(value)) throw new CmsApiError("CMS_RESPONSE_INVALID", 0, "CMS request 無法驗證。");
    return value;
  }

  private async json<T>(path: `/v1/${string}`, schema: ZodType<T> | undefined, init?: RequestInit): Promise<T> {
    const response = await this.session.authorizedFetch(path, init);
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = authoringErrorSchema.safeParse(value);
      if (error.success) throw new CmsApiError(error.data.code, response.status, error.data.remediation.message, [], error.data.subjectIds);
      const referenced = mediaAssetReferencedErrorSchema.safeParse(value);
      if (referenced.success) throw new CmsApiError(referenced.data.code, response.status, referenced.data.remediation.message, referenced.data.usage);
      throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    }
    if (schema === undefined) return value as T;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CmsApiError("CMS_RESPONSE_INVALID", response.status, "CMS response 無法驗證。");
    return parsed.data;
  }
}

type ContentTypeCatalogContextValue = Readonly<{ catalog: ContentTypeCatalogDto | undefined; refresh: () => Promise<void> }>;
const ContentTypeCatalogContext = createContext<ContentTypeCatalogContextValue | undefined>(undefined);

function ContentTypeCatalogProvider({ api, children }: Readonly<{ api: CmsApiClient; children: React.ReactNode }>): React.JSX.Element {
  const [catalog, setCatalog] = useState<ContentTypeCatalogDto>();
  const refresh = useCallback(async (): Promise<void> => { setCatalog(await api.contentTypes()); }, [api]);
  useEffect(() => { void refresh().catch(() => setCatalog(undefined)); }, [refresh]);
  const value = useMemo(() => ({ catalog, refresh }), [catalog, refresh]);
  return <ContentTypeCatalogContext.Provider value={value}>{children}</ContentTypeCatalogContext.Provider>;
}


function PageHeading({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { heading.current?.focus(); }, [pathname]);
  return <h1 ref={heading} id="page-title" tabIndex={-1}>{children}</h1>;
}

function Layout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const catalog = useContext(ContentTypeCatalogContext);
  const location = useLocation();
  const menuItems = contentTypeDisplayOrder(catalog?.catalog?.items ?? []).filter((item) => item.showInMenu);
  // 動態內容選單以路徑中的 typeId 判定 active，避免每個項目同時亮起。
  const activeTypeId = location.pathname.startsWith("/cms/content/") ? location.pathname.slice("/cms/content/".length) : undefined;
  return <><a className="skip" href="#page-title">跳到主標題</a><header><p>本機 CMS 已連線。</p><nav aria-label="CMS 導覽"><NavLink to="/cms" end>首頁</NavLink>{menuItems.map((item) => <Link key={item.typeId} to={postPath(item.typeId)} aria-current={item.typeId === activeTypeId ? "page" : undefined}>{item.label}</Link>)}<NavLink to="/cms/media">媒體庫</NavLink><NavLink to="/cms/content-types">內容類型</NavLink><NavLink to="/cms/taxonomies">分類</NavLink></nav></header><main id="workspace" aria-labelledby="page-title">{children}</main></>;
}

function postPath(typeId: string): string {
  return `/cms/content/${typeId}`;
}

type EntryForm = Readonly<{ title: string; slug: string; excerpt: string; text: string; blocks: readonly StructuredBlock[]; seoTitle: string; seoDescription: string; canonicalPath: string; featuredMedia: string; taxonomyTerms: readonly TaxonomyTermIdentity[]; status: "draft" | "published"; custom: Readonly<Record<string, unknown>> }>;

const emptyEntryForm: EntryForm = { title: "", slug: "", excerpt: "", text: "", blocks: [], seoTitle: "", seoDescription: "", canonicalPath: "", featuredMedia: "", taxonomyTerms: [], status: "draft", custom: {} };

function entryArticleText(entry: CptEntryDto): string {
  const article = entry.content.blocks.find((block) => block.kind === "article");
  return article === undefined ? "" : article.text;
}

function entryFormOf(entry: CptEntryDto): EntryForm {
  return { title: entry.content.title, slug: entry.slug, excerpt: entry.content.excerpt, text: entryArticleText(entry), blocks: entry.content.blocks, seoTitle: entry.content.seo.title ?? "", seoDescription: entry.content.seo.description ?? "", canonicalPath: entry.content.seo.canonicalPath ?? "", featuredMedia: entry.content.featuredMedia ?? "", taxonomyTerms: entry.taxonomyTerms, status: entry.status, custom: customValuesOf(entry) };
}

/** 只有實際渲染出來的 field 才能成為 focus 目標；其他 subjectIds 退回 form 層訊息。 */
function renderedCustomFieldIds(definition: ContentTypeDto | undefined, subjectIds: readonly string[]): readonly string[] {
  if (definition === undefined) return [];
  const rendered = new Set(definition.fieldGroups.flatMap((group) => group.fields.map((field) => field.fieldId)));
  return subjectIds.filter((fieldId) => rendered.has(fieldId));
}

/**
 * 本文只編輯第一個 article block；其餘 body block（含其他 article block）原樣留在原位置，
 * 避免 Save 靜默刪除或改寫它們。無法辨識單一本文的 entry 在 refreshEntry 就被拒絕編輯。
 */
function cptBlocksOf(form: EntryForm): readonly StructuredBlock[] {
  let replaced = false;
  const blocks = form.blocks.map((block) => {
    if (block.kind !== "article" || replaced) return block;
    replaced = true;
    return { kind: "article" as const, text: form.text };
  });
  // 新內容沒有任何既有 block，本文由 server 驗證的單一 article block 表示。
  return replaced ? blocks : [{ kind: "article" as const, text: form.text }, ...blocks];
}

function articleBlockCount(blocks: readonly StructuredBlock[]): number {
  return blocks.filter((block) => block.kind === "article").length;
}

function cptContentOf(typeId: string, form: EntryForm): unknown {
  return { contract: "cpt-content/v1", typeId, title: form.title, blocks: cptBlocksOf(form), excerpt: form.excerpt, seo: { ...(form.seoTitle.trim() === "" ? {} : { title: form.seoTitle }), ...(form.seoDescription.trim() === "" ? {} : { description: form.seoDescription }), ...(form.canonicalPath.trim() === "" ? {} : { canonicalPath: form.canonicalPath }) }, ...(form.featuredMedia === "" ? {} : { featuredMedia: form.featuredMedia }), customValues: customValuesRequest(form.custom) };
}

function cptEntryStatusText(status: CptEntryDto["status"]): string {
  return status === "draft" ? "草稿" : "已發布";
}

function mediaChoiceLabel(asset: MediaAssetV2Dto): string {
  return `${asset.title} · ${asset.originalFilename} (${asset.mimeType})`;
}

/**
 * entry editor 的自訂欄位控制項：只依 definition metadata 渲染，不套任何 HTML constraint，
 * 也不重算 server 的驗證規則（required 只以 aria-required 與文字呈現）。
 */
function CustomFieldControl({ field, index, value, invalid, disabled, assets, onChange }: Readonly<{ field: ContentField; index: number; value: unknown; invalid: boolean; disabled: boolean; assets: readonly MediaAssetV2Dto[]; onChange: (value: unknown) => void }>): React.JSX.Element {
  const description = customFieldDescription(field);
  const descriptionId = `custom-field-description-${index}`;
  const errorId = `custom-field-error-${index}`;
  const describedBy = [description === "" ? undefined : descriptionId, invalid ? errorId : undefined].filter((id) => id !== undefined).join(" ");
  const accessibility = { "aria-describedby": describedBy === "" ? undefined : describedBy, "aria-required": field.required ? true : undefined };
  const textValue = typeof value === "string" ? value : "";
  const hint = description === "" ? undefined : <span id={descriptionId}>（{description}）</span>;
  const issue = invalid ? <p id={errorId} className="field-issue">此欄位未通過發布驗證。</p> : undefined;
  if (field.kind === "boolean" || field.kind === "multi-select" || field.kind === "multi-media") {
    const legend = `${field.label}${field.required ? "（必填）" : ""}`;
    // presence-sensitive kinds 一律能表示「未設定」：boolean 用三態、multi 值清空即移除 key。
    const body = field.kind === "boolean"
      ? <select aria-label={field.label} value={value === undefined ? "unset" : value === true ? "true" : "false"} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value === "unset" ? undefined : event.target.value === "true")} disabled={disabled}><option value="unset">未設定</option><option value="true">是</option><option value="false">否</option></select>
      : field.kind === "multi-select"
        ? (field.options ?? []).map((option) => <label key={option.optionId}><input type="checkbox" aria-label={option.label} checked={Array.isArray(value) && value.includes(option.optionId)} aria-invalid={invalid || undefined} onChange={(event) => { const current = Array.isArray(value) ? (value as readonly string[]) : []; const next = event.target.checked ? [...current, option.optionId] : current.filter((item) => item !== option.optionId); onChange(next.length === 0 ? undefined : next); }} disabled={disabled} />{option.label}</label>)
        : assets.filter((asset) => !Array.isArray(field.constraints.mimeTypes) || field.constraints.mimeTypes.includes(asset.mimeType)).map((asset) => <label key={asset.assetId}><input type="checkbox" checked={Array.isArray(value) && value.includes(asset.assetId)} onChange={(event) => { const current = Array.isArray(value) ? value as readonly string[] : []; const next = event.target.checked ? [...current, asset.assetId] : current.filter((id) => id !== asset.assetId); onChange(next.length === 0 ? undefined : next); }} disabled={disabled} />{mediaChoiceLabel(asset)}</label>);
    return <fieldset className="custom-field" data-custom-field={field.fieldId} tabIndex={-1} {...accessibility}>{<legend>{legend}</legend>}{hint}{body}{issue}</fieldset>;
  }
  if (field.kind === "single-select") return <label className="custom-field">{field.label}{field.required && "（必填）"}<select value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled}><option value="">未選擇</option>{(field.options ?? []).map((option) => <option key={option.optionId} value={option.optionId}>{option.label}</option>)}</select>{hint}{issue}</label>;
  if (field.kind === "single-media") return <label className="custom-field">{field.label}{field.required && "（必填）"}<select value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled}><option value="">未選擇</option>{assets.filter((asset) => !Array.isArray(field.constraints.mimeTypes) || field.constraints.mimeTypes.includes(asset.mimeType)).map((asset) => <option key={asset.assetId} value={asset.assetId}>{mediaChoiceLabel(asset)}</option>)}</select>{hint}{issue}</label>;
  if (field.kind === "textarea") return <label className="custom-field">{field.label}{field.required && "（必填）"}<textarea value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "number") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="number" value={typeof value === "number" ? String(value) : ""} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value.trim() === "" ? undefined : Number(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "datetime") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="datetime-local" value={isoToDatetimeLocal(value)} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(datetimeLocalToIso(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "date") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="date" value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  // text 的空字串是合法的明示空值；url／single-media 的空輸入代表移除該值。
  const clearsOnEmpty = field.kind !== "text";
  const placeholder = field.kind === "url" ? "https://example.com" : undefined;
  return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="text" value={textValue} placeholder={placeholder} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(clearsOnEmpty && event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
}

function CustomFieldsSection({ definition, values, invalidFieldIds, disabled, assets, onChange }: Readonly<{ definition: ContentTypeDto; values: Readonly<Record<string, unknown>>; invalidFieldIds: readonly string[]; disabled: boolean; assets: readonly MediaAssetV2Dto[]; onChange: (fieldId: string, value: unknown) => void }>): React.JSX.Element | null {
  if (definition.fieldGroups.length === 0) return null;
  const positions = new Map<string, number>();
  let position = -1;
  for (const group of definition.fieldGroups) for (const field of group.fields) positions.set(field.fieldId, ++position);
  return <section aria-labelledby="custom-fields-heading">
    <h2 id="custom-fields-heading">自訂欄位</h2>
    {definition.fieldGroups.map((group) => <fieldset key={group.groupId}><legend>{group.label}</legend>{group.help !== "" && <p>{group.help}</p>}{group.fields.map((field) => <CustomFieldControl key={field.fieldId} field={field} index={positions.get(field.fieldId) ?? 0} value={values[field.fieldId]} invalid={invalidFieldIds.includes(field.fieldId)} disabled={disabled} assets={assets} onChange={(value) => onChange(field.fieldId, value)} />)}</fieldset>)}
  </section>;
}

function PostWorkspace({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { typeId } = useParams();
  return typeId === undefined
    ? <Layout><PageHeading>內容</PageHeading><p role="alert">找不到內容類型。</p></Layout>
    : <PostCatalog key={typeId} api={api} typeId={typeId} />;
}

function PostCatalog({ api, typeId }: Readonly<{ api: CmsApiClient; typeId: string }>): React.JSX.Element {
  const reload = useRef<HTMLButtonElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const confirmDelete = useRef<HTMLButtonElement>(null);
  const editingEntryId = useRef<string | undefined>(undefined);
  const [definition, setDefinition] = useState<ContentTypeDto>();
  const [catalog, setCatalog] = useState<CptEntryCatalogDto>();
  const [assets, setAssets] = useState<readonly MediaAssetV2Dto[]>([]);
  const [taxonomies, setTaxonomies] = useState<readonly TaxonomySnapshotDto[]>([]);
  const [newTermLabels, setNewTermLabels] = useState<Readonly<Record<string, string>>>({});
  const [searchResult, setSearchResult] = useState<CptEntrySearchResultDto>();
  const searchGeneration = useRef(0);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [filterTaxonomy, setFilterTaxonomy] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"create" | "edit">();
  // 每次開啟或切換編輯對象都遞增，讓 focus 由 render 後的 effect 執行（不用 mouse-only 的選取路徑）。
  const [editorToken, setEditorToken] = useState(0);
  const [form, setForm] = useState<EntryForm>();
  const [baseline, setBaseline] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "delete">();
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  // 只有實際渲染出來的 field 才會進到這裡；其他 subjectIds 留在 form 層訊息。
  const [customErrors, setCustomErrors] = useState<readonly string[]>([]);
  const createInlineTerm = async (taxonomy: TaxonomySnapshotDto, cardinality: "one" | "many"): Promise<void> => {
    const label = newTermLabels[taxonomy.taxonomy.taxonomyId]?.trim() ?? "";
    if (label === "") return;
    try {
      const updated = await api.taxonomyCommand(taxonomy.taxonomy.taxonomyId, { kind: "create-term", expectedStateDigest: taxonomy.stateDigest, label, order: taxonomy.terms.length });
      const created = updated.terms.find((term) => !taxonomy.terms.some((existing) => existing.termId === term.termId));
      setTaxonomies((items) => items.map((item) => item.taxonomy.taxonomyId === updated.taxonomy.taxonomyId ? updated : item));
      if (created !== undefined && form !== undefined) setForm({ ...form, taxonomyTerms: [...(cardinality === "one" ? form.taxonomyTerms.filter((item) => item.taxonomyId !== updated.taxonomy.taxonomyId) : form.taxonomyTerms), { taxonomyId: updated.taxonomy.taxonomyId, termId: created.termId }] });
      setNewTermLabels((values) => ({ ...values, [taxonomy.taxonomy.taxonomyId]: "" }));
    } catch (reason) { setError(message(reason)); }
  };
  const refreshSearch = useCallback(async (): Promise<void> => {
    const generation = ++searchGeneration.current;
    setSearchResult(undefined);
    try {
      const result = await api.searchEntries(typeId, { search: searchText, statuses: statusFilter === "all" ? [] : [statusFilter], taxonomyFilters: filterTaxonomy === "" || filterTerm === "" ? [] : [{ taxonomyId: filterTaxonomy, termIds: [filterTerm] }], page });
      if (generation === searchGeneration.current) setSearchResult(result);
    } catch (reason) {
      if (generation === searchGeneration.current) throw reason;
    }
  }, [api, typeId, searchText, statusFilter, filterTaxonomy, filterTerm, page]);
  useEffect(() => { void refreshSearch().catch((reason: unknown) => setError(message(reason))); return () => { searchGeneration.current += 1; }; }, [refreshSearch]);

  const refreshEntry = useCallback(async (entryId: string, focusEditor: boolean): Promise<void> => {
    const entry = await api.entry(typeId, entryId);
    // 「本文」只有在恰好一個 article block 時才有唯一意義；否則 fail closed，不由 UI 猜測要改哪一段。
    if (articleBlockCount(entry.content.blocks) !== 1) {
      editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setBaseline(undefined);
      throw new CmsApiError("CMS_ENTRY_NOT_EDITABLE", 0, "這筆內容的 article block 不是恰好一個，無法在 CMS 編輯本文；請以 API 調整 block 後再試。");
    }
    editingEntryId.current = entryId;
    setMode("edit"); setForm(entryFormOf(entry)); setBaseline(entry.stateDigest); setCustomErrors([]);
    if (focusEditor) setEditorToken((value) => value + 1);
  }, [api, typeId]);
  /** 重新載入一律以 server 的最新 state 重建畫面：catalog 與（若編輯器開著）目前 entry 的 baseline。 */
  const load = useCallback((): void => {
    setLoading(true); setError(undefined); setConflict(false);
    void (async () => {
      try {
        const [nextDefinition, nextCatalog, media] = await Promise.all([api.contentType(typeId), api.entryCatalog(typeId), api.listMedia()]);
        setDefinition(nextDefinition); setCatalog(nextCatalog);
        setAssets(media.items);
        setTaxonomies(await Promise.all(nextDefinition.taxonomyAttachments.map((attachment) => api.taxonomy(attachment.taxonomyId))));
        const entryId = editingEntryId.current;
        if (entryId !== undefined) await refreshEntry(entryId, true);
      } catch (reason) {
        if (reason instanceof CmsApiError && reason.status === 404 && editingEntryId.current !== undefined) {
          editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setBaseline(undefined); setNotice("這筆內容已不存在。");
        } else setError(message(reason));
      } finally { setLoading(false); }
    })();
  }, [api, refreshEntry, typeId]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict) reload.current?.focus(); }, [conflict]);
  useEffect(() => { if (notice !== "") status.current?.focus(); }, [notice]);
  useEffect(() => { if (editorToken > 0) editorHeading.current?.focus(); }, [editorToken]);
  useEffect(() => {
    const first = customErrors[0];
    if (first === undefined) return;
    document.querySelector<HTMLElement>(`[data-custom-field="${first}"]`)?.focus();
  }, [customErrors]);

  const startCreate = (): void => {
    editingEntryId.current = undefined;
    setMode("create"); setForm(definition === undefined ? emptyEntryForm : { ...emptyEntryForm, custom: customDefaultsOf(definition) }); setBaseline(undefined); setEditorToken((value) => value + 1);
    setConflict(false); setError(undefined); setNotice(""); setCustomErrors([]);
  };
  const valid = form !== undefined && form.title.trim() !== "" && form.text.trim() !== "";
  const locked = busy !== undefined || conflict;
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!valid || form === undefined || mode === undefined || catalog === undefined || locked) return;
    setBusy("save"); setError(undefined); setNotice(""); setCustomErrors([]);
    try {
      const content = cptContentOf(typeId, form);
      const saved = mode === "create"
        ? await api.createEntry(typeId, { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, ...(form.slug.trim() === "" ? {} : { slug: form.slug.trim() }), content, taxonomyTerms: form.taxonomyTerms, status: form.status })
        : await api.saveEntry(typeId, editingEntryId.current ?? "", { contract: "cpt-entry-save-request/v1", expectedStateDigest: baseline ?? "", slug: form.slug.trim(), content, taxonomyTerms: form.taxonomyTerms, status: form.status });
      editingEntryId.current = saved.entryId;
      setMode("edit"); setForm(entryFormOf(saved)); setBaseline(saved.stateDigest);
      setCatalog(await api.entryCatalog(typeId));
      await refreshSearch();
      setNotice("已儲存。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else if (reason instanceof CmsApiError && reason.code === "INVALID_ENTRY_CUSTOM_VALUES") { setCustomErrors(renderedCustomFieldIds(definition, reason.subjectIds)); setError(reason.remediation); }
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const remove = async (): Promise<void> => {
    if (mode !== "edit" || editingEntryId.current === undefined || baseline === undefined || locked) return;
    setBusy("delete"); setError(undefined); setNotice("");
    try {
      await api.deleteEntry(typeId, editingEntryId.current, { contract: "cpt-entry-delete-request/v1", expectedStateDigest: baseline });
      dialog.current?.close();
      editingEntryId.current = undefined; setMode(undefined); setForm(undefined); setBaseline(undefined);
      setCatalog(await api.entryCatalog(typeId));
      await refreshSearch();
      setNotice("已刪除。");
    } catch (reason) {
      dialog.current?.close();
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const trapDeleteFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelDelete.current) { event.preventDefault(); confirmDelete.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirmDelete.current) { event.preventDefault(); cancelDelete.current?.focus(); }
  };
  useEffect(() => {
    const element = dialog.current;
    const close = (): void => deleteTrigger.current?.focus();
    element?.addEventListener("cancel", close);
    return () => element?.removeEventListener("cancel", close);
  }, []);

  const operationStatus = busy === "save" ? "正在儲存內容…" : busy === "delete" ? "正在刪除內容…" : notice;

  if (loading && definition === undefined) return <Layout><PageHeading key={typeId}>內容</PageHeading><p role="status" aria-live="polite" aria-busy="true">正在載入內容。</p></Layout>;
  if (definition === undefined || catalog === undefined) return <Layout><PageHeading key={typeId}>內容</PageHeading><p role="alert">{error ?? "內容類型無法載入。"}</p><button ref={reload} onClick={load}>重試</button></Layout>;
  return <Layout>
    <PageHeading key={typeId}>{definition.label}內容</PageHeading>
    <p><Link to="/cms/content-types">管理內容類型</Link>（system fields：{definition.systemFields.join("、")}）</p>
    {error !== undefined && <p role="alert">{error}</p>}
    {conflict && <><p role="alert">這筆內容已由另一個頁面更新，表單的 baseline 已過期。</p><button ref={reload} onClick={load}>重新載入內容</button></>}
    <p ref={status} role="status" tabIndex={-1} aria-live="polite" aria-atomic="true">{operationStatus}</p>
    <section aria-labelledby="entry-catalog-heading">
      <h2 id="entry-catalog-heading">內容清單</h2>
      <p><button type="button" onClick={startCreate} disabled={locked}>建立內容</button></p>
      <label>搜尋標題或 Slug<input value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1); }} /></label>
      <label>狀態<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "all" | "draft" | "published"); setPage(1); }}><option value="all">全部</option><option value="draft">草稿</option><option value="published">已發布</option></select></label>
      <label>分類<select value={filterTaxonomy} onChange={(event) => { setFilterTaxonomy(event.target.value); setFilterTerm(""); setPage(1); }}><option value="">全部</option>{taxonomies.map((taxonomy) => <option key={taxonomy.taxonomy.taxonomyId} value={taxonomy.taxonomy.taxonomyId}>{taxonomy.taxonomy.label}</option>)}</select></label>
      {filterTaxonomy !== "" && <label>Term<select value={filterTerm} onChange={(event) => { setFilterTerm(event.target.value); setPage(1); }}><option value="">全部</option>{taxonomies.find((item) => item.taxonomy.taxonomyId === filterTaxonomy)?.terms.map((term) => <option key={term.termId} value={term.termId}>{term.label}</option>)}</select></label>}
      {searchResult === undefined ? <p role="status">正在搜尋內容。</p> : <><p>{searchResult.totalItems} 筆結果；第 {searchResult.page}／{Math.max(1, searchResult.totalPages)} 頁</p>{searchResult.items.length === 0 ? <p>沒有符合條件的內容。</p> : <table><caption>{definition.label}的搜尋結果</caption><thead><tr><th scope="col">標題</th><th scope="col">Slug</th><th scope="col">狀態</th><th scope="col">最後發布</th></tr></thead><tbody>{searchResult.items.map((item) => <tr key={item.entryId}><td><button type="button" aria-current={item.entryId === editingEntryId.current ? "true" : undefined} onClick={() => void refreshEntry(item.entryId, true).catch((reason: unknown) => setError(message(reason)))}>{item.title}</button></td><td>{item.slug}</td><td>{cptEntryStatusText(item.status)}</td><td>{item.publishedAt ?? "尚未發布"}</td></tr>)}</tbody></table>}<p><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button><button type="button" disabled={page >= searchResult.totalPages} onClick={() => setPage(page + 1)}>下一頁</button></p></>}
    </section>
    {mode !== undefined && form !== undefined && <section aria-labelledby="entry-editor-heading">
      <h2 id="entry-editor-heading" ref={editorHeading} tabIndex={-1}>{mode === "create" ? "建立內容" : "編輯內容"}</h2>
      <p>{form.blocks.length <= 1 ? "本文以外的區塊會原樣保留。" : `這個內容另有 ${String(form.blocks.length - 1)} 個非本文區塊；儲存時會原樣保留在原本位置。`}</p>
      <form aria-label="內容編輯" noValidate onSubmit={(event) => void save(event)}>
        <label>標題<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={locked} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} disabled={locked} /></label>
        <label>摘要<textarea value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} disabled={locked} /></label>
        <label>本文<textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} disabled={locked} /></label>
        <label>特色媒體<select value={form.featuredMedia} onChange={(event) => setForm({ ...form, featuredMedia: event.target.value })} disabled={locked}><option value="">未選擇</option>{assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{mediaChoiceLabel(asset)}</option>)}</select></label>
        <section aria-labelledby="entry-taxonomy-heading"><h3 id="entry-taxonomy-heading">分類與標籤</h3>{definition.taxonomyAttachments.map((attachment) => { const taxonomy = taxonomies.find((item) => item.taxonomy.taxonomyId === attachment.taxonomyId); if (taxonomy === undefined) return null; const selected = form.taxonomyTerms.filter((item) => item.taxonomyId === attachment.taxonomyId).map((item) => item.termId); return <fieldset key={attachment.taxonomyId} disabled={locked}><legend>{taxonomy.taxonomy.label}{attachment.required ? "（發布時必填）" : ""}</legend>{attachment.cardinality === "one" ? <select aria-label={taxonomy.taxonomy.label} value={selected[0] ?? ""} onChange={(event) => setForm({ ...form, taxonomyTerms: [...form.taxonomyTerms.filter((item) => item.taxonomyId !== attachment.taxonomyId), ...(event.target.value === "" ? [] : [{ taxonomyId: attachment.taxonomyId, termId: event.target.value }])] })}><option value="">未選擇</option>{taxonomy.terms.filter((term) => term.state === "live" || selected.includes(term.termId)).map((term) => <option key={term.termId} value={term.termId}>{term.label}{term.state === "retired" ? "（已停用）" : ""}</option>)}</select> : taxonomy.terms.filter((term) => term.state === "live" || selected.includes(term.termId)).map((term) => <label key={term.termId}><input type="checkbox" checked={selected.includes(term.termId)} onChange={(event) => setForm({ ...form, taxonomyTerms: event.target.checked ? [...form.taxonomyTerms, { taxonomyId: attachment.taxonomyId, termId: term.termId }] : form.taxonomyTerms.filter((item) => item.taxonomyId !== attachment.taxonomyId || item.termId !== term.termId) })} />{term.label}</label>)}{attachment.allowTermCreation && <div><label>新增 term<input value={newTermLabels[attachment.taxonomyId] ?? ""} onChange={(event) => setNewTermLabels((values) => ({ ...values, [attachment.taxonomyId]: event.target.value }))} /></label><button type="button" onClick={() => void createInlineTerm(taxonomy, attachment.cardinality)} disabled={(newTermLabels[attachment.taxonomyId] ?? "").trim() === ""}>建立並選取</button></div>}</fieldset>; })}</section>
        {definition !== undefined && <CustomFieldsSection definition={definition} values={form.custom} invalidFieldIds={customErrors} disabled={locked} assets={assets} onChange={(fieldId, value) => setForm({ ...form, custom: value === undefined ? Object.fromEntries(Object.entries(form.custom).filter(([key]) => key !== fieldId)) : { ...form.custom, [fieldId]: value } })} />}
        <fieldset disabled={locked}><legend>SEO</legend><label>SEO 標題<input value={form.seoTitle} onChange={(event) => setForm({ ...form, seoTitle: event.target.value })} /></label><label>Meta description<textarea value={form.seoDescription} onChange={(event) => setForm({ ...form, seoDescription: event.target.value })} /></label><label>Canonical path<input value={form.canonicalPath} onChange={(event) => setForm({ ...form, canonicalPath: event.target.value })} /></label></fieldset>
        <fieldset disabled={locked}><legend>狀態</legend><label><input type="radio" name="entry-status" checked={form.status === "draft"} onChange={() => setForm({ ...form, status: "draft" })} />草稿</label><label><input type="radio" name="entry-status" checked={form.status === "published"} onChange={() => setForm({ ...form, status: "published" })} />已發布</label></fieldset>
        <p><button type="submit" disabled={!valid || locked}>{busy === "save" ? "正在儲存…" : "儲存"}</button>{mode === "edit" && <button ref={deleteTrigger} type="button" onClick={() => { dialog.current?.showModal(); cancelDelete.current?.focus(); }} disabled={locked}>刪除內容</button>}</p>
      </form>
      <dialog ref={dialog} aria-labelledby="delete-dialog-title" onKeyDown={trapDeleteFocus}><h2 id="delete-dialog-title">刪除內容</h2><p>刪除後這筆內容與其 slug 會立即消失，無法復原。</p><button ref={cancelDelete} type="button" onClick={() => { dialog.current?.close(); deleteTrigger.current?.focus(); }} disabled={busy !== undefined}>取消</button><button ref={confirmDelete} type="button" onClick={() => void remove()} disabled={busy !== undefined}>{busy === "delete" ? "正在刪除…" : "確認刪除"}</button></dialog>
    </section>}
  </Layout>;
}

function newFieldDraft(): FieldDraft {
  return { key: draftKey(), fieldId: undefined, kind: "text", label: "", help: "", required: false, showInGenericTemplate: false, minLength: "", maxLength: "", minimum: "", maximum: "", mimeTypes: "", maxItems: "", options: [], defaultText: "", defaultBoolean: "unset", defaultOptionKey: "", defaultOptionKeys: [] };
}

function newGroupDraft(): FieldGroupDraft {
  return { key: draftKey(), groupId: undefined, label: "", help: "", fields: [] };
}

/** 切換 kind 會清掉不適用的 draft 狀態，避免把上一個 kind 的 constraints 或 default 送出。 */
function fieldDraftWithKind(field: FieldDraft, kind: ContentFieldKind): FieldDraft {
  const keepsOptions = isSelectKind(kind) && isSelectKind(field.kind);
  return { ...field, kind, minLength: "", maxLength: "", minimum: "", maximum: "", mimeTypes: "", maxItems: "", options: keepsOptions ? field.options : [], defaultText: "", defaultBoolean: "unset", defaultOptionKey: "", defaultOptionKeys: [] };
}

/**
 * Content Type Builder 的欄位群組編輯器。state 由呼叫端的 `definition`／response 導出並以 stateDigest
 * 為 key 掛載，因此 CAS token 與 payload 永遠同源，server 配置的 stable ID 也會在儲存後立刻回到 draft。
 */
function ContentTypeFieldGroupsEditor({ groups, issues, disabled, onChange }: Readonly<{ groups: readonly FieldGroupDraft[]; issues: ReadonlyMap<string, string>; disabled: boolean; onChange: (next: readonly FieldGroupDraft[]) => void }>): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");
  const moveFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = moveFocus.current;
    if (key === undefined || !groups.some((group) => group.key === key.split("\u0000")[0])) return;
    document.querySelector<HTMLElement>(`[data-move-key="${key}"]`)?.focus();
  }, [groups]);
  const nameOf = (value: string): string => value.trim() === "" ? "未命名" : value.trim();
  const issueId = (key: string): string => `${key}-issue`;
  const issueFor = (key: string): React.JSX.Element | undefined => { const text = issues.get(key); return text === undefined ? undefined : <p id={issueId(key)} className="field-issue">{text}</p>; };
  const issueKeys = (key: string): string | undefined => issues.get(key) === undefined ? undefined : issueId(key);
  const groupAt = (index: number): FieldGroupDraft | undefined => groups[index];
  const replaceGroup = (index: number, next: FieldGroupDraft): void => onChange(groups.map((group, position) => position === index ? next : group));
  const replaceField = (groupIndex: number, fieldIndex: number, next: FieldDraft): void => {
    const group = groupAt(groupIndex);
    if (group === undefined) return;
    replaceGroup(groupIndex, { ...group, fields: group.fields.map((field, position) => position === fieldIndex ? next : field) });
  };
  const moveGroup = (index: number, delta: number): void => { const next = moveWithin(groups, index, delta); if (next === groups) return; moveFocus.current = `${groups[index]!.key}\u0000group`; onChange(next); setAnnouncement(`群組「${nameOf(groups[index]!.label)}」已移至第 ${index + delta + 1} 位。`); };
  const moveField = (groupIndex: number, fieldIndex: number, delta: number): void => { const group = groupAt(groupIndex); if (group === undefined) return; const next = moveWithin(group.fields, fieldIndex, delta); if (next === group.fields) return; moveFocus.current = `${group.key}\u0000${group.fields[fieldIndex]!.key}`; replaceGroup(groupIndex, { ...group, fields: next }); setAnnouncement(`欄位「${nameOf(group.fields[fieldIndex]!.label)}」已移至第 ${fieldIndex + delta + 1} 位。`); };
  const moveOption = (groupIndex: number, fieldIndex: number, optionIndex: number, delta: number): void => { const group = groupAt(groupIndex); const field = group?.fields[fieldIndex]; if (group === undefined || field === undefined) return; const next = moveWithin(field.options, optionIndex, delta); if (next === field.options) return; moveFocus.current = `${group.key}\u0000${field.key}\u0000${field.options[optionIndex]!.key}`; replaceField(groupIndex, fieldIndex, { ...field, options: next }); setAnnouncement(`選項「${nameOf(field.options[optionIndex]!.label)}」已移至第 ${optionIndex + delta + 1} 位。`); };
  return <section aria-labelledby="field-groups-heading">
    <h2 id="field-groups-heading">欄位群組</h2>
    <p>群組、欄位與選項的順序就是 CMS 編輯器的呈現順序；stable ID 由 server 配置，儲存後才會顯示。</p>
    <p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {groups.map((group, groupIndex) => <fieldset key={group.key} className="field-group">
      <legend>{nameOf(group.label)}</legend>
      <label>群組名稱<input value={group.label} aria-invalid={issues.has(group.key)} aria-describedby={issueKeys(group.key)} onChange={(event) => replaceGroup(groupIndex, { ...group, label: event.target.value })} disabled={disabled} /></label>
      <label>群組說明<textarea value={group.help} onChange={(event) => replaceGroup(groupIndex, { ...group, help: event.target.value })} disabled={disabled} /></label>
      {issueFor(group.key)}
      <p>
        <button type="button" data-move-key={`${group.key}\u0000group`} aria-label={`將群組「${nameOf(group.label)}」上移`} onClick={() => moveGroup(groupIndex, -1)} disabled={disabled || groupIndex === 0}>上移</button>
        <button type="button" aria-label={`將群組「${nameOf(group.label)}」下移`} onClick={() => moveGroup(groupIndex, 1)} disabled={disabled || groupIndex === groups.length - 1}>下移</button>
        <button type="button" aria-label={`刪除群組「${nameOf(group.label)}」`} onClick={() => onChange(groups.filter((_, position) => position !== groupIndex))} disabled={disabled}>刪除群組</button>
      </p>
      {group.fields.map((field, fieldIndex) => <fieldset key={field.key} className="field-definition">
        <legend>{nameOf(field.label)}</legend>
        <label>欄位名稱<input value={field.label} aria-invalid={issues.has(field.key)} aria-describedby={issueKeys(field.key)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, label: event.target.value })} disabled={disabled} /></label>
        <label>欄位類型<select value={field.kind} onChange={(event) => replaceField(groupIndex, fieldIndex, fieldDraftWithKind(field, event.target.value as ContentFieldKind))} disabled={disabled}>{(Object.keys(fieldKindLabels) as ContentFieldKind[]).map((kind) => <option key={kind} value={kind}>{fieldKindLabels[kind]}</option>)}</select></label>
        <label>欄位說明<textarea value={field.help} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, help: event.target.value })} disabled={disabled} /></label>
        <p><label><input type="checkbox" checked={field.required} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, required: event.target.checked })} disabled={disabled} />必填</label> <label><input type="checkbox" checked={field.showInGenericTemplate} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, showInGenericTemplate: event.target.checked })} disabled={disabled} />顯示於一般模板（僅意圖）</label></p>
        {isTextKind(field.kind) && <p><label>最小長度<input type="number" value={field.minLength} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, minLength: event.target.value })} disabled={disabled} /></label> <label>最大長度<input type="number" value={field.maxLength} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maxLength: event.target.value })} disabled={disabled} /></label></p>}
        {field.kind === "number" && <p><label>最小值<input type="number" value={field.minimum} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, minimum: event.target.value })} disabled={disabled} /></label> <label>最大值<input type="number" value={field.maximum} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maximum: event.target.value })} disabled={disabled} /></label></p>}
        {isMediaKind(field.kind) && <p><label>允許的 MIME types（每行一個）<textarea value={field.mimeTypes} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, mimeTypes: event.target.value })} disabled={disabled} /></label>{field.kind === "multi-media" && <label>數量上限<input type="number" value={field.maxItems} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, maxItems: event.target.value })} disabled={disabled} /></label>}</p>}
        {isSelectKind(field.kind) && <fieldset>
          <legend>選項</legend>
          {field.options.map((option, optionIndex) => <p key={option.key}>
            <label>選項名稱<input value={option.label} aria-invalid={issues.has(`${field.key}:${option.key}`)} aria-describedby={issueKeys(`${field.key}:${option.key}`)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, options: field.options.map((candidate, position) => position === optionIndex ? { ...candidate, label: event.target.value } : candidate) })} disabled={disabled} /></label>
            <button type="button" data-move-key={`${group.key}\u0000${field.key}\u0000${option.key}`} aria-label={`將選項「${nameOf(option.label)}」上移`} onClick={() => moveOption(groupIndex, fieldIndex, optionIndex, -1)} disabled={disabled || optionIndex === 0}>上移</button>
            <button type="button" aria-label={`將選項「${nameOf(option.label)}」下移`} onClick={() => moveOption(groupIndex, fieldIndex, optionIndex, 1)} disabled={disabled || optionIndex === field.options.length - 1}>下移</button>
            <button type="button" aria-label={`刪除選項「${nameOf(option.label)}」`} onClick={() => replaceField(groupIndex, fieldIndex, { ...field, options: field.options.filter((_, position) => position !== optionIndex), defaultOptionKey: field.defaultOptionKey === option.key ? "" : field.defaultOptionKey, defaultOptionKeys: field.defaultOptionKeys.filter((key) => key !== option.key) })} disabled={disabled}>刪除選項</button>
          </p>)}
          <button type="button" onClick={() => replaceField(groupIndex, fieldIndex, { ...field, options: [...field.options, { key: draftKey(), optionId: undefined, label: "" }] })} disabled={disabled}>新增選項</button>
          {field.kind === "single-select"
            ? <label>預設值<select value={field.defaultOptionKey} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultOptionKey: event.target.value })} disabled={disabled}><option value="">未設定</option>{field.options.map((option) => <option key={option.key} value={option.key}>{nameOf(option.label)}</option>)}</select></label>
            : <fieldset><legend>預設值</legend>{field.options.length === 0 ? <p>尚無選項。</p> : field.options.map((option) => <label key={option.key}><input type="checkbox" checked={field.defaultOptionKeys.includes(option.key)} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultOptionKeys: event.target.checked ? [...field.defaultOptionKeys, option.key] : field.defaultOptionKeys.filter((key) => key !== option.key) })} disabled={disabled} />{nameOf(option.label)}</label>)}</fieldset>}
        </fieldset>}
        {!isSelectKind(field.kind) && (field.kind === "boolean"
          ? <label>預設值<select value={field.defaultBoolean} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultBoolean: event.target.value as FieldDraft["defaultBoolean"] })} disabled={disabled}><option value="unset">未設定</option><option value="true">是</option><option value="false">否</option></select></label>
          : <label>{field.kind === "multi-media" ? "預設值（每行一個 asset ID）" : "預設值（留白代表未設定）"}{field.kind === "multi-media" ? <textarea value={field.defaultText} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultText: event.target.value })} disabled={disabled} /> : <input type={field.kind === "number" || field.kind === "date" ? (field.kind === "number" ? "number" : "date") : "text"} value={field.defaultText} onChange={(event) => replaceField(groupIndex, fieldIndex, { ...field, defaultText: event.target.value })} disabled={disabled} />}</label>)}
        {issueFor(field.key)}
        <p>
          <button type="button" data-move-key={`${group.key}\u0000${field.key}`} aria-label={`將欄位「${nameOf(field.label)}」上移`} onClick={() => moveField(groupIndex, fieldIndex, -1)} disabled={disabled || fieldIndex === 0}>上移</button>
          <button type="button" aria-label={`將欄位「${nameOf(field.label)}」下移`} onClick={() => moveField(groupIndex, fieldIndex, 1)} disabled={disabled || fieldIndex === group.fields.length - 1}>下移</button>
          <button type="button" aria-label={`刪除欄位「${nameOf(field.label)}」`} onClick={() => replaceGroup(groupIndex, { ...group, fields: group.fields.filter((_, position) => position !== fieldIndex) })} disabled={disabled}>刪除欄位</button>
        </p>
      </fieldset>)}
      <button type="button" onClick={() => replaceGroup(groupIndex, { ...group, fields: [...group.fields, newFieldDraft()] })} disabled={disabled}>新增欄位</button>
    </fieldset>)}
    <button type="button" onClick={() => onChange([...groups, newGroupDraft()])} disabled={disabled}>新增欄位群組</button>
  </section>;
}

function contentTypeDisplayOrder(items: ContentTypeCatalogDto["items"]): ContentTypeCatalogDto["items"] {
  return items.toSorted((left, right) => left.order === right.order ? left.typeId < right.typeId ? -1 : left.typeId > right.typeId ? 1 : 0 : left.order - right.order);
}

function ContentTypeList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [catalog, setCatalog] = useState<ContentTypeCatalogDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => { setCatalog(undefined); setError(undefined); void api.contentTypes().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  if (catalog === undefined) return <Layout><PageHeading>內容類型全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>內容類型全覽</PageHeading><p><Link className="action-link" to="/cms/content-types/new">建立內容類型</Link></p><table><caption>所有內容類型</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">Stable ID</th><th scope="col">排序</th><th scope="col">選單</th></tr></thead><tbody>{contentTypeDisplayOrder(catalog.items).map((item) => <tr key={item.typeId}><td><Link to={`/cms/content-types/${item.typeId}`}>{item.label}</Link></td><td>{item.slug}</td><td>{item.typeId}</td><td>{item.order}</td><td>{item.showInMenu ? "顯示" : "隱藏"}</td></tr>)}</tbody></table></Layout>;
}

function TaxonomyAttachmentsEditor({ catalog, attachments, disabled, onChange }: Readonly<{ catalog: TaxonomyCatalogDto | undefined; attachments: readonly TaxonomyAttachment[]; disabled: boolean; onChange: (next: readonly TaxonomyAttachment[]) => void }>): React.JSX.Element {
  const available = catalog?.taxonomies ?? [];
  const fixedIds = new Set(["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
  const update = (taxonomyId: string, change: Partial<TaxonomyAttachment>): void => onChange(attachments.map((item) => item.taxonomyId === taxonomyId ? { ...item, ...change } : item));
  return <fieldset disabled={disabled || catalog === undefined}><legend>分類附掛</legend>{catalog === undefined ? <p>正在載入分類。</p> : available.length === 0 ? <p>尚無分類。請先建立 taxonomy。</p> : available.map(({ taxonomy }) => {
    const selected = attachments.find((item) => item.taxonomyId === taxonomy.taxonomyId);
    const fixed = fixedIds.has(taxonomy.taxonomyId);
    return <div key={taxonomy.taxonomyId} className="custom-field"><label><input type="checkbox" checked={fixed || selected !== undefined} disabled={fixed} onChange={(event) => onChange(event.target.checked ? [...attachments, { taxonomyId: taxonomy.taxonomyId, cardinality: "many", required: false, allowTermCreation: false }] : attachments.filter((item) => item.taxonomyId !== taxonomy.taxonomyId))} />附加 {taxonomy.label}{fixed ? "（固定）" : ""}</label>{selected !== undefined && !fixed && <div><label>{taxonomy.label}選取數量<select aria-label={`${taxonomy.label}選取數量`} value={selected.cardinality} onChange={(event) => update(taxonomy.taxonomyId, { cardinality: event.target.value as "one" | "many" })}><option value="one">單選</option><option value="many">多選</option></select></label><label><input type="checkbox" checked={selected.required} onChange={(event) => update(taxonomy.taxonomyId, { required: event.target.checked })} />發布時必填</label><label><input type="checkbox" checked={selected.allowTermCreation} onChange={(event) => update(taxonomy.taxonomyId, { allowTermCreation: event.target.checked })} />允許在編輯器建立 term</label></div>}</div>;
  })}</fieldset>;
}

function ContentTypeNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const catalogContext = useContext(ContentTypeCatalogContext);
  const catalog = catalogContext?.catalog;
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [help, setHelp] = useState("");
  const [order, setOrder] = useState("0");
  const [showInMenu, setShowInMenu] = useState(true);
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [drafts, setDrafts] = useState<readonly FieldGroupDraft[]>([]);
  const [taxonomies, setTaxonomies] = useState<TaxonomyCatalogDto>();
  const [attachments, setAttachments] = useState<readonly TaxonomyAttachment[]>([]);
  useEffect(() => { void api.taxonomies().then(setTaxonomies).catch((reason: unknown) => setError(message(reason))); }, [api]);
  const issues = useMemo(() => fieldGroupsIssues(drafts), [drafts]);
  const blocked = issues.size > 0;
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (catalog === undefined || label.trim() === "") { setError("請輸入內容類型名稱。"); return; }
    if (blocked) { setError(`欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。`); return; }
    try {
      const created = await api.createContentType({ contract: "content-type-create-request/v1", expectedStateDigest: catalog.stateDigest, label, ...(slug === "" ? {} : { slug }), help, order: Number(order), showInMenu, fieldGroups: fieldGroupsRequest(drafts), taxonomyAttachments: attachments });
      setError(undefined); setStale(false);
      await catalogContext?.refresh();
      navigate(`/cms/content-types/${created.typeId}`);
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型清單已由其他操作更新；請重新載入後再試。"); setStale(true); }
      else { setError(message(reason)); setStale(false); }
    }
  };
  const reload = (): void => { setError(undefined); setStale(false); void catalogContext?.refresh().catch((reason: unknown) => setError(message(reason))); };
  return <Layout><PageHeading>建立內容類型</PageHeading>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}<form aria-label="Content Type 定義" onSubmit={(event) => void submit(event)}><label>名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Slug（選填）<input value={slug} onChange={(event) => setSlug(event.target.value)} /></label><label>說明<textarea value={help} onChange={(event) => setHelp(event.target.value)} /></label><label>排序<input type="number" value={order} onChange={(event) => setOrder(event.target.value)} /></label><label><input type="checkbox" checked={showInMenu} onChange={(event) => setShowInMenu(event.target.checked)} />顯示於選單</label><ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={catalog === undefined} onChange={setDrafts} /><TaxonomyAttachmentsEditor catalog={taxonomies} attachments={attachments} disabled={catalog === undefined} onChange={setAttachments} /><button disabled={catalog === undefined || taxonomies === undefined || blocked} type="submit">建立內容類型</button></form></Layout>;
}

type ContentTypeFormSubmission = Readonly<{ label: string; slug: string; help: string; order: number; showInMenu: boolean; fieldGroups: readonly unknown[]; taxonomyAttachments: readonly TaxonomyAttachment[] }>;

/**
 * Builder 的定義表單。以 `definition.stateDigest` 為 key 掛載，因此 draft 一定由目前 definition 導出，
 * 儲存成功後也一定由 response 重建；CAS token 與 payload 不會來自兩個不同來源。
 */
function ContentTypeDefinitionForm({ definition, taxonomyCatalog, busy, onSubmit }: Readonly<{ definition: ContentTypeDto; taxonomyCatalog: TaxonomyCatalogDto | undefined; busy: boolean; onSubmit: (submission: ContentTypeFormSubmission) => Promise<void> }>): React.JSX.Element {
  const [drafts, setDrafts] = useState<readonly FieldGroupDraft[]>(() => groupDraftsOf(definition.fieldGroups));
  const [attachments, setAttachments] = useState<readonly TaxonomyAttachment[]>(definition.taxonomyAttachments);
  const [localError, setLocalError] = useState<string>();
  const issues = useMemo(() => fieldGroupsIssues(drafts), [drafts]);
  const blocked = issues.size > 0;
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "");
    const slug = String(form.get("slug") ?? "");
    const metadataIssue = label.trim() === "" ? "請輸入內容類型名稱。" : slug.trim() === "" ? "請輸入內容類型 slug。" : undefined;
    setLocalError(metadataIssue);
    if (metadataIssue !== undefined || blocked) return;
    void onSubmit({ label, slug, help: String(form.get("help") ?? ""), order: Number(form.get("order")), showInMenu: form.has("showInMenu"), fieldGroups: fieldGroupsRequest(drafts), taxonomyAttachments: attachments });
  };
  const alert = localError ?? (blocked ? `欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。` : undefined);
  return <form aria-label="Content Type 定義" aria-busy={busy} noValidate onSubmit={submit}>
    <label>名稱<input name="label" required defaultValue={definition.label} disabled={busy} /></label>
    <label>Slug<input name="slug" required defaultValue={definition.slug} disabled={busy} /></label>
    <label>說明<textarea name="help" defaultValue={definition.help} disabled={busy} /></label>
    <label>排序<input name="order" type="number" defaultValue={definition.order} disabled={busy} /></label>
    <label><input name="showInMenu" type="checkbox" defaultChecked={definition.showInMenu} disabled={busy} />顯示於選單</label>
    <ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={busy} onChange={setDrafts} />
    <TaxonomyAttachmentsEditor catalog={taxonomyCatalog} attachments={attachments} disabled={busy} onChange={setAttachments} />
    {alert !== undefined && <p role="alert">{alert}</p>}
    <p><button type="submit" disabled={busy || blocked}>{busy ? "正在儲存…" : "儲存內容類型"}</button></p>
  </form>;
}

function ContentTypeDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { typeId } = useParams();
  const catalogContext = useContext(ContentTypeCatalogContext);
  const [definition, setDefinition] = useState<ContentTypeDto>();
  const [taxonomies, setTaxonomies] = useState<TaxonomyCatalogDto>();
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const load = useCallback((): void => { if (typeId === undefined) { setError("找不到內容類型。"); return; } setDefinition(undefined); setError(undefined); setStale(false); setStatus(undefined); void Promise.all([api.contentType(typeId), api.taxonomies()]).then(([nextDefinition, nextTaxonomies]) => { setDefinition(nextDefinition); setTaxonomies(nextTaxonomies); }).catch((reason: unknown) => setError(message(reason))); }, [api, typeId]);
  useEffect(load, [load]);
  if (definition === undefined) return <Layout><PageHeading>內容類型詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const submit = async (submission: ContentTypeFormSubmission): Promise<void> => {
    setBusy(true); setStatus(undefined);
    try {
      const replaced = await api.replaceContentType(definition.typeId, { contract: "content-type-replace-request/v1", expectedStateDigest: definition.stateDigest, label: submission.label, slug: submission.slug, help: submission.help, order: submission.order, showInMenu: submission.showInMenu, fieldGroups: submission.fieldGroups, taxonomyAttachments: submission.taxonomyAttachments });
      await catalogContext?.refresh();
      setDefinition(replaced);
      setError(undefined);
      setStale(false);
      setStatus("已儲存內容類型。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型已由其他操作更新；請重新載入後再試。"); setStale(true); }
      else if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_BREAKING_CHANGE") setError("這個內容類型已有內容，只能新增 optional 欄位、增加選項或放寬限制。");
      else if (reason instanceof CmsApiError && reason.code === "INVALID_CONTENT_TYPE_DEFINITION") setError(`${reason.remediation}請檢查欄位名稱、說明、限制與選項設定。`);
      else setError(message(reason));
    } finally { setBusy(false); }
  };
  const reload = (): void => { load(); queueMicrotask(() => document.getElementById("page-title")?.focus()); };
  return <Layout><PageHeading>內容類型：{definition.label}</PageHeading>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}{status !== undefined && <p role="status" aria-live="polite">{status}</p>}<ContentTypeDefinitionForm key={definition.stateDigest} definition={definition} taxonomyCatalog={taxonomies} busy={busy} onSubmit={submit} /><dl><dt>Stable ID</dt><dd>{definition.typeId}</dd><dt>Slug</dt><dd>{definition.slug}</dd><dt>System fields</dt><dd>{definition.systemFields.join(", ")}</dd></dl><p>欄位群組：{definition.fieldGroups.length}；分類附掛：{definition.taxonomyAttachments.length}</p></Layout>;
}

function TaxonomyList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [catalog, setCatalog] = useState<TaxonomyCatalogDto>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => { setCatalog(undefined); setError(undefined); void api.taxonomies().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  if (catalog === undefined) return <Layout><PageHeading>分類全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>分類全覽</PageHeading><p><Link className="action-link" to="/cms/taxonomies/new">建立分類</Link></p>{catalog.taxonomies.length === 0 ? <p>尚無分類。<Link to="/cms/taxonomies/new">建立第一個分類</Link></p> : <table><caption>所有分類</caption><thead><tr><th scope="col">名稱</th><th scope="col">Taxonomy ID</th></tr></thead><tbody>{catalog.taxonomies.map(({ taxonomy }) => <tr key={taxonomy.taxonomyId}><td><Link to={`/cms/taxonomies/${taxonomy.taxonomyId}`}>{taxonomy.label}</Link></td><td>{taxonomy.taxonomyId}</td></tr>)}</tbody></table>}</Layout>;
}

function TaxonomyNew({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [hierarchical, setHierarchical] = useState(false);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLabelError(undefined);
    setFormError(undefined);
    if (label.trim() === "") {
      setLabelError("請輸入分類名稱。");
      return;
    }
    setBusy(true);
    try {
      const catalog = await api.taxonomies();
      const created = await api.createTaxonomy({ expectedStateDigest: catalog.stateDigest, label: label.trim(), ...(slug.trim() === "" ? {} : { slug: slug.trim() }), hierarchical });
      navigate(`/cms/taxonomies/${created.taxonomy.taxonomyId}`, { state: { createdTaxonomyId: created.taxonomy.taxonomyId } });
    } catch (reason) {
      const error = message(reason);
      setFormError(error);
    } finally {
      setBusy(false);
    }
  };
  return <Layout><PageHeading>建立分類</PageHeading><form aria-label="分類定義" aria-busy={busy} onSubmit={(event) => void submit(event)}><label htmlFor="taxonomy-label">分類名稱<input id="taxonomy-label" required value={label} onChange={(event) => { setLabel(event.target.value); setLabelError(undefined); }} aria-invalid={labelError !== undefined} disabled={busy} /></label><label>Slug（可留空）<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label><label><input type="checkbox" checked={hierarchical} onChange={(event) => setHierarchical(event.target.checked)} disabled={busy} />支援階層</label>{labelError !== undefined && <p role="alert">{labelError}</p>}{formError !== undefined && <p role="alert">{formError}</p>}<p role="status" aria-live="polite" aria-atomic="true">{busy ? "正在建立分類。" : ""}</p><button type="submit" disabled={busy}>{busy ? "正在建立…" : "建立分類"}</button></form></Layout>;
}

function TaxonomyDefinitionEditor({ snapshot, busy, onSave }: Readonly<{ snapshot: TaxonomySnapshotDto; busy: boolean; onSave: (body: Readonly<Record<string, unknown>>) => Promise<void> }>): React.JSX.Element {
  const [label, setLabel] = useState(snapshot.taxonomy.label);
  const [slug, setSlug] = useState(snapshot.taxonomy.slug);
  const [hierarchical, setHierarchical] = useState(snapshot.taxonomy.hierarchical);
  return <form aria-label="編輯分類" onSubmit={(event) => { event.preventDefault(); void onSave({ kind: "replace-taxonomy", label: label.trim(), slug: slug.trim(), hierarchical }); }}><label>分類名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label><label>分類 slug<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label><label><input type="checkbox" checked={hierarchical} onChange={(event) => setHierarchical(event.target.checked)} disabled={busy} />支援階層</label><button disabled={busy || label.trim() === ""}>儲存分類</button></form>;
}

function TaxonomyTermEditor({ term, terms, hierarchical, busy, onSave }: Readonly<{ term: TaxonomySnapshotDto["terms"][number]; terms: TaxonomySnapshotDto["terms"]; hierarchical: boolean; busy: boolean; onSave: (body: Readonly<Record<string, unknown>>) => Promise<void> }>): React.JSX.Element {
  const [label, setLabel] = useState(term.label);
  const [slug, setSlug] = useState(term.slug);
  const [parentTermId, setParentTermId] = useState(term.parentTermId ?? "");
  return <form aria-label={`編輯 term：${term.label}`} onSubmit={(event) => { event.preventDefault(); void onSave({ kind: "replace-term", termId: term.termId, label: label.trim(), slug: slug.trim(), order: term.order, ...(parentTermId === "" ? {} : { parentTermId }), state: term.state }); }}><label>Term 名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label><label>Term slug<input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={busy} /></label>{hierarchical && <label>上層 term<select value={parentTermId} onChange={(event) => setParentTermId(event.target.value)} disabled={busy}><option value="">最上層</option>{terms.filter((item) => item.termId !== term.termId && item.state === "live").map((item) => <option key={item.termId} value={item.termId}>{item.label}</option>)}</select></label>}<button disabled={busy || label.trim() === ""}>儲存 term</button></form>;
}

function TaxonomyDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { taxonomyId } = useParams();
  const { state } = useLocation();
  const [snapshot, setSnapshot] = useState<TaxonomySnapshotDto>();
  const [error, setError] = useState<string>();
  const [termLabel, setTermLabel] = useState("");
  const [parentTermId, setParentTermId] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((): void => {
    if (taxonomyId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(taxonomyId)) {
      setSnapshot(undefined);
      setError("找不到分類。");
      return;
    }
    setSnapshot(undefined);
    setError(undefined);
    void api.taxonomy(taxonomyId).then(setSnapshot).catch((reason: unknown) => setError(reason instanceof CmsApiError && reason.status === 404 ? "找不到分類。" : message(reason)));
  }, [api, taxonomyId]);
  useEffect(load, [load]);
  const command = async (body: Readonly<Record<string, unknown>>): Promise<void> => {
    if (taxonomyId === undefined || snapshot === undefined) return;
    setBusy(true); setError(undefined);
    try { setSnapshot(await api.taxonomyCommand(taxonomyId, { expectedStateDigest: snapshot.stateDigest, ...body })); setTermLabel(""); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  };
  if (snapshot === undefined) return <Layout><PageHeading>分類詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const createdTaxonomyId = typeof state === "object" && state !== null && "createdTaxonomyId" in state && typeof state.createdTaxonomyId === "string" ? state.createdTaxonomyId : undefined;
  return <Layout><PageHeading>分類：{snapshot.taxonomy.label}</PageHeading>{createdTaxonomyId === snapshot.taxonomy.taxonomyId && <p role="status" aria-live="polite" aria-atomic="true">已建立分類。</p>}{error !== undefined && <><p role="alert">{error}</p><button onClick={load}>重新載入</button></>}<dl><dt>Stable ID</dt><dd>{snapshot.taxonomy.taxonomyId}</dd><dt>Slug</dt><dd>{snapshot.taxonomy.slug}</dd><dt>模式</dt><dd>{snapshot.taxonomy.hierarchical ? "階層" : "平面"}</dd></dl><TaxonomyDefinitionEditor key={snapshot.taxonomy.taxonomyId} snapshot={snapshot} busy={busy} onSave={command} /><form onSubmit={(event) => { event.preventDefault(); void command({ kind: "create-term", label: termLabel.trim(), order: snapshot.terms.length, ...(parentTermId === "" ? {} : { parentTermId }) }); }}><label>新增 term<input value={termLabel} onChange={(event) => setTermLabel(event.target.value)} disabled={busy} /></label>{snapshot.taxonomy.hierarchical && <label>上層 term<select value={parentTermId} onChange={(event) => setParentTermId(event.target.value)} disabled={busy}><option value="">最上層</option>{snapshot.terms.filter((term) => term.state === "live").map((term) => <option key={term.termId} value={term.termId}>{term.label}</option>)}</select></label>}<button disabled={busy || termLabel.trim() === ""}>建立 term</button></form><section aria-labelledby="taxonomy-terms"><h2 id="taxonomy-terms">Terms</h2>{snapshot.terms.length === 0 ? <p>尚無 term。</p> : <table><caption>所有 terms</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">上層</th><th scope="col">狀態</th><th scope="col">操作</th></tr></thead><tbody>{snapshot.terms.map((term) => <tr key={term.termId}><td>{term.label}</td><td>{term.slug}</td><td>{term.parentTermId === undefined ? "—" : snapshot.terms.find((item) => item.termId === term.parentTermId)?.label ?? term.parentTermId}</td><td>{term.state === "live" ? "使用中" : "已停用"}</td><td><TaxonomyTermEditor key={term.termId} term={term} terms={snapshot.terms} hierarchical={snapshot.taxonomy.hierarchical} busy={busy} onSave={command} /><button disabled={busy} onClick={() => void command({ kind: "replace-term", termId: term.termId, label: term.label, slug: term.slug, order: term.order, ...(term.parentTermId === undefined ? {} : { parentTermId: term.parentTermId }), state: term.state === "live" ? "retired" : "live" })}>{term.state === "live" ? "停用" : "重新啟用"}</button><button disabled={busy} onClick={() => void command({ kind: "delete-term", termId: term.termId })}>刪除</button></td></tr>)}</tbody></table>}</section></Layout>;
}

function MediaUsageList({ usage }: Readonly<{ usage: readonly MediaUsageV2Dto[] }>): React.JSX.Element {
  return <ul aria-label="媒體引用">{usage.map((item) => <li key={item.entryId}>{`${item.entryId}（${item.status === "published" ? "已發布" : "草稿"}）`}</li>)}</ul>;
}

function MediaAssetEvidence({ asset }: Readonly<{ asset: MediaAssetV2Dto }>): React.JSX.Element {
  return <dl>
    <dt>Asset ID</dt><dd className="breakable">{asset.assetId}</dd>
    <dt>Slug</dt><dd>{asset.slug}</dd>
    <dt>Alt 文字</dt><dd>{asset.altText ?? "未設定"}</dd>
    <dt>Caption</dt><dd>{asset.caption === "" ? "未設定" : asset.caption}</dd>
    <dt>Description</dt><dd>{asset.description === "" ? "未設定" : asset.description}</dd>
    <dt>原始檔名</dt><dd>{asset.originalFilename}</dd>
    <dt>MIME type</dt><dd>{asset.mimeType}</dd>
    <dt>檔案大小</dt><dd>{asset.byteLength}</dd>
    <dt>Checksum</dt><dd className="breakable">{asset.checksum}</dd>
    <dt>影像尺寸</dt><dd>{asset.image === null ? "非影像" : `${asset.image.width} × ${asset.image.height}`}</dd>
    <dt>上傳時間</dt><dd>{asset.uploadedAt}</dd>
    <dt>縮圖</dt><dd className="breakable">{asset.thumbnail === null ? "僅提供 metadata" : <><img src={`/cms/media/${asset.assetId}/thumbnail`} alt="" width={asset.thumbnail.width} height={asset.thumbnail.height} />{`${asset.thumbnail.width} × ${asset.thumbnail.height}／${asset.thumbnail.byteLength} bytes／${asset.thumbnail.digest}`}</>}</dd>
  </dl>;
}

function MediaAssetList({ assets }: Readonly<{ assets: readonly MediaAssetV2Dto[] }>): React.JSX.Element {
  return <ul aria-label="媒體 asset">{assets.map((asset) => <li key={asset.assetId}><article aria-labelledby={`media-asset-${asset.assetId}`}><h3 id={`media-asset-${asset.assetId}`}><Link to={`/cms/media/${asset.assetId}`}>{asset.title}</Link></h3><MediaAssetEvidence asset={asset} /></article></li>)}</ul>;
}

function MediaList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { state } = useLocation();
  const [catalog, setCatalog] = useState<MediaCatalogV2Dto>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => { setCatalog(undefined); setError(undefined); void api.listMedia().then(setCatalog).catch((reason: unknown) => setError(message(reason))); }, [api]);
  useEffect(load, [load]);
  const deletedSlug = typeof state === "object" && state !== null && "deletedSlug" in state && typeof state.deletedSlug === "string" ? state.deletedSlug : undefined;
  if (catalog === undefined) return <Layout><PageHeading>媒體庫</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入媒體庫。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>媒體庫</PageHeading><p><Link className="action-link" to="/cms/media/import">匯入媒體</Link></p>{deletedSlug !== undefined && <p role="status" aria-live="polite" aria-atomic="true">{`已刪除 asset 並釋放 slug：${deletedSlug}。`}</p>}{catalog.items.length === 0 ? <p>尚無媒體。<Link to="/cms/media/import">匯入第一個媒體檔案</Link></p> : <><p role="status" aria-live="polite" aria-atomic="true">{`共 ${catalog.items.length} 個 asset。`}</p><MediaAssetList assets={catalog.items} /></>}</Layout>;
}

type MediaImportStatus = "waiting" | "uploading" | "done" | "cancelled" | "failed";
type MediaImportItem = Readonly<{ id: string; file: File; status: MediaImportStatus; sent: number; progressTotal: number; failure: string | undefined; assetId: string | undefined }>;

/** 契約允許任意多檔案，但同時 in-flight 的上傳固定為兩個；其餘留在 waiting 由 render 迴圈補位。 */
const MEDIA_IMPORT_CONCURRENCY = 2;

function mediaImportStatusText(item: MediaImportItem): string {
  switch (item.status) {
    case "waiting": return "等待中";
    case "uploading": return `上傳中 ${item.progressTotal === 0 ? 100 : Math.min(100, Math.floor((item.sent / item.progressTotal) * 100))}%`;
    case "done": return "已完成";
    case "cancelled": return "已取消";
    case "failed": return "失敗";
  }
}

function MediaImport({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [fields, setFields] = useState<MediaMetadataFields>({ title: "", slug: "", altText: "", caption: "", description: "" });
  const [items, setItems] = useState<readonly MediaImportItem[]>([]);
  const [catalog, setCatalog] = useState<MediaCatalogV2Dto>();
  const aborts = useRef(new Map<string, AbortController>());
  const patch = useCallback((id: string, next: Partial<MediaImportItem>): void => { setItems((current) => current.map((item) => item.id === id ? { ...item, ...next } : item)); }, []);
  const refreshCatalog = useCallback((): void => { void api.listMedia().then(setCatalog).catch(() => setCatalog(undefined)); }, [api]);
  const upload = useCallback(async (item: MediaImportItem): Promise<void> => {
    const controller = new AbortController();
    aborts.current.set(item.id, controller);
    try {
      const asset = await api.uploadMedia(null, null, item.file, mediaImportMetadata(fields, item.file.name), { onProgress: (sent, progressTotal) => patch(item.id, { sent, progressTotal }), signal: controller.signal });
      patch(item.id, { status: "done", assetId: asset.assetId });
      refreshCatalog();
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CMS_REQUEST_ABORTED") patch(item.id, { status: "cancelled" });
      else patch(item.id, { status: "failed", failure: message(reason) });
    } finally { aborts.current.delete(item.id); }
  }, [api, fields, patch, refreshCatalog]);
  // 佇列推進：每次 render 只補一個 waiting 項目，讓同時 in-flight 數穩定收斂在上限內。
  useEffect(() => {
    if (items.filter((item) => item.status === "uploading").length >= MEDIA_IMPORT_CONCURRENCY) return;
    const next = items.find((item) => item.status === "waiting");
    if (next === undefined) return;
    patch(next.id, { status: "uploading", sent: 0, progressTotal: next.file.size, failure: undefined });
    void upload(next);
  }, [items, patch, upload]);
  const select = (files: FileList | null): void => {
    if (files === null || files.length === 0) return;
    // FileList 是 live view：先取出 File snapshot，之後清空 input value 才不會讓佇列變成空的。
    const selected = Array.from(files);
    setItems((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, status: "waiting" as MediaImportStatus, sent: 0, progressTotal: file.size, failure: undefined, assetId: undefined }))]);
  };
  const cancel = (item: MediaImportItem): void => {
    if (item.status === "waiting") patch(item.id, { status: "cancelled" });
    else aborts.current.get(item.id)?.abort();
  };
  // 重試一律回到 waiting：新的 AbortController、新的 XHR、byte 0 起算，沒有 Range 或 resume。
  const retry = (item: MediaImportItem): void => { patch(item.id, { status: "waiting", sent: 0, progressTotal: item.file.size, failure: undefined }); };
  const importedIds = new Set(items.flatMap((item) => item.assetId === undefined ? [] : [item.assetId]));
  const imported = (catalog?.items ?? []).filter((asset) => importedIds.has(asset.assetId));
  return <Layout>
    <PageHeading>匯入媒體</PageHeading>
    <form aria-label="媒體上傳設定" onSubmit={(event) => event.preventDefault()}>
      <fieldset><legend>上傳 metadata</legend><p>留白時以檔名作為標題，server 會依標題推導 slug；alt 留白代表未設定。</p>
        <label htmlFor="media-import-title">標題<input id="media-import-title" value={fields.title} onChange={(event) => setFields((current) => ({ ...current, title: event.target.value }))} /></label>
        <label htmlFor="media-import-alt">Alt 文字<input id="media-import-alt" value={fields.altText} onChange={(event) => setFields((current) => ({ ...current, altText: event.target.value }))} /></label>
        <label htmlFor="media-import-caption">Caption<input id="media-import-caption" value={fields.caption} onChange={(event) => setFields((current) => ({ ...current, caption: event.target.value }))} /></label>
        <label htmlFor="media-import-description">Description<textarea id="media-import-description" value={fields.description} onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))} /></label>
      </fieldset>
      <label htmlFor="media-import-files">媒體檔案<input id="media-import-files" type="file" multiple onChange={(event) => { select(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
    </form>
    <section aria-labelledby="media-import-queue-heading">
      <h2 id="media-import-queue-heading">上傳佇列</h2>
      <p>{`同時最多 ${MEDIA_IMPORT_CONCURRENCY} 個上傳；其餘項目等待中。`}</p>
      {items.length === 0 ? <p>尚未選擇檔案。</p> : <ul aria-label="上傳項目">{items.map((item) => <li key={item.id}><article aria-labelledby={`media-import-${item.id}-name`}><h3 id={`media-import-${item.id}-name`}>{item.file.name}</h3><p role="status" aria-live="polite" aria-atomic="true">{mediaImportStatusText(item)}</p><button type="button" onClick={() => cancel(item)} disabled={item.status === "done" || item.status === "cancelled" || item.status === "failed"}>取消</button><button type="button" onClick={() => retry(item)} disabled={item.status !== "cancelled" && item.status !== "failed"}>重試</button>{item.failure !== undefined && <p role="alert">{item.failure}</p>}</article></li>)}</ul>}
    </section>
    {imported.length > 0 && <section aria-labelledby="media-import-library-heading"><h2 id="media-import-library-heading">已匯入的 asset（重新載入的媒體庫）</h2><MediaAssetList assets={imported} /></section>}
  </Layout>;
}

function MediaDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MediaAssetDetailV2Dto>();
  const [fields, setFields] = useState<MediaMetadataFields>();
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<"title" | "slug", string | undefined>>>({ title: undefined, slug: undefined });
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<Readonly<{ message: string; usage: readonly MediaUsageV2Dto[] }>>();
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<"save" | "replace" | "delete">();
  const [replaceFile, setReplaceFile] = useState<File>();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const confirmDelete = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const load = useCallback((): void => {
    if (assetId === undefined || !AUTHORING_RESOURCE_ID_PATTERN.test(assetId)) { setError("找不到媒體 asset。"); return; }
    setDetail(undefined); setFields(undefined); setError(undefined); setConflict(false); setNotice(""); setFailure(undefined);
    void api.getMedia(assetId).then((value) => { setDetail(value); setFields(mediaFields(value.asset)); }).catch((reason: unknown) => setError(reason instanceof CmsApiError && reason.status === 404 ? "找不到媒體 asset。" : message(reason)));
  }, [api, assetId]);
  useEffect(load, [load]);
  const applyFailure = (reason: unknown): void => {
    const usage = reason instanceof CmsApiError ? reason.usage : [];
    // 409 的 usage evidence 比初次讀取更完整：引用是後來的操作建立的，畫面必須立刻改為鎖定破壞性操作。
    if (usage.length > 0) setDetail((current) => current === undefined ? current : { ...current, usage: [...usage] });
    setFailure({ message: message(reason), usage });
  };
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (detail === undefined || fields === undefined) return;
    const next = { title: fields.title.trim() === "" ? "請輸入標題。" : undefined, slug: fields.slug.trim() === "" ? "請輸入 slug。" : undefined };
    setFieldErrors(next);
    if (next.title !== undefined || next.slug !== undefined) return;
    setBusy("save"); setFailure(undefined); setNotice("");
    try {
      const asset = await api.saveMediaMetadata({ assetId: detail.asset.assetId, expectedStateDigest: detail.asset.stateDigest, title: fields.title.trim(), slug: fields.slug.trim(), altText: fields.altText === "" ? null : fields.altText, caption: fields.caption, description: fields.description });
      setDetail({ contract: "media-asset-detail/v2", asset, usage: detail.usage });
      setFields(mediaFields(asset));
      setNotice("已儲存。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict(true);
      else applyFailure(reason);
    } finally { setBusy(undefined); }
  };
  const replace = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (detail === undefined || fields === undefined) return;
    if (replaceFile === undefined) { setFailure({ message: "請選擇替換檔案。", usage: [] }); return; }
    setBusy("replace"); setFailure(undefined); setNotice("");
    try {
      const asset = await api.uploadMedia(detail.asset.assetId, detail.asset.stateDigest, replaceFile, mediaImportMetadata(fields, replaceFile.name, detail.asset.slug));
      setDetail({ contract: "media-asset-detail/v2", asset, usage: detail.usage });
      setFields(mediaFields(asset));
      setReplaceFile(undefined);
      setNotice("已替換媒體 bytes。");
    } catch (reason) { applyFailure(reason); } finally { setBusy(undefined); }
  };
  const remove = async (): Promise<void> => {
    if (detail === undefined) return;
    setBusy("delete"); setFailure(undefined); setNotice("");
    try {
      const receipt = await api.deleteMedia({ assetId: detail.asset.assetId, expectedStateDigest: detail.asset.stateDigest });
      dialog.current?.close();
      void navigate("/cms/media", { state: { deletedSlug: receipt.releasedSlug } });
    } catch (reason) { dialog.current?.close(); applyFailure(reason); } finally { setBusy(undefined); }
  };
  const openDelete = (): void => { setFailure(undefined); dialog.current?.showModal(); cancelDelete.current?.focus(); };
  const closeDelete = (): void => { dialog.current?.close(); deleteTrigger.current?.focus(); };
  const trapDeleteFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelDelete.current) { event.preventDefault(); confirmDelete.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirmDelete.current) { event.preventDefault(); cancelDelete.current?.focus(); }
  };
  if (detail === undefined || fields === undefined) return <Layout><PageHeading>媒體詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入媒體。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const referenced = detail.usage.length > 0;
  const locked = busy !== undefined;
  return <Layout>
    <PageHeading>媒體：{detail.asset.title}</PageHeading>
    {notice !== "" && <p role="status" aria-live="polite" aria-atomic="true">{notice}</p>}
    {conflict && <><p role="alert">媒體 metadata 已由另一個頁面更新。</p><button type="button" onClick={load}>重新載入</button></>}
    {failure !== undefined && <div role="alert"><p>{failure.message}</p>{failure.usage.length > 0 && <><p>目前引用：</p><MediaUsageList usage={failure.usage} /></>}</div>}
    <section aria-labelledby="media-metadata-heading">
      <h2 id="media-metadata-heading">Metadata</h2>
      <form aria-label="媒體 metadata" noValidate aria-busy={busy === "save"} onSubmit={(event) => void save(event)}>
        <label htmlFor="media-metadata-title">標題<input id="media-metadata-title" required aria-invalid={fieldErrors.title !== undefined} aria-describedby={fieldErrors.title === undefined ? undefined : "media-metadata-title-error"} value={fields.title} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, title: event.target.value })} disabled={locked || conflict} /></label>
        {fieldErrors.title !== undefined && <p id="media-metadata-title-error" role="alert">{fieldErrors.title}</p>}
        <label htmlFor="media-metadata-slug">Slug<input id="media-metadata-slug" required aria-invalid={fieldErrors.slug !== undefined} aria-describedby={fieldErrors.slug === undefined ? undefined : "media-metadata-slug-error"} value={fields.slug} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, slug: event.target.value })} disabled={locked || conflict} /></label>
        {fieldErrors.slug !== undefined && <p id="media-metadata-slug-error" role="alert">{fieldErrors.slug}</p>}
        <label htmlFor="media-metadata-alt">Alt 文字<input id="media-metadata-alt" value={fields.altText} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, altText: event.target.value })} disabled={locked || conflict} /></label>
        <label htmlFor="media-metadata-caption">Caption<input id="media-metadata-caption" value={fields.caption} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, caption: event.target.value })} disabled={locked || conflict} /></label>
        <label htmlFor="media-metadata-description">Description<textarea id="media-metadata-description" value={fields.description} onChange={(event) => setFields((current) => current === undefined ? current : { ...current, description: event.target.value })} disabled={locked || conflict} /></label>
        <button type="submit" disabled={locked || conflict}>{busy === "save" ? "正在儲存…" : "儲存"}</button>
      </form>
    </section>
    <section aria-labelledby="media-evidence-heading"><h2 id="media-evidence-heading">Evidence</h2><MediaAssetEvidence asset={detail.asset} /></section>
    <section aria-labelledby="media-usage-heading"><h2 id="media-usage-heading">引用狀態</h2>{referenced ? <><p>此 asset 仍被下列 entry 引用，Replace 與 Delete 已停用。</p><MediaUsageList usage={detail.usage} /></> : <p>目前沒有 entry 引用此 asset。</p>}</section>
    <section aria-labelledby="media-replace-heading">
      <h2 id="media-replace-heading">替換 bytes</h2>
      <p>替換會保留 stable asset ID 與 slug，只更新 bytes、尺寸與 checksum。</p>
      <form aria-label="媒體替換" onSubmit={(event) => void replace(event)}>
        <label htmlFor="media-replace-file">替換檔案<input id="media-replace-file" type="file" onChange={(event) => setReplaceFile(event.currentTarget.files?.[0])} disabled={locked || referenced} /></label>
        <button type="submit" disabled={locked || referenced}>{busy === "replace" ? "正在替換…" : "替換 bytes"}</button>
      </form>
    </section>
    <section aria-labelledby="media-delete-heading">
      <h2 id="media-delete-heading">刪除 asset</h2>
      <p>刪除會釋出 bytes、縮圖與 slug，且無法復原。</p>
      <button ref={deleteTrigger} type="button" onClick={openDelete} disabled={locked || referenced}>刪除 asset</button>
    </section>
    <p><Link to="/cms/media">返回媒體庫</Link></p>
    <dialog ref={dialog} aria-labelledby="media-delete-dialog-title" aria-describedby="media-delete-dialog-description" onKeyDown={trapDeleteFocus}><h2 id="media-delete-dialog-title">刪除媒體 asset</h2><p id="media-delete-dialog-description">{`將刪除「${detail.asset.title}」並釋放 slug ${detail.asset.slug}。`}</p><button ref={cancelDelete} type="button" onClick={closeDelete} disabled={locked}>取消</button><button ref={confirmDelete} type="button" onClick={() => void remove()} disabled={locked}>{busy === "delete" ? "正在刪除…" : "確認刪除"}</button></dialog>
  </Layout>;
}

function Home({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [types, setTypes] = useState<ContentTypeCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setTypes(undefined); setError(undefined);
    void api.contentTypes().then((value) => setTypes(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  return <Layout><PageHeading>CMS 工作台</PageHeading><p>建立並管理全新內容。公開網站發布目前暫停。</p><p><Link to="/cms/content-types/new">建立內容類型</Link> · <Link to="/cms/media/import">匯入媒體</Link> · <Link to="/cms/taxonomies">管理分類</Link></p>{types === undefined ? error === undefined ? <p role="status">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></> : <ul>{types.map((type) => <li key={type.typeId}><Link to={postPath(type.typeId)}>{type.label}</Link></li>)}</ul>}</Layout>;
}

function CmsApp({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const api = useMemo(() => new CmsApiClient(session), [session]);
  return <BrowserRouter><ContentTypeCatalogProvider api={api}><Routes><Route path="/cms" element={<Home api={api} />} /><Route path="/cms/" element={<Home api={api} />} /><Route path="/cms/content/:typeId" element={<PostWorkspace api={api} />} /><Route path="/cms/media" element={<MediaList api={api} />} /><Route path="/cms/media/import" element={<MediaImport api={api} />} /><Route path="/cms/media/:assetId" element={<MediaDetail api={api} />} /><Route path="/cms/content-types" element={<ContentTypeList api={api} />} /><Route path="/cms/content-types/new" element={<ContentTypeNew api={api} />} /><Route path="/cms/content-types/:typeId" element={<ContentTypeDetail api={api} />} /><Route path="/cms/taxonomies" element={<TaxonomyList api={api} />} /><Route path="/cms/taxonomies/new" element={<TaxonomyNew api={api} />} /><Route path="/cms/taxonomies/:taxonomyId" element={<TaxonomyDetail api={api} />} /></Routes></ContentTypeCatalogProvider></BrowserRouter>;
}

export function startCms(): void {
  const root = document.getElementById("root");
  if (root !== null) createRoot(root).render(<CmsApp session={openAuthoringSession()} />);
}
