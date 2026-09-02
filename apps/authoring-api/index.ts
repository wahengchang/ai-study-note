export { createLocalAuthoringCredentialAuthority } from "./credential-store.js";
export type {
  AuthoringCredentialAuthority,
  AuthoringCredentialFailureCode,
  AuthoringCredentialResult,
  CredentialAction,
  CredentialAdmission,
  CredentialSummary,
} from "./credential-store.js";
export { startAuthoringApi } from "./server.js";
export type {
  AuthoringApiLogEvent,
  AuthoringApiResult,
  RunningAuthoringApi,
  StartAuthoringApiInput,
  TransportCode,
} from "./server.js";
