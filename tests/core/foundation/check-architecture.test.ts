import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkArchitecture, formatDiagnostics } from "../../../scripts/check-architecture.js";

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "foundation-architecture-"));
  await Promise.all(Object.entries(files).map(async ([file, content]) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), content); }));
  return root;
}

test("requires a non-empty production source tree", async () => {
  const output = await checkArchitecture({ rootDir: await fixture({ "tests/example.test.ts": "export {};" }) });
  assert.deepEqual(output.violations.map((item) => item.ruleId), ["EMPTY_PRODUCTION_SOURCE"]);
});

test("rejects Foundation dependency on another owner", async () => {
  const root = await fixture({ "core/foundation/index.ts": "import '../content/index.js';", "core/content/index.ts": "export {};" });
  const output = await checkArchitecture({ rootDir: root });
  assert.equal(output.ok, false);
  assert.equal(output.violations[0]?.ruleId, "FOUNDATION_ISOLATION");
  assert.match(formatDiagnostics(output, "text"), /FOUNDATION_ISOLATION/);
  assert.equal(JSON.parse(formatDiagnostics(output, "json")).ok, false);
});
