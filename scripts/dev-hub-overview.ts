import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonObject = Record<string, unknown>;
type Issue = Readonly<{ number: number; state: "open" | "closed"; title: string; url: string; dependencies: readonly number[] }>;
type Cycle = Readonly<{ id: string; status: string; path: string }>;
type WorkItem = Readonly<{ id: string; cycleId: string; status: string }>;
type PullRequest = Readonly<{ number: number; url: string }>;
type WorkGroup = Readonly<{ id: string; cycleId: string; status: string; owner: string; pr: PullRequest | null }>;
type Link = Readonly<{ issueNumber: number; cycleId: string; workItemId: string; workGroupId: string }>;

const root = path.resolve(".dev-hub/overview");
const fail = (message: string): never => { throw new Error(`dev-hub overview: ${message}`); };
const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const readJson = (name: string): JsonObject => {
  const value: unknown = JSON.parse(readFileSync(path.join(root, name), "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value as JsonObject;
};
const exact = (value: JsonObject, keys: readonly string[], subject: string): void => {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(`invalid ${subject} schema`);
};
const object = (value: unknown, subject: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`invalid ${subject}`);
  return value as JsonObject;
};
const positive = (value: unknown, subject: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`invalid ${subject}`);
  return value as number;
};
const text = (value: unknown, subject: string): string => {
  if (typeof value !== "string" || value.length === 0) fail(`invalid ${subject}`);
  return value as string;
};
const id = (value: unknown, subject: string): string => {
  const result = text(value, subject);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(result)) fail(`invalid ${subject}`);
  return result;
};
const timestamp = (value: unknown, subject: string): string => {
  const result = text(value, subject);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(result) || Number.isNaN(Date.parse(result))) fail(`invalid ${subject}`);
  return result;
};
const index = <T extends Readonly<{ id?: string; number?: number }>>(values: readonly T[], key: (value: T) => string, subject: string): Readonly<Record<string, T>> => {
  const result: Record<string, T> = Object.create(null);
  for (const value of values) { const valueKey = key(value); if (Object.prototype.hasOwnProperty.call(result, valueKey)) fail(`duplicate ${subject}`); result[valueKey] = value; }
  return result;
};

const config = readJson("config.json");
exact(config, ["contract", "github_repository"], "config");
if (config.contract !== "dev-hub-overview-config/v2") fail("unsupported config contract");
const repository = text(config.github_repository, "github_repository");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) fail("invalid github_repository");
const issueUrl = (number: number): string => `https://github.com/${repository}/issues/${number}`;
const prUrl = (number: number): string => `https://github.com/${repository}/pull/${number}`;

const snapshot = readJson("issues.json");
exact(snapshot, ["contract", "captured_at", "issues", "cycles", "work_items", "work_groups"], "issues snapshot");
if (snapshot.contract !== "dev-hub-overview-issues/v2") fail("unsupported issues contract");
const capturedAt = timestamp(snapshot.captured_at, "issues captured_at");
if (!Array.isArray(snapshot.issues) || !Array.isArray(snapshot.cycles) || !Array.isArray(snapshot.work_items) || !Array.isArray(snapshot.work_groups)) fail("invalid issues snapshot collections");
const rawIssues = snapshot.issues as unknown[];
const rawCycles = snapshot.cycles as unknown[];
const rawWorkItems = snapshot.work_items as unknown[];
const rawWorkGroups = snapshot.work_groups as unknown[];
const issues = rawIssues.map((value): Issue => {
  const item = object(value, "Issue"); exact(item, ["number", "state", "title", "url", "dependencies"], "Issue");
  const number = positive(item.number, "Issue number"); const state = item.state;
  if (state !== "open" && state !== "closed") fail("invalid Issue state");
  const url = text(item.url, "Issue URL"); if (url !== issueUrl(number)) fail("cross-repository Issue URL");
  if (!Array.isArray(item.dependencies)) fail("invalid Issue dependencies");
  const dependencies = (item.dependencies as unknown[]).map((dependency) => positive(dependency, "Issue dependency"));
  const dependencyIndex: Record<string, true> = Object.create(null);
  for (const dependency of dependencies) { if (Object.prototype.hasOwnProperty.call(dependencyIndex, String(dependency))) fail("duplicate Issue dependency"); dependencyIndex[String(dependency)] = true; }
  return { number, state: state as "open" | "closed", title: text(item.title, "Issue title"), url, dependencies };
});
const cycles = rawCycles.map((value): Cycle => {
  const item = object(value, "Cycle"); exact(item, ["id", "status", "path"], "Cycle");
  const cycleId = id(item.id, "Cycle id"); const localPath = text(item.path, "Cycle path");
  if (localPath !== `.dev-hub/active/${cycleId}`) fail("invalid Cycle local path");
  return { id: cycleId, status: text(item.status, "Cycle status"), path: localPath };
});
const workItems = rawWorkItems.map((value): WorkItem => {
  const item = object(value, "Work Item"); exact(item, ["id", "cycle_id", "status"], "Work Item");
  return { id: id(item.id, "Work Item id"), cycleId: id(item.cycle_id, "Work Item cycle"), status: text(item.status, "Work Item status") };
});
const workGroups = rawWorkGroups.map((value): WorkGroup => {
  const item = object(value, "Work Group"); exact(item, ["id", "cycle_id", "status", "owner", "pr"], "Work Group");
  let pr: PullRequest | null = null;
  if (item.pr !== null) { const raw = object(item.pr, "PR"); exact(raw, ["number", "url"], "PR"); const number = positive(raw.number, "PR number"); const url = text(raw.url, "PR URL"); if (url !== prUrl(number)) fail("cross-repository PR URL"); pr = { number, url }; }
  return { id: id(item.id, "Work Group id"), cycleId: id(item.cycle_id, "Work Group cycle"), status: text(item.status, "Work Group status"), owner: text(item.owner, "Work Group owner"), pr };
});
const linksSnapshot = readJson("links.json");
exact(linksSnapshot, ["contract", "captured_at", "items"], "links snapshot");
if (linksSnapshot.contract !== "dev-hub-overview-links/v2" || timestamp(linksSnapshot.captured_at, "links captured_at") !== capturedAt || !Array.isArray(linksSnapshot.items)) fail("invalid or mismatched links snapshot");
const rawLinks = linksSnapshot.items as unknown[];
const links = rawLinks.map((value): Link => {
  const item = object(value, "link"); exact(item, ["issue_number", "cycle_id", "work_item_id", "work_group_id"], "link");
  return { issueNumber: positive(item.issue_number, "link Issue"), cycleId: id(item.cycle_id, "link Cycle"), workItemId: id(item.work_item_id, "link Work Item"), workGroupId: id(item.work_group_id, "link Work Group") };
});
const issueByNumber = index(issues, (item) => String(item.number), "Issue"); const cycleById = index(cycles, (item) => item.id, "Cycle"); const workItemById = index(workItems, (item) => item.id, "Work Item"); const workGroupById = index(workGroups, (item) => item.id, "Work Group");
for (const issue of issues) for (const dependency of issue.dependencies) if (!Object.prototype.hasOwnProperty.call(issueByNumber, String(dependency))) fail("missing recursive Issue dependency");
const traversed: Record<string, "visiting" | "done"> = Object.create(null);
const visit = (number: number): void => { const state = traversed[String(number)]; if (state === "visiting") fail("Issue dependency cycle"); if (state === "done") return; traversed[String(number)] = "visiting"; for (const dependency of (issueByNumber[String(number)] as Issue).dependencies) visit(dependency); traversed[String(number)] = "done"; };
for (const issue of issues) visit(issue.number);
const linkedIssues: Record<string, true> = Object.create(null); const linkedItems: Record<string, true> = Object.create(null); const linkedGroups: Record<string, true> = Object.create(null);
for (const link of links) {
  if (!Object.prototype.hasOwnProperty.call(issueByNumber, String(link.issueNumber)) || !Object.prototype.hasOwnProperty.call(cycleById, link.cycleId) || !Object.prototype.hasOwnProperty.call(workItemById, link.workItemId) || !Object.prototype.hasOwnProperty.call(workGroupById, link.workGroupId)) fail("unresolved link");
  if (Object.prototype.hasOwnProperty.call(linkedIssues, String(link.issueNumber)) || Object.prototype.hasOwnProperty.call(linkedItems, link.workItemId) || Object.prototype.hasOwnProperty.call(linkedGroups, link.workGroupId)) fail("link must be one-to-one");
  const workItem = workItemById[link.workItemId] as WorkItem; const workGroup = workGroupById[link.workGroupId] as WorkGroup;
  if (workItem.cycleId !== link.cycleId || workGroup.cycleId !== link.cycleId) fail("cross-Cycle link");
  linkedIssues[String(link.issueNumber)] = true; linkedItems[link.workItemId] = true; linkedGroups[link.workGroupId] = true;
}
const activeLinks = links.filter((link) => [(cycleById[link.cycleId] as Cycle).status, (workItemById[link.workItemId] as WorkItem).status, (workGroupById[link.workGroupId] as WorkGroup).status].some((status) => status === "active" || status === "in_progress"));
const dependencyClosure = (number: number): readonly Issue[] => { const closure: Record<string, Issue> = Object.create(null); const walk = (current: number): void => { for (const dependency of (issueByNumber[String(current)] as Issue).dependencies) { const value = issueByNumber[String(dependency)] as Issue; if (Object.prototype.hasOwnProperty.call(closure, String(dependency))) continue; closure[String(dependency)] = value; walk(dependency); } }; walk(number); return Object.keys(closure).map((key) => closure[key] as Issue).sort((left, right) => left.number - right.number); };
const cards = activeLinks.sort((left, right) => left.issueNumber - right.issueNumber).map((link) => { const issue = issueByNumber[String(link.issueNumber)] as Issue; const cycle = cycleById[link.cycleId] as Cycle; const item = workItemById[link.workItemId] as WorkItem; const group = workGroupById[link.workGroupId] as WorkGroup; const dependencies = dependencyClosure(issue.number).map((dependency) => `<a href="${escape(dependency.url)}">Issue #${dependency.number}</a>`).join(", ") || "無"; const pull = group.pr === null ? "無 PR" : `<a href="${escape(group.pr.url)}">PR #${group.pr.number}</a>`; return `<article><h2><a href="${escape(issue.url)}">Issue #${issue.number}</a> ${escape(issue.title)}</h2><dl><dt>Dependencies</dt><dd>${dependencies}</dd><dt>Cycle</dt><dd>${escape(cycle.id)} (${escape(cycle.status)})</dd><dt>Work Item</dt><dd>${escape(item.id)} (${escape(item.status)})</dd><dt>Work Group</dt><dd>${escape(group.id)} (${escape(group.status)})</dd><dt>Owner</dt><dd>${escape(group.owner)}</dd><dt>PR</dt><dd>${pull}</dd></dl></article>`; }).join("");
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Dev Hub Overview</title><main><h1>Dev Hub Overview</h1><p>Snapshot: ${escape(capturedAt)}</p><section><h2>Flow</h2><ol><li>Project</li><li>GitHub Issue</li><li>Dev Hub Cycle → Work Item → Work Group</li></ol></section><section><h2>Active linked Issues</h2>${cards || "<p>無 active linked Issue。</p>"}</section></main>`;
const output = path.join(root, "index.html");
if (process.argv[2] === "--check") process.exitCode = 0;
else { if (existsSync(output)) fail("refusing to overwrite index.html"); writeFileSync(output, html, { encoding: "utf8", mode: 0o600 }); }
