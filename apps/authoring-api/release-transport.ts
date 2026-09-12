import { isDigest } from "../../core/foundation/index.js";
import type { DeliveryFailure, FixedRootReleaseDelivery, PublicDelivery, ReleaseReceipt } from "../../core/delivery/index.js";
import type { PublishedProjectionResult, ProjectionPreview } from "../../core/projection/index.js";
import { createStaticRenderer, type RendererOutput } from "../../core/renderer/index.js";

export type ReleaseDiagnostic = Readonly<{ code: string }>;
export type ReleaseDiagnosis = Readonly<{ status: "ready" | "blocked"; diagnostics: readonly ReleaseDiagnostic[] }>;
export type ReleaseBuild = Readonly<{ artifactDigest: string; diagnostics: readonly ReleaseDiagnostic[] }>;
export type ReleaseTransportFailureCode = "RELEASE_BUILD_BLOCKED" | "RELEASE_BUILD_FAILED" | "RELEASE_ARTIFACT_INVALID" | "RELEASE_TARGET_CONFLICT" | "RELEASE_TARGET_FAILED";
export type ReleaseTransportResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: ReleaseTransportFailureCode }> }>;
export interface AuthoringReleaseTransport {
  diagnose(): Promise<ReleaseDiagnosis>;
  build(): Promise<ReleaseTransportResult<ReleaseBuild>>;
  release(input: Readonly<{ artifactDigest: string }>): ReleaseTransportResult<ReleaseReceipt>;
  redeliver(input: Readonly<{ artifactDigest: string }>): ReleaseTransportResult<ReleaseReceipt>;
}
export type CreateAuthoringReleaseTransportInput = Readonly<{ projection: ProjectionPreview; delivery: PublicDelivery; releaseDelivery: FixedRootReleaseDelivery }>;

function diagnostics(result: PublishedProjectionResult): readonly ReleaseDiagnostic[] {
  return result.diagnostics.map((diagnostic) => ({ code: diagnostic.code })).sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0);
}

function failedCode(value: unknown): ReleaseDiagnostic {
  if (value !== null && typeof value === "object") {
    const code = Object.getOwnPropertyDescriptor(value, "code")?.value;
    if (typeof code === "string" && /^[A-Z0-9_]+$/u.test(code)) return { code };
  }
  return { code: "RELEASE_BUILD_BLOCKED" };
}

async function prepare(input: CreateAuthoringReleaseTransportInput): Promise<Readonly<{ ok: true; value: Readonly<{ rendered: RendererOutput; diagnostics: readonly ReleaseDiagnostic[] }> }> | Readonly<{ ok: false; diagnostics: readonly ReleaseDiagnostic[] }>> {
  const projected = await input.projection.produceRendererInput({});
  if (!projected.ok) return { ok: false, diagnostics: [failedCode(projected.error)] };
  const rendered = await createStaticRenderer().render(projected.value.artifact);
  if (!rendered.ok) return { ok: false, diagnostics: [failedCode(rendered.error)] };
  return { ok: true, value: { rendered: rendered.value, diagnostics: diagnostics(projected.value) } };
}

function releaseFailure(error: DeliveryFailure): ReleaseTransportFailureCode {
  if (error.code === "REDELIVERY_SOURCE_INVALID") return "RELEASE_ARTIFACT_INVALID";
  if (error.code === "RELEASE_TARGET_CONFLICT") return "RELEASE_TARGET_CONFLICT";
  return "RELEASE_TARGET_FAILED";
}

export function createAuthoringReleaseTransport(input: CreateAuthoringReleaseTransportInput): AuthoringReleaseTransport {
  return {
    async diagnose() {
      const result = await prepare(input);
      return result.ok ? { status: "ready", diagnostics: result.value.diagnostics } : { status: "blocked", diagnostics: result.diagnostics };
    },
    async build() {
      const result = await prepare(input);
      if (!result.ok) return { ok: false, error: { code: "RELEASE_BUILD_BLOCKED" } };
      const delivered = input.delivery.deliver(result.value.rendered);
      if (!delivered.ok) return { ok: false, error: { code: "RELEASE_BUILD_FAILED" } };
      const readBack = input.delivery.loadVerifiedArtifact({ artifactDigest: delivered.value.artifactDigest });
      return readBack.ok ? { ok: true, value: { artifactDigest: delivered.value.artifactDigest, diagnostics: result.value.diagnostics } } : { ok: false, error: { code: "RELEASE_BUILD_FAILED" } };
    },
    release(request) {
      const artifactDigest = request.artifactDigest;
      if (!isDigest(artifactDigest)) return { ok: false, error: { code: "RELEASE_ARTIFACT_INVALID" } };
      const result = input.releaseDelivery.release({ artifactDigest });
      return result.ok ? result : { ok: false, error: { code: releaseFailure(result.error) } };
    },
    redeliver(request) {
      const artifactDigest = request.artifactDigest;
      if (!isDigest(artifactDigest)) return { ok: false, error: { code: "RELEASE_ARTIFACT_INVALID" } };
      const result = input.releaseDelivery.redeliver({ artifactDigest });
      return result.ok ? result : { ok: false, error: { code: releaseFailure(result.error) } };
    },
  };
}
