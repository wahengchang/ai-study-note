import type { ProjectionFailure, ProjectionFailureCode } from "./contracts.js";

const messages: Readonly<Record<ProjectionFailureCode, string>> = {
  INVALID_PROJECTION_INPUT: "Projection 輸入無效。",
  SUBJECT_NOT_FOUND: "Preview subject 不存在。",
  SUBJECT_NOT_PUBLISHED: "Preview subject 尚未發布。",
  PROJECTION_STORAGE_FAILURE: "Projection 無法讀取 canonical state。",
  INVALID_REVISION_EVIDENCE: "Revision evidence 無法驗證。",
  UNRESOLVED_ROUTE_REFERENCE: "Route reference 無法完整解析。",
  UNRESOLVED_MEDIA_REFERENCE: "Media reference 無法完整解析。",
  PROJECTION_STATE_CHANGED: "Projection selection 在讀取期間已變更。",
  PROJECTION_PAYLOAD_TOO_LARGE: "Projection 內嵌 bytes 超過 v1 上限。",
  PROJECTION_ENCODING_FAILED: "Projection canonical bytes 無法產生。",
  INVALID_RENDERER_INPUT: "renderer-input/v1 無法驗證。",
  INVALID_PREVIEW_INPUT: "preview-input/v1 無法驗證。",
};

export function projectionFailure(code: ProjectionFailureCode, subjectIds: readonly string[] = []): ProjectionFailure {
  return Object.freeze({ code, owner: "Projection", subjectIds: Object.freeze([...subjectIds]), remediation: Object.freeze({ kind: "message", message: messages[code] }) });
}
