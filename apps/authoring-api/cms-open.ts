import { randomBytes } from "node:crypto";
import { request, Agent, type IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

import { AUTHORING_HOST, AUTHORING_ORIGIN, AUTHORING_PORT, openLocalAuthoringClientCredential } from "./index.js";
import { serverProofSchema } from "./transport-contracts.js";

function nonce(): string { return randomBytes(32).toString("base64url"); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function body(incoming: IncomingMessage): Promise<string> { const { promise, resolve, reject } = Promise.withResolvers<string>(); let text = ""; incoming.setEncoding("utf8"); incoming.on("data", (chunk: string) => { text += chunk; }); incoming.once("end", () => resolve(text)); incoming.once("error", reject); return promise; }

function post(agent: Agent, pathname: string, payload: string, previousSocket?: Socket, authorization?: string): Promise<Readonly<{ status: number; text: string; socket: Socket; reused: boolean }>> {
  const { promise, resolve, reject } = Promise.withResolvers<Readonly<{ status: number; text: string; socket: Socket; reused: boolean }>>();
    let socket: Socket | undefined;
    const current = request({ host: AUTHORING_HOST, port: AUTHORING_PORT, method: "POST", path: pathname, agent, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...(authorization === undefined ? {} : { Authorization: authorization }) } }, (incoming) => { void body(incoming).then((text) => socket === undefined ? reject(new Error("CMS_OPEN_CONNECTION_FAILED")) : resolve({ status: incoming.statusCode ?? 0, text, socket, reused: current.reusedSocket }), reject); });
    current.once("socket", (value) => { socket = value; if (previousSocket !== undefined && (value !== previousSocket || !current.reusedSocket)) { current.destroy(new Error("CMS_OPEN_CONNECTION_CHANGED")); } });
    current.once("error", reject); current.end(payload);
  return promise;
}

export async function main(): Promise<void> {
  const credential = await openLocalAuthoringClientCredential({ homeDirectory: homedir() });
  if (!credential.ok) { process.stderr.write(`CMS_OPEN_FAILED code=${credential.error.code}\n`); process.exitCode = 1; return; }
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const proofNonce = nonce();
    const proof = await post(agent, "/_local/server-proof", JSON.stringify({ contract: "authoring-server-proof-challenge/v1", generation: credential.value.generation, nonce: proofNonce }));
    const parsed: unknown = JSON.parse(proof.text);
    const validProof = serverProofSchema.safeParse(parsed);
    if (proof.status !== 200 || !validProof.success || validProof.data.generation !== credential.value.generation || validProof.data.nonce !== proofNonce || !credential.value.verifyServerProof(proofNonce, validProof.data.mac)) throw new Error("CMS_OPEN_SERVER_PROOF_INVALID");
    const minted = await post(agent, "/_local/browser-tickets", JSON.stringify({ contract: "browser-ticket-mint-request/v1", generation: credential.value.generation, proofNonce }), proof.socket, credential.value.authorizationHeader());
    const ticket: unknown = JSON.parse(minted.text);
    if (minted.status !== 201 || !record(ticket) || typeof ticket.ticket !== "string") throw new Error("CMS_OPEN_TICKET_REJECTED");
    const url = `${AUTHORING_ORIGIN}/cms/#ticket=${encodeURIComponent(ticket.ticket)}`;
    const opened = spawn("open", [url], { detached: true, stdio: "ignore" }); opened.unref();
    process.stdout.write("CMS_OPEN_OK\n");
  } catch (error) { process.stderr.write(`CMS_OPEN_FAILED code=${error instanceof Error ? error.message : "UNKNOWN"}\n`); process.exitCode = 1; } finally { credential.value.dispose(); agent.destroy(); }
}
if (process.argv[1] !== undefined && new URL(`file://${process.argv[1]}`).href === import.meta.url) void main();
