import { chromium } from "playwright";
import type { Browser } from "playwright";
import { pathToFileURL } from "node:url";

import { createLocalAuthoringClient } from "./authoring-client.js";
import { AUTHORING_ORIGIN, AUTHORING_RESOURCE_ID_PATTERN } from "./origin.js";

export type OpenCmsCliIo = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenCmsCliEnvironment = Readonly<{ homeDirectory: string; xdgConfigHome?: string }>;

/** 僅以 Playwright private pipe/context 啟動，不傳 profile、debug port 或 ticket-bearing argv。 */
export async function runOpenCmsCli(argv: readonly string[], io: OpenCmsCliIo, environment: OpenCmsCliEnvironment): Promise<number> {
  const route = argv.length === 1 && argv[0] === "--plugins"
    ? "/cms/plugins"
    : argv.length === 2 && argv[0] === "--entry-id" && argv[1] !== undefined && AUTHORING_RESOURCE_ID_PATTERN.test(argv[1])
      ? `/cms/entries/${argv[1]}`
      : undefined;
  if (route === undefined) { io.stderr("CMS_OPEN_FAILED code=INVALID_ARGUMENTS\n"); return 2; }
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    const minted = await createLocalAuthoringClient(environment).mintBrowserTicket();
    if (!minted.ok) {
      await browser.close();
      io.stderr(`CMS_OPEN_FAILED code=${minted.error.code}\n`);
      return 1;
    }
    try {
      await page.goto(`${AUTHORING_ORIGIN}${route}#${minted.value.ticket}`, { waitUntil: "domcontentloaded" });
    } catch {
      await browser.close();
      io.stderr("CMS_OPEN_FAILED code=CMS_BROWSER_NAVIGATION_FAILED\n");
      return 1;
    }
    const watched = browser;
    await new Promise<void>((resolve) => watched.once("disconnected", () => resolve()));
    return 0;
  } catch {
    if (browser !== undefined && browser.isConnected()) await browser.close();
    io.stderr("CMS_OPEN_FAILED code=CMS_BROWSER_LAUNCH_FAILED\n");
    return 1;
  }
}

export async function openCmsMain(): Promise<void> {
  process.exitCode = await runOpenCmsCli(process.argv.slice(2), { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) }, { homeDirectory: process.env.HOME ?? "", ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { xdgConfigHome: process.env.XDG_CONFIG_HOME }) });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await openCmsMain();
