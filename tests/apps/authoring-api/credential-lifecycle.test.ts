import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmodSync, constants, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalAuthoringCredentialAuthority } from "../../../apps/authoring-api/index.js";
import { createLocalAuthoringCredentialAuthorityWithIo } from "../../../apps/authoring-api/credential-store.js";
import type { CredentialIo } from "../../../apps/authoring-api/credential-store.js";

function authority(root: string) { return createLocalAuthoringCredentialAuthority({ homeDirectory: root, xdgConfigHome: path.join(root, "config") }); }

test("credential lifecycle only permits the four contract transitions", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root);
    const provisioned = await credentials.transition("provision"); assert.deepEqual(provisioned, { ok: true, value: { generation: 1, status: "active" } });
    const first = await credentials.openAdmission(); assert.equal(first.ok, true); if (!first.ok) return;
    const recordPath = path.join(root, "config", "ai-study-note", "local-authoring-v1.json"); const firstKey = JSON.parse(readFileSync(recordPath, "utf8")).apiKey as string;
    assert.equal(first.value.verifyBearer(firstKey), true); first.value.dispose();
    const rotated = await credentials.transition("rotate"); assert.deepEqual(rotated, { ok: true, value: { generation: 2, status: "active" } });
    const second = await credentials.openAdmission(); assert.equal(second.ok, true); if (!second.ok) return;
    assert.equal(second.value.verifyBearer(firstKey), false); second.value.dispose();
    assert.deepEqual(await credentials.transition("revoke"), { ok: true, value: { generation: 3, status: "revoked" } });
    const revoked = await credentials.openAdmission(); assert.equal(revoked.ok, false); if (!revoked.ok) assert.equal(revoked.error.code, "CREDENTIAL_REVOKED");
    assert.deepEqual(await credentials.transition("reprovision"), { ok: true, value: { generation: 4, status: "active" } });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsafe credential mode fails closed without disclosing the key", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root); assert.equal((await credentials.transition("provision")).ok, true);
    const recordPath = path.join(root, "config", "ai-study-note", "local-authoring-v1.json"); const key = JSON.parse(readFileSync(recordPath, "utf8")).apiKey as string;
    chmodSync(recordPath, 0o644);
    const opened = await credentials.openAdmission(); assert.equal(opened.ok, false); if (!opened.ok) assert.equal(opened.error.code, "CREDENTIAL_STORE_UNSAFE");
    assert.equal(JSON.stringify(opened).includes(key), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("credential store enforces 0700 directory and 0600 record modes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    assert.equal((await authority(root).transition("provision")).ok, true);
    const directory = path.join(root, "config", "ai-study-note");
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(directory, "local-authoring-v1.json")).mode & 0o777, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a stale lock is reaped inside the same transition instead of failing the first call", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root);
    assert.equal((await credentials.transition("provision")).ok, true);
    const directory = path.join(root, "config", "ai-study-note");
    writeFileSync(path.join(directory, ".local-authoring-v1.lock"), JSON.stringify({ pid: 0x7ffffff, token: "a".repeat(43) }), { mode: 0o600 });
    assert.deepEqual(await credentials.transition("rotate"), { ok: true, value: { generation: 2, status: "active" } });
    assert.deepEqual(readdirSync(directory), ["local-authoring-v1.json"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a live lock still blocks a concurrent transition", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const credentials = authority(root);
    assert.equal((await credentials.transition("provision")).ok, true);
    const directory = path.join(root, "config", "ai-study-note");
    writeFileSync(path.join(directory, ".local-authoring-v1.lock"), JSON.stringify({ pid: process.pid, token: "a".repeat(43) }), { mode: 0o600 });
    const blocked = await credentials.transition("rotate");
    assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.error.code, "CREDENTIAL_STORE_BUSY");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a symlinked credential directory is rejected without touching the link target", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const configHome = path.join(root, "config");
    mkdirSync(configHome, { recursive: true });
    const victim = path.join(root, "victim");
    mkdirSync(victim, { mode: 0o755 });
    symlinkSync(victim, path.join(configHome, "ai-study-note"));
    const provisioned = await createLocalAuthoringCredentialAuthority({ homeDirectory: root, xdgConfigHome: configHome }).transition("provision");
    assert.equal(provisioned.ok, false); if (!provisioned.ok) assert.equal(provisioned.error.code, "CREDENTIAL_STORE_UNSAFE");
    assert.equal(statSync(victim).mode & 0o777, 0o755, "link target 的 mode 不得在回絕前被修改");
    assert.deepEqual(readdirSync(victim), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the committed record is fsynced together with its directory entry", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "authoring-credential-"));
  try {
    const trace: string[] = [];
    const directories = new WeakSet<object>();
    const io: CredentialIo = {
      mkdir: async (target, options) => { await fs.mkdir(target, options); },
      lstat: (target) => fs.lstat(target),
      realpath: (target) => fs.realpath(target),
      open: async (target, flags, mode) => {
        const handle = await fs.open(target, flags, mode);
        const isDirectory = (flags & (constants.O_DIRECTORY ?? 0)) !== 0;
        if (isDirectory) directories.add(handle);
        return {
          stat: () => handle.stat(),
          read: (buffer, offset, length, position) => handle.read(buffer, offset, length, position),
          write: (buffer) => handle.write(buffer),
          chmod: (value) => handle.chmod(value),
          sync: async () => { trace.push(isDirectory ? "sync:directory" : "sync:file"); await handle.sync(); },
          close: () => handle.close(),
        };
      },
      link: (existingPath, newPath) => fs.link(existingPath, newPath),
      rename: async (oldPath, newPath) => { trace.push("rename"); await fs.rename(oldPath, newPath); },
      unlink: (target) => fs.unlink(target),
      chmod: (target, mode) => fs.chmod(target, mode),
      isProcessAlive: () => false,
    };
    const credentials = createLocalAuthoringCredentialAuthorityWithIo({ homeDirectory: root, xdgConfigHome: path.join(root, "config") }, io, (size) => randomBytes(size), process.getuid?.() ?? -1);
    assert.deepEqual(await credentials.transition("provision"), { ok: true, value: { generation: 1, status: "active" } });
    const rename = trace.indexOf("rename");
    assert.notEqual(rename, -1);
    assert.equal(trace.slice(0, rename).includes("sync:file"), true, "temp record 必須在 rename 之前 fsync");
    assert.equal(trace.slice(rename).includes("sync:directory"), true, "rename 之後必須 fsync directory entry");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
