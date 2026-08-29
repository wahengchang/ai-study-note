import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildDevHubDependencyLayout, loadDevHubOverview, renderDevHubOverviewHtml } from "../../scripts/render-dev-hub-overview.js";

type RawIssue = { number: number; title: string; url: string; state: string; parent_issue: number | null; depends_on: number[] };
type RawWorkItem = { id: string; title: string; status: string; depends_on: string[]; work_group: string | null; path: string };
type RawWorkGroup = { id: string; title: string; status: string; work_items: string[]; owner: string; branch: string; worktree: string; pr: string | null; path: string };
type RawCycle = { id: string; hub: { path: string; status: string }; work_items: RawWorkItem[]; work_groups: RawWorkGroup[] };
type RawLink = { issue_number: number; target_kind: string; cycle_id: string; work_item_id: string; work_group_id: string | null };
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
  const fixture: RawOverviewFixture = {
    issues: {
      schema_version: 3,
      coverage: { mode: "dev_hub_work_with_dependencies", complete: false, note: "涵蓋已登錄 Dev Hub 的 planned、active、done Work Items 及其遞迴前置 Issue，不代表 GitHub Issues 自動同步。" },
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
      schema_version: 3,
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
  const backlogCycleId = "cycle-2026-08-29-1002-cms-issue-backlog";
  const backlogNumbers = [214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 230, 231, 232, 233, 235, 236, 237, 238, 239, 241, 252, 253, 254, 255, 256, 257, 260, 261, 262];
  const allNumbers = [...backlogNumbers, 229, 234, 246].sort((left, right) => left - right);
  const dependencies: Record<number, number[]> = { 219: [239], 220: [239], 221: [219], 222: [219], 223: [219], 224: [219, 221], 225: [222], 226: [219, 223], 227: [219, 223], 228: [221, 222, 223], 229: [220, 228], 230: [224], 231: [225], 232: [223, 225, 228], 233: [223, 228], 234: [220, 228], 235: [223, 232], 236: [223, 232], 237: [228, 231, 236], 238: [228, 231], 241: [228], 246: [220, 228, 229, 234], 254: [232, 235, 246, 253], 255: [253, 254, 256], 256: [246, 254], 257: [232, 233, 236, 237, 238, 241, 254, 255] };
  const ids = new Map(backlogNumbers.map((number, index) => [number, `WI-${String(index + 1).padStart(3, "0")}`]));
  const done = new Set([219, 220, 221, 222, 223, 225, 227, 228, 239, 252]);
  fixture.issues.issues = allNumbers.map((number) => ({ number, title: `Issue #${number}`, url: issueUrl(number), state: "open", parent_issue: null, depends_on: dependencies[number] ?? [] }));
  fixture.links.cycles = [fixture.links.cycles[0]!, { id: backlogCycleId, hub: { path: `.dev-hub/active/${backlogCycleId}/hub.md`, status: "active" }, work_items: backlogNumbers.map((number) => ({ id: ids.get(number)!, title: `Issue #${number}`, status: number === 261 || done.has(number) ? "done" : "pending", depends_on: (dependencies[number] ?? []).flatMap((dependency) => ids.has(dependency) ? [ids.get(dependency)!] : []), work_group: number === 261 ? "WG-001-planned-backlog-onboarding" : null, path: `.dev-hub/active/${backlogCycleId}/work-items/${ids.get(number)!}-issue-${number}.md` })), work_groups: [{ id: "WG-001-planned-backlog-onboarding", title: "Planned backlog onboarding", status: "completed", work_items: ["WI-033"], owner: "Main", branch: "chore/dev-hub-planned-backlog", worktree: ".dev-hub/worktrees/dev-hub-planned-backlog", pr: null, path: `.dev-hub/active/${backlogCycleId}/work-groups/WG-001-planned-backlog-onboarding.md` }] }];
  fixture.links.links = allNumbers.map((number) => number === 229 ? { issue_number: number, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-001", work_group_id: "WG-001-plugin-lifecycle-integration" } : number === 234 ? { issue_number: number, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-002", work_group_id: "WG-001-plugin-lifecycle-integration" } : number === 246 ? { issue_number: number, target_kind: "dev_hub_work_item", cycle_id: pluginCycleId, work_item_id: "WI-003", work_group_id: "WG-001-plugin-lifecycle-integration" } : { issue_number: number, target_kind: "dev_hub_work_item", cycle_id: backlogCycleId, work_item_id: ids.get(number)!, work_group_id: number === 261 ? "WG-001-planned-backlog-onboarding" : null });
  return fixture;
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

test("schema v3 的 37 張 linked Issues 產生 58 edges、11 階段與 unassigned HTML", async () => {
  const directory = temporaryDirectory();
  try {
    const data = await loadDevHubOverview(writeFixture(directory, createFixture()));
    assert.equal(data.issues.length, 37);
    assert.equal(data.links.length, 37);
    assert.equal(data.cycles.length, 2);
    const layout = buildDevHubDependencyLayout(data);
    assert.equal(layout.issues.reduce((count, item) => count + item.dependencies.length, 0), 58);
    assert.equal(layout.stages.length, 11);
    assert.deepEqual(layout.stages[0], { level: 1, issueNumbers: [239, 253] });
    assert.deepEqual(layout.stages.at(-1), { level: 11, issueNumbers: [257] });
    assert.deepEqual(layout.independentIssueNumbers, [214, 215, 216, 217, 218, 252, 260, 261, 262]);
    const html = renderDevHubOverviewHtml(data);
    assert.match(html, /<strong>37<\/strong> linked Issues/);
    assert.match(html, /<strong>58<\/strong> dependency edges/);
    assert.match(html, /<strong>2<\/strong> active Cycles/);
    assert.match(html, /未分派 Work Items/);
    assert.match(html, /data-cycle-card="cycle-2026-08-29-1002-cms-issue-backlog\/unassigned"/);
    assert.match(html, /data-issue-number="214"[\s\S]*?未分派/);
    assert.match(html, /第 11 階段/);
    assert.match(html, /role="tab" id="tab-table"[^>]+aria-selected="true"/);
    assert.match(html, /role="tab" id="tab-dependencies"/);
    assert.match(html, /id="panel-dependencies" role="tabpanel"/);
    assert.match(html, /<details id="overview-controls">/);
    assert.match(html, /dev-hub-overview\.preferences\.v1/);
    assert.match(html, /<th scope="col" data-column="issue">Issue／Issue state<\/th>/);
    assert.match(html, /<th scope="col" data-column="localStatus">Local status<\/th>/);
    assert.match(html, /<th scope="col" data-column="dependencies">前置依賴<\/th>/);
    assert.match(html, /data-column="parent" hidden/);
    assert.match(html, /第 11 階段/);
    assert.match(html, /獨立工作/);
    assert.match(html, /data-cycle-card=/);
    assert.match(html, /data-status-lane="in_progress"/);
    assert.match(html, /data-status-lane="pending"/);
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

test("同一 Cycle 的多個 Work Group 各自成卡，不共用第一個 Work Group 的 title 與 owner", async () => {
  const directory = temporaryDirectory();
  try {
    const fixture = createFixture();
    const cycle = fixture.links.cycles[0]!;
    const firstGroup = cycle.work_groups[0]!;
    firstGroup.work_items = ["WI-001", "WI-002"];
    cycle.work_items[2]!.work_group = "WG-002-plugin-composition";
    cycle.work_groups.push({
      id: "WG-002-plugin-composition", title: "Plugin composition", status: "pending", work_items: ["WI-003"],
      owner: "domain_application_engineer", branch: "cms/plugin-composition", worktree: ".dev-hub/worktrees/plugin-composition", pr: null,
      path: `.dev-hub/active/${cycle.id}/work-groups/WG-002-plugin-composition.md`,
    });
    fixture.links.links.find((link) => link.issue_number === 246)!.work_group_id = "WG-002-plugin-composition";
    const html = renderDevHubOverviewHtml(await loadDevHubOverview(writeFixture(directory, fixture)));
    const cards = [...html.matchAll(/data-cycle-card="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(cards, ["cycle-2026-08-29-1002-cms-issue-backlog/WG-001-planned-backlog-onboarding", "cycle-2026-08-29-1002-cms-issue-backlog/unassigned", `${cycle.id}/WG-001-plugin-lifecycle-integration`, `${cycle.id}/WG-002-plugin-composition`]);
    const compositionCard = html.match(/<article class="cycle-card" data-cycle-card="[^"]*WG-002-plugin-composition">[\s\S]*?<\/article>/)?.[0];
    assert.notEqual(compositionCard, undefined);
    assert.match(compositionCard!, /<h3>Plugin composition<\/h3>/);
    assert.match(compositionCard!, /Owner：domain_application_engineer/);
    assert.match(compositionCard!, /data-issue-number="246"/);
    assert.equal(/data-issue-number="229"/.test(compositionCard!), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
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


test("nullable assignment 違規 fail closed 且不覆寫 output", async (t) => {
  const cases = ["schema v2", "unassigned in progress", "null WI with group link", "assigned WI with null link", "unassigned WI listed by group", "missing group"];
  for (const name of cases) await t.test(name, async () => {
    const directory = temporaryDirectory();
    try {
      const fixture = createFixture();
      const backlog = fixture.links.cycles[1]!;
      const item = backlog.work_items[0]!;
      const link = fixture.links.links.find((candidate) => candidate.issue_number === 214)!;
      if (name === "schema v2") fixture.issues.schema_version = 2;
      if (name === "unassigned in progress") item.status = "in_progress";
      if (name === "null WI with group link") link.work_group_id = "WG-001-planned-backlog-onboarding";
      if (name === "assigned WI with null link") fixture.links.links.find((candidate) => candidate.issue_number === 261)!.work_group_id = null;
      if (name === "unassigned WI listed by group") backlog.work_groups[0]!.work_items.push(item.id);
      if (name === "missing group") { const assigned = backlog.work_items.find((candidate) => candidate.id === "WI-033")!; assigned.work_group = "WG-404"; fixture.links.links.find((candidate) => candidate.issue_number === 261)!.work_group_id = "WG-404"; }
      const inputDirectory = writeFixture(directory, fixture); const outputPath = path.join(inputDirectory, "index.html"); const canary = Buffer.from("preserve-existing-output\n"); writeFileSync(outputPath, canary);
      await assert.rejects(loadDevHubOverview(inputDirectory), /^Error: DEV_HUB_OVERVIEW_INVALID:/);
      assert.equal(invoke(directory, []).status, 1); assert.deepEqual(readFileSync(outputPath), canary);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
