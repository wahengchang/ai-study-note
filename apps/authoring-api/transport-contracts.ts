import type { DomainApplicationFailureCode } from "../../core/application/index.js";
import type { PluginHostFailureCode } from "../../core/plugin-host/index.js";
import { z } from "zod";

import { SECRET_TEXT_PATTERN } from "./origin.js";

const positiveInteger = z.number().int().safe().positive();
const stringArray = z.array(z.string());
const messageRemediationSchema = z.object({ kind: z.literal("message"), message: z.string() }).strict();
/**
 * wire 上的 `content` 一定來自 `JSON.parse`，因此 `undefined` 不可能出現；但
 * `z.unknown()` 會放行 in-process caller 傳進來的 explicit `undefined`，而
 * `JSON.stringify` 又會把該 key 整個丟掉。若不擋在 client 端，caller 會拿到
 * listener 回來的 `INVALID_REQUEST_BODY`，而不是本地的 `INVALID_CLIENT_REQUEST`。
 */
const jsonContent = z.unknown().refine((value) => value !== undefined);

export const serverProofChallengeSchema = z.object({
  contract: z.literal("authoring-server-proof-challenge/v1"),
  generation: positiveInteger,
  nonce: z.string().regex(SECRET_TEXT_PATTERN),
}).strict();

export const serverProofSchema = z.object({
  contract: z.literal("authoring-server-proof/v1"),
  generation: positiveInteger,
  nonce: z.string().regex(SECRET_TEXT_PATTERN),
  mac: z.string().regex(SECRET_TEXT_PATTERN),
}).strict();

export const saveRevisionRequestSchema = z.object({
  contract: z.literal("save-revision-request/v1"),
  revisionId: z.string(),
  operationId: z.string(),
  schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
  content: jsonContent,
  route: z.string(),
  assetVersions: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
}).strict();

export const saveRevisionSuccessSchema = z.object({
  contract: z.literal("save-revision-success/v1"),
  entryId: z.string(),
  revision: z.object({
    revisionId: z.string(),
    schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
    contentDigest: z.string(),
    lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(),
  }).strict(),
  references: z.array(z.object({ assetId: z.string(), assetVersionId: z.string() }).strict()),
  pointer: z.object({ currentRevisionId: z.string(), publishedRevisionId: z.string().optional() }).strict(),
  currentRoute: z.object({ normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict(),
  lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(),
  stateDigest: z.string(),
  activePluginStateDigest: z.string(),
}).strict();

export const publishRevisionRequestSchema = z.object({
  contract: z.literal("publish-revision-request/v1"),
  expectedCurrentRevisionId: z.string(),
  operationId: z.string(),
}).strict();

export const publishRevisionSuccessSchema = z.object({
  contract: z.literal("publish-revision-success/v1"),
  entryId: z.string(),
  revision: z.object({
    revisionId: z.string(),
    schemaIdentity: z.object({ schemaId: z.string(), version: positiveInteger }).strict(),
    contentDigest: z.string(),
    lineage: z.object({ operationId: z.string(), operationKind: z.string() }).strict(),
  }).strict(),
  publishedPointer: z.object({ currentRevisionId: z.string(), publishedRevisionId: z.string() }).strict(),
  publishedRoute: z.object({ normalizedRoute: z.string(), owner: z.string(), sourceRevisionId: z.string() }).strict(),
  lineageIdentity: z.object({ entryId: z.string(), revisionId: z.string(), operationId: z.string() }).strict(),
  stateDigest: z.string(),
}).strict();

export type TransportCode =
  | "INVALID_REQUEST_FRAMING"
  | "MISDIRECTED_REQUEST"
  | "ORIGIN_FORBIDDEN"
  | "AUTHORIZATION_REQUIRED"
  | "AUTHORIZATION_MALFORMED"
  | "AUTHORIZATION_DUPLICATE"
  | "AUTHORIZATION_ALTERNATE_TRANSPORT"
  | "AUTHORIZATION_INVALID"
  | "AUTHORIZATION_REVOKED"
  | "SERVER_PROOF_GENERATION_MISMATCH"
  | "INVALID_REQUEST_BODY"
  | "REQUEST_BODY_TOO_LARGE"
  | "ROUTE_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_SERVER_ERROR";

type RemoteFailureCode = TransportCode | DomainApplicationFailureCode | PluginHostFailureCode;

const transportStatuses: Readonly<Record<TransportCode, readonly number[]>> = {
  INVALID_REQUEST_FRAMING: [400], MISDIRECTED_REQUEST: [421], ORIGIN_FORBIDDEN: [403],
  AUTHORIZATION_REQUIRED: [401], AUTHORIZATION_MALFORMED: [401], AUTHORIZATION_DUPLICATE: [401],
  AUTHORIZATION_ALTERNATE_TRANSPORT: [401], AUTHORIZATION_INVALID: [401], AUTHORIZATION_REVOKED: [401],
  SERVER_PROOF_GENERATION_MISMATCH: [401], INVALID_REQUEST_BODY: [400], REQUEST_BODY_TOO_LARGE: [400],
  ROUTE_NOT_FOUND: [404], METHOD_NOT_ALLOWED: [405], UNSUPPORTED_MEDIA_TYPE: [415], INTERNAL_SERVER_ERROR: [500, 503],
};

const conflictCodes = [
  "CURRENT_REVISION_MISMATCH", "MEDIA_REFERENCE_CONFLICT", "ROUTE_CONFLICT", "ROUTE_CHANGE_REQUIRED",
  "STALE_ROUTE_PROPOSAL", "PLUGIN_IDENTITY_CONFLICT", "ACTIVATION_STATE_CONFLICT", "ACTIVE_PLUGIN_IDENTITY_MISMATCH",
] as const;
const invalidCodes = [
  "INVALID_SAVE_REVISION_REQUEST", "INVALID_PUBLISH_REVISION_REQUEST", "INVALID_RESTORE_REVISION_REQUEST", "INVALID_CHANGE_ROUTE_REQUEST",
  "MEDIA_REFERENCE_NOT_FOUND", "SCHEMA_INVALID", "MEDIA_UNAVAILABLE", "BLOCKED_ARCHIVED_MEDIA_RESTORE",
  "PLUGIN_NOT_FOUND", "PLUGIN_NOT_ACTIVE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING",
  "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CAPABILITY_DENIED",
  "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED",
] as const;
const domainCodes = [
  "INVALID_SAVE_REVISION_REQUEST", "INVALID_PUBLISH_REVISION_REQUEST", "INVALID_RESTORE_REVISION_REQUEST", "INVALID_CHANGE_ROUTE_REQUEST",
  "CURRENT_REVISION_MISMATCH", "MEDIA_REFERENCE_NOT_FOUND", "MEDIA_REFERENCE_CONFLICT", "SCHEMA_INVALID",
  "MEDIA_UNAVAILABLE", "BLOCKED_ARCHIVED_MEDIA_RESTORE", "ROUTE_CONFLICT", "ROUTE_CHANGE_REQUIRED",
  "STALE_ROUTE_PROPOSAL", "SAVE_REVISION_FAILED", "PUBLISH_REVISION_FAILED", "RESTORE_REVISION_FAILED", "CHANGE_ROUTE_FAILED",
] as const satisfies readonly DomainApplicationFailureCode[];
const pluginCodes = [
  "INVALID_PLUGIN_HOST_INPUT", "INVALID_TRUSTED_ROOT", "PLUGIN_DISCOVERY_FAILED", "PLUGIN_NOT_FOUND",
  "INVALID_PLUGIN_MANIFEST", "UNSUPPORTED_HOOK_CONTRACT", "UNSUPPORTED_CAPABILITY", "PLUGIN_EVIDENCE_MISMATCH",
  "PLUGIN_IDENTITY_CONFLICT", "PLUGIN_MODULE_INVALID", "PLUGIN_NOT_ACTIVE", "ACTIVE_PLUGIN_IDENTITY_MISMATCH",
  "ACTIVATION_STATE_CONFLICT", "ACTIVATION_STATE_FAILURE", "PLUGIN_BLOCK_INACTIVE", "PLUGIN_BLOCK_MISSING",
  "PLUGIN_BLOCK_IDENTITY_CHANGED", "PLUGIN_VALIDATION_REJECTED", "PLUGIN_CALLBACK_RESULT_INVALID", "PLUGIN_CALLBACK_FAILED",
  "PLUGIN_CAPABILITY_DENIED", "INVALID_PLUGIN_OPERATION_SNAPSHOT", "PLUGIN_VALIDATION_SERVICE_FAILED",
  "ACTIVE_PLUGIN_SOURCE_MISSING", "ACTIVE_PLUGIN_REACTIVATION_REQUIRED",
] as const satisfies readonly PluginHostFailureCode[];

const domainStatuses: Readonly<Record<DomainApplicationFailureCode, readonly number[]>> = Object.fromEntries(domainCodes.map((code) => [code, conflictCodes.includes(code as never) ? [409] : invalidCodes.includes(code as never) ? [422] : [500]])) as unknown as Readonly<Record<DomainApplicationFailureCode, readonly number[]>>;
const pluginStatuses: Readonly<Record<PluginHostFailureCode, readonly number[]>> = Object.fromEntries(pluginCodes.map((code) => [code, conflictCodes.includes(code as never) ? [409] : invalidCodes.includes(code as never) ? [422] : [500]])) as unknown as Readonly<Record<PluginHostFailureCode, readonly number[]>>;
const statusByCode: Readonly<Record<RemoteFailureCode, readonly number[]>> = { ...transportStatuses, ...domainStatuses, ...pluginStatuses };

export type AuthoringRemoteErrorCode = keyof typeof statusByCode;

export function authoringErrorStatuses(code: string): readonly number[] | undefined {
  return Object.prototype.hasOwnProperty.call(statusByCode, code) ? statusByCode[code as AuthoringRemoteErrorCode] : undefined;
}

export const authoringErrorSchema = z.object({
  contract: z.literal("authoring-error/v1"),
  requestId: z.string(),
  code: z.string().refine((code) => authoringErrorStatuses(code) !== undefined),
  owner: z.enum(["AuthoringApi", "AuthoringCredential", "DomainApplication", "Content", "DataMedia", "SiteDefinition", "PluginHost"]),
  subjectIds: stringArray,
  remediation: messageRemediationSchema,
}).strict();

export type ServerProofChallengeDto = Readonly<z.infer<typeof serverProofChallengeSchema>>;
export type ServerProofDto = Readonly<z.infer<typeof serverProofSchema>>;
export type SaveRevisionRequestDto = Readonly<z.infer<typeof saveRevisionRequestSchema>>;
export type SaveRevisionSuccessDto = Readonly<z.infer<typeof saveRevisionSuccessSchema>>;
export type PublishRevisionRequestDto = Readonly<z.infer<typeof publishRevisionRequestSchema>>;
export type PublishRevisionSuccessDto = Readonly<z.infer<typeof publishRevisionSuccessSchema>>;
export type AuthoringErrorDto = Readonly<z.infer<typeof authoringErrorSchema>>;
