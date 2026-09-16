import { caseFold } from "unicode-case-folding";

export type GlobalSlug = Readonly<{ slug: string; namespaceKey: string }>;

const forbidden = /[\p{Control}\s/%]/u;
const segment = /^[\p{L}\p{N}\p{M}]+(?:-[\p{L}\p{N}\p{M}]+)*$/u;

export function globalSlugNamespaceKey(slug: string): string | undefined {
  const normalized = normalizeDisplaySlug(slug);
  return normalized === undefined ? undefined : caseFold(normalized).normalize("NFC");
}

export function normalizeDisplaySlug(value: string): string | undefined {
  if (typeof value !== "string" || !value.isWellFormed()) return undefined;
  const slug = value.normalize("NFC");
  return slug.length > 0 && slug === value && !forbidden.test(slug) && slug !== "." && slug !== ".." && segment.test(slug) ? slug : undefined;
}

export function suggestGlobalSlug(label: string): GlobalSlug | undefined {
  if (typeof label !== "string" || !label.isWellFormed()) return undefined;
  const slug = caseFold(label.trim().normalize("NFC")).normalize("NFC").replace(/[^\p{L}\p{N}\p{M}]+/gu, "-").replace(/^-+|-+$/gu, "");
  const normalized = normalizeDisplaySlug(slug);
  return normalized === undefined ? undefined : { slug: normalized, namespaceKey: caseFold(normalized).normalize("NFC") };
}

export function globalSlug(value: string): GlobalSlug | undefined {
  const slug = normalizeDisplaySlug(value);
  return slug === undefined ? undefined : { slug, namespaceKey: caseFold(slug).normalize("NFC") };
}
