import type { ContentField, ContentFieldGroup, ContentFieldKind, ContentTypeCatalogDto } from "./cms-api.js";
/**
 * ACF-like 自訂欄位的 Builder draft。`order` 由陣列位置推導（不要求使用者輸入數字），
 * 既有項目保留 server 配置的 stable ID，新項目省略 ID 並改用 request-local 的 draft key。
 */
export type FieldOptionDraft = Readonly<{ key: string; optionId: string | undefined; label: string }>;
export type FieldDraft = Readonly<{
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
export type FieldGroupDraft = Readonly<{ key: string; groupId: string | undefined; label: string; help: string; fields: readonly FieldDraft[] }>;

export const fieldKindLabels: Readonly<Record<ContentFieldKind, string>> = { text: "單行文字", textarea: "多行文字", number: "數字", boolean: "是／否", url: "網址", date: "日期", datetime: "日期時間", "single-select": "單選", "multi-select": "多選", "single-media": "單一媒體", "multi-media": "多媒體" };
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

export function draftKey(): string { return crypto.randomUUID(); }
export function isTextKind(kind: ContentFieldKind): boolean { return kind === "text" || kind === "textarea"; }
export function isSelectKind(kind: ContentFieldKind): boolean { return kind === "single-select" || kind === "multi-select"; }
export function isMediaKind(kind: ContentFieldKind): boolean { return kind === "single-media" || kind === "multi-media"; }
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

export function groupDraftsOf(groups: readonly ContentFieldGroup[]): readonly FieldGroupDraft[] {
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
export function fieldGroupsRequest(groups: readonly FieldGroupDraft[]): readonly unknown[] {
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
export function fieldGroupsIssues(groups: readonly FieldGroupDraft[]): ReadonlyMap<string, string> {
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

export function moveWithin<T>(items: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const moved = next.splice(index, 1)[0] as T;
  next.splice(target, 0, moved);
  return next;
}

export function contentTypeDisplayOrder(items: ContentTypeCatalogDto["items"]): ContentTypeCatalogDto["items"] {
  return items.toSorted((left, right) => left.order === right.order ? left.typeId < right.typeId ? -1 : left.typeId > right.typeId ? 1 : 0 : left.order - right.order);
}
