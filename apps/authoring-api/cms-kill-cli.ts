import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { AUTHORING_HOST, AUTHORING_PORT } from "./origin.js";

export type CmsKillCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

/** 只認這兩個 local CMS entrypoint；其餘 listener 一律不送 signal。 */
const CMS_ENTRYPOINTS = ["apps/authoring-api/cms-local-cli.ts", "apps/authoring-api/cms-serve-cli.ts"] as const;

function listeningPids(): readonly number[] {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP@${AUTHORING_HOST}:${AUTHORING_PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
      .split("\n")
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function isCmsProcess(pid: number): boolean {
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return CMS_ENTRYPOINTS.some((entrypoint) => command.includes(entrypoint));
  } catch {
    return false;
  }
}

export function runCmsKillCli(argv: readonly string[], io: CmsKillCliIo): number {
  if (argv.length !== 0) { io.stderr("CMS_KILL_FAILED code=INVALID_ARGUMENTS\n"); return 2; }
  let stopped = 0;
  for (const pid of listeningPids().filter(isCmsProcess)) {
    // listener 可能在 lsof 與 kill 之間結束，pid 重用則已被 isCmsProcess 擋下。
    try { process.kill(pid, "SIGTERM"); stopped += 1; } catch { continue; }
  }
  io.stdout(`CMS_KILL_OK stopped=${stopped}\n`);
  return 0;
}

export function cmsKillMain(): void {
  process.exitCode = runCmsKillCli(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) cmsKillMain();
