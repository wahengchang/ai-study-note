import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createLocalAuthoringClient } from "./authoring-client.js";
import { saveRevisionRequestSchema } from "./transport-contracts.js";
import type { SaveRevisionRequestDto } from "./transport-contracts.js";

const inputLimit = 4 * 1024 * 1024;
const entryIdPattern = /^[A-Za-z0-9._~-]+$/u;

export type SaveRevisionCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type SaveRevisionCliEnvironment = Readonly<{ cwd: string; homeDirectory: string; xdgConfigHome?: string }>;

type ParsedArguments = Readonly<{ entryId: string; input: string }>;

function invalidArguments(io: SaveRevisionCliIo): number { io.stderr("AUTHORING_SAVE_REVISION_FAILED code=INVALID_ARGUMENTS\n"); return 2; }
function repeatedOption(argv: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2).split("=", 1)[0] ?? "";
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}
function parse(argv: readonly string[]): ParsedArguments | undefined {
  if (repeatedOption(argv) || argv.includes("--api-key") || argv.some((argument) => argument.startsWith("--api-key="))) return undefined;
  try {
    const parsed = parseArgs({ args: argv, strict: true, allowPositionals: false, options: { "entry-id": { type: "string" }, input: { type: "string" } } });
    const entryId = parsed.values["entry-id"];
    const input = parsed.values.input;
    return typeof entryId === "string" && typeof input === "string" && entryIdPattern.test(entryId) && input.length > 0 ? { entryId, input } : undefined;
  } catch { return undefined; }
}
async function readRequestFile(path: string): Promise<Readonly<{ ok: true; value: SaveRevisionRequestDto }> | Readonly<{ ok: false; code: "INPUT_READ_FAILED" | "INVALID_REQUEST_FILE" }>> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > inputLimit) return { ok: false, code: "INPUT_READ_FAILED" };
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) return { ok: false, code: "INPUT_READ_FAILED" };
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)); } catch { return { ok: false, code: "INVALID_REQUEST_FILE" }; }
    let value: unknown;
    try { value = JSON.parse(text); } catch { return { ok: false, code: "INVALID_REQUEST_FILE" }; }
    const parsed = saveRevisionRequestSchema.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "INVALID_REQUEST_FILE" };
  } catch { return { ok: false, code: "INPUT_READ_FAILED" }; } finally { await handle?.close().catch(() => undefined); }
}

export async function runSaveRevisionCli(argv: readonly string[], io: SaveRevisionCliIo, environment: SaveRevisionCliEnvironment): Promise<number> {
  const argumentsValue = parse(argv);
  if (argumentsValue === undefined) return invalidArguments(io);
  const request = await readRequestFile(resolve(environment.cwd, argumentsValue.input));
  if (!request.ok) { io.stderr(`AUTHORING_SAVE_REVISION_FAILED code=${request.code}\n`); return 2; }
  const result = await createLocalAuthoringClient({ homeDirectory: environment.homeDirectory, ...(environment.xdgConfigHome === undefined ? {} : { xdgConfigHome: environment.xdgConfigHome }) }).saveRevision({ entryId: argumentsValue.entryId, request: request.value });
  if (!result.ok) { io.stderr(`AUTHORING_SAVE_REVISION_FAILED code=${result.error.code}\n`); return 1; }
  io.stdout("AUTHORING_SAVE_REVISION_OK\n");
  return 0;
}

export async function saveRevisionMain(): Promise<void> {
  process.exitCode = await runSaveRevisionCli(process.argv.slice(2), { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) }, { cwd: process.cwd(), homeDirectory: process.env.HOME ?? "", ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: process.env.XDG_CONFIG_HOME }) });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await saveRevisionMain();
