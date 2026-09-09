import { pathToFileURL } from "node:url";

import { runThemePackage } from "./package.js";

export async function themePackageMain(): Promise<void> {
  process.exitCode = await runThemePackage(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void themePackageMain();
