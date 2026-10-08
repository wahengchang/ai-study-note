/** Stable asset IDs must remain addressable through the finite Authoring API route. */
const mediaAssetIdPattern = /^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u;
export function isMediaAssetId(value: unknown): value is string {
  return typeof value === "string" && mediaAssetIdPattern.test(value);
}
