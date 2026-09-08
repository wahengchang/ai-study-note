import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { packagePlugin } from "../../../apps/cli/plugin-package.js";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

test("seo-basics package compiles a canonical immutable installed plugin", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-package-"));
  try {
    const installed = join(root, "installed");
    await mkdir(installed);
    const first = await packagePlugin({ id: "seo-basics", installedPluginsRoot: installed });
    assert.deepEqual(first.ok && first.changed, true);
    if (!first.ok) return;
    const manifest: unknown = JSON.parse(await readFile(join(first.destination, "plugin-manifest.json"), "utf8"));
    assert.equal(isRecord(manifest), true);
    if (!isRecord(manifest)) return;
    assert.equal(manifest.id, "seo-basics");
    assert.equal(Array.isArray(manifest.callbacks), true);
    if (!Array.isArray(manifest.callbacks)) return;
    assert.deepEqual(manifest.callbacks.flatMap((callback) => isRecord(callback) && typeof callback.hook === "string" ? [callback.hook] : []), ["cms/seo/analyze", "public/seo/page", "public/seo/site"]);
    const second = await packagePlugin({ id: "seo-basics", installedPluginsRoot: installed });
    assert.deepEqual(second.ok && second.changed, false);
    await writeFile(join(first.destination, "index.mjs"), "export const corrupted = true;\n");
    const conflict = await packagePlugin({ id: "seo-basics", installedPluginsRoot: installed });
    assert.deepEqual(conflict, { ok: false, code: "PACKAGE_DESTINATION_CONFLICT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
