import { pathToFileURL } from "node:url";

import type { CliIo } from "./db-migrate.js";

/** Public build is paused until the current-only content projection is connected. */
export async function runSiteBuild(_argv: readonly string[], io: CliIo): Promise<number> {
  io.stderr("SITE_BUILD_FAILED code=CURRENT_CONTENT_PUBLIC_BUILD_PAUSED\n");
  return 1;
}
export async function siteBuildMain(): Promise<void> {
  process.exitCode = await runSiteBuild(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void siteBuildMain();
