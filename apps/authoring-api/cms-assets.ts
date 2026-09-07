import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ASSET_FILE_PATTERN = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const ASSET_REQUEST_PATTERN = /^\/cms\/(assets\/[A-Za-z0-9][A-Za-z0-9._-]*)$/u;

export type CmsAsset = Readonly<{ bytes: Uint8Array; contentType: string; destination: "script" | "style" | "image" | "font" }>;
export interface CmsAssets {
  readonly bootstrapPath: string;
  read(pathname: string): CmsAsset | undefined;
}

type ManifestEntry = Readonly<{ file: string; isEntry?: boolean; css?: readonly string[]; assets?: readonly string[] }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function contentMetadata(file: string): Readonly<{ contentType: string; destination: CmsAsset["destination"] }> | undefined {
  const extension = basename(file).split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "js": return { contentType: "text/javascript; charset=utf-8", destination: "script" };
    case "css": return { contentType: "text/css; charset=utf-8", destination: "style" };
    case "svg": return { contentType: "image/svg+xml", destination: "image" };
    case "png": return { contentType: "image/png", destination: "image" };
    case "jpg": case "jpeg": return { contentType: "image/jpeg", destination: "image" };
    case "webp": return { contentType: "image/webp", destination: "image" };
    case "woff2": return { contentType: "font/woff2", destination: "font" };
    case "woff": return { contentType: "font/woff", destination: "font" };
    default: return undefined;
  }
}

/** 僅信任 Vite manifest 列出的 hashed outputs；絕不由 request path 拼接檔案系統路徑。 */
export function loadCmsAssets(distRoot: string): CmsAssets | undefined {
  const root = resolve(distRoot);
  let manifest: unknown;
  try { manifest = JSON.parse(readFileSync(resolve(root, ".vite", "manifest.json"), "utf8")); } catch { return undefined; }
  if (!isPlainObject(manifest)) return undefined;

  const files = new Set<string>();
  let bootstrapPath: string | undefined;
  for (const [source, raw] of Object.entries(manifest)) {
    if (!isPlainObject(raw) || typeof raw.file !== "string" || !ASSET_FILE_PATTERN.test(raw.file) || contentMetadata(raw.file) === undefined) return undefined;
    const entry = raw as ManifestEntry;
    files.add(entry.file);
    for (const linked of [...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (typeof linked !== "string" || !ASSET_FILE_PATTERN.test(linked) || contentMetadata(linked) === undefined) return undefined;
      files.add(linked);
    }
    if (source === "index.html") bootstrapPath = entry.file;
  }
  if (bootstrapPath === undefined || contentMetadata(bootstrapPath)?.destination !== "script") return undefined;

  return {
    bootstrapPath,
    read(pathname) {
      const match = ASSET_REQUEST_PATTERN.exec(pathname);
      const file = match?.[1];
      if (file === undefined || !files.has(file)) return undefined;
      const metadata = contentMetadata(file);
      if (metadata === undefined) return undefined;
      try { return { bytes: readFileSync(resolve(root, file)), ...metadata }; } catch { return undefined; }
    },
  };
}
