import { pathToFileURL } from "node:url";

import { runPluginPackage } from "./package.js";

export async function pluginPackageMain(): Promise<void> {
  process.exitCode = await runPluginPackage(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void pluginPackageMain();
