import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateDatabase } from "../../../core/persistence/index.js";
import { createLocalAuthoringCredentialAuthority, startCmsRuntime } from "../../../apps/authoring-api/index.js";
import { markCurrentMediaRoot } from "../../../core/media/current-object-store.js";

import { runCmsServe } from "../../../apps/authoring-api/cms-serve-cli.js";

const baseArguments = ["--database", "/tmp/cms.sqlite", "--media-root", "/tmp/objects", "--installed-plugins-root", "/tmp/plugins", "--installed-themes-root", "/tmp/themes", "--cms-assets-root", "/tmp/cms"] as const;

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout(text) { output.push(text); }, stderr(text) { output.push(text); } } };
}

test("cms:serve rejects missing, duplicate, malformed, unknown, and positional arguments before startup", async () => {
  const cases = [
    baseArguments.filter((argument) => argument !== "--cms-assets-root" && argument !== "/tmp/cms"),
    [...baseArguments, "--database", "/tmp/other.sqlite"],
    [...baseArguments, "--unknown", "x"],
    [...baseArguments, "unexpected"],
  ] as const;
  for (const arguments_ of cases) {
    const captured = capture();
    assert.equal(await runCmsServe(arguments_, { HOME: "/tmp" }, captured.io), 2);
    assert.deepEqual(captured.output, ["CMS_SERVE_FAILED code=INVALID_ARGUMENTS\n"]);
  }
});

test("current-only CMS runtime starts without legacy theme and closes cleanly", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "cms-serve-"));
  try {
    const repositoryRoot = path.join(directory, "repository");
    const databasePath = path.join(directory, "cms.sqlite");
    const objectsRoot = path.join(directory, "objects");
    const installedPluginsRoot = path.join(directory, "plugins");
    const installedThemesRoot = path.join(directory, "themes");
    const cmsAssetsRoot = path.join(repositoryRoot, "dist", "cms");
    mkdirSync(path.join(cmsAssetsRoot, ".vite"), { recursive: true, mode: 0o700 });
    mkdirSync(path.join(cmsAssetsRoot, "assets"), { mode: 0o700 });
    mkdirSync(installedPluginsRoot, { mode: 0o700 });
    mkdirSync(installedThemesRoot, { mode: 0o700 });
    writeFileSync(path.join(cmsAssetsRoot, ".vite", "manifest.json"), JSON.stringify({ "index.html": { file: "assets/cms.js", isEntry: true } }), { mode: 0o600 });
    writeFileSync(path.join(cmsAssetsRoot, "assets", "cms.js"), "export {};\n", { mode: 0o600 });
    assert.equal(migrateDatabase({ databasePath }).ok, true);
    const credential = createLocalAuthoringCredentialAuthority({ homeDirectory: directory, xdgConfigHome: path.join(directory, "config") });
    assert.equal((await credential.transition("provision")).ok, true);
    mkdirSync(objectsRoot, { mode: 0o700 });
    assert.equal(markCurrentMediaRoot(objectsRoot), true);
    const runtime = await startCmsRuntime({ repositoryRoot, databasePath, mediaRoot: objectsRoot, installedPluginsRoot, installedThemesRoot, cmsAssetsRoot, credential: { homeDirectory: directory, xdgConfigHome: path.join(directory, "config") }, logger: () => undefined });
    assert.equal(runtime.ok, true, runtime.ok ? "" : runtime.error.code);
    if (runtime.ok) await runtime.value.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
