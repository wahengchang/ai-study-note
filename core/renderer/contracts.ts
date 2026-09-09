import type { Digest, MessageRemediation } from "../foundation/index.js";
import type { RendererInputArtifact, RendererInput } from "../projection/index.js";

export type RenderedFile = Readonly<{ path: string; bytes: Uint8Array; digest: Digest }>;
export function isArtifactFilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || !/^[a-z0-9][a-z0-9._/-]*$/u.test(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && !segment.startsWith(".") && !segment.endsWith("."));
}
export type PublicBlockRenderInput = RendererInput;
export type PublicBlockRenderOutput = Readonly<{ contract: "public-block-render-output/v1"; html: string }>;
export type PublicAssetsEmitInput = RendererInput;
export type PublicAssetsEmitOutput = Readonly<{ contract: "public-assets-emit-output/v1"; files: readonly Readonly<{ path: string; bytesBase64: string }>[] }>;
export type ThemeRenderInput = Readonly<{ contract: "theme-render-input/v1"; selection: RendererInput["selection"]; entries: readonly Readonly<{ entryId: string; revisionId: string; content: RendererInput["entries"][number]["content"]; contentDigest: Digest; blocks: readonly string[] }>[]; routes: RendererInput["routes"]["claims"]; media: RendererInput["media"]; resources: RendererInput["theme"]["files"] }>;
export type ThemeRenderOutput = Readonly<{ contract: "theme-render-output/v1"; pages: readonly Readonly<{ route: string; language: string; bodyHtml: string; stylesheetResources: readonly string[] }>[] }>;
export type RendererOutput = Readonly<{ contract: "renderer-output/v1"; rendererInputDigest: Digest; provenance: Readonly<{ publishedRevisionIds: readonly Readonly<{ entryId: string; revisionId: string }>[]; routeGraphDigest: Digest; mediaSelectionDigest: Digest; theme: Readonly<{ id: string; version: string; manifestHash: Digest }>; plugins: readonly Readonly<{ id: string; version: string; manifestHash: Digest }>[]; seo: Readonly<{ count: number; digest: Digest }> }>; routes: readonly Readonly<{ route: string; filePath: string }>[]; files: readonly RenderedFile[]; outputDigest: Digest }>;
export type RendererFailure = Readonly<{ code: "INVALID_RENDERER_INPUT" | "RENDERER_INPUT_DIGEST_MISMATCH" | "RENDERER_MODULE_INVALID" | "RENDERER_CALLBACK_FAILED" | "RENDERER_CALLBACK_RESULT_INVALID" | "RENDER_OUTPUT_CONFLICT" | "UNSUPPORTED_EXTENSION_CONTRACT" | "PUBLIC_MEDIA_UNSUPPORTED" | "SEO_CONTRIBUTION_CONFLICT"; owner: "Renderer"; subjectIds: readonly string[]; remediation: MessageRemediation }>;
export type RendererResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: RendererFailure }>;
export type StaticRenderer = Readonly<{ render(input: RendererInputArtifact): Promise<RendererResult<RendererOutput>> }>;
