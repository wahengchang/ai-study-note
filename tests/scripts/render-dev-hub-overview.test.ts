import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildDevHubDependencyLayout, loadDevHubOverview, renderDevHubOverviewHtml } from "../../scripts/render-dev-hub-overview.js";

type RawIssue = { number: number; title: string; url: string; state: string; parent_issue: number | null; depends_on: number[] };
type RawWorkItem = { id: string; title: string; status: string; depends_on: string[]; work_group: string; path: string };
type RawWorkGroup = { id: string; title: string; status: string; work_items: string[]; owner: string; branch: string; worktree: string; pr: string | null; path: string };
type RawCycle = { id: string; hub: { path: string; status: string }; work_items: RawWorkItem[]; work_groups: RawWorkGroup[] };
type RawLink = { issue_number: number; target_kind: string; cycle_id: string; work_item_id: string; work_group_id: string };
type RawOverviewFixture = {
  issues: { schema_version: number; coverage: { mode: string; complete: boolean; note: string }; updated_at: string; issues: RawIssue[] };
  links: { schema_version: number; updated_at: string; cycles: RawCycle[]; links: RawLink[] };
};

const root = path.resolve(import.meta.dirname, "../..");
const rendererPath = path.join(root, "scripts/render-dev-hub-overview.ts");
const issueUrl = (number: number) => `https://github.com/wahengchang/ai-study-note/issues/${number}`;

function temporaryDirectory(): string {
  const runtimeDirectory = path.join(root, ".dev-hub/runtime");
  mkdirSync(runtimeDirectory, { recursive: true });
  return mkdtempSync(path.join(runtimeDirectory, "overview-test-"));
}

function createFixture(): RawOverviewFixture {
  const pluginCycleId = "cycle-2026-08-28-1655-plugin-lifecycle-integration";
  const overviewCycleId = "cycle-2026-08-28-1801-project-progress-roadmap";
  const timestamp = "2026-08-28T21:35:44+08:00";
  return {
    issues: {
      schema_version: 2,
      coverage: { mode: "active_dev_hub_with_dependencies", complete: false, note: "僅涵蓋已登錄於 active Dev Hub 的工作及其遞迴前置 Issue，不代表全部 open GitHub Issues。" },
      updated_at: timestamp,
      issues: [
        { number: 219, title: "Forward storage migration", url: issueUrl(219), state: "open", parent_issue: 214, depends_on: [239] },
        { number: 220, title: "Plugin activation", url: issueUrl(220), state: "open", parent_issue: 218, depends_on: [239] },
        { number: 221, title: "Pointer lineage", url: issueUrl(221), state: "open", parent_issue: 214, depends_on: [219] },
        { number: 222, title: "Route claim", url: issueUrl(222), state: "open", parent_issue: 216, depends_on: [219] },
        { number: 223, title: "Local media import", url: issueUrl(223), state: "open", parent_issue: 217, depends_on: [219] },
        { number: 228, title: "SaveRevision", url: issueUrl(228), state: "open", parent_issue: 215, depends_on: [221, 222, 223] },
        { number: 229, title: "Plugin exact re-enable", url: issueUrl(229), state: "open", parent_issue: 218, depends_on: [220, 228] },
        { number: 234, title: "SaveRevision validators", url: issueUrl(234), state: "open", parent_issue: 218, depends_on: [220, 228] },
        { number: 239, title: "TypeScript Foundation", url: issueUrl(239), state: "open", parent_issue: null, depends_on: [] },
        { number: 246, title: "Application Plugin composition", url: issueUrl(246), state: "open", parent_issue: 218, depends_on: [220, 228, 229, 234] },
        { number: 252, title: "Project progress roadmap", url: issueUrl(252), state: "open", parent_issue: null, depends_on: [] },
      ],
    },
    links: {
      schema_version: 2,
      updated_at: timestamp,
      cycles: [
        {
          id: pluginCycleId,
          hub: { path: `.dev-hub/active/${pluginCycleId}/hub.md`, status: "active" },
          work_items: [
            { id: "WI-001", title: "Plugin exact re-enable lifecycle", status: "in_progress", depends_on: [], work_group: "WG-001-plugin-lifecycle-integration", path: `.dev-hub/active/${pluginCycleId}/work-items/WI-001-plugin-exact-reenable.md` },
            { id: "WI-002", title: "SaveRevision validator snapshots", status: "pending", depends_on: ["WI-001"], work_group: "WG-001-plugin-lifecycle-integration", path: `.dev-hub/active/${pluginCycleId}/work-items/WI-002-save-revision-validators.md` },
            { id: "WI-003", title: "Application Plugin composition", status: "pending", depends_on: ["WI-001", "WI-002"], work_group: "WG-001-plugin-lifecycle-integration", path: `.dev-hub/active/${pluginCycleId}/work-items/WI-003-application-plugin-composition.md` },
          ],
          work_groups: [{ id: "WG-001-plugin-lifecycle-integration", title: "Plugin lifecycle integration", status: "in_progress", work_items: ["WI-001", "WI-002", "WI-003"], owner: "Main", branch: "cms/plugin-lifecycle-integration", worktree: ".dev-hub/worktrees/plugin-lifecycle-integration", pr: null, path: `.dev-hub/active/${pluginCycleId}/work-groups/WG-001-plugin-lifecycle-integration.md` }],
        },
        {
          id: overviewCycleId,
          hub: { path: `.dev-hub/active/${overviewCycleId}/hub.md`, status: "active" },
          work_items: [{ id: "WI-001", title: "Project progress roadmap governance", status: "in_progress", depends_on: [], work_group: "WG-001-project-progress-roadmap", path: `.dev-hub/active/${overviewCycleId}/work-items/WI-001-project-progress-roadmap.md` }],
          work_groups: [{ id: "WG-001-project-progress-roadmap", title: "Project progress roadmap", status: "in_progress", work_items: ["WI-001"], owner: "domain_application_engineer", branch: "chore/project-progress-roadmap", worktree: ".dev-hub/worktrees/project-progress-roadmap", pr: "https://github.com/wahengchang/ai-study-note/pull/258", path: `.dev-hub/active/${overviewCycleId}/work-groups/WG-001-project-progress-roadmap.md` }],
        },
      ],
      links: [
        { issue_number: 229, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-001", work_group_id: "WG-001-plugin-lifecycle-integration" },
        { issue_number: 234, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-002", work_group_id: "WG-001-plugin-lifecycle-integration" },
        { issue_number: 246, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-003", work_group_id: "WG-001-plugin-lifecycle-integration" },
        { issue_number: 252, target_kind: "dev_hub_work_item", cycle_id: overviewCycleId, work_item_id: "WI-001", work_group_id: "WG-001-project-progress-roadmap" },
      ],
    },
  };
}

function writeFixture(directory: string, fixture: RawOverviewFixture): string {
  const inputDirectory = path.join(directory, ".dev-hub/overview");
  mkdirSync(inputDirectory, { recursive: true });
  writeFileSync(path.join(inputDirectory, "issues.json"), `${JSON.stringify(fixture.issues, null, 2)}\n`);
  writeFileSync(path.join(inputDirectory, "links.json"), `${JSON.stringify(fixture.links, null, 2)}\n`);
  return inputDirectory;
}

function invoke(directory: string, args: readonly string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", rendererPath, ...args], { cwd: directory, encoding: "utf8" });
}

function issue(fixture: RawOverviewFixture, number: number): RawIssue {
  const result = fixture.issues.issues.find((candidate) => candidate.number === number);
  if (result === undefined) {
    throw new Error(`fixture 缺少 #${number}`);
  }
  return result;
}

test("schema v2 的十一張 Issue closure 產生七階段與四個 View", async () => {
  const directory = temporaryDirectory();
  try {
    const data = await loadDevHubOverview(writeFixture(directory, createFixture()));
    assert.deepEqual(data.issues.map((item) => item.number), [219, 220, 221, 222, 223, 228, 229, 234, 239, 246, 252]);
    assert.deepEqual(data.links.map((item) => item.issueNumber), [229, 234, 246, 252]);
    const layout = buildDevHubDependencyLayout(data);
    assert.deepEqual(layout.stages, [
      { level: 1, issueNumbers: [239] }, { level: 2, issueNumbers: [219, 220] }, { level: 3, issueNumbers: [221, 222, 223] },
      { level: 4, issueNumbers: [228] }, { level: 5, issueNumbers: [229] }, { level: 6, issueNumbers: [234] }, { level: 7, issueNumbers: [246] },
    ]);
    assert.deepEqual(layout.independentIssueNumbers, [252]);
    assert.deepEqual(layout.issues.find((item) => item.issueNumber === 234)?.dependencies.find((item) => item.issueNumber === 229)?.source, "work_item");
    assert.deepEqual(layout.issues.find((item) => item.issueNumber === 246)?.dependencies.filter((item) => item.issueNumber === 229 || item.issueNumber === 234).map((item) => item.source), ["both", "both"]);
    const html = renderDevHubOverviewHtml(data);
    assert.match(html, /<strong>4<\/strong> active Issues/);
    assert.match(html, /<strong>7<\/strong> upstream dependencies/);
    assert.match(html, /<strong>2<\/strong> active Cycles/);
    assert.match(html, /role="tab" id="tab-table"[^>]+aria-selected="true"/);
    assert.match(html, /role="tab" id="tab-dependencies"/);
    assert.match(html, /id="panel-dependencies" role="tabpanel"/);
    assert.match(html, /<details id="overview-controls">/);
    assert.match(html, /dev-hub-overview\.preferences\.v1/);
    assert.match(html, /<th scope="col" data-column="issue">Issue／Issue state<\/th>/);
    assert.match(html, /<th scope="col" data-column="localStatus">Local status<\/th>/);
    assert.match(html, /<th scope="col" data-column="dependencies">前置依賴<\/th>/);
    assert.match(html, /data-column="parent" hidden/);
    assert.match(html, /第 7 階段/);
    assert.match(html, /獨立工作/);
    assert.match(html, /data-cycle-card=/);
    assert.match(html, /data-status-lane="in_progress"/);
    assert.match(html, /data-status-lane="pending"/);
    assert.match(html, /<a href="https:\/\/github\.com\/wahengchang\/ai-study-note\/pull\/258">PR #258<\/a>/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("缺少 closure、合併 cycle 與錯誤 PR 都 fail closed 且不覆寫 output", async (t) => {
  const invalidCases: ReadonlyArray<{ name: string; mutate: (fixture: RawOverviewFixture) => void }> = [
    { name: "missing dependency snapshot", mutate: (fixture) => { issue(fixture, 229).depends_on = [999]; } },
    { name: "unreachable dependency-only row", mutate: (fixture) => { fixture.issues.issues.push({ number: 999, title: "orphan", url: issueUrl(999), state: "open", parent_issue: null, depends_on: [] }); } },
    { name: "missing work item link", mutate: (fixture) => { fixture.links.links = fixture.links.links.filter((link) => link.issue_number !== 234); } },
    { name: "combined dependency cycle", mutate: (fixture) => { issue(fixture, 229).depends_on = [234]; } },
    { name: "wrong PR URL", mutate: (fixture) => { fixture.links.cycles[1]!.work_groups[0]!.pr = "https://example.test/pull/258"; } },
    { name: "nonpositive PR URL", mutate: (fixture) => { fixture.links.cycles[1]!.work_groups[0]!.pr = "https://github.com/wahengchang/ai-study-note/pull/0"; } },
    { name: "stale timestamp", mutate: (fixture) => { fixture.links.updated_at = "2026-08-28T21:35:45+08:00"; } },
  ];
  for (const invalidCase of invalidCases) await t.test(invalidCase.name, async () => {
    const directory = temporaryDirectory();
    try {
      const fixture = createFixture(); invalidCase.mutate(fixture);
      const inputDirectory = writeFixture(directory, fixture); const outputPath = path.join(inputDirectory, "index.html"); const existingOutput = Buffer.from("preserve-existing-output\n"); writeFileSync(outputPath, existingOutput);
      await assert.rejects(loadDevHubOverview(inputDirectory), /^Error: DEV_HUB_OVERVIEW_INVALID:/);
      const result = invoke(directory, []);
      assert.equal(result.status, 1); assert.match(result.stderr, /^DEV_HUB_OVERVIEW_INVALID:/); assert.deepEqual(readFileSync(outputPath), existingOutput);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

test("HTML 對可疑 model 值安全 escaping，並保持 JSON payload 可解析", async () => {
  const directory = temporaryDirectory();
  try {
    const fixture = createFixture();
    issue(fixture, 229).title = "</script><script>alert(1)</script> & \u2028 \u2029";
    fixture.links.cycles[0]!.work_groups[0]!.owner = "<img src=x onerror=alert(1)>";
    const html = renderDevHubOverviewHtml(await loadDevHubOverview(writeFixture(directory, fixture)));
    assert.equal(html.includes("</script><script>alert(1)</script>"), false);
    assert.equal(html.includes("<img src=x onerror=alert(1)>"), false);
    assert.equal(html.includes("\\u003c/script\\u003e"), true);
    const payload = html.match(/<script id="dev-hub-overview-model" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.notEqual(payload, undefined);
    assert.equal(JSON.parse(payload!).rows.find((row: { issueNumber: number }) => row.issueNumber === 229).title, "</script><script>alert(1)</script> & \u2028 \u2029");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("相同 inputs 的 render 穩定，CLI check 不改寫 stale output", async () => {
  const directory = temporaryDirectory();
  try {
    const inputDirectory = writeFixture(directory, createFixture()); const data = await loadDevHubOverview(inputDirectory);
    assert.equal(renderDevHubOverviewHtml(data), renderDevHubOverviewHtml(data));
    const generated = invoke(directory, []); assert.equal(generated.status, 0);
    const outputPath = path.join(inputDirectory, "index.html"); const currentOutput = readFileSync(outputPath);
    const freshCheck = invoke(directory, ["--check"]); assert.equal(freshCheck.status, 0); assert.deepEqual(readFileSync(outputPath), currentOutput);
    const staleOutput = Buffer.from("stale output\n"); writeFileSync(outputPath, staleOutput);
    const staleCheck = invoke(directory, ["--check"]); assert.equal(staleCheck.status, 1); assert.match(staleCheck.stderr, /^DEV_HUB_OVERVIEW_STALE:/); assert.deepEqual(readFileSync(outputPath), staleOutput);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
