import { createHash, randomBytes } from "node:crypto";

import { BROWSER_TICKET_PATTERN } from "./origin.js";

const PROOF_TTL_MS = 5_000;
const TICKET_TTL_MS = 60_000;

export type BrowserBootstrapFailure = "BROWSER_BOOTSTRAP_INVALID";
export type BrowserTicketMint = Readonly<{ ticket: string; generation: number; expiresInSeconds: 60 }>;

type ProofGrant = Readonly<{ generation: number; proofNonce: string; expiresAt: number }>;
type TicketGrant = Readonly<{ generation: number; expiresAt: number }>;

export interface BrowserBootstrapState {
  grantProof(socket: object, input: Readonly<{ generation: number; proofNonce: string }>): void;
  mint(socket: object, input: Readonly<{ generation: number; proofNonce: string }>): BrowserTicketMint | undefined;
  consume(input: Readonly<{ ticket: string; generation: number }>): boolean;
  clear(): void;
}

/**
 * Proof 綁 TCP socket，而 ticket registry 只存 SHA-256 digest。所有消耗先刪除
 * 再回傳，讓同一 event-loop turn 中的並行 exchange 至多一個成功。
 */
export function createBrowserBootstrapState(input: Readonly<{
  now?: () => number;
  random?: (size: number) => Uint8Array;
}> = {}): BrowserBootstrapState {
  const now = input.now ?? (() => performance.now());
  const random = input.random ?? randomBytes;
  let proofs = new WeakMap<object, ProofGrant>();
  const tickets = new Map<string, TicketGrant>();

  function purgeExpired(at: number): void {
    for (const [digest, grant] of tickets) if (at >= grant.expiresAt) tickets.delete(digest);
  }
  function digest(ticket: string): string {
    return createHash("sha256").update(ticket, "utf8").digest("hex");
  }

  return {
    grantProof(socket, value) {
      proofs.set(socket, { generation: value.generation, proofNonce: value.proofNonce, expiresAt: now() + PROOF_TTL_MS });
    },
    mint(socket, value) {
      const at = now();
      purgeExpired(at);
      const grant = proofs.get(socket);
      // 第一次 schema-valid mint attempt 一律消耗 grant，連 mismatch 也不例外。
      proofs.delete(socket);
      if (grant === undefined || at >= grant.expiresAt || grant.generation !== value.generation || grant.proofNonce !== value.proofNonce) return undefined;
      const ticket = `asn_bt_v1_${Buffer.from(random(32)).toString("base64url")}`;
      if (!BROWSER_TICKET_PATTERN.test(ticket)) return undefined;
      tickets.set(digest(ticket), { generation: value.generation, expiresAt: at + TICKET_TTL_MS });
      return { ticket, generation: value.generation, expiresInSeconds: 60 };
    },
    consume(value) {
      if (!BROWSER_TICKET_PATTERN.test(value.ticket)) return false;
      const at = now();
      purgeExpired(at);
      const key = digest(value.ticket);
      const grant = tickets.get(key);
      // delete-before-response / delete-before-generation decision 保證 replay 沒有 oracle。
      tickets.delete(key);
      return grant !== undefined && at < grant.expiresAt && grant.generation === value.generation;
    },
    clear() {
      proofs = new WeakMap<object, ProofGrant>();
      tickets.clear();
    },
  };
}
