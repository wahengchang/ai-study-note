import { caseFold } from "unicode-case-folding";

export type NormalizedRoute = Readonly<{ normalizedRoute: string; diagnostic: string }>;

export function normalizeRoute(route: string): NormalizedRoute | null {
  if (typeof route !== "string" || !hasOnlyScalars(route) || !route.startsWith("/") || route.startsWith("//") || route.includes("\\") || route.includes("%") || /[\p{Control}\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/u.test(route)) return null;
  const folded = caseFold(route.normalize("NFC")).normalize("NFC");
  const segments = folded.split("/").filter((segment, index) => index === 0 || segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  let normalizedRoute = segments.join("/");
  if (normalizedRoute.length > 1 && normalizedRoute.endsWith("/")) normalizedRoute = normalizedRoute.slice(0, -1);
  return { normalizedRoute, diagnostic: diagnosticRoute(route) };
}

export function diagnosticRoute(route: string): string {
  let value = "";
  for (let index = 0; index < route.length; index += 1) {
    const code = route.codePointAt(index);
    if (code === undefined) break;
    const character = String.fromCodePoint(code);
    value += /^[A-Za-z0-9/._~-]$/.test(character) ? character : `\\u{${code.toString(16).toUpperCase()}}`;
    if (code > 0xffff) index += 1;
  }
  return value;
}

function hasOnlyScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
