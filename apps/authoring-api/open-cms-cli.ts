import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createLocalAuthoringClient } from "./authoring-client.js";
import { AUTHORING_ORIGIN, AUTHORING_RESOURCE_ID_PATTERN } from "./origin.js";

export type OpenCmsCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenCmsCliEnvironment = Readonly<{ homeDirectory: string; xdgConfigHome?: string }>;

/** 以作業系統預設瀏覽器開啟 CMS；一次性 ticket 位於 URL fragment。 */
export async function runOpenCmsCli(argv: readonly string[], io: OpenCmsCliIo, environment: OpenCmsCliEnvironment): Promise<number> {
  const route = argv.length === 1 && argv[0] === "--plugins"
    ? "/cms/plugins"
    : argv.length === 2 && argv[0] === "--entry-id" && argv[1] !== undefined && AUTHORING_RESOURCE_ID_PATTERN.test(argv[1])
      ? `/cms/entries/${argv[1]}`
      : undefined;
  if (route === undefined) { io.stderr("CMS_OPEN_FAILED code=INVALID_ARGUMENTS\n"); return 2; }
  const minted = await createLocalAuthoringClient(environment).mintBrowserTicket();
  if (!minted.ok) {
    io.stderr(`CMS_OPEN_FAILED code=${minted.error.code}\n`);
    return 1;
  }
  const opened = await new Promise<boolean>((resolve) => {
    const browser = spawn("open", [`${AUTHORING_ORIGIN}${route}#${minted.value.ticket}`], { detached: true, stdio: "ignore" });
    browser.once("error", () => resolve(false));
    browser.once("spawn", () => {
      browser.unref();
      resolve(true);
    });
  });
  if (!opened) {
    io.stderr("CMS_OPEN_FAILED code=CMS_DEFAULT_BROWSER_LAUNCH_FAILED\n");
    return 1;
  }
  return 0;
}

export async function openCmsMain(): Promise<void> {
  process.exitCode = await runOpenCmsCli(process.argv.slice(2), { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) }, { homeDirectory: process.env.HOME ?? "", ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: process.env.XDG_CONFIG_HOME }) });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await openCmsMain();
