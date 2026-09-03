export { createLocalAuthoringCredentialAuthority } from "./credential-store.js";
export type {
  AuthoringCredentialAuthority,
  AuthoringCredentialFailureCode,
  AuthoringCredentialResult,
  CredentialAction,
  CredentialAdmission,
  CredentialSummary,
} from "./credential-store.js";
export { createLocalAuthoringClient } from "./authoring-client.js";
export type {
  AuthoringClientFailureCode,
  AuthoringClientResult,
  LocalAuthoringClient,
} from "./authoring-client.js";
export { main, runCredentialCli } from "./credential-cli.js";
export type { CredentialCliIo } from "./credential-cli.js";
export { runSaveRevisionCli, saveRevisionMain } from "./save-revision-cli.js";
export type { SaveRevisionCliEnvironment, SaveRevisionCliIo } from "./save-revision-cli.js";
export {
  API_KEY_PATTERN,
  AUTHORING_AUTHORITY,
  AUTHORING_HOST,
  AUTHORING_ORIGIN,
  AUTHORING_PORT,
  redactSecrets,
} from "./origin.js";
export { startAuthoringApi } from "./server.js";
export type {
  AuthoringApiLogEvent,
  AuthoringApiResult,
  RunningAuthoringApi,
  StartAuthoringApiInput,
  TransportCode,
} from "./server.js";
export {
  authoringErrorSchema,
  authoringErrorStatuses,
  saveRevisionRequestSchema,
  saveRevisionSuccessSchema,
  serverProofChallengeSchema,
  serverProofSchema,
} from "./transport-contracts.js";
export type {
  AuthoringErrorDto,
  AuthoringRemoteErrorCode,
  SaveRevisionRequestDto,
  SaveRevisionSuccessDto,
  ServerProofChallengeDto,
  ServerProofDto,
} from "./transport-contracts.js";
