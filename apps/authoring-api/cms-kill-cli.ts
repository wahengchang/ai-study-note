import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { AUTHORING_HOST, AUTHORING_PORT } from "./origin.js";

export type CmsKillCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

/** 只認由 production CLI 以完整 argv 啟動的 local CMS listener；其餘 listener 一律不送 signal。 */
const CMS_PROCESS_COMMAND = /^(?:\S*\/)?node(?:\s+--import\s+\S+|\s+--\S+(?:=\S+)?)*\s+apps\/authoring-api\/(?:cms-local-cli\.ts\s+start|cms-serve-cli\.ts\s+--database\s+\S+\s+--media-root\s+\S+\s+--installed-plugins-root\s+\S+\s+--installed-themes-root\s+\S+\s+--cms-assets-root\s+\S+)\s*$/u;

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
    return CMS_PROCESS_COMMAND.test(execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim());
  } catch {
    return false;
  }
}

type CmsKillDependencies = Readonly<{
  listeningPids(): readonly number[];
  isCmsProcess(pid: number): boolean;
  terminate(pid: number): void;
}>;

const localCmsDependencies: CmsKillDependencies = {
  listeningPids,
  isCmsProcess,
  terminate: (pid) => { process.kill(pid, "SIGTERM"); },
};

export function runCmsKillCli(argv: readonly string[], io: CmsKillCliIo, dependencies: CmsKillDependencies = localCmsDependencies): number {
  if (argv.length !== 0) { io.stderr("CMS_KILL_FAILED code=INVALID_ARGUMENTS\n"); return 2; }
  let stopped = 0;
  for (const pid of dependencies.listeningPids()) {
    if (!dependencies.isCmsProcess(pid)) continue;
    // listener 可能在 lsof 與 kill 之間結束，pid 重用則已被 isCmsProcess 擋下。
    try { dependencies.terminate(pid); stopped += 1; } catch { continue; }
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
