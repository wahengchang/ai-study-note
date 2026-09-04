import type { Digest, JsonValue, MessageRemediation } from "../foundation/index.js";
import type { RendererInputArtifact, RendererInputV1 } from "../projection/index.js";

export type RenderedFile = Readonly<{ path: string; bytes: Uint8Array; digest: Digest }>;
/** Renderer 與 Delivery 共用的 artifact-relative path profile；兩端必須以同一判斷收斂，否則可交付範圍會不一致。 */
export function isArtifactFilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || !/^[a-z0-9][a-z0-9._/-]*$/u.test(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && !segment.startsWith(".") && !segment.endsWith("."));
}
export type PublicBlockRenderInput = RendererInputV1;
export type PublicBlockRenderOutput = Readonly<{ contract: "public-block-render-output/v1"; html: string }>;
export type PublicAssetsEmitInput = RendererInputV1;
export type PublicAssetsEmitOutput = Readonly<{ contract: "public-assets-emit-output/v1"; files: readonly Readonly<{ path: string; bytesBase64: string }>[]}>;
export type ThemeRenderInput = Readonly<{ contract: "theme-render-input/v1"; selection: RendererInputV1["selection"]; entries: readonly Readonly<{ entryId: string; revisionId: string; content: JsonValue; contentDigest: Digest; blocks: readonly string[] }>[]; routes: RendererInputV1["routes"]; media: RendererInputV1["media"]; resources: RendererInputV1["theme"]["resources"] }>;
export type ThemeRenderOutput = Readonly<{ contract: "theme-render-output/v1"; files: readonly Readonly<{ path: string; html: string }>[] }>;
export type RendererOutput = Readonly<{ contract: "renderer-output/v1"; rendererInputDigest: Digest; provenance: Readonly<{ publishedRevisionIds: readonly Readonly<{ entryId: string; revisionId: string }>[]; routeGraphDigest: Digest; mediaSelectionDigest: Digest; theme: Readonly<{ id: string; version: string; manifestHash: Digest }>; plugins: readonly Readonly<{ id: string; version: string; manifestHash: Digest }>[] }>; files: readonly RenderedFile[]; outputDigest: Digest }>;
export type RendererFailure = Readonly<{ code: "INVALID_RENDERER_INPUT" | "RENDERER_INPUT_DIGEST_MISMATCH" | "RENDERER_MODULE_INVALID" | "RENDERER_CALLBACK_FAILED" | "RENDERER_CALLBACK_RESULT_INVALID" | "RENDER_OUTPUT_CONFLICT" | "UNSUPPORTED_EXTENSION_CONTRACT"; owner: "Renderer"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type RendererResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: RendererFailure }>;
export type StaticRenderer = Readonly<{ render(input: RendererInputArtifact): Promise<RendererResult<RendererOutput>> }>;
