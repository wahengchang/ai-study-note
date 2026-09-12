import { execFileSync } from "node:child_process";

const PORT = "43127";

function listeningPids(): readonly number[] {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
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
    return command.includes("apps/authoring-api/cms-local-cli.ts") || command.includes("apps/authoring-api/cms-serve-cli.ts");
  } catch {
    return false;
  }
}

function main(): void {
  const pids = listeningPids().filter(isCmsProcess);
  for (const pid of pids) process.kill(pid, "SIGTERM");
  process.stdout.write(pids.length === 0 ? "CMS_KILL_OK stopped=0\n" : `CMS_KILL_OK stopped=${pids.length}\n`);
}

main();
