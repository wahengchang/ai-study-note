import assert from "node:assert/strict";
import test from "node:test";

import { runCmsKillCli } from "../../../apps/authoring-api/index.js";

function capture(): Readonly<{ output: string[]; io: Readonly<{ stdout(text: string): void; stderr(text: string): void }> }> {
  const output: string[] = [];
  return { output, io: { stdout: (text) => { output.push(text); }, stderr: (text) => { output.push(text); } } };
}

// 透過 Authoring API public entry import；若 CLI 在 module load 執行，這個測試 process 會在 test body 前就有副作用。
test("匯入 cms:kill module 只暴露 runner，不執行停止操作", () => {
  assert.equal(typeof runCmsKillCli, "function");
});

test("cms:kill 只終止辨識為 CMS 的 listener", () => {
  const killed = capture();
  const terminated: number[] = [];
  assert.equal(runCmsKillCli([], killed.io, {
    listeningPids: () => [101, 202],
    isCmsProcess: (pid) => pid === 101,
    terminate: (pid) => { terminated.push(pid); },
  }), 0);
  assert.deepEqual(terminated, [101]);
  assert.deepEqual(killed.output, ["CMS_KILL_OK stopped=1\n"]);
});

test("cms:kill 拒絕多餘參數", async () => {
  const rejected = capture();
  assert.equal(runCmsKillCli(["--all"], rejected.io), 2);
  assert.deepEqual(rejected.output, ["CMS_KILL_FAILED code=INVALID_ARGUMENTS\n"]);
});
