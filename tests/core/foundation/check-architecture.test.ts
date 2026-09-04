import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkArchitecture,
  formatDiagnostics,
  type ArchitectureRule,
} from "../../../scripts/check-architecture.js";

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "foundation-architecture-"));
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), content);
    }),
  );
  return root;
}

async function rules(files: Record<string, string>): Promise<readonly ArchitectureRule[]> {
  const output = await checkArchitecture({ rootDir: await fixture(files) });
  return output.violations.map((item) => item.ruleId);
}

/** 每個 fixture 都帶一個真實 production 檔，避免誤觸 EMPTY_PRODUCTION_SOURCE。 */
const contentEntry = { "core/content/index.ts": "export const content = 1;\n" };

test("requires a non-empty production source tree", async () => {
  assert.deepEqual(await rules({ "tests/example.test.ts": "export {};" }), ["EMPTY_PRODUCTION_SOURCE"]);
});

test("accepts a contract-conforming tree", async () => {
  assert.deepEqual(
    await rules({
      "core/foundation/index.ts": "export const version = 1;\n",
      "core/foundation/canonical-json.ts": "export const jcs = 1;\n",
      "core/content/index.ts": "import { version } from '../foundation/index.js';\nexport const content = version;\n",
      "core/application/index.ts": "import { content } from '../content/index.js';\nexport const app = content;\n",
      "core/renderer/index.ts": "export const renderer = 1;\n",
      "core/projection/index.ts": "export const projection = 1;\n",
      "core/delivery/index.ts":
        "import { projection } from '../projection/index.js';\nimport { renderer } from '../renderer/index.js';\nexport const delivery = projection + renderer;\n",
      "apps/cms/index.ts": "import { app } from '../../core/application/index.js';\nexport const cms = app;\n",
      "db/migrations/0001-create-content.sql": "select 1;\n",
      "tests/core/content/content.test.ts": "import '../../../core/content/index.js';\n",
    }),
    [],
  );
});

test("rejects Foundation dependency on another owner or an unapproved package", async () => {
  const root = await fixture({
    "core/foundation/index.ts": "import '../content/index.js';\nimport 'left-pad';\n",
    ...contentEntry,
  });
  const output = await checkArchitecture({ rootDir: root });
  assert.equal(output.ok, false);
  assert.deepEqual(
    output.violations.map((item) => item.ruleId),
    ["FOUNDATION_ISOLATION", "FOUNDATION_ISOLATION"],
  );
  assert.match(formatDiagnostics(output, "text"), /FOUNDATION_ISOLATION/);
  assert.equal(JSON.parse(formatDiagnostics(output, "json")).ok, false);
});

test("allows Foundation to use Node builtins and json-canonicalize", async () => {
  assert.deepEqual(
    await rules({
      "core/foundation/index.ts": "import 'node:crypto';\nexport const ok = 1;\n",
      ...contentEntry,
    }),
    [],
  );
});

test("rejects cross-owner deep imports that bypass the public entrypoint", async () => {
  assert.deepEqual(
    await rules({
      "core/content/index.ts": "export const content = 1;\n",
      "core/content/internal/store.ts": "export const store = 1;\n",
      "apps/cms/index.ts": "import { store } from '../../core/content/internal/store.js';\nexport const cms = store;\n",
    }),
    ["DEEP_IMPORT"],
  );
});

test("allows package-local imports inside a unit", async () => {
  assert.deepEqual(
    await rules({
      "core/content/index.ts": "import { store } from './internal/store.js';\nexport const content = store;\n",
      "core/content/internal/store.ts": "export const store = 1;\n",
    }),
    [],
  );
});

test("rejects an owner dependency outside the documented matrix", async () => {
  assert.deepEqual(
    await rules({
      "core/renderer/index.ts": "import { content } from '../content/index.js';\nexport const renderer = content;\n",
      ...contentEntry,
    }),
    ["OWNER_DIRECTION"],
  );
});

test("rejects core and extension dependencies on apps", async () => {
  assert.deepEqual(
    await rules({
      "core/content/index.ts": "import { cms } from '../../apps/cms/index.js';\nexport const content = cms;\n",
      "apps/cms/index.ts": "export const cms = 1;\n",
    }),
    ["APP_COMPOSITION"],
  );
});

test("rejects Host and Renderer dependencies on repository extension source", async () => {
  assert.deepEqual(
    await rules({
      "core/plugin-host/index.ts": "import '../../extensions/plugins/demo-plugin/index.js';\nexport const host = 1;\n",
      "extensions/plugins/demo-plugin/index.ts": "export const plugin = 1;\n",
    }),
    ["HOST_EXTENSION_ISOLATION"],
  );

  assert.deepEqual(
    await rules({
      "core/renderer/index.ts": "import '../../extensions/themes/demo-theme/index.js';\nexport const renderer = 1;\n",
      "extensions/themes/demo-theme/index.ts": "export const theme = 1;\n",
    }),
    ["RENDERER_THEME_ISOLATION"],
  );
});

test("accepts type-only extension imports of the matching public contract entry", async () => {
  assert.deepEqual(
    await rules({
      "core/plugin-host/index.ts": "export type PluginHook = { id: string };\nexport const host = 1;\n",
      "core/renderer/index.ts": "export type RenderInput = { id: string };\nexport const renderer = 1;\n",
      "extensions/plugins/demo-plugin/index.ts":
        "import type { PluginHook } from '../../../core/plugin-host/index.js';\nexport const hook: PluginHook = { id: 'demo' };\n",
      "extensions/themes/demo-theme/index.ts":
        "import { type RenderInput } from '../../../core/renderer/index.js';\nexport const input: RenderInput = { id: 'demo' };\n",
      "extensions/plugins/demo-plugin/helper.ts": "export const helper = 1;\n",
    }),
    [],
  );
});

test("rejects extension value imports and imports of the wrong contract entry", async () => {
  assert.deepEqual(
    await rules({
      "core/plugin-host/index.ts": "export const host = 1;\n",
      "extensions/plugins/demo-plugin/index.ts":
        "import { host } from '../../../core/plugin-host/index.js';\nexport const plugin = host;\n",
    }),
    ["RUNTIME_SELF_CONTAINED"],
  );

  assert.deepEqual(
    await rules({
      "core/renderer/index.ts": "export type RenderInput = { id: string };\nexport const renderer = 1;\n",
      "extensions/plugins/demo-plugin/index.ts":
        "import type { RenderInput } from '../../../core/renderer/index.js';\nexport const plugin: RenderInput = { id: 'x' };\n",
    }),
    ["EXTENSION_TYPE_ONLY"],
  );
});

test("requires every unit to publish a root index.ts", async () => {
  assert.deepEqual(await rules({ "core/content/store.ts": "export const store = 1;\n" }), ["PUBLIC_ENTRYPOINT"]);
});

test("rejects non-kebab-case names and malformed migration names", async () => {
  assert.deepEqual(
    await rules({
      ...contentEntry,
      "core/content/StoreThing.ts": "export const a = 1;\n",
      "core/content/some_thing.ts": "export const b = 1;\n",
      "db/migrations/create-content.sql": "select 1;\n",
    }),
    ["NAMING", "NAMING", "NAMING"],
  );
});

test("rejects legacy flat roots and cross-owner catch-all roots", async () => {
  assert.deepEqual(
    await rules({ ...contentEntry, "plugins/legacy.ts": "export const legacy = 1;\n" }),
    ["LEGACY_FLAT_ROOT"],
  );
  assert.deepEqual(await rules({ ...contentEntry, "utils/helper.ts": "export const helper = 1;\n" }), [
    "CATCH_ALL_ROOT",
  ]);
});

test("rejects files outside the documented semantic roots", async () => {
  assert.deepEqual(await rules({ ...contentEntry, "src/legacy-app.ts": "export const legacy = 1;\n" }), ["ROOT_TREE"]);
  assert.deepEqual(await rules({ ...contentEntry, "core/not-an-owner/index.ts": "export const x = 1;\n" }), [
    "ROOT_TREE",
  ]);
});

test("rejects unresolved and non-literal module specifiers", async () => {
  assert.deepEqual(
    await rules({
      "core/content/index.ts": "import './missing.js';\nexport const content = 1;\n",
    }),
    ["UNRESOLVED_IMPORT"],
  );
  assert.deepEqual(
    await rules({
      "core/content/index.ts": "export const content = await import(`./${globalThis.name}.js`);\n",
    }),
    ["UNRESOLVED_IMPORT"],
  );
});

test("只允許 Plugin Host 與 Renderer 的已驗證 runtime module URL", async () => {
  assert.deepEqual(
    await rules({
      "core/plugin-host/index.ts": "export {};\n",
      "core/plugin-host/module-loader.ts": "const url = 'data:text/javascript;base64,ZXhwb3J0IHt9';\nexport const module = import(url);\n",
      "core/renderer/index.ts": "export {};\n",
      "core/renderer/module-loader.ts": "const url = 'data:text/javascript;base64,ZXhwb3J0IHt9';\nexport const module = import(url);\n",
      ...contentEntry,
    }),
    [],
  );
});

test("rejects parse errors instead of silently skipping the file", async () => {
  assert.deepEqual(await rules({ "core/content/index.ts": "export const = ;\n" }), ["PARSE_ERROR"]);
});

test("rejects symlinks whose realpath escapes the repository", async () => {
  const root = await fixture(contentEntry);
  await symlink(path.resolve("/etc"), path.join(root, "core", "content", "outside"));
  const output = await checkArchitecture({ rootDir: root });
  assert.equal(output.ok, false);
  assert.deepEqual(
    output.violations.map((item) => item.ruleId),
    ["SYMLINK_ESCAPE"],
  );
});

test("main reports a usage error as exit code 2", async () => {
  const { main } = await import("../../../scripts/check-architecture.js");
  const errors: string[] = [];
  const code = await main(["--format", "yaml"], { cwd: process.cwd(), stdout: () => {}, stderr: (t) => errors.push(t) });
  assert.equal(code, 2);
  assert.match(errors.join(""), /ARCHITECTURE_CHECK_ERROR/);
});
