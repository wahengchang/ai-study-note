import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCmsServe } from "../../../apps/authoring-api/cms-serve-cli.js";
import { runDbMigrate } from "../../../apps/cli/db-migrate.js";
import { runPluginPackage, runThemePackage } from "../../../apps/cli/package.js";
import { runSiteBuild } from "../../../apps/cli/site-build.js";
import { runThemeActivate } from "../../../apps/cli/theme-activate.js";
import { parsePluginManifest } from "../../../core/plugin-host/index.js";
import { parseThemeManifest } from "../../../core/theme-host/index.js";

function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), "seo-production-cli-"));
}

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout: (text) => { output.push(text); }, stderr: (text) => { output.push(text); } } };
}

test("production package commands create canonical verified packages and rerun without replacing them", async (context) => {
  const root = temporaryDirectory();
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const plugins = path.join(root, "plugins");
  const themes = path.join(root, "themes");
  mkdirSync(plugins, { mode: 0o700 });
  mkdirSync(themes, { mode: 0o700 });

  const plugin = capture();
  assert.equal(await runPluginPackage(["--id", "seo-basics", "--installed-plugins-root", plugins], plugin.io), 0);
  assert.match(plugin.output.join(""), /^PLUGIN_PACKAGE_OK id=seo-basics version=1\.0\.0 manifest=sha256:/u);
  assert.equal(parsePluginManifest(new Uint8Array(readFileSync(path.join(plugins, "seo-basics", "plugin.json"))), "seo-basics").ok, true);
  const pluginManifest = readFileSync(path.join(plugins, "seo-basics", "plugin.json"));
  assert.equal(await runPluginPackage(["--id", "seo-basics", "--installed-plugins-root", plugins], capture().io), 0);
  assert.deepEqual(readFileSync(path.join(plugins, "seo-basics", "plugin.json")), pluginManifest);

  const theme = capture();
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themes], theme.io), 0);
  assert.match(theme.output.join(""), /^THEME_PACKAGE_OK id=study-notes version=1\.0\.0 manifest=sha256:/u);
  assert.equal(parseThemeManifest(new Uint8Array(readFileSync(path.join(themes, "study-notes", "theme.json")))).ok, true);
  assert.equal(existsSync(path.join(themes, "study-notes", "assets", "study-notes.css")), true);
});

test("theme activation uses the durable theme state and command matrix rejects malformed invocations", async (context) => {
  const root = temporaryDirectory();
  context.after(() => { rmSync(root, { recursive: true, force: true }); });
  const database = path.join(root, "cms.sqlite");
  const themes = path.join(root, "themes");
  mkdirSync(themes, { mode: 0o700 });
  assert.equal(runDbMigrate(["--database", database], capture().io), 0);
  assert.equal(await runThemePackage(["--id", "study-notes", "--installed-themes-root", themes], capture().io), 0);
  const activated = capture();
  assert.equal(await runThemeActivate(["--database", database, "--installed-themes-root", themes, "--id", "study-notes"], activated.io), 0);
  assert.match(activated.output.join(""), /^THEME_ACTIVATE_OK id=study-notes version=1\.0\.0 manifest=sha256:/u);

  assert.equal(await runCmsServe([], { HOME: root }, capture().io), 2);
  assert.equal(await runSiteBuild([], capture().io), 2);
  assert.equal(await runThemeActivate(["--database", database, "--id", "study-notes"], capture().io), 2);
});
