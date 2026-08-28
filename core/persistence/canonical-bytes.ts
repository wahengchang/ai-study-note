import { canonicalJsonBytes, isDigest, sha256Digest, type Digest } from "../foundation/index.js";

import type { PersistenceFailureCode } from "./contracts.js";

export type CanonicalBytesValidation =
  | Readonly<{ ok: true; bytes: Uint8Array; digest: Digest }>
  | Readonly<{ ok: false; code: PersistenceFailureCode }>;

const decoder = new TextDecoder("utf-8", { fatal: true });

export function validateCanonicalBytes(bytes: Uint8Array, digest: string): CanonicalBytesValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return { ok: false, code: "NON_CANONICAL_BYTES" };
  }

  const canonical = canonicalJsonBytes(parsed);
  if (!canonical.ok || !sameBytes(bytes, canonical.value)) return { ok: false, code: "NON_CANONICAL_BYTES" };
  if (!isDigest(digest) || sha256Digest(bytes) !== digest) return { ok: false, code: "DIGEST_MISMATCH" };
  return { ok: true, bytes, digest };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
