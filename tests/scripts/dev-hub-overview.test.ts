import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const renderer = path.join(repositoryRoot, "scripts", "dev-hub-overview.ts");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
function fixture(config: unknown, issues: unknown, links: unknown): string {
  const directory = mkdtempSync(path.join(tmpdir(), "dev-hub-overview-")); const overview = path.join(directory, ".dev-hub", "overview");
  mkdirSync(overview, { recursive: true }); writeFileSync(path.join(overview, "config.json"), JSON.stringify(config)); writeFileSync(path.join(overview, "issues.json"), JSON.stringify(issues)); writeFileSync(path.join(overview, "links.json"), JSON.stringify(links)); return directory;
}
function run(directory: string, check = false): SpawnSyncReturns<string> { return spawnSync(process.execPath, ["--import", tsxLoader, renderer, ...(check ? ["--check"] : [])], { cwd: directory, encoding: "utf8" }); }
const config = { contract: "dev-hub-overview-config/v2", github_repository: "owner/repository" };
const issues = { contract: "dev-hub-overview-issues/v2", captured_at: "2026-01-01T00:00:00Z", issues: [{ number: 1, state: "open", title: "<unsafe>", url: "https://github.com/owner/repository/issues/1", dependencies: [2] }, { number: 2, state: "open", title: "Dependency", url: "https://github.com/owner/repository/issues/2", dependencies: [] }], cycles: [{ id: "cycle", status: "active", path: ".dev-hub/active/cycle" }], work_items: [{ id: "WI-001", cycle_id: "cycle", status: "in_progress" }], work_groups: [{ id: "WG-001", cycle_id: "cycle", status: "in_progress", owner: "<owner>", pr: { number: 1, url: "https://github.com/owner/repository/pull/1" } }] };
const links = { contract: "dev-hub-overview-links/v2", captured_at: "2026-01-01T00:00:00Z", items: [{ issue_number: 1, cycle_id: "cycle", work_item_id: "WI-001", work_group_id: "WG-001" }] };

test("renders deterministic escaped active linked Issue card and check does not write", () => {
  const directory = fixture(config, issues, links);
  try {
    assert.equal(run(directory, true).status, 0); const output = path.join(directory, ".dev-hub", "overview", "index.html"); assert.equal(run(directory).status, 0);
    const html = readFileSync(output, "utf8"); assert.equal(html.includes("&lt;unsafe&gt;"), true); assert.equal(html.includes("&lt;owner&gt;"), true); assert.equal(html.includes("https://github.com/owner/repository/issues/1"), true); assert.equal(html.includes("https://github.com/owner/repository/issues/2"), true); assert.equal(html.includes("https://github.com/owner/repository/pull/1"), true); assert.equal(html.includes("Project"), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("fails closed before output for invalid repository data and overwrite", () => {
  const directory = fixture({ ...config, github_repository: "invalid" }, issues, links);
  try {
    const output = path.join(directory, ".dev-hub", "overview", "index.html"); assert.notEqual(run(directory).status, 0); assert.throws(() => readFileSync(output)); writeFileSync(path.join(directory, ".dev-hub", "overview", "config.json"), JSON.stringify(config)); writeFileSync(output, "verified"); assert.notEqual(run(directory).status, 0); assert.equal(readFileSync(output, "utf8"), "verified");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("rejects cross-repository URLs, unresolved dependency closure, cycles, and non-one-to-one links", () => {
  const cases: readonly [unknown, unknown][] = [
    [{ ...issues, issues: [{ ...issues.issues[0], url: "https://github.com/elsewhere/repository/issues/1" }, issues.issues[1]] }, links],
    [{ ...issues, issues: [{ ...issues.issues[0], dependencies: [3] }, issues.issues[1]] }, links],
    [{ ...issues, issues: [{ ...issues.issues[0], dependencies: [2] }, { ...issues.issues[1], dependencies: [1] }] }, links],
    [issues, { ...links, items: [...links.items, { issue_number: 1, cycle_id: "cycle", work_item_id: "WI-001", work_group_id: "WG-001" }] }],
  ];
  for (const [snapshot, joined] of cases) { const directory = fixture(config, snapshot, joined); try { assert.notEqual(run(directory).status, 0); assert.throws(() => readFileSync(path.join(directory, ".dev-hub", "overview", "index.html"))); } finally { rmSync(directory, { recursive: true, force: true }); } }
});
