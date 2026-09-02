import { randomBytes } from "node:crypto";
import { Agent, request } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { openLocalAuthoringClientCredential } from "./credential-store.js";
import type { AuthoringCredentialFailureCode, LocalAuthoringCredentialInput } from "./credential-store.js";
import { AUTHORING_HOST, AUTHORING_PORT } from "./origin.js";
import { authoringErrorSchema, authoringErrorStatuses, saveRevisionRequestSchema, saveRevisionSuccessSchema, serverProofSchema } from "./transport-contracts.js";
import type { AuthoringRemoteErrorCode, SaveRevisionRequestDto, SaveRevisionSuccessDto } from "./transport-contracts.js";

const proofLimit = 64 * 1024;
const saveSuccessLimit = 16 * 1024 * 1024;
const entryIdPattern = /^[A-Za-z0-9._~-]+$/u;

export type AuthoringClientFailureCode = AuthoringCredentialFailureCode | AuthoringRemoteErrorCode | "INVALID_CLIENT_REQUEST" | "AUTHORING_CONNECTION_FAILED" | "AUTHORING_PROOF_TIMEOUT" | "AUTHORING_SAVE_TIMEOUT" | "AUTHORING_SERVER_PROOF_INVALID" | "AUTHORING_CONNECTION_CHANGED" | "INVALID_SERVER_RESPONSE";
export type AuthoringClientResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: AuthoringClientFailureCode }> }>;
export interface LocalAuthoringClient {
  saveRevision(input: Readonly<{ entryId: string; request: SaveRevisionRequestDto }>): Promise<AuthoringClientResult<SaveRevisionSuccessDto>>;
}

type HttpReply = Readonly<{ status: number; text: string }>;
type ProofReply = Readonly<{ reply: HttpReply; socket: Socket }>;

function failed<T>(code: AuthoringClientFailureCode): AuthoringClientResult<T> { return { ok: false, error: { code } }; }
function nonce(): string { return randomBytes(32).toString("base64url"); }

async function readBody(response: IncomingMessage, limit: number): Promise<Readonly<{ ok: true; text: string }> | Readonly<{ ok: false }>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = () => { if (!settled) { settled = true; resolve({ ok: false }); } };
    response.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > limit) { response.destroy(); fail(); return; }
      chunks.push(bytes);
    });
    response.once("aborted", fail);
    response.once("error", fail);
    response.once("end", () => {
      if (settled) return;
      settled = true;
      if (!response.complete) { resolve({ ok: false }); return; }
      try { resolve({ ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)) }); } catch { resolve({ ok: false }); }
    });
  });
}

function remoteCode(status: number, text: string): AuthoringRemoteErrorCode | undefined {
  let body: unknown;
  try { body = JSON.parse(text); } catch { return undefined; }
  const parsed = authoringErrorSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const statuses = authoringErrorStatuses(parsed.data.code);
  return statuses?.includes(status) ? parsed.data.code as AuthoringRemoteErrorCode : undefined;
}

function requestProof(agent: Agent, body: string): Promise<Readonly<{ ok: true; value: ProofReply }> | Readonly<{ ok: false; code: "AUTHORING_CONNECTION_FAILED" | "AUTHORING_PROOF_TIMEOUT" | "INVALID_SERVER_RESPONSE" }>> {
  return new Promise((resolve) => {
    let requestSocket: Socket | undefined;
    let response: IncomingMessage | undefined;
    let settled = false;
    const finish = (value: Readonly<{ ok: true; value: ProofReply }> | Readonly<{ ok: false; code: "AUTHORING_CONNECTION_FAILED" | "AUTHORING_PROOF_TIMEOUT" | "INVALID_SERVER_RESPONSE" }>) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const req = request({ host: AUTHORING_HOST, port: AUTHORING_PORT, method: "POST", path: "/_local/server-proof", agent, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (incoming) => {
      response = incoming;
      const socket = requestSocket;
      if (socket === undefined) { incoming.destroy(); finish({ ok: false, code: "AUTHORING_CONNECTION_FAILED" }); return; }
      void readBody(incoming, proofLimit).then((read) => finish(read.ok ? { ok: true, value: { reply: { status: incoming.statusCode ?? 0, text: read.text }, socket } } : { ok: false, code: "INVALID_SERVER_RESPONSE" }));
    });
    const deadline = setTimeout(() => { req.destroy(); response?.destroy(); finish({ ok: false, code: "AUTHORING_PROOF_TIMEOUT" }); }, 5_000);
    req.once("socket", (socket) => { requestSocket = socket; });
    req.once("error", () => finish({ ok: false, code: "AUTHORING_CONNECTION_FAILED" }));
    req.end(body);
  });
}

function requestSave(agent: Agent, proofSocket: Socket, header: string, pathname: string, body: string): Promise<Readonly<{ ok: true; value: HttpReply }> | Readonly<{ ok: false; code: "AUTHORING_CONNECTION_CHANGED" | "AUTHORING_CONNECTION_FAILED" | "AUTHORING_SAVE_TIMEOUT" | "INVALID_SERVER_RESPONSE" }>> {
  return new Promise((resolve) => {
    let response: IncomingMessage | undefined;
    let settled = false;
    const finish = (value: Readonly<{ ok: true; value: HttpReply }> | Readonly<{ ok: false; code: "AUTHORING_CONNECTION_CHANGED" | "AUTHORING_CONNECTION_FAILED" | "AUTHORING_SAVE_TIMEOUT" | "INVALID_SERVER_RESPONSE" }>) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const req: ClientRequest = request({ host: AUTHORING_HOST, port: AUTHORING_PORT, method: "POST", path: pathname, agent, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (incoming) => {
      response = incoming;
      const limit = incoming.statusCode === 200 ? saveSuccessLimit : proofLimit;
      void readBody(incoming, limit).then((read) => finish(read.ok ? { ok: true, value: { status: incoming.statusCode ?? 0, text: read.text } } : { ok: false, code: "INVALID_SERVER_RESPONSE" }));
    });
    const deadline = setTimeout(() => { req.destroy(); response?.destroy(); finish({ ok: false, code: "AUTHORING_SAVE_TIMEOUT" }); }, 30_000);
    req.once("socket", (socket) => {
      if (socket !== proofSocket || !req.reusedSocket || socket.destroyed) { req.destroy(); finish({ ok: false, code: "AUTHORING_CONNECTION_CHANGED" }); return; }
      req.setHeader("Authorization", header);
      req.end(body);
    });
    req.once("error", () => finish({ ok: false, code: "AUTHORING_CONNECTION_FAILED" }));
  });
}

export function createLocalAuthoringClient(location: LocalAuthoringCredentialInput): LocalAuthoringClient {
  return {
    async saveRevision(input) {
      if (!entryIdPattern.test(input.entryId) || !saveRevisionRequestSchema.safeParse(input.request).success) return failed("INVALID_CLIENT_REQUEST");
      const body = JSON.stringify(input.request);
      const savePath = `/v1/entries/${input.entryId}/revisions`;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const credential = await openLocalAuthoringClientCredential(location);
        if (!credential.ok) return failed(credential.error.code);
        const agent = new Agent({ keepAlive: true, maxSockets: 1, maxTotalSockets: 1, maxFreeSockets: 1, proxyEnv: undefined });
        try {
          const challengeNonce = nonce();
          const proof = await requestProof(agent, JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: credential.value.generation, nonce: challengeNonce }));
          if (!proof.ok) return failed(proof.code);
          const rawProof = (() => { try { return JSON.parse(proof.value.reply.text) as unknown; } catch { return undefined; } })();
          if (proof.value.reply.status !== 200) {
            const code = remoteCode(proof.value.reply.status, proof.value.reply.text);
            if (code === "SERVER_PROOF_GENERATION_MISMATCH" && attempt === 0) continue;
            return failed(code ?? "INVALID_SERVER_RESPONSE");
          }
          const parsedProof = serverProofSchema.safeParse(rawProof);
          if (!parsedProof.success || parsedProof.data.generation !== credential.value.generation || parsedProof.data.nonce !== challengeNonce || !credential.value.verifyServerProof(challengeNonce, parsedProof.data.mac)) return failed("AUTHORING_SERVER_PROOF_INVALID");
          const header = credential.value.authorizationHeader();
          if (header === "") return failed("AUTHORING_CONNECTION_FAILED");
          const saved = await requestSave(agent, proof.value.socket, header, savePath, body);
          if (!saved.ok) return failed(saved.code);
          if (saved.value.status !== 200) return failed(remoteCode(saved.value.status, saved.value.text) ?? "INVALID_SERVER_RESPONSE");
          const rawSuccess = (() => { try { return JSON.parse(saved.value.text) as unknown; } catch { return undefined; } })();
          const parsedSuccess = saveRevisionSuccessSchema.safeParse(rawSuccess);
          return parsedSuccess.success ? { ok: true, value: parsedSuccess.data } : failed("INVALID_SERVER_RESPONSE");
        } finally {
          credential.value.dispose();
          agent.destroy();
        }
      }
      return failed("SERVER_PROOF_GENERATION_MISMATCH");
    },
  };
}
