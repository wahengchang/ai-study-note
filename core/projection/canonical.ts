import { canonicalJsonBytes, sha256Digest, type Digest } from "../foundation/index.js";

import type { RendererMedia } from "./contracts.js";

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

// caller 與 parser 的輸入都可能是敵意 object（含會拋出的 proxy），因此 shape 檢查必須永不拋出。
export function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors && "value" in descriptors[key]!);
  } catch { return false; }
}

export function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freeze(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)]))) as T;
}

// producer 與 parser 必須由同一段程式碼推導 mediaSelectionDigest，
// 否則 parser 無法驗證 payload 自述的 selection digest。
export function mediaSelectionDigest(media: RendererMedia): Digest | null {
  const bytes = canonicalJsonBytes({
    contract: "renderer-media-selection/v1",
    references: media.references,
    assets: media.assets.map((asset) => ({ identity: asset.identity, objectDigest: asset.objectDigest, byteLength: asset.byteLength, metadata: asset.metadata, metadataDigest: asset.metadataDigest })),
    objects: media.objects.map((object) => ({ objectDigest: object.objectDigest, byteLength: object.byteLength })),
  });
  return bytes.ok ? sha256Digest(bytes.value) : null;
}

// preview route selection 同樣需要 producer/parser 共用定義。
export function routeSelectionDigest(mode: "current" | "published", claim: Readonly<{ normalizedRoute: string; owner: string; sourceRevisionId: string }>): Digest | null {
  const bytes = canonicalJsonBytes({ contract: "preview-route-selection/v1", graph: mode, claim: { normalizedRoute: claim.normalizedRoute, owner: claim.owner, sourceRevisionId: claim.sourceRevisionId } });
  return bytes.ok ? sha256Digest(bytes.value) : null;
}
