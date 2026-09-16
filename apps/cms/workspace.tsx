import { createRoot } from "react-dom/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { z, type ZodType } from "zod";

import "./tokens.css";
import { openAuthoringSession, type AuthoringSession } from "./session.js";

const AUTHORING_RESOURCE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const jsonContent = z.unknown().refine((value) => value !== undefined);
const schemaIdentitySchema = z.object({ schemaId: z.string(), version: z.number().int().safe().positive() }).strict();
const remediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
const authoringErrorSchema = z.object({ contract: z.literal("authoring-error/v1"), requestId: z.string(), code: z.string(), owner: z.string(), subjectIds: z.array(z.string()), remediation: remediationSchema }).strict();
const mediaUsageV2Schema = z.object({ entryId: z.string().min(1), status: z.enum(["draft", "published"]) }).strict();
/**
 * 被 entry 引用的 current media asset 不得 Replace／Delete。這個 failure 帶完整 usage evidence，
 * generic `authoring-error/v1` 無法承載，因此以 exact contract 單獨驗證並保留給 UI 顯示。
 */
const mediaAssetReferencedErrorSchema = z.object({ contract: z.literal("media-asset-referenced/v2"), requestId: z.string(), code: z.literal("MEDIA_ASSET_REFERENCED"), owner: z.literal("DataMedia"), subjectIds: z.array(z.string()), remediation: remediationSchema, usage: z.array(mediaUsageV2Schema).nonempty() }).strict();
const entryCatalogSchema = z.object({ contract: z.literal("entry-catalog/v1"), items: z.array(z.object({ entryId: z.string(), title: z.string(), status: z.enum(["draft", "published", "published-with-draft"]), current: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict(), published: z.object({ revisionId: z.string(), contentDigest: digestSchema, normalizedRoute: z.string() }).strict().optional() }).strict()), routeGraphs: z.unknown(), stateDigest: digestSchema }).strict();
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
const taxonomyBindingSchema = z.object({ taxonomyId: z.string(), termId: z.string(), evidence: z.object({ taxonomyId: z.string(), termId: z.string(), label: z.string(), slug: z.string(), order: z.number().int().safe() }).strict(), evidenceDigest: digestSchema }).strict();
const authoringEntrySchema = z.object({ contract: z.literal("authoring-entry/v1"), entryId: z.string(), current: z.object({ revisionId: z.string(), schemaIdentity: schemaIdentitySchema, content: jsonContent, contentDigest: digestSchema, route: z.string(), assets: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()), taxonomyBindings: z.array(taxonomyBindingSchema) }).strict(), stateDigest: digestSchema }).strict();
const taxonomyTermSchema = z.object({ taxonomyId: z.string(), termId: z.string(), label: z.string(), slug: z.string(), order: z.number().int().safe(), state: z.enum(["live", "retired"]) }).strict();
const taxonomySnapshotSchema = z.object({ contract: z.literal("taxonomy/v1"), taxonomy: z.object({ taxonomyId: z.string(), label: z.string() }).strict(), terms: z.array(taxonomyTermSchema), stateDigest: digestSchema }).strict();
const taxonomyCatalogSchema = z.object({ contract: z.literal("taxonomy-catalog/v1"), taxonomies: z.array(z.object({ taxonomy: z.object({ taxonomyId: z.string(), label: z.string() }).strict(), stateDigest: digestSchema }).strict()) }).strict();
const seoSettingsSchema = z.object({ contract: z.literal("seo-plugin-settings/v1"), publicSiteUrl: z.string().url(), indexing: z.enum(["allow", "disallow"]) }).strict();
const pluginIdentitySchema = z.object({ id: z.string(), version: z.string(), hookContract: z.literal("plugin-hooks/v1"), manifestHash: digestSchema, capabilities: z.array(z.string()) }).strict();
const pluginManagementSnapshotSchema = z.object({ contract: z.literal("plugin-management-snapshot/v1"), activationStateDigest: digestSchema, settingsStateDigest: digestSchema, plugins: z.array(z.object({ identity: pluginIdentitySchema, status: z.enum(["inactive", "active", "reactivation-required"]), settings: z.object({ settingsContract: z.literal("seo-plugin-settings/v1"), settings: seoSettingsSchema, settingsDigest: digestSchema }).strict().optional() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const mediaImageV2Schema = z.object({ width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaThumbnailV2Schema = z.object({ digest: digestSchema, byteLength: z.number().int().nonnegative(), width: z.number().int().safe().positive(), height: z.number().int().safe().positive() }).strict();
const mediaAssetV2Schema = z.object({ contract: z.literal("media-asset/v2"), assetId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), altText: z.string().nullable(), caption: z.string(), description: z.string(), originalFilename: z.string().min(1), mimeType: z.string().min(1), byteLength: z.number().int().nonnegative(), checksum: digestSchema, uploadedAt: z.string().min(1), image: mediaImageV2Schema.nullable(), thumbnail: mediaThumbnailV2Schema.nullable(), stateDigest: digestSchema }).strict();
const mediaCatalogV2Schema = z.object({ contract: z.literal("media-catalog/v2"), items: z.array(mediaAssetV2Schema), stateDigest: digestSchema }).strict();
const mediaAssetDetailV2Schema = z.object({ contract: z.literal("media-asset-detail/v2"), asset: mediaAssetV2Schema, usage: z.array(mediaUsageV2Schema) }).strict();
const mediaDeleteReceiptV2Schema = z.object({ contract: z.literal("media-delete-receipt/v2"), assetId: z.string().min(1), releasedSlug: z.string().min(1) }).strict();
const cmsSeoAnalysisResponseSchema = z.object({ contract: z.literal("cms-seo-analysis-response/v1"), documentDigest: digestSchema, status: z.enum(["available", "unavailable"]), preview: z.object({ title: z.string(), description: z.string().optional(), canonicalUrl: z.string().url().optional() }).strict().optional(), suggestions: z.array(z.object({ code: z.string() }).strict()), diagnostics: z.array(z.unknown()) }).strict();
const previewDocumentSchema = z.object({ contract: z.literal("preview-document/v1"), selection: z.enum(["current", "published"]), subject: z.object({ entryId: z.string() }).strict(), revisionId: z.string(), contentDigest: digestSchema, document: z.string() }).strict();
const interactiveDemoBlockSchema = z.object({
  kind: z.literal("interactive-demo"),
  identity: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  hook: z.literal("cms/editor-block/resolve"),
  manifestHash: digestSchema,
  source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(),
  staticFallback: z.string().min(1),
}).strict();
const articleBlockSchema = z.object({ kind: z.literal("article"), text: z.string().min(1) }).strict();
const structuredContentSchema = z.object({ contract: z.literal("site-content/v1"), title: z.string().min(1), blocks: z.array(z.discriminatedUnion("kind", [articleBlockSchema, interactiveDemoBlockSchema])).min(1), seo: z.object({ title: z.string().min(1).optional(), description: z.string().min(1).optional(), canonicalPath: z.string().min(1).optional() }).strict() }).strict();
const cptEntrySchema = z.object({ contract: z.literal("cpt-entry/v1"), entryId: z.string(), typeId: z.string(), slug: z.string(), content: z.object({ contract: z.literal("cpt-content/v1"), typeId: z.string(), title: z.string(), blocks: z.array(z.discriminatedUnion("kind", [articleBlockSchema, interactiveDemoBlockSchema])).min(1), excerpt: z.string(), seo: z.object({ title: z.string().optional(), description: z.string().optional(), canonicalPath: z.string().optional() }).strict(), customValues: z.array(z.object({ fieldId: z.string(), value: jsonContent }).strict()) }).strict(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), lastPublishedDigest: digestSchema.optional(), stateDigest: digestSchema }).strict();
const cptEntryCatalogSchema = z.object({ contract: z.literal("cpt-entry-catalog/v1"), typeId: z.string(), items: z.array(z.object({ entryId: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published"]), publishedAt: z.string().optional(), stateDigest: digestSchema }).strict()), stateDigest: digestSchema }).strict();
const cptEntryDeletedSchema = z.object({ contract: z.literal("cpt-entry-deleted/v1"), entryId: z.string() }).strict();
const cmsEditorBlockDiagnosticSchema = z.object({ code: z.enum(["PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING", "PLUGIN_BLOCK_IDENTITY_CHANGED"]), owner: z.literal("PluginHost"), subjectIds: z.array(z.string()), remediation: z.object({ kind: z.literal("message"), message: z.string() }).strict(), detail: z.object({ pluginId: z.string(), hook: z.literal("cms/editor-block/resolve"), capability: z.literal("cms-editor-block-resolution"), entryId: z.string(), cause: z.enum(["inactive", "missing", "identity-changed"]) }).strict() }).strict();
const cmsEditorBlockResolutionSchema = z.object({ blockIndex: z.number().int().nonnegative(), pluginIdentity: z.object({ id: z.string(), version: z.string(), hook: z.literal("cms/editor-block/resolve"), manifestHash: digestSchema }).strict(), source: z.object({ html: z.string(), css: z.string(), javascript: z.string() }).strict(), sourceDigest: digestSchema, activeStateDigest: digestSchema, status: z.enum(["active", "inactive", "missing", "identity-changed"]), output: jsonContent.optional(), outputDigest: digestSchema.optional(), diagnostic: cmsEditorBlockDiagnosticSchema.optional() }).strict().superRefine((value, context) => {
  if (value.status === "active" && (value.output === undefined || value.outputDigest === undefined || value.diagnostic !== undefined)) context.addIssue({ code: "custom", message: "CMS_EDITOR_BLOCK_RESOLUTION_INVALID" });
  if (value.status !== "active" && (value.output !== undefined || value.outputDigest !== undefined || value.diagnostic === undefined || value.diagnostic.code !== `PLUGIN_BLOCK_${value.status === "identity-changed" ? "IDENTITY_CHANGED" : value.status.toUpperCase()}` || value.diagnostic.detail.cause !== value.status)) context.addIssue({ code: "custom", message: "CMS_EDITOR_BLOCK_RESOLUTION_INVALID" });
});
const cmsEditorBlockResolutionsSchema = z.object({ contract: z.literal("cms-editor-block-resolutions/v1"), entryId: z.string(), revisionId: z.string(), contentDigest: digestSchema, stateDigest: digestSchema, items: z.array(cmsEditorBlockResolutionSchema) }).strict();
const saveRevisionSuccessSchema = z.unknown();
const siteRouteClaimSchema = z.object({ graph: z.enum(["current", "published"]), normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict();
const siteRouteGraphSchema = z.object({ contract: z.literal("route-graph/v1"), normalization: z.literal("route-normalization/v1"), graph: z.enum(["current", "published"]), claims: z.array(siteRouteClaimSchema), digest: digestSchema }).strict();
const routeGraphDigestsSchema = z.object({ current: digestSchema, published: digestSchema }).strict();
const routeChangeProposalSchema = z.object({ contract: z.literal("route-change-proposal/v1"), baselineDigests: routeGraphDigestsSchema, claim: siteRouteClaimSchema, impact: z.array(z.object({ change: z.enum(["route-move", "attribution-only", "retained"]), graph: z.enum(["current", "published"]), owner: z.string(), from: z.string(), to: z.string(), resultingSourceRevisionId: z.string() }).strict()), resultingDigests: routeGraphDigestsSchema }).strict();
const publishRevisionSuccessSchema = z.unknown();
const releaseDiagnosticSchema = z.object({ code: z.string().regex(/^[A-Z0-9_]+$/u) }).strict();
const releaseDiagnosisSchema = z.object({ contract: z.literal("release-diagnosis/v1"), status: z.enum(["ready", "blocked"]), diagnostics: z.array(releaseDiagnosticSchema) }).strict();
const releaseBuildSchema = z.object({ contract: z.literal("release-build/v1"), artifactDigest: digestSchema, diagnostics: z.array(releaseDiagnosticSchema) }).strict();
const releaseReceiptSchema = z.object({ contract: z.literal("release-receipt/v1"), artifactDigest: digestSchema, targetDigest: digestSchema }).strict();
type AuthoringEntryDto = Readonly<z.infer<typeof authoringEntrySchema>>;
type CmsEditorBlockResolutionsDto = Readonly<z.infer<typeof cmsEditorBlockResolutionsSchema>>;
type CmsSeoAnalysisResponseDto = Readonly<z.infer<typeof cmsSeoAnalysisResponseSchema>>;
type EntryCatalogDto = Readonly<z.infer<typeof entryCatalogSchema>>;
type CptEntryDto = Readonly<z.infer<typeof cptEntrySchema>>;
type CptEntryCatalogDto = Readonly<z.infer<typeof cptEntryCatalogSchema>>;
type ContentTypeCatalogDto = Readonly<z.infer<typeof contentTypeCatalogSchema>>;
type ContentTypeDto = Readonly<z.infer<typeof contentTypeSchema>>;
type PluginManagementSnapshotDto = Readonly<z.infer<typeof pluginManagementSnapshotSchema>>;
type PreviewDocumentDto = Readonly<z.infer<typeof previewDocumentSchema>>;
type ReleaseDiagnosisDto = Readonly<z.infer<typeof releaseDiagnosisSchema>>;
type ReleaseBuildDto = Readonly<z.infer<typeof releaseBuildSchema>>;
type ReleaseReceiptDto = Readonly<z.infer<typeof releaseReceiptSchema>>;
type TaxonomySnapshotDto = Readonly<z.infer<typeof taxonomySnapshotSchema>>;
type TaxonomyCatalogDto = Readonly<z.infer<typeof taxonomyCatalogSchema>>;
type StructuredContent = Readonly<z.infer<typeof structuredContentSchema>>;
type MediaAssetV2Dto = Readonly<z.infer<typeof mediaAssetV2Schema>>;
type MediaCatalogV2Dto = Readonly<z.infer<typeof mediaCatalogV2Schema>>;
type MediaAssetDetailV2Dto = Readonly<z.infer<typeof mediaAssetDetailV2Schema>>;
type MediaUsageV2Dto = Readonly<z.infer<typeof mediaUsageV2Schema>>;
type SiteRouteGraphDto = Readonly<z.infer<typeof siteRouteGraphSchema>>;
type RouteChangeProposalDto = Readonly<z.infer<typeof routeChangeProposalSchema>>;
type StructuredBlock = StructuredContent["blocks"][number];
type InteractiveDemoBlock = Extract<StructuredBlock, Readonly<{ kind: "interactive-demo" }>>;

const seoKeys = ["title", "description", "canonicalPath"] as const;
type Seo = Readonly<{ title?: string | undefined; description?: string | undefined; canonicalPath?: string | undefined }>;
type NormalizedDocument = Readonly<{ content: StructuredContent; route: string }>;
type TaxonomyTermIdentity = Readonly<{ taxonomyId: string; termId: string }>;
export { openAuthoringSession } from "./session.js";

export class CmsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly remediation: string, readonly usage: readonly MediaUsageV2Dto[] = [], readonly subjectIds: readonly string[] = []) {
    super(remediation);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("CMS_CANONICAL_JSON_INVALID");
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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

function normalizeSeo(value: Seo): Seo {
  const result: Record<string, string> = {};
  for (const key of seoKeys) {
    const trimmed = value[key]?.trim();
    if (trimmed !== undefined && trimmed !== "") result[key] = trimmed;
  }
  return result as Seo;
}

function normalizeDocument(title: string, route: string, text: string, seo: Seo, blocks: readonly StructuredBlock[] = [{ kind: "article", text }]): NormalizedDocument {
  const normalizedRoute = route.trim().startsWith("/") ? route.trim() : `/${route.trim()}`;
  return { content: { contract: "site-content/v1", title, blocks: blocks.map((block) => block.kind === "article" ? { kind: "article", text } : block), seo: normalizeSeo(seo) }, route: normalizedRoute };
}

function articleDocument(value: unknown, route: string): NormalizedDocument | undefined {
  const parsed = structuredContentSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const articles = parsed.data.blocks.filter((block) => block.kind === "article");
  if (articles.length !== 1) return undefined;
  return normalizeDocument(parsed.data.title, route, articles[0]!.text, parsed.data.seo, parsed.data.blocks);
}

function isValidDocument(document: NormalizedDocument): boolean {
  const article = document.content.blocks.find((block) => block.kind === "article");
  return article !== undefined && document.content.title.trim() !== "" && document.route !== "/" && document.route.startsWith("/") && article.text.trim() !== "";
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

function slugify(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "");
}


class CmsApiClient {
  constructor(private readonly session: AuthoringSession) {}

  listEntries(): Promise<EntryCatalogDto> { return this.json("/v1/entries", entryCatalogSchema); }
  routeGraph(selection: "current" | "published"): Promise<SiteRouteGraphDto> { return this.json(`/v1/site/routes?selection=${selection}` as `/v1/${string}`, siteRouteGraphSchema); }
  proposeRouteChange(body: Record<string, unknown>): Promise<RouteChangeProposalDto> { return this.json("/v1/site/routes/change", routeChangeProposalSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  changeRoute(proposal: RouteChangeProposalDto): Promise<unknown> { return this.json("/v1/site/routes/change", undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "change-route-command/v1", operationId: crypto.randomUUID(), proposal }) }); }
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
  createTaxonomy(taxonomyId: string, label: string): Promise<TaxonomySnapshotDto> { return this.json("/v1/taxonomies", taxonomySnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "taxonomy-create-request/v1", taxonomyId: this.resourceId(taxonomyId), label }) }); }
  taxonomy(taxonomyId: string): Promise<TaxonomySnapshotDto> { return this.json(`/v1/taxonomies/${this.resourceId(taxonomyId)}`, taxonomySnapshotSchema); }
  entryCatalog(typeId: string): Promise<CptEntryCatalogDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntryCatalogSchema); }
  entry(typeId: string, entryId: string): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema); }
  createEntry(typeId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  saveEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<CptEntryDto> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}`, cptEntrySchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  deleteEntry(typeId: string, entryId: string, request: Record<string, unknown>): Promise<unknown> { return this.json(`/v1/content-types/${this.resourceId(typeId)}/entries/${this.resourceId(entryId)}/delete`, cptEntryDeletedSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
  current(entryId: string): Promise<AuthoringEntryDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/current`, authoringEntrySchema); }
  editorBlocks(entryId: string): Promise<CmsEditorBlockResolutionsDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/current/editor-blocks`, cmsEditorBlockResolutionsSchema); }
  plugins(): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins", pluginManagementSnapshotSchema); }
  replaceSettings(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/settings", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  activate(body: Record<string, unknown>): Promise<PluginManagementSnapshotDto> { return this.json("/v1/plugins/activate", pluginManagementSnapshotSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  analyze(entryId: string, body: Record<string, unknown>): Promise<CmsSeoAnalysisResponseDto> { return this.json(`/v1/entries/${this.resourceId(entryId)}/seo-analysis`, cmsSeoAnalysisResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  save(entryId: string, baseline: string | null, document: NormalizedDocument, taxonomyTerms: readonly TaxonomyTermIdentity[]): Promise<unknown> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/revisions`, saveRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "save-revision-request/v1", revisionId: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: document.content, route: document.route, assetVersions: [], taxonomyTerms }) });
  }
  publish(entryId: string, baseline: string): Promise<unknown> {
    return this.json(`/v1/entries/${this.resourceId(entryId)}/publish`, publishRevisionSuccessSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "publish-revision-request/v1", expectedCurrentRevisionId: baseline, operationId: crypto.randomUUID() }) });
  }
  preview(entryId: string, selection: "current" | "published"): Promise<PreviewDocumentDto> {
    return this.json("/v1/preview", previewDocumentSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "preview-request/v1", selection, subject: { entryId: this.resourceId(entryId) } }) });
  }
  diagnoseRelease(): Promise<ReleaseDiagnosisDto> { return this.json("/v1/release/diagnose", releaseDiagnosisSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "release-diagnose-request/v1" }) }); }
  buildRelease(): Promise<ReleaseBuildDto> { return this.json("/v1/release/build", releaseBuildSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "release-build-request/v1" }) }); }
  releaseArtifact(artifactDigest: string): Promise<ReleaseReceiptDto> { return this.json("/v1/release", releaseReceiptSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "release-request/v1", artifactDigest }) }); }
  redeliverArtifact(artifactDigest: string): Promise<ReleaseReceiptDto> { return this.json("/v1/redeliver", releaseReceiptSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "redeliver-request/v1", artifactDigest }) }); }

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


function entryStatusText(status: EntryCatalogDto["items"][number]["status"]): string {
  return status === "draft" ? "草稿" : status === "published" ? "已發布" : "已發布，有未發布變更";
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
  // 所有 CPT 的 document pathname 都是 `/cms/post`，因此 active 判定必須比較 canonical query 的 typeId，
  // 不能用 NavLink 的 pathname 比對（否則每個動態項目會同時 active）。
  const activeTypeId = location.pathname === "/cms/post" ? activeContentTypeId(location.search) : undefined;
  return <><a className="skip" href="#page-title">跳到主標題</a><header><p>本機 CMS 已連線。</p><nav aria-label="CMS 導覽"><NavLink to="/cms" end>首頁</NavLink>{menuItems.map((item) => <Link key={item.typeId} to={postPath(item.typeId)} aria-current={item.typeId === activeTypeId ? "page" : undefined}>{item.label}</Link>)}<NavLink to="/cms/entries">舊版文章</NavLink><NavLink to="/cms/entries/new">新增文章</NavLink><NavLink to="/cms/media">媒體庫</NavLink><NavLink to="/cms/content-types">內容類型</NavLink><NavLink to="/cms/taxonomies">分類</NavLink><NavLink to="/cms/plugins">外掛</NavLink><NavLink to="/cms/release">發布診斷</NavLink></nav></header><main id="workspace" aria-labelledby="page-title">{children}</main></>;
}

function EntryList({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [entries, setEntries] = useState<EntryCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setEntries(undefined); setError(undefined);
    void api.listEntries().then((value) => setEntries(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  if (entries === undefined) return <Layout><PageHeading>文章全覽</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  return <Layout><PageHeading>文章全覽</PageHeading>{entries.length === 0 ? <p>尚無文章。<Link to="/cms/entries/new">建立第一篇文章</Link></p> : <table><caption>所有文章</caption><thead><tr><th scope="col">標題</th><th scope="col">狀態</th><th scope="col">網址</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.entryId}><td><Link to={`/cms/entries/${entry.entryId}`}>{entry.title}</Link></td><td>{entryStatusText(entry.status)}</td><td>{entry.current.normalizedRoute}</td></tr>)}</tbody></table>}</Layout>;
}


/**
 * `/cms/post`（Article）與 `/cms/post?cpt=<typeId>`（其他 CPT）是 current entry 的唯一 document。
 * query canonicality 由 server admission 保證；這裡只做防禦性解析，讓非 canonical 值不會被當成 identity。
 * Article 的 seeded stable ID 來自 migration 0012。
 */
const articleTypeId = "00000000-0000-4000-8000-000000000001";
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function activeContentTypeId(search: string): string | undefined {
  if (search === "") return articleTypeId;
  const params = new URLSearchParams(search);
  const value = params.get("cpt");
  return params.size === 1 && value !== null && canonicalUuidPattern.test(value) && value !== articleTypeId ? value : undefined;
}

function postPath(typeId: string): string {
  return typeId === articleTypeId ? "/cms/post" : `/cms/post?cpt=${typeId}`;
}

type EntryForm = Readonly<{ title: string; slug: string; excerpt: string; text: string; blocks: readonly StructuredBlock[]; seoTitle: string; seoDescription: string; canonicalPath: string; status: "draft" | "published"; custom: Readonly<Record<string, unknown>> }>;

const emptyEntryForm: EntryForm = { title: "", slug: "", excerpt: "", text: "", blocks: [], seoTitle: "", seoDescription: "", canonicalPath: "", status: "draft", custom: {} };

function entryArticleText(entry: CptEntryDto): string {
  const article = entry.content.blocks.find((block) => block.kind === "article");
  return article === undefined ? "" : article.text;
}

function entryFormOf(entry: CptEntryDto): EntryForm {
  return { title: entry.content.title, slug: entry.slug, excerpt: entry.content.excerpt, text: entryArticleText(entry), blocks: entry.content.blocks, seoTitle: entry.content.seo.title ?? "", seoDescription: entry.content.seo.description ?? "", canonicalPath: entry.content.seo.canonicalPath ?? "", status: entry.status, custom: customValuesOf(entry) };
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
  return { contract: "cpt-content/v1", typeId, title: form.title, blocks: cptBlocksOf(form), excerpt: form.excerpt, seo: { ...(form.seoTitle.trim() === "" ? {} : { title: form.seoTitle }), ...(form.seoDescription.trim() === "" ? {} : { description: form.seoDescription }), ...(form.canonicalPath.trim() === "" ? {} : { canonicalPath: form.canonicalPath }) }, customValues: customValuesRequest(form.custom) };
}

function cptEntryStatusText(status: CptEntryDto["status"]): string {
  return status === "draft" ? "草稿" : "已發布";
}

/**
 * entry editor 的自訂欄位控制項：只依 definition metadata 渲染，不套任何 HTML constraint，
 * 也不重算 server 的驗證規則（required 只以 aria-required 與文字呈現）。
 */
function CustomFieldControl({ field, index, value, invalid, disabled, onChange }: Readonly<{ field: ContentField; index: number; value: unknown; invalid: boolean; disabled: boolean; onChange: (value: unknown) => void }>): React.JSX.Element {
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
        : <textarea aria-label={field.label} value={Array.isArray(value) ? (value as readonly string[]).join("\n") : ""} aria-invalid={invalid || undefined} onChange={(event) => { const lines = [...new Set(event.target.value.split("\n").map((line) => line.trim()).filter((line) => line !== ""))]; onChange(lines.length === 0 ? undefined : lines); }} disabled={disabled} placeholder="每行一個 asset ID" />;
    return <fieldset className="custom-field" data-custom-field={field.fieldId} tabIndex={-1} {...accessibility}>{<legend>{legend}</legend>}{hint}{body}{issue}</fieldset>;
  }
  if (field.kind === "single-select") return <label className="custom-field">{field.label}{field.required && "（必填）"}<select value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled}><option value="">未選擇</option>{(field.options ?? []).map((option) => <option key={option.optionId} value={option.optionId}>{option.label}</option>)}</select>{hint}{issue}</label>;
  if (field.kind === "textarea") return <label className="custom-field">{field.label}{field.required && "（必填）"}<textarea value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "number") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="number" value={typeof value === "number" ? String(value) : ""} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value.trim() === "" ? undefined : Number(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "datetime") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="datetime-local" value={isoToDatetimeLocal(value)} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(datetimeLocalToIso(event.target.value))} disabled={disabled} />{hint}{issue}</label>;
  if (field.kind === "date") return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="date" value={textValue} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
  // text 的空字串是合法的明示空值；url／single-media 的空輸入代表移除該值。
  const clearsOnEmpty = field.kind !== "text";
  const placeholder = field.kind === "single-media" ? "asset stable ID" : field.kind === "url" ? "https://example.com" : undefined;
  return <label className="custom-field">{field.label}{field.required && "（必填）"}<input type="text" value={textValue} placeholder={placeholder} data-custom-field={field.fieldId} aria-invalid={invalid || undefined} {...accessibility} onChange={(event) => onChange(clearsOnEmpty && event.target.value === "" ? undefined : event.target.value)} disabled={disabled} />{hint}{issue}</label>;
}

function CustomFieldsSection({ definition, values, invalidFieldIds, disabled, onChange }: Readonly<{ definition: ContentTypeDto; values: Readonly<Record<string, unknown>>; invalidFieldIds: readonly string[]; disabled: boolean; onChange: (fieldId: string, value: unknown) => void }>): React.JSX.Element | null {
  if (definition.fieldGroups.length === 0) return null;
  const positions = new Map<string, number>();
  let position = -1;
  for (const group of definition.fieldGroups) for (const field of group.fields) positions.set(field.fieldId, ++position);
  return <section aria-labelledby="custom-fields-heading">
    <h2 id="custom-fields-heading">自訂欄位</h2>
    {definition.fieldGroups.map((group) => <fieldset key={group.groupId}><legend>{group.label}</legend>{group.help !== "" && <p>{group.help}</p>}{group.fields.map((field) => <CustomFieldControl key={field.fieldId} field={field} index={positions.get(field.fieldId) ?? 0} value={values[field.fieldId]} invalid={invalidFieldIds.includes(field.fieldId)} disabled={disabled} onChange={(value) => onChange(field.fieldId, value)} />)}</fieldset>)}
  </section>;
}

function PostWorkspace({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { pathname, search } = useLocation();
  const typeId = pathname === "/cms/post" ? activeContentTypeId(search) : undefined;
  return typeId === undefined
    ? <Layout><PageHeading>內容</PageHeading><p role="alert">這個網址不是 canonical 的內容位置。</p><p><Link to="/cms/post">回到文章內容</Link></p></Layout>
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
        const [nextDefinition, nextCatalog] = await Promise.all([api.contentType(typeId), api.entryCatalog(typeId)]);
        setDefinition(nextDefinition); setCatalog(nextCatalog);
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
        ? await api.createEntry(typeId, { contract: "cpt-entry-create-request/v1", expectedStateDigest: catalog.stateDigest, ...(form.slug.trim() === "" ? {} : { slug: form.slug.trim() }), content, status: form.status })
        : await api.saveEntry(typeId, editingEntryId.current ?? "", { contract: "cpt-entry-save-request/v1", expectedStateDigest: baseline ?? "", slug: form.slug.trim(), content, status: form.status });
      editingEntryId.current = saved.entryId;
      setMode("edit"); setForm(entryFormOf(saved)); setBaseline(saved.stateDigest);
      setCatalog(await api.entryCatalog(typeId));
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
      {catalog.items.length === 0 ? <p>尚無內容。</p> : <table><caption>{definition.label}的所有內容</caption><thead><tr><th scope="col">標題</th><th scope="col">Slug</th><th scope="col">狀態</th><th scope="col">最後發布</th></tr></thead><tbody>{catalog.items.map((item) => <tr key={item.entryId}><td><button type="button" aria-current={item.entryId === editingEntryId.current ? "true" : undefined} onClick={() => void refreshEntry(item.entryId, true).catch((reason: unknown) => setError(message(reason)))}>{item.title}</button></td><td>{item.slug}</td><td>{cptEntryStatusText(item.status)}</td><td>{item.publishedAt ?? "尚未發布"}</td></tr>)}</tbody></table>}
    </section>
    {mode !== undefined && form !== undefined && <section aria-labelledby="entry-editor-heading">
      <h2 id="entry-editor-heading" ref={editorHeading} tabIndex={-1}>{mode === "create" ? "建立內容" : "編輯內容"}</h2>
      <p>{form.blocks.length === 1 ? "本文以外的區塊會原樣保留。" : `這個內容另有 ${String(form.blocks.length - 1)} 個非本文區塊；儲存時會原樣保留在原本位置。`}</p>
      <form aria-label="內容編輯" noValidate onSubmit={(event) => void save(event)}>
        <label>標題<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={locked} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} disabled={locked} /></label>
        <label>摘要<textarea value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} disabled={locked} /></label>
        <label>本文<textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} disabled={locked} /></label>
        {definition !== undefined && <CustomFieldsSection definition={definition} values={form.custom} invalidFieldIds={customErrors} disabled={locked} onChange={(fieldId, value) => setForm({ ...form, custom: value === undefined ? Object.fromEntries(Object.entries(form.custom).filter(([key]) => key !== fieldId)) : { ...form.custom, [fieldId]: value } })} />}
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
  const issues = useMemo(() => fieldGroupsIssues(drafts), [drafts]);
  const blocked = issues.size > 0;
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (catalog === undefined || label.trim() === "") { setError("請輸入內容類型名稱。"); return; }
    if (blocked) { setError(`欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。`); return; }
    try {
      const created = await api.createContentType({ contract: "content-type-create-request/v1", expectedStateDigest: catalog.stateDigest, label, ...(slug === "" ? {} : { slug }), help, order: Number(order), showInMenu, fieldGroups: fieldGroupsRequest(drafts), taxonomyAttachments: [] });
      setError(undefined); setStale(false);
      await catalogContext?.refresh();
      navigate(`/cms/content-types/${created.typeId}`);
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.code === "CONTENT_TYPE_STATE_CONFLICT") { setError("內容類型清單已由其他操作更新；請重新載入後再試。"); setStale(true); }
      else { setError(message(reason)); setStale(false); }
    }
  };
  const reload = (): void => { setError(undefined); setStale(false); void catalogContext?.refresh().catch((reason: unknown) => setError(message(reason))); };
  return <Layout><PageHeading>建立內容類型</PageHeading>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}<form aria-label="Content Type 定義" onSubmit={(event) => void submit(event)}><label>名稱<input required value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Slug（選填）<input value={slug} onChange={(event) => setSlug(event.target.value)} /></label><label>說明<textarea value={help} onChange={(event) => setHelp(event.target.value)} /></label><label>排序<input type="number" value={order} onChange={(event) => setOrder(event.target.value)} /></label><label><input type="checkbox" checked={showInMenu} onChange={(event) => setShowInMenu(event.target.checked)} />顯示於選單</label><ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={catalog === undefined} onChange={setDrafts} /><button disabled={catalog === undefined || blocked} type="submit">建立內容類型</button></form></Layout>;
}

type ContentTypeFormSubmission = Readonly<{ label: string; slug: string; help: string; order: number; showInMenu: boolean; fieldGroups: readonly unknown[] }>;

/**
 * Builder 的定義表單。以 `definition.stateDigest` 為 key 掛載，因此 draft 一定由目前 definition 導出，
 * 儲存成功後也一定由 response 重建；CAS token 與 payload 不會來自兩個不同來源。
 */
function ContentTypeDefinitionForm({ definition, busy, onSubmit }: Readonly<{ definition: ContentTypeDto; busy: boolean; onSubmit: (submission: ContentTypeFormSubmission) => Promise<void> }>): React.JSX.Element {
  const [drafts, setDrafts] = useState<readonly FieldGroupDraft[]>(() => groupDraftsOf(definition.fieldGroups));
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
    void onSubmit({ label, slug, help: String(form.get("help") ?? ""), order: Number(form.get("order")), showInMenu: form.has("showInMenu"), fieldGroups: fieldGroupsRequest(drafts) });
  };
  const alert = localError ?? (blocked ? `欄位群組仍有 ${String(issues.size)} 個問題，請先修正後再儲存。` : undefined);
  return <form aria-label="Content Type 定義" aria-busy={busy} noValidate onSubmit={submit}>
    <label>名稱<input name="label" required defaultValue={definition.label} disabled={busy} /></label>
    <label>Slug<input name="slug" required defaultValue={definition.slug} disabled={busy} /></label>
    <label>說明<textarea name="help" defaultValue={definition.help} disabled={busy} /></label>
    <label>排序<input name="order" type="number" defaultValue={definition.order} disabled={busy} /></label>
    <label><input name="showInMenu" type="checkbox" defaultChecked={definition.showInMenu} disabled={busy} />顯示於選單</label>
    <ContentTypeFieldGroupsEditor groups={drafts} issues={issues} disabled={busy} onChange={setDrafts} />
    {alert !== undefined && <p role="alert">{alert}</p>}
    <p><button type="submit" disabled={busy || blocked}>{busy ? "正在儲存…" : "儲存內容類型"}</button></p>
  </form>;
}

function ContentTypeDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { typeId } = useParams();
  const catalogContext = useContext(ContentTypeCatalogContext);
  const [definition, setDefinition] = useState<ContentTypeDto>();
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const load = useCallback((): void => { if (typeId === undefined) { setError("找不到內容類型。"); return; } setDefinition(undefined); setError(undefined); setStale(false); setStatus(undefined); void api.contentType(typeId).then(setDefinition).catch((reason: unknown) => setError(message(reason))); }, [api, typeId]);
  useEffect(load, [load]);
  if (definition === undefined) return <Layout><PageHeading>內容類型詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入內容類型。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const submit = async (submission: ContentTypeFormSubmission): Promise<void> => {
    setBusy(true); setStatus(undefined);
    try {
      const replaced = await api.replaceContentType(definition.typeId, { contract: "content-type-replace-request/v1", expectedStateDigest: definition.stateDigest, label: submission.label, slug: submission.slug, help: submission.help, order: submission.order, showInMenu: submission.showInMenu, fieldGroups: submission.fieldGroups, taxonomyAttachments: definition.taxonomyAttachments });
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
  return <Layout><PageHeading>內容類型：{definition.label}</PageHeading>{error !== undefined && <><p role="alert">{error}</p>{stale && <button onClick={reload}>重新載入</button>}</>}{status !== undefined && <p role="status" aria-live="polite">{status}</p>}<ContentTypeDefinitionForm key={definition.stateDigest} definition={definition} busy={busy} onSubmit={submit} /><dl><dt>Stable ID</dt><dd>{definition.typeId}</dd><dt>Slug</dt><dd>{definition.slug}</dd><dt>System fields</dt><dd>{definition.systemFields.join(", ")}</dd></dl><p>欄位群組：{definition.fieldGroups.length}；分類附掛：{definition.taxonomyAttachments.length}</p></Layout>;
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
  const [taxonomyId, setTaxonomyId] = useState("");
  const [label, setLabel] = useState("");
  const [idError, setIdError] = useState<string>();
  const [labelError, setLabelError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIdError(undefined);
    setLabelError(undefined);
    setFormError(undefined);
    if (!AUTHORING_RESOURCE_ID_PATTERN.test(taxonomyId)) {
      setIdError("Taxonomy ID 只能使用英數字、句點、底線、連字號或波浪號。");
      return;
    }
    if (label.trim() === "") {
      setLabelError("請輸入分類名稱。");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createTaxonomy(taxonomyId, label.trim());
      navigate(`/cms/taxonomies/${created.taxonomy.taxonomyId}`, { state: { createdTaxonomyId: created.taxonomy.taxonomyId } });
    } catch (reason) {
      const error = message(reason);
      if (reason instanceof CmsApiError && reason.code === "TAXONOMY_CONFLICT") setIdError(error);
      else setFormError(error);
    } finally {
      setBusy(false);
    }
  };
  return <Layout><PageHeading>建立分類</PageHeading><form aria-label="分類定義" aria-busy={busy} onSubmit={(event) => void submit(event)}><label htmlFor="taxonomy-id">Taxonomy ID<input id="taxonomy-id" required value={taxonomyId} onChange={(event) => { setTaxonomyId(event.target.value); setIdError(undefined); }} aria-invalid={idError !== undefined} aria-describedby={idError === undefined ? undefined : "taxonomy-id-error"} disabled={busy} /></label>{idError !== undefined && <p id="taxonomy-id-error" role="alert">{idError}</p>}<label htmlFor="taxonomy-label">分類名稱<input id="taxonomy-label" required value={label} onChange={(event) => { setLabel(event.target.value); setLabelError(undefined); }} aria-invalid={labelError !== undefined} aria-describedby={labelError === undefined ? undefined : "taxonomy-label-error"} disabled={busy} /></label>{labelError !== undefined && <p id="taxonomy-label-error" role="alert">{labelError}</p>}{formError !== undefined && <p role="alert">{formError}</p>}<p role="status" aria-live="polite" aria-atomic="true">{busy ? "正在建立分類。" : ""}</p><button type="submit" disabled={busy}>{busy ? "正在建立…" : "建立分類"}</button></form></Layout>;
}

function TaxonomyDetail({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const { taxonomyId } = useParams();
  const { state } = useLocation();
  const [snapshot, setSnapshot] = useState<TaxonomySnapshotDto>();
  const [error, setError] = useState<string>();
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
  if (snapshot === undefined) return <Layout><PageHeading>分類詳情</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入分類。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const createdTaxonomyId = typeof state === "object" && state !== null && "createdTaxonomyId" in state && typeof state.createdTaxonomyId === "string" ? state.createdTaxonomyId : undefined;
  return <Layout><PageHeading>分類：{snapshot.taxonomy.label}</PageHeading>{createdTaxonomyId === snapshot.taxonomy.taxonomyId && <p role="status" aria-live="polite" aria-atomic="true">已建立分類。</p>}<dl><dt>Taxonomy ID</dt><dd>{snapshot.taxonomy.taxonomyId}</dd></dl><section aria-labelledby="taxonomy-terms"><h2 id="taxonomy-terms">Terms</h2>{snapshot.terms.length === 0 ? <p>尚無 term。</p> : <table><caption>所有 terms</caption><thead><tr><th scope="col">名稱</th><th scope="col">Slug</th><th scope="col">順序</th><th scope="col">狀態</th></tr></thead><tbody>{snapshot.terms.map((term) => <tr key={term.termId}><td>{term.label}</td><td>{term.slug}</td><td>{term.order}</td><td>{term.state === "live" ? "使用中" : "已停用"}</td></tr>)}</tbody></table>}</section></Layout>;
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
  const [entries, setEntries] = useState<EntryCatalogDto["items"]>();
  const [error, setError] = useState<string>();
  const load = useCallback((): void => {
    setEntries(undefined); setError(undefined);
    void api.listEntries().then((value) => setEntries(value.items)).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  const actionableEntries = entries === undefined ? [] : entries.filter((entry) => entry.status !== "published").slice(0, 5);
  return <Layout><PageHeading>CMS 文章工作台</PageHeading><p>建立、編輯並發布文章；發布只會更新已發布版本。</p><p><Link className="action-link" to="/cms/entries/new">建立文章</Link> <Link to="/cms/entries">查看所有文章</Link></p><section aria-labelledby="actionable-entries"><h2 id="actionable-entries">待處理文章</h2>{entries === undefined ? error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></> : actionableEntries.length === 0 ? <p>目前沒有待處理文章。<Link to="/cms/entries">查看所有文章</Link></p> : <ul>{actionableEntries.map((entry) => <li key={entry.entryId}><Link to={`/cms/entries/${entry.entryId}`}>{entry.title}</Link>（{entryStatusText(entry.status)}）</li>)}</ul>}</section></Layout>;
}

function Plugins({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PluginManagementSnapshotDto>();
  const [url, setUrl] = useState("");
  const [indexing, setIndexing] = useState<"allow" | "disallow">("disallow");
  const [saved, setSaved] = useState<Readonly<{ url: string; indexing: "allow" | "disallow" }>>();
  const [busy, setBusy] = useState<"settings" | "activation">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<"settings" | "activation">();
  const reload = useRef<HTMLButtonElement>(null);
  const load = useCallback((): void => {
    setError(undefined); setNotice("");
    void api.plugins().then((next) => {
      setSnapshot(next); setConflict(undefined);
      const plugin = next.plugins.find((item) => item.identity.id === "seo-basics");
      const settings = plugin?.settings?.settings;
      setUrl(settings?.publicSiteUrl ?? "");
      setIndexing(settings?.indexing ?? "disallow");
      setSaved(settings === undefined ? undefined : { url: settings.publicSiteUrl, indexing: settings.indexing });
    }).catch((reason: unknown) => { setSnapshot(undefined); setError(message(reason)); });
  }, [api]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict !== undefined) reload.current?.focus(); }, [conflict]);
  if (snapshot === undefined) return <Layout><PageHeading>外掛</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入外掛。</p> : <><p role="alert">{error}</p><button onClick={load}>重試</button></>}</Layout>;
  const plugin = snapshot.plugins.find((item) => item.identity.id === "seo-basics");
  if (plugin === undefined) return <Layout><PageHeading>外掛</PageHeading><p role="alert">找不到 seo-basics 外掛。</p><button onClick={load}>重新載入外掛狀態</button></Layout>;
  const formDirty = saved === undefined || saved.url !== url || saved.indexing !== indexing;
  const validUrl = (() => { try { return url !== "" && new URL(url).protocol === "https:"; } catch { return false; } })();
  const mutationsLocked = busy !== undefined || conflict !== undefined;
  const settings = plugin.settings;
  const canActivate = settings !== undefined && !formDirty && plugin.status === "inactive" && !mutationsLocked;
  const saveSettings = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!validUrl || mutationsLocked) return;
    setBusy("settings"); setError(undefined); setNotice("");
    try {
      const next = await api.replaceSettings({ contract: "plugin-settings-replace-request/v1", identity: plugin.identity, expectedSettingsStateDigest: snapshot.settingsStateDigest, settingsContract: "seo-plugin-settings/v1", settings: { contract: "seo-plugin-settings/v1", publicSiteUrl: url, indexing } });
      setSnapshot(next); setSaved({ url, indexing }); setNotice("SEO 設定已儲存。現在可以啟用外掛。");
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict("settings");
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  const activate = async (): Promise<void> => {
    if (!canActivate) return;
    setBusy("activation"); setError(undefined); setNotice("");
    try {
      const next = await api.activate({ contract: "plugin-activation-request/v1", identity: plugin.identity, expectedActivationStateDigest: snapshot.activationStateDigest });
      setSnapshot(next); setNotice(`已啟用：${plugin.identity.id}@${plugin.identity.version}`);
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) setConflict("activation");
      else setError(message(reason));
    } finally { setBusy(undefined); }
  };
  return <Layout><PageHeading>外掛</PageHeading>{error !== undefined && <p role="alert">{error}</p>}{conflict !== undefined && <p role="alert">{conflict === "settings" ? "外掛設定已由另一個頁面更新。請重新載入。" : "外掛啟用狀態已由另一個頁面更新。請重新載入。"}</p>}<p role="status" aria-live="polite">{busy === "settings" ? "正在儲存…" : busy === "activation" ? "正在啟用…" : notice}</p><section aria-labelledby="seo-basics-heading"><h2 id="seo-basics-heading">seo-basics</h2><form onSubmit={(event) => void saveSettings(event)}><label>公開網站 URL<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={mutationsLocked} aria-invalid={url !== "" && !validUrl} /></label><fieldset disabled={mutationsLocked}><legend>索引設定</legend><label><input type="radio" name="indexing" checked={indexing === "allow"} onChange={() => setIndexing("allow")} />允許搜尋引擎索引</label><label><input type="radio" name="indexing" checked={indexing === "disallow"} onChange={() => setIndexing("disallow")} />禁止搜尋引擎索引</label></fieldset><button type="submit" disabled={!validUrl || !formDirty || mutationsLocked}>儲存 SEO 設定</button></form><p>狀態：{plugin.status}</p><button ref={reload} type="button" onClick={load}>重新載入外掛狀態</button><button type="button" onClick={() => void activate()} disabled={!canActivate}>{plugin.status === "active" ? "SEO Plugin 已啟用" : "啟用 SEO Plugin"}</button></section></Layout>;
}

function SeoPreview({ analysis, busy, invalid, failure }: Readonly<{ analysis: CmsSeoAnalysisResponseDto | undefined; busy: boolean; invalid: boolean; failure: string | undefined }>): React.JSX.Element {
  const suggestions = analysis?.suggestions ?? [];
  const status = invalid ? "填寫標題、網址代稱與本文後即可查看 SEO 預覽。" : busy || analysis === undefined ? "內容已變更，正在更新 SEO 預覽…" : failure !== undefined ? failure : analysis.status === "unavailable" ? "SEO 預覽目前無法使用；不影響儲存或發布。SEO 建議目前無法取得。請檢查外掛設定後再試。" : suggestions.length === 0 ? "目前沒有 SEO 建議。" : suggestions.map((suggestion) => suggestion.code === "SEO_TITLE_MISSING" ? "建議填寫 SEO 標題；目前預覽使用文章標題。" : suggestion.code === "SEO_DESCRIPTION_MISSING" ? "建議填寫 Meta description。" : suggestion.code).join(" ");
  return <aside aria-labelledby="seo-preview-heading"><section aria-busy={busy}><h2 id="seo-preview-heading">SEO 預覽</h2><p role="status" aria-live="polite" aria-atomic="true">{status}</p>{!invalid && !busy && failure === undefined && analysis?.status === "available" && <>{analysis.preview?.title !== undefined && <h3>{analysis.preview.title}</h3>}{analysis.preview?.description !== undefined && <p>{analysis.preview.description}</p>}{analysis.preview?.canonicalUrl !== undefined && <p className="breakable">{analysis.preview.canonicalUrl}</p>}<ul>{suggestions.map((suggestion) => <li key={suggestion.code}>{suggestion.code}</li>)}</ul></>}</section></aside>;
}

/**
 * `failure` 只驅動這個 block 的 status text；對應的 `role="alert"` 由 Editor 統一渲染一次。
 * 一份 document 可含多個 interactive block，逐 block 重複 alert 會讓同一則訊息被 AT 播報多次。
 */
function EditorPluginBlock({ block, blockIndex, resolution, failure }: Readonly<{ block: InteractiveDemoBlock; blockIndex: number; resolution: CmsEditorBlockResolutionsDto["items"][number] | undefined; failure: string | undefined }>): React.JSX.Element {
  const ordinal = blockIndex + 1;
  const headingId = `editor-plugin-block-${blockIndex}-heading`;
  const statusId = `editor-plugin-block-${blockIndex}-status`;
  const identity = `${block.identity.id}@${block.identity.version}`;
  const status = resolution === undefined
    ? failure === undefined ? `正在解析外掛 ${identity}。` : failure
    : resolution.status === "active" ? `外掛 ${identity} 已啟用；已顯示 Host output。`
      : resolution.status === "inactive" ? `外掛 ${identity} 尚未啟用；已保留原始內容。`
        : resolution.status === "missing" ? `找不到外掛 ${identity}；已保留原始內容。`
          : `外掛 ${identity} identity 已變更；已保留原始內容。`;
  return <section aria-labelledby={headingId} aria-busy={resolution === undefined && failure === undefined}>
    <h2 id={headingId}>互動區塊 {ordinal}</h2>
    <dl><dt>Plugin</dt><dd>{identity}</dd><dt>Manifest hash</dt><dd className="breakable">{block.manifestHash}</dd></dl>
    <p id={statusId} role="status" aria-live="polite" aria-atomic="true" aria-label={`互動區塊 ${ordinal} 狀態`}>{status}</p>
    {resolution?.status === "active" && <pre role="region" tabIndex={0} aria-label={`互動區塊 ${ordinal} Host output`} aria-describedby={statusId}>{canonicalJson(resolution.output)}</pre>}
    {resolution !== undefined && resolution.status !== "active" && <>{resolution.diagnostic !== undefined && <div role="note" aria-labelledby={`editor-plugin-block-${blockIndex}-diagnostic`}><h3 id={`editor-plugin-block-${blockIndex}-diagnostic`}>Plugin 診斷</h3><p>{resolution.diagnostic.code}</p><p>{resolution.diagnostic.remediation.message}</p></div>}<pre role="region" tabIndex={0} aria-label={`互動區塊 ${ordinal} 保留的來源`} aria-describedby={statusId}>{canonicalJson(resolution.source)}</pre></>}
  </section>;
}

function Editor({ api, create }: Readonly<{ api: CmsApiClient; create: boolean }>): React.JSX.Element {
  const { entryId: routeEntryId } = useParams();
  const navigate = useNavigate();
  const generatedId = useRef("");
  if (generatedId.current === "") generatedId.current = crypto.randomUUID();
  const entryId = routeEntryId ?? generatedId.current;
  const timer = useRef<number | undefined>(undefined);
  const analysisGeneration = useRef(0);
  const editorBlockGeneration = useRef(0);
  const reload = useRef<HTMLButtonElement>(null);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const cancelPublish = useRef<HTMLButtonElement>(null);
  const confirmPublish = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const currentPreviewTab = useRef<HTMLButtonElement>(null);
  const publishedPreviewTab = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState("");
  const [route, setRoute] = useState("");
  const [text, setText] = useState("");
  const [seo, setSeo] = useState<Seo>({});
  const [blocks, setBlocks] = useState<readonly StructuredBlock[]>([{ kind: "article", text: "" }]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [taxonomyTerms, setTaxonomyTerms] = useState<readonly TaxonomyTermIdentity[]>([]);
  const [savedDocument, setSavedDocument] = useState<string>();
  const [loading, setLoading] = useState(!create);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [publishError, setPublishError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysis, setAnalysis] = useState<CmsSeoAnalysisResponseDto>();
  const [analysisFailure, setAnalysisFailure] = useState<string>();
  const [editorBlockResolutions, setEditorBlockResolutions] = useState<CmsEditorBlockResolutionsDto>();
  const [editorBlockFailure, setEditorBlockFailure] = useState<string>();
  const [currentPreview, setCurrentPreview] = useState<string>();
  const [publishedPreview, setPublishedPreview] = useState<string | null>();
  const [previewError, setPreviewError] = useState<string>();
  const [previewSelection, setPreviewSelection] = useState<"current" | "published">("current");
  const normalized = useMemo(() => normalizeDocument(title, route, text, seo, blocks), [blocks, route, seo, text, title]);
  const normalizedBytes = useMemo(() => canonicalJson(normalized), [normalized]);
  const valid = isValidDocument(normalized);
  const isNew = baseline === null && savedDocument === undefined;
  const dirty = isNew || normalizedBytes !== savedDocument;
  const focusConflict = (): void => { setConflict(true); setNotice(""); setError(undefined); };
  const selectPreview = (selection: "current" | "published", focus = false): void => {
    setPreviewSelection(selection);
    if (focus) (selection === "current" ? currentPreviewTab : publishedPreviewTab).current?.focus();
  };
  const previewKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      selectPreview(event.key === "Home" ? "current" : event.key === "End" ? "published" : event.key === "ArrowLeft" ? previewSelection === "current" ? "published" : "current" : previewSelection === "published" ? "current" : "published", true);
    }
  };
  const trapPublishFocus = (event: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelPublish.current) {
      event.preventDefault();
      confirmPublish.current?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmPublish.current) {
      event.preventDefault();
      cancelPublish.current?.focus();
    }
  };
  const adopt = (entry: AuthoringEntryDto): boolean => {
    const document = articleDocument(entry.current.content, entry.current.route);
    const article = document?.content.blocks.find((block) => block.kind === "article");
    // 每次 adopt 都換掉 editing instance；比它更早發出的 editor-block response 一律作廢。
    editorBlockGeneration.current += 1;
    if (document === undefined || article === undefined) { setError("目前 revision 無法作為 Article 編輯。"); return false; }
    setTitle(document.content.title); setRoute(document.route.slice(1)); setText(article.text); setSeo(document.content.seo); setBlocks(document.content.blocks); setBaseline(entry.current.revisionId); setSavedDocument(canonicalJson(document)); setEditorBlockResolutions(undefined); setEditorBlockFailure(undefined);
    setTaxonomyTerms(entry.current.taxonomyBindings.map(({ taxonomyId, termId }) => ({ taxonomyId, termId }))); setConflict(false);
    return true;
  };
  const refreshPreviews = async (): Promise<void> => {
    const [current, published] = await Promise.allSettled([api.preview(entryId, "current"), api.preview(entryId, "published")]);
    if (current.status === "fulfilled") setCurrentPreview(current.value.document);
    else setPreviewError(message(current.reason));
    if (published.status === "fulfilled") setPublishedPreview(published.value.document);
    else if (published.reason instanceof CmsApiError && published.reason.status === 404) setPublishedPreview(null);
    else setPreviewError(message(published.reason));
  };
  /**
   * Editor 以 block index 對齊 resolution，因此只採用「與目前 editing instance 完全相符」的 response：
   * generation 擋掉切換文章後才回來的 stale response（否則另一篇文章的 Host output 會落在這裡的 block 上）；
   * revision/digest 擋掉 canonical drift；index 序列與單一 activeStateDigest 擋掉 partial 或跨 activation
   * state 拼出來的 snapshot——Application 是逐 block 呼叫 Host，中途的 activation 變更會讓各 item 不同源。
   */
  const refreshEditorBlocks = async (entry: AuthoringEntryDto): Promise<void> => {
    const generation = editorBlockGeneration.current;
    const document = articleDocument(entry.current.content, entry.current.route);
    if (document === undefined) return;
    const expected = document.content.blocks.flatMap((block, blockIndex) => block.kind === "interactive-demo" ? [blockIndex] : []);
    if (expected.length === 0) return;
    try {
      const next = await api.editorBlocks(entryId);
      if (editorBlockGeneration.current !== generation) return;
      const aligned = next.items.length === expected.length && expected.every((blockIndex, position) => next.items[position]?.blockIndex === blockIndex);
      const singleState = next.items.every((item) => item.activeStateDigest === next.items[0]?.activeStateDigest);
      if (next.entryId !== entryId || next.revisionId !== entry.current.revisionId || next.contentDigest !== entry.current.contentDigest || !aligned || !singleState) { setEditorBlockFailure("互動區塊狀態已變更，請重新載入文章。"); return; }
      setEditorBlockResolutions(next);
    } catch (reason) {
      if (editorBlockGeneration.current !== generation) return;
      setEditorBlockFailure(message(reason));
    }
  };
  const load = useCallback((): void => {
    if (create) return;
    setLoading(true); setNotFound(false); setError(undefined);
    void api.current(entryId).then(async (entry) => {
      if (adopt(entry)) await Promise.all([refreshPreviews(), refreshEditorBlocks(entry)]);
    }).catch((reason: unknown) => {
      if (reason instanceof CmsApiError && reason.status === 404) setNotFound(true);
      else setError(message(reason));
    }).finally(() => setLoading(false));
  // refreshPreviews、refreshEditorBlocks 和 adopt 都刻意使用目前 editing instance。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, create, entryId]);
  useEffect(load, [load]);
  useEffect(() => { if (conflict) reload.current?.focus(); }, [conflict]);
  useEffect(() => { if (notice === "已發布。") status.current?.focus(); }, [notice]);
  useEffect(() => {
    const generation = ++analysisGeneration.current;
    if (timer.current !== undefined) clearTimeout(timer.current);
    if (!valid || conflict) { setAnalysisBusy(false); return; }
    setAnalysisBusy(true); setAnalysisFailure(undefined);
    timer.current = window.setTimeout(() => {
      void (async () => {
        const documentDigest = await sha256(canonicalJson({ entryId, expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: normalized.content, route: normalized.route }));
        try {
          const next = await api.analyze(entryId, { contract: "cms-seo-analysis-request/v1", entryId, expectedCurrentRevisionId: baseline, schemaIdentity: { schemaId: "site-content", version: 1 }, content: normalized.content, route: normalized.route, documentDigest });
          if (analysisGeneration.current === generation && next.documentDigest === documentDigest) { setAnalysis(next); setAnalysisBusy(false); }
        } catch (reason) {
          if (analysisGeneration.current !== generation) return;
          if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
          else { setAnalysisBusy(false); setAnalysisFailure("SEO 預覽目前無法使用；不影響儲存或發布。"); }
        }
      })();
    }, 400);
    return () => { if (timer.current !== undefined) clearTimeout(timer.current); };
  }, [api, baseline, conflict, entryId, normalized, valid]);
  useEffect(() => {
    const element = dialog.current;
    const close = (): void => publishTrigger.current?.focus();
    element?.addEventListener("cancel", close);
    return () => element?.removeEventListener("cancel", close);
  }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!valid || !dirty || entryBusy || conflict) return;
    if (timer.current !== undefined) clearTimeout(timer.current);
    analysisGeneration.current += 1;
    setEntryBusy(true); setError(undefined); setNotice("");
    try {
      await api.save(entryId, baseline, normalized, taxonomyTerms);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await Promise.all([refreshPreviews(), refreshEditorBlocks(refreshed)]);
      setNotice("已儲存。");
      if (create) navigate(`/cms/entries/${entryId}`, { replace: true });
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setError(message(reason));
    } finally { setEntryBusy(false); }
  };
  const openPublish = (): void => { setPublishError(undefined); dialog.current?.showModal(); cancelPublish.current?.focus(); };
  const publish = async (): Promise<void> => {
    if (baseline === null || dirty || entryBusy || conflict) return;
    setEntryBusy(true); setPublishError(undefined); setNotice("");
    try {
      await api.publish(entryId, baseline);
      const refreshed = await api.current(entryId);
      if (!adopt(refreshed)) return;
      await Promise.all([refreshPreviews(), refreshEditorBlocks(refreshed)]);
      setNotice("已發布。");
      dialog.current?.close();
    } catch (reason) {
      if (reason instanceof CmsApiError && reason.status === 409) focusConflict();
      else setPublishError(message(reason));
    } finally { setEntryBusy(false); }
  };
  if (loading) return <Layout><PageHeading>編輯文章</PageHeading><p role="status" aria-live="polite" aria-busy="true">正在載入文章。</p></Layout>;
  if (notFound) return <Layout><PageHeading>編輯文章</PageHeading><p role="alert">找不到這篇文章。</p><button onClick={load}>重試</button></Layout>;
  const mutationLocked = entryBusy || conflict;
  const resolutionsByBlockIndex = new Map(editorBlockResolutions?.items.map((item) => [item.blockIndex, item]));
  const currentRevisionText = baseline === null ? "尚未儲存" : baseline;
  const operationStatus = entryBusy ? baseline === null ? "正在儲存新文章…" : "正在處理文章變更…" : notice || (dirty ? "有未儲存的變更；頁面預覽尚未更新，發布已停用。" : "頁面預覽顯示已儲存內容；SEO 預覽分析目前表單內容。");
  return <Layout>
    <PageHeading>{isNew ? "新增文章" : "編輯文章"}</PageHeading>
    {error !== undefined && <p role="alert">{error}</p>}
    {conflict && <><p role="alert">內容已由另一個頁面更新。</p><button ref={reload} onClick={load}>重新載入文章</button></>}
    {editorBlockFailure !== undefined && <p role="alert">{editorBlockFailure}</p>}
    <section className="editor">
      <form id="entry-editor" aria-label="文章內容" onSubmit={(event) => void save(event)}>
        <label>標題<input required aria-invalid={!valid && title.trim() === ""} value={title} onChange={(event) => { setTitle(event.target.value); if (route === "") setRoute(slugify(event.target.value)); }} disabled={mutationLocked} /></label>
        <label>網址代稱<input required value={route} onChange={(event) => setRoute(event.target.value)} disabled={mutationLocked} /></label>
        <label>本文<textarea required value={text} onChange={(event) => setText(event.target.value)} disabled={mutationLocked} /></label>
        {normalized.content.blocks.map((block, blockIndex) => block.kind === "interactive-demo" && <EditorPluginBlock key={`${block.identity.id}\0${blockIndex}`} block={block} blockIndex={blockIndex} resolution={resolutionsByBlockIndex.get(blockIndex)} failure={editorBlockFailure} />)}
        <fieldset><legend>SEO</legend><p>留白時使用文章標題</p><label>SEO 標題<input value={seo.title ?? ""} onChange={(event) => setSeo((current) => ({ ...current, title: event.target.value }))} disabled={mutationLocked} /></label><p>留白時會顯示 SEO 建議</p><label>Meta description<textarea value={seo.description ?? ""} onChange={(event) => setSeo((current) => ({ ...current, description: event.target.value }))} disabled={mutationLocked} /></label><p>留白時使用文章網址；站內路徑須以 / 開頭</p><label>Canonical path<input value={seo.canonicalPath ?? ""} onChange={(event) => setSeo((current) => ({ ...current, canonicalPath: event.target.value }))} disabled={mutationLocked} /></label></fieldset>
      </form>
      <div className="preview-column">
        <aside aria-labelledby="entry-actions-heading"><h2 id="entry-actions-heading">文章動作</h2><p>目前 revision：<span className="breakable">{currentRevisionText}</span></p><p ref={status} role="status" tabIndex={-1} aria-live="polite" aria-atomic="true">{operationStatus}</p><button form="entry-editor" type="submit" disabled={!valid || !dirty || mutationLocked}>{entryBusy ? "正在儲存…" : "儲存"}</button><button ref={publishTrigger} type="button" onClick={openPublish} disabled={baseline === null || dirty || mutationLocked}>發布</button></aside>
        <SeoPreview analysis={analysis} busy={analysisBusy} invalid={!valid} failure={analysisFailure} />
        <aside aria-labelledby="page-preview-heading"><h2 id="page-preview-heading">頁面預覽</h2>{previewError !== undefined && <p role="alert">{previewError}</p>}<div role="tablist" aria-label="頁面預覽版本"><button ref={currentPreviewTab} id="current-preview-tab" type="button" role="tab" tabIndex={previewSelection === "current" ? 0 : -1} aria-selected={previewSelection === "current"} aria-controls="current-preview-panel" onClick={() => selectPreview("current")} onKeyDown={previewKeyDown}>目前版本</button><button ref={publishedPreviewTab} id="published-preview-tab" type="button" role="tab" tabIndex={previewSelection === "published" ? 0 : -1} aria-selected={previewSelection === "published"} aria-controls="published-preview-panel" onClick={() => selectPreview("published")} onKeyDown={previewKeyDown}>已發布版本</button></div>{previewSelection === "current" ? <section id="current-preview-panel" role="tabpanel" aria-labelledby="current-preview-tab">{currentPreview === undefined ? <p>尚未儲存</p> : <iframe title="目前版本頁面預覽" sandbox="" srcDoc={currentPreview} />}</section> : <section id="published-preview-panel" role="tabpanel" aria-labelledby="published-preview-tab">{publishedPreview === null || publishedPreview === undefined ? <p>尚未發布</p> : <iframe title="已發布版本頁面預覽" sandbox="" srcDoc={publishedPreview} />}</section>}</aside>
      </div>
    </section>

    <dialog ref={dialog} aria-labelledby="publish-dialog-title" aria-describedby="publish-dialog-description" onKeyDown={trapPublishFocus}><h2 id="publish-dialog-title">發布文章</h2><p id="publish-dialog-description">將發布目前 revision：<span className="breakable">{currentRevisionText}</span>。發布只會更新已發布版本。</p>{publishError !== undefined && <p role="alert">{publishError}</p>}<button ref={cancelPublish} type="button" onClick={() => { dialog.current?.close(); publishTrigger.current?.focus(); }} disabled={entryBusy}>取消</button><button ref={confirmPublish} type="button" onClick={() => void publish()} disabled={entryBusy}>{entryBusy ? "正在發布…" : "確認發布"}</button></dialog>
  </Layout>;
}
function SiteRouteWorkspace({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [current, setCurrent] = useState<SiteRouteGraphDto>();
  const [published, setPublished] = useState<SiteRouteGraphDto>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [graph, setGraph] = useState<"current" | "published">("current");
  const [owner, setOwner] = useState("");
  const [sourceRevisionId, setSourceRevisionId] = useState("");
  const [route, setRoute] = useState("");
  const load = useCallback((): void => {
    setCurrent(undefined); setPublished(undefined); setError(undefined);
    void Promise.all([api.routeGraph("current"), api.routeGraph("published")]).then(([nextCurrent, nextPublished]) => {
      setCurrent(nextCurrent); setPublished(nextPublished);
    }).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  const claims = graph === "current" ? current?.claims ?? [] : published?.claims ?? [];
  const selectClaim = (value: string): void => {
    const claim = claims[Number(value)];
    if (claim === undefined) return;
    setOwner(claim.owner); setSourceRevisionId(claim.sourceRevisionId); setRoute(claim.normalizedRoute);
  };
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (current === undefined || published === undefined || owner === "" || sourceRevisionId === "" || route.trim() === "") return;
    setBusy(true); setError(undefined); setStatus("正在驗證路由變更。");
    void api.proposeRouteChange({ contract: "route-change-proposal-request/v1", expectedRouteGraphDigests: { current: current.digest, published: published.digest }, graph, owner, route, sourceRevisionId }).then((proposal) => api.changeRoute(proposal)).then(() => {
      setStatus("路由已更新。"); load();
    }).catch((reason: unknown) => {
      const code = reason instanceof CmsApiError ? reason.code : "";
      setError(code === "STALE_ROUTE_PROPOSAL" || code === "ROUTE_CONFLICT" ? "路由已由其他操作更新；請重新載入後再試。" : message(reason));
    }).finally(() => setBusy(false));
  };
  return <Layout><PageHeading>Site route 管理</PageHeading>
    <p role="status" aria-live="polite" aria-atomic="true">{status}</p>
    {error !== undefined && <p role="alert">{error}</p>}
    {current === undefined || published === undefined
      ? error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在載入路由圖。</p> : <button onClick={load}>重試</button>
      : <><section aria-labelledby="route-graphs-heading"><h2 id="route-graphs-heading">目前與已發布路由</h2>
        {(["current", "published"] as const).map((selection) => { const snapshot = selection === "current" ? current : published; return <section key={selection} aria-labelledby={`${selection}-routes-heading`}><h3 id={`${selection}-routes-heading`}>{selection === "current" ? "目前版本" : "已發布版本"}</h3>{snapshot.claims.length === 0 ? <p>此路由圖尚無 route claim。</p> : <table><caption>{selection === "current" ? "目前版本 route claims" : "已發布版本 route claims"}</caption><thead><tr><th scope="col">路徑</th><th scope="col">Owner</th><th scope="col">來源 revision</th></tr></thead><tbody>{snapshot.claims.map((claim) => <tr key={`${claim.normalizedRoute}\0${claim.owner}`}><td>{claim.normalizedRoute}</td><td>{claim.owner}</td><td className="breakable">{claim.sourceRevisionId}</td></tr>)}</tbody></table>}</section>; })}
      </section><section aria-labelledby="change-route-heading"><h2 id="change-route-heading">變更路由</h2><form onSubmit={submit}><label>Route graph<select value={graph} onChange={(event) => { const next = event.target.value as "current" | "published"; setGraph(next); setOwner(""); setSourceRevisionId(""); setRoute(""); }} disabled={busy}><option value="current">目前版本</option><option value="published">已發布版本</option></select></label><label>現有 claim<select value={owner === "" ? "" : String(claims.findIndex((claim) => claim.owner === owner && claim.sourceRevisionId === sourceRevisionId))} onChange={(event) => selectClaim(event.target.value)} disabled={busy || claims.length === 0}><option value="">選擇 claim</option>{claims.map((claim, index) => <option key={`${claim.normalizedRoute}\0${claim.owner}`} value={index}>{claim.normalizedRoute} — {claim.owner}</option>)}</select></label><label>新 route<input required value={route} onChange={(event) => setRoute(event.target.value)} disabled={busy || owner === ""} /></label><button type="submit" disabled={busy || owner === ""}>{busy ? "正在變更…" : "變更路由"}</button></form></section></>}
  </Layout>;
}

function Release({ api }: Readonly<{ api: CmsApiClient }>): React.JSX.Element {
  const [diagnosis, setDiagnosis] = useState<ReleaseDiagnosisDto>();
  const [build, setBuild] = useState<ReleaseBuildDto>();
  const [receipt, setReceipt] = useState<ReleaseReceiptDto>();
  const [busy, setBusy] = useState<"build" | "release" | "redeliver">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const retry = useRef<HTMLButtonElement>(null);
  const load = useCallback((): void => {
    setDiagnosis(undefined); setBuild(undefined); setReceipt(undefined); setError(undefined); setNotice("");
    void api.diagnoseRelease().then(setDiagnosis).catch((reason: unknown) => setError(message(reason)));
  }, [api]);
  useEffect(load, [load]);
  useEffect(() => { if (error !== undefined) retry.current?.focus(); }, [error]);
  const run = async (operation: "build" | "release" | "redeliver"): Promise<void> => {
    if (busy !== undefined || (operation !== "build" && build === undefined)) return;
    setBusy(operation); setError(undefined); setNotice("");
    try {
      if (operation === "build") {
        const next = await api.buildRelease();
        setBuild(next); setReceipt(undefined); setNotice("已建立 release artifact；尚未發布。");
      } else {
        const next = operation === "release" ? await api.releaseArtifact(build!.artifactDigest) : await api.redeliverArtifact(build!.artifactDigest);
        setReceipt(next); setNotice(operation === "release" ? "已發布 artifact。" : "已重新發布 artifact。");
      }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(undefined); }
  };
  if (diagnosis === undefined) return <Layout><PageHeading>發布診斷</PageHeading>{error === undefined ? <p role="status" aria-live="polite" aria-busy="true">正在檢查 release 狀態。</p> : <><p role="alert">{error}</p><button ref={retry} onClick={load}>重新診斷</button></>}</Layout>;
  const blocked = diagnosis.status === "blocked";
  const status = busy === "build" ? "正在建立 release artifact…" : busy === "release" ? "正在發布 artifact…" : busy === "redeliver" ? "正在重新發布 artifact…" : notice || (blocked ? "診斷已阻擋；請先處理診斷項目。" : "診斷完成；可以建立 release artifact。");
  return <Layout><PageHeading>發布診斷</PageHeading><p role="status" aria-live="polite" aria-atomic="true">{status}</p>{error !== undefined && <p role="alert">{error}</p>}<section aria-labelledby="release-diagnosis-heading"><h2 id="release-diagnosis-heading">Release 狀態</h2><p>{blocked ? "已阻擋" : "已就緒"}</p>{diagnosis.diagnostics.length === 0 ? <p>沒有診斷項目。</p> : <ul aria-label="Release 診斷項目">{diagnosis.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.code}</li>)}</ul>}<button ref={retry} type="button" onClick={load} disabled={busy !== undefined}>重新診斷</button></section><section aria-labelledby="release-actions-heading"><h2 id="release-actions-heading">Release 動作</h2><p>建立 artifact 不會發布；發布只使用已建立且驗證過的 artifact。</p><button type="button" onClick={() => void run("build")} disabled={blocked || busy !== undefined}>{busy === "build" ? "正在建立 artifact…" : "建立 artifact"}</button><button type="button" onClick={() => void run("release")} disabled={build === undefined || busy !== undefined}>{busy === "release" ? "正在發布 artifact…" : "發布 artifact"}</button><button type="button" onClick={() => void run("redeliver")} disabled={build === undefined || busy !== undefined}>{busy === "redeliver" ? "正在重新發布 artifact…" : "重新發布 artifact"}</button>{build !== undefined && <dl><dt>Artifact digest</dt><dd className="breakable">{build.artifactDigest}</dd>{receipt !== undefined && <><dt>Target digest</dt><dd className="breakable">{receipt.targetDigest}</dd></>}</dl>}</section></Layout>;
}

function CmsApp({ session }: Readonly<{ session: AuthoringSession }>): React.JSX.Element {
  const api = useMemo(() => new CmsApiClient(session), [session]);
  return <BrowserRouter><ContentTypeCatalogProvider api={api}><Routes><Route path="/cms" element={<Home api={api} />} /><Route path="/cms/" element={<Home api={api} />} /><Route path="/cms/site/routes" element={<SiteRouteWorkspace api={api} />} /><Route path="/cms/post" element={<PostWorkspace api={api} />} /><Route path="/cms/entries" element={<EntryList api={api} />} /><Route path="/cms/entries/new" element={<Editor api={api} create />} /><Route path="/cms/entries/:entryId" element={<Editor api={api} create={false} />} /><Route path="/cms/media" element={<MediaList api={api} />} /><Route path="/cms/media/import" element={<MediaImport api={api} />} /><Route path="/cms/media/:assetId" element={<MediaDetail api={api} />} /><Route path="/cms/content-types" element={<ContentTypeList api={api} />} /><Route path="/cms/content-types/new" element={<ContentTypeNew api={api} />} /><Route path="/cms/content-types/:typeId" element={<ContentTypeDetail api={api} />} /><Route path="/cms/taxonomies" element={<TaxonomyList api={api} />} /><Route path="/cms/taxonomies/new" element={<TaxonomyNew api={api} />} /><Route path="/cms/taxonomies/:taxonomyId" element={<TaxonomyDetail api={api} />} /><Route path="/cms/plugins" element={<Plugins api={api} />} /><Route path="/cms/release" element={<Release api={api} />} /></Routes></ContentTypeCatalogProvider></BrowserRouter>;
}

export function startCms(): void {
  const root = document.getElementById("root");
  if (root !== null) createRoot(root).render(<CmsApp session={openAuthoringSession()} />);
}
