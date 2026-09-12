import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";

import { AUTHORING_HOST, AUTHORING_PORT, runCmsKillCli } from "../../../apps/authoring-api/index.js";

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout: (text) => { output.push(text); }, stderr: (text) => { output.push(text); } } };
}

// import 這個 module 不得有 side effect：舊版在 module load 時直接 main()，任何 import 都會 SIGTERM 使用者的 CMS。
test("匯入 cms:kill module 不會終止任何 process，且無 listener 時回報 stopped=0", async () => {
  const killed = capture();
  assert.equal(runCmsKillCli([], killed.io), 0);
  assert.deepEqual(killed.output, ["CMS_KILL_OK stopped=0\n"]);
});

test("cms:kill 不對非 CMS 的 loopback listener 送 signal", async (context) => {
  const server = createServer();
  const bound = await new Promise<boolean>((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(AUTHORING_PORT, AUTHORING_HOST, () => resolve(true));
  });
  if (!bound) return; // port 被真實 CMS 佔用時跳過，不誤殺。
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const killed = capture();
  assert.equal(runCmsKillCli([], killed.io), 0);
  assert.deepEqual(killed.output, ["CMS_KILL_OK stopped=0\n"], "非 CMS entrypoint 的 listener 必須保留");
  assert.equal(server.listening, true);
});

test("cms:kill 拒絕多餘參數", async () => {
  const rejected = capture();
  assert.equal(runCmsKillCli(["--all"], rejected.io), 2);
  assert.deepEqual(rejected.output, ["CMS_KILL_FAILED code=INVALID_ARGUMENTS\n"]);
});
