import {
  contentTypeListSchema,
  entryDetailSchema,
  entryListSchema,
  previewDocumentSchema,
  publishRevisionSuccessSchema,
  saveRevisionSuccessSchema,
} from "../transport-contracts.js";
import type {
  ContentTypeListDto,
  EntryDetailDto,
  EntryListDto,
  PreviewDocumentDto,
  PreviewRequestDto,
  PublishRevisionRequestDto,
  PublishRevisionSuccessDto,
  SaveRevisionRequestDto,
  SaveRevisionSuccessDto,
} from "../transport-contracts.js";

import type { AuthoringSession } from "./authoring-session.js";

export class CmsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsApiError";
  }
}


async function request<T>(session: AuthoringSession, path: `/v1/${string}`, init: RequestInit | undefined, parse: (body: unknown) => T): Promise<T> {
  const response = await session.authorizedFetch(path, init);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const remediation = typeof body === "object" && body !== null && !Array.isArray(body) && "remediation" in body && typeof body.remediation === "object" && body.remediation !== null && !Array.isArray(body.remediation) && "message" in body.remediation ? body.remediation.message : undefined;
    throw new CmsApiError(typeof remediation === "string" && remediation.length > 0 ? remediation : `CMS request failed (${response.status})`);
  }
  try {
    return parse(body);
  } catch {
    throw new CmsApiError("CMS 回應格式不正確，請重新開啟工作台。");
  }
}

function entryPath(entryId: string, suffix = ""): `/v1/${string}` {
  return `/v1/entries/${encodeURIComponent(entryId)}${suffix}`;
}

function jsonRequest(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function listContentTypes(session: AuthoringSession): Promise<ContentTypeListDto> {
  return request(session, "/v1/content-types", undefined, contentTypeListSchema.parse);
}

export function listEntries(session: AuthoringSession): Promise<EntryListDto> {
  return request(session, "/v1/entries", undefined, entryListSchema.parse);
}

export function getEntry(session: AuthoringSession, entryId: string): Promise<EntryDetailDto> {
  return request(session, entryPath(entryId), undefined, entryDetailSchema.parse);
}

export function saveEntry(session: AuthoringSession, entryId: string, body: SaveRevisionRequestDto): Promise<SaveRevisionSuccessDto> {
  return request(session, entryPath(entryId, "/revisions"), jsonRequest(body), saveRevisionSuccessSchema.parse);
}

export function publishEntry(session: AuthoringSession, entryId: string, body: PublishRevisionRequestDto): Promise<PublishRevisionSuccessDto> {
  return request(session, entryPath(entryId, "/publish"), jsonRequest(body), publishRevisionSuccessSchema.parse);
}

export function previewEntry(session: AuthoringSession, body: PreviewRequestDto): Promise<PreviewDocumentDto> {
  return request(session, "/v1/preview", jsonRequest(body), previewDocumentSchema.parse);
}
