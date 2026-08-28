import { createHash } from "node:crypto";

export type Digest = `sha256:${string}`;

const digestPattern = /^sha256:[0-9a-f]{64}$/;

export function sha256Digest(bytes: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function isDigest(value: string): value is Digest {
  return digestPattern.test(value);
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
