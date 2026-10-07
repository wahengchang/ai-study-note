import assert from "node:assert/strict";
import test from "node:test";

import { runSiteBuild } from "../../../apps/cli/site-build.js";

test("site:build explicitly refuses the disconnected current-only public path", async () => {
  const output: string[] = [];
  const code = await runSiteBuild([], { stdout: (text) => output.push(`out:${text}`), stderr: (text) => output.push(`err:${text}`) });
  assert.equal(code, 1);
  assert.deepEqual(output, ["err:SITE_BUILD_FAILED code=CURRENT_CONTENT_PUBLIC_BUILD_PAUSED\n"]);
});
