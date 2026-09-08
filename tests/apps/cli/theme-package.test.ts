import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { packageTheme } from "../../../apps/cli/theme-package.js";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

test("study-notes theme is compiled, evidenced, and idempotently installed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "theme-package-"));
  try {
    const first = await packageTheme({ id: "study-notes", installedThemesRoot: root });
    assert.deepEqual(first.ok && { changed: first.changed, destination: path.basename(first.destination) }, { changed: true, destination: "study-notes" });
    if (!first.ok) return;
    const manifest = JSON.parse(await readFile(path.join(first.destination, "theme-manifest.json"), "utf8")) as unknown;
    assert.equal(record(manifest), true);
    if (!record(manifest)) return;
    assert.equal(manifest.manifestVersion, "theme-manifest/v1");
    assert.equal(manifest.rendererContract, "theme-renderer/v1");
    assert.deepEqual(manifest.resources, [{ file: "style.css", digest: manifest.resources instanceof Array && record(manifest.resources[0]) ? manifest.resources[0].digest : undefined }]);
    const entry = await readFile(path.join(first.destination, "index.mjs"), "utf8");
    assert.equal(entry.includes("export function render"), true);
    const second = await packageTheme({ id: "study-notes", installedThemesRoot: root });
    assert.deepEqual(second.ok && second.changed, false);
    await writeFile(path.join(first.destination, "style.css"), "corrupt");
    const conflict = await packageTheme({ id: "study-notes", installedThemesRoot: root });
    assert.deepEqual(conflict, { ok: false, code: "PACKAGE_DESTINATION_CONFLICT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
