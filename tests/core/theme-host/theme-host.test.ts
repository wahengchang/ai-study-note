import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createThemeHost, type ThemeIdentity } from "../../../core/theme-host/index.js";

type Fixture = Readonly<{ base: string; repositoryRoot: string; installedThemesRoot: string }>;
type Resource = Readonly<{ file: string; content: string }>;

async function fixture(): Promise<Fixture> {
  const base = await mkdtemp(path.join(tmpdir(), "theme-host-"));
  const repositoryRoot = path.join(base, "repository");
  const installedThemesRoot = path.join(base, "installed-themes");
  await Promise.all([mkdir(repositoryRoot, { recursive: true, mode: 0o700 }), mkdir(installedThemesRoot, { recursive: true, mode: 0o700 })]);
  return Object.freeze({ base, repositoryRoot, installedThemesRoot });
}

async function cleanup(value: Fixture): Promise<void> {
  await rm(value.base, { recursive: true, force: true });
}

async function installTheme(input: Readonly<{
  root: string;
  slot: string;
  id: string;
  version: string;
  runtime?: string;
  resources?: readonly Resource[];
}>): Promise<ThemeIdentity> {
  const directory = path.join(input.root, input.slot);
  const runtime = input.runtime ?? "export const theme = 'ok';\n";
  const resources = input.resources ?? [{ file: "assets/site.css", content: "body{}\n" }];
  await mkdir(path.join(directory, "assets"), { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, "runtime.mjs"), runtime, { mode: 0o600 });
  await Promise.all(resources.map(async (resource) => {
    const target = path.join(directory, resource.file);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, resource.content, { mode: 0o600 });
  }));
  const manifest = {
    contract: "theme-manifest/v1",
    id: input.id,
    version: input.version,
    runtime: { file: "runtime.mjs", digest: sha256Digest(new TextEncoder().encode(runtime)) },
    resources: resources.map((resource) => ({ file: resource.file, digest: sha256Digest(new TextEncoder().encode(resource.content)) })),
  };
  const canonical = canonicalJsonBytes(manifest);
  assert.equal(canonical.ok, true);
  await writeFile(path.join(directory, "theme.json"), canonical.value, { mode: 0o600 });
  return Object.freeze({ id: input.id, version: input.version, manifestHash: sha256Digest(canonical.value) });
}


test("discovers external canonical Themes, resolves exact identity, and defensively copies bytes", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const first = await installTheme({ root: roots.installedThemesRoot, slot: "opaque-a", id: "example-theme", version: "1.0.0" });
  const second = await installTheme({ root: roots.installedThemesRoot, slot: "opaque-b", id: "example-theme", version: "2.0.0" });
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const discovery = await created.value.discover();
  assert.deepEqual(discovery, { ok: true, value: { candidates: [first, second], rejections: [] } });
  const resolved = await created.value.resolveExact({ identity: first });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.value.identity, first);
  assert.equal("path" in resolved.value, false);
  const bytes = await created.value.readVerifiedFile({ identity: first, file: "runtime.mjs" });
  assert.equal(bytes.ok, true);
  bytes.value[0] = 0;
  const reread = await created.value.readVerifiedFile({ identity: first, file: "runtime.mjs" });
  assert.equal(reread.ok, true);
  assert.equal(new TextDecoder().decode(reread.value), "export const theme = 'ok';\n");
  const missing = await created.value.readVerifiedFile({ identity: first, file: "undeclared.mjs" });
  assert.equal(missing.ok, false);
  if (missing.ok) throw new Error("expected failure");
  assert.equal(missing.error.code, "THEME_FILE_NOT_DECLARED");
  assert.equal(missing.error.owner, "ThemeHost");
  assert.deepEqual(missing.error.subjectIds, ["example-theme"]);
  assert.equal(missing.error.remediation.kind, "message");
});

test("fails closed for duplicate id/version even when one slot evidence drifts", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "one", id: "duplicate-theme", version: "1.0.0" });
  await installTheme({ root: roots.installedThemesRoot, slot: "two", id: "duplicate-theme", version: "1.0.0" });
  await writeFile(path.join(roots.installedThemesRoot, "two", "assets/site.css"), "drift\n", { mode: 0o600 });
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, true);
  assert.deepEqual(discovery.value.candidates, []);
  assert.equal(discovery.value.rejections.length, 1);
  const rejection = discovery.value.rejections[0]!;
  assert.equal(rejection.code, "THEME_IDENTITY_CONFLICT");
  assert.equal(rejection.owner, "ThemeHost");
  assert.deepEqual(rejection.subjectIds, ["duplicate-theme"]);
  assert.equal(rejection.remediation.kind, "message");
  const resolved = await created.value.resolveExact({ identity });
  assert.equal(resolved.ok, false);
  if (resolved.ok) throw new Error("expected conflict");
  assert.equal(resolved.error.code, "THEME_IDENTITY_CONFLICT");
});

test("rejects invalid trusted roots and fail-closes evidence drift", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "safe", id: "safe-theme", version: "1.0.0" });
  const relative = await createThemeHost({ repositoryRoot: "relative", installedThemesRoot: roots.installedThemesRoot });
  assert.equal(relative.ok, false);
  if (relative.ok) throw new Error("expected failure");
  assert.equal(relative.error.code, "INVALID_TRUSTED_ROOT");
  const nested = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: path.join(roots.repositoryRoot, "themes") });
  assert.equal(nested.ok, false);
  if (nested.ok) throw new Error("expected failure");
  assert.equal(nested.error.code, "INVALID_TRUSTED_ROOT");
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  await writeFile(path.join(roots.installedThemesRoot, "safe", "assets/site.css"), "changed\n", { mode: 0o600 });
  const bytes = await created.value.readVerifiedFile({ identity, file: "runtime.mjs" });
  assert.equal(bytes.ok, false);
  if (bytes.ok) throw new Error("expected evidence failure");
  assert.equal(bytes.error.code, "THEME_EVIDENCE_MISMATCH");
  assert.equal(bytes.error.owner, "ThemeHost");
  assert.deepEqual(bytes.error.subjectIds, ["safe-theme"]);
  assert.equal(bytes.error.remediation.kind, "message");
  await chmod(roots.installedThemesRoot, 0o777);
  const afterModeDrift = await created.value.discover();
  assert.equal(afterModeDrift.ok, false);
  if (afterModeDrift.ok) throw new Error("expected root failure");
  assert.equal(afterModeDrift.error.code, "INVALID_TRUSTED_ROOT");
});

test("rejects symlinked evidence and every executable runtime import without executing runtime", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const probe = "globalThis.__themeHostProbe = (globalThis.__themeHostProbe ?? 0) + 1; export {};\n";
  const valid = await installTheme({ root: roots.installedThemesRoot, slot: "probe", id: "probe-theme", version: "1.0.0", runtime: probe });
  const imports = ["import './relative.mjs';", "import '/absolute.mjs';", "import 'package-name';", "import('package-name');", "import 'node:fs';"];
  await Promise.all(imports.map((runtime, index) => installTheme({ root: roots.installedThemesRoot, slot: `invalid-${index}`, id: `invalid-theme-${index}`, version: "1.0.0", runtime })));
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, true);
  assert.deepEqual(discovery.value.candidates, [valid]);
  assert.equal(discovery.value.rejections.filter((item) => item.code === "THEME_RUNTIME_INVALID").length, imports.length);
  assert.equal((globalThis as Record<string, unknown>).__themeHostProbe, undefined);
  await rm(path.join(roots.installedThemesRoot, "probe", "runtime.mjs"));
  await writeFile(path.join(roots.installedThemesRoot, "outside.mjs"), probe, { mode: 0o600 });
  await symlink(path.join(roots.installedThemesRoot, "outside.mjs"), path.join(roots.installedThemesRoot, "probe", "runtime.mjs"));
  const symlinkRead = await created.value.readVerifiedFile({ identity: valid, file: "runtime.mjs" });
  assert.equal(symlinkRead.ok, false);
  if (symlinkRead.ok) throw new Error("expected evidence failure");
  assert.equal(symlinkRead.error.code, "THEME_EVIDENCE_MISMATCH");
});

async function installManifestBytes(root: string, slot: string, manifest: unknown): Promise<void> {
  const directory = path.join(root, slot);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, "runtime.mjs"), "export const theme = 'ok';\n", { mode: 0o600 });
  const canonical = canonicalJsonBytes(manifest);
  assert.equal(canonical.ok, true);
  await writeFile(path.join(directory, "theme.json"), canonical.value, { mode: 0o600 });
}

test("rejects malformed caller input before touching the installed root", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "input", id: "input-theme", version: "1.0.0" });
  const extraKey = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot, extra: 1 } as unknown as Readonly<{ repositoryRoot: string; installedThemesRoot: string }>);
  assert.equal(extraKey.ok, false);
  if (extraKey.ok) throw new Error("expected failure");
  assert.equal(extraKey.error.code, "INVALID_THEME_HOST_INPUT");
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const malformed: readonly unknown[] = [
    null,
    { identity: { ...identity, extra: 1 } },
    { identity: { id: "Input-Theme", version: identity.version, manifestHash: identity.manifestHash } },
    { identity: { id: identity.id, version: "1.0", manifestHash: identity.manifestHash } },
    { identity: { id: identity.id, version: identity.version, manifestHash: "sha256" } },
  ];
  for (const input of malformed) {
    const resolved = await created.value.resolveExact(input as Readonly<{ identity: ThemeIdentity }>);
    assert.equal(resolved.ok, false);
    if (resolved.ok) throw new Error("expected failure");
    assert.equal(resolved.error.code, "INVALID_THEME_HOST_INPUT");
    assert.deepEqual(resolved.error.subjectIds, []);
  }
  const unnamedFile = await created.value.readVerifiedFile({ identity, file: 1 } as unknown as Readonly<{ identity: ThemeIdentity; file: string }>);
  assert.equal(unnamedFile.ok, false);
  if (unnamedFile.ok) throw new Error("expected failure");
  assert.equal(unnamedFile.error.code, "INVALID_THEME_HOST_INPUT");
});

test("separates unknown identity from same id/version evidence drift", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const identity = await installTheme({ root: roots.installedThemesRoot, slot: "known", id: "known-theme", version: "1.0.0" });
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const absent = await created.value.resolveExact({ identity: { id: "absent-theme", version: "1.0.0", manifestHash: identity.manifestHash } });
  assert.equal(absent.ok, false);
  if (absent.ok) throw new Error("expected failure");
  assert.equal(absent.error.code, "THEME_NOT_FOUND");
  assert.deepEqual(absent.error.subjectIds, ["absent-theme"]);
  const otherVersion = await created.value.resolveExact({ identity: { ...identity, version: "9.9.9" } });
  assert.equal(otherVersion.ok, false);
  if (otherVersion.ok) throw new Error("expected failure");
  assert.equal(otherVersion.error.code, "THEME_NOT_FOUND");
  const wrongHash = await created.value.resolveExact({ identity: { ...identity, manifestHash: sha256Digest(new TextEncoder().encode("other")) } });
  assert.equal(wrongHash.ok, false);
  if (wrongHash.ok) throw new Error("expected failure");
  assert.equal(wrongHash.error.code, "THEME_EVIDENCE_MISMATCH");
  assert.deepEqual(wrongHash.error.subjectIds, ["known-theme"]);
});

test("rejects every non-canonical or unsafe manifest shape", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const digest = sha256Digest(new TextEncoder().encode("export const theme = 'ok';\n"));
  const base = { contract: "theme-manifest/v1", id: "shape-theme", version: "1.0.0", runtime: { file: "runtime.mjs", digest }, resources: [] };
  await installManifestBytes(roots.installedThemesRoot, "unknown-key", { ...base, id: "unknown-key-theme", extra: 1 });
  await installManifestBytes(roots.installedThemesRoot, "bad-version", { ...base, id: "bad-version-theme", version: "1.0" });
  await installManifestBytes(roots.installedThemesRoot, "escaping-file", { ...base, id: "escaping-theme", resources: [{ file: "../escape.css", digest }] });
  await installManifestBytes(roots.installedThemesRoot, "unsorted", { ...base, id: "unsorted-theme", resources: [{ file: "b.css", digest }, { file: "a.css", digest }] });
  await installManifestBytes(roots.installedThemesRoot, "non-module", { ...base, id: "non-module-theme", runtime: { file: "runtime.js", digest } });
  await mkdir(path.join(roots.installedThemesRoot, "non-canonical"), { recursive: true, mode: 0o700 });
  await writeFile(path.join(roots.installedThemesRoot, "non-canonical", "theme.json"), '{"id":"canonical-theme","contract":"theme-manifest/v1"}\n', { mode: 0o600 });
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, true);
  assert.deepEqual(discovery.value.candidates, []);
  assert.deepEqual(
    discovery.value.rejections.map((rejection) => [rejection.code, rejection.subjectIds]),
    [
      ["INVALID_THEME_MANIFEST", []],
      ["INVALID_THEME_MANIFEST", ["bad-version-theme"]],
      ["INVALID_THEME_MANIFEST", ["escaping-theme"]],
      ["INVALID_THEME_MANIFEST", ["non-module-theme"]],
      ["INVALID_THEME_MANIFEST", ["unsorted-theme"]],
    ],
  );
  assert.equal(discovery.value.rejections.every((rejection) => rejection.owner === "ThemeHost"), true);
});

test("fails discovery closed when the installed root exceeds the slot bound", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  await Promise.all(Array.from({ length: 257 }, (_unused, index) => mkdir(path.join(roots.installedThemesRoot, `slot-${index}`), { recursive: true, mode: 0o700 })));
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, false);
  if (discovery.ok) throw new Error("expected failure");
  assert.equal(discovery.error.code, "THEME_DISCOVERY_FAILED");
  assert.deepEqual(discovery.error.subjectIds, []);
});

test("resolves a healthy Theme without depending on unrelated package evidence", async (context) => {
  const roots = await fixture();
  context.after(() => cleanup(roots));
  const healthy = await installTheme({ root: roots.installedThemesRoot, slot: "healthy", id: "healthy-theme", version: "1.0.0" });
  await installTheme({ root: roots.installedThemesRoot, slot: "broken", id: "broken-theme", version: "1.0.0" });
  await writeFile(path.join(roots.installedThemesRoot, "broken", "assets/site.css"), "drift\n", { mode: 0o600 });
  const created = await createThemeHost({ repositoryRoot: roots.repositoryRoot, installedThemesRoot: roots.installedThemesRoot });
  assert.equal(created.ok, true);
  const resolved = await created.value.resolveExact({ identity: healthy });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("expected success");
  assert.deepEqual(resolved.value.identity, healthy);
  const bytes = await created.value.readVerifiedFile({ identity: healthy, file: "assets/site.css" });
  assert.equal(bytes.ok, true);
  if (!bytes.ok) throw new Error("expected success");
  assert.equal(new TextDecoder().decode(bytes.value), "body{}\n");
  const discovery = await created.value.discover();
  assert.equal(discovery.ok, true);
  if (!discovery.ok) throw new Error("expected success");
  assert.deepEqual(discovery.value.candidates, [healthy]);
  assert.deepEqual(discovery.value.rejections.map((rejection) => rejection.code), ["THEME_EVIDENCE_MISMATCH"]);
});
