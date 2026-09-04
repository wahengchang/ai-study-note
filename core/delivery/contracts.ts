import type { Digest, MessageRemediation } from "../foundation/index.js";
import type { RendererOutput } from "../renderer/index.js";
export type ArtifactManifest = Readonly<{ contract: "artifact-manifest/v1"; rendererInputDigest: Digest; provenance: RendererOutput["provenance"]; files: readonly Readonly<{ path: string; digest: Digest; byteLength: number }>[]; totalDigest: Digest }>;
export type DeliveryFailure = Readonly<{ code: "INVALID_RENDERER_OUTPUT" | "ARTIFACT_WRITE_FAILED" | "ARTIFACT_IMMUTABILITY_CONFLICT" | "REDELIVERY_SOURCE_INVALID"; owner: "Delivery"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type DeliveryResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DeliveryFailure }>;
export type PublicDelivery = Readonly<{ deliver(output: RendererOutput): DeliveryResult<Readonly<{ artifactDigest: Digest; directory: string; manifest: ArtifactManifest }>>; redeliver(input: Readonly<{ artifactDigest: Digest; destination: string }>): DeliveryResult<void> }>;
export type CreatePublicDeliveryInput = Readonly<{ artifactsRoot: string }>;
