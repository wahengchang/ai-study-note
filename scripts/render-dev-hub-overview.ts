import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;
type DependencySource = 'issue' | 'work_item' | 'both';

export type IssueSnapshot = {
  number: number;
  title: string;
  url: string;
  state: string;
  parentIssue: number | null;
  dependsOn: number[];
};

type WorkItemSnapshot = {
  id: string;
  title: string;
  status: string;
  dependsOn: string[];
  workGroup: string;
  path: string;
};

type WorkGroupSnapshot = {
  id: string;
  title: string;
  status: string;
  workItems: string[];
  owner: string;
  branch: string;
  worktree: string;
  pr: string | null;
  path: string;
};

type CycleSnapshot = {
  id: string;
  hubPath: string;
  hubStatus: string;
  workItems: WorkItemSnapshot[];
  workGroups: WorkGroupSnapshot[];
};

type LinkSnapshot = {
  issueNumber: number;
  cycleId: string;
  workItemId: string;
  workGroupId: string;
};

export type DevHubOverview = {
  coverageNote: string;
  issues: IssueSnapshot[];
  cycles: CycleSnapshot[];
  links: LinkSnapshot[];
};

export type DevHubDependency = {
  issueNumber: number;
  source: DependencySource;
};

export type DevHubDependencyLayout = {
  stages: ReadonlyArray<{ level: number; issueNumbers: readonly number[] }>;
  independentIssueNumbers: readonly number[];
  issues: ReadonlyArray<{ issueNumber: number; dependencies: readonly DevHubDependency[] }>;
};

const ISSUE_URL_PREFIX = 'https://github.com/wahengchang/ai-study-note/issues/';
const PULL_URL_PREFIX = 'https://github.com/wahengchang/ai-study-note/pull/';
const PULL_URL_PATTERN = new RegExp(`^${PULL_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[1-9]\\d*$`);
const INVALID_PREFIX = 'DEV_HUB_OVERVIEW_INVALID:';
const COVERAGE_NOTE = '僅涵蓋已登錄於 active Dev Hub 的工作及其遞迴前置 Issue，不代表全部 open GitHub Issues。';
const UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

function invalid(message: string): never {
  throw new Error(`${INVALID_PREFIX} ${message}`);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) invalid(`${label} 必須是物件。`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${label} 必須是陣列。`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(`${label} 必須是非空字串。`);
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) invalid(`${label} 必須是正整數。`);
  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  return asArray(value, label).map((item, index) => asString(item, `${label}[${index}]`));
}

function requireSchemaVersion(value: unknown, filename: string): void {
  if (value !== 2) invalid(`${filename} 的 schema_version 必須為 2。`);
}

function requireLocalMarkdownPath(path: string, cycleId: string, label: string): void {
  const parts = path.split('/');
  const expectedPrefix = `.dev-hub/active/${cycleId}/`;
  if (!path.startsWith(expectedPrefix) || !path.endsWith('.md') || path.includes('\\') || parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    invalid(`${label} 必須是 ${expectedPrefix} 下且不含 traversal 的 .md 相對路徑。`);
  }
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) invalid(`${label} 不可重複。`);
}

function parseIssue(value: unknown, index: number): IssueSnapshot {
  const issue = asRecord(value, `issues[${index}]`);
  const number = asInteger(issue.number, `issues[${index}].number`);
  const url = asString(issue.url, `issues[${index}].url`);
  if (url !== `${ISSUE_URL_PREFIX}${number}`) invalid(`issues[${index}].url 必須等於 ${ISSUE_URL_PREFIX}<number>。`);
  return {
    number,
    title: asString(issue.title, `issues[${index}].title`),
    url,
    state: asString(issue.state, `issues[${index}].state`),
    parentIssue: issue.parent_issue === null ? null : asInteger(issue.parent_issue, `issues[${index}].parent_issue`),
    dependsOn: asArray(issue.depends_on, `issues[${index}].depends_on`).map((item, dependencyIndex) => asInteger(item, `issues[${index}].depends_on[${dependencyIndex}]`)),
  };
}

function parseWorkItem(value: unknown, cycleId: string, index: number): WorkItemSnapshot {
  const item = asRecord(value, `cycles.${cycleId}.work_items[${index}]`);
  const path = asString(item.path, `cycles.${cycleId}.work_items[${index}].path`);
  requireLocalMarkdownPath(path, cycleId, `cycles.${cycleId}.work_items[${index}].path`);
  return {
    id: asString(item.id, `cycles.${cycleId}.work_items[${index}].id`),
    title: asString(item.title, `cycles.${cycleId}.work_items[${index}].title`),
    status: asString(item.status, `cycles.${cycleId}.work_items[${index}].status`),
    dependsOn: asStringArray(item.depends_on, `cycles.${cycleId}.work_items[${index}].depends_on`),
    workGroup: asString(item.work_group, `cycles.${cycleId}.work_items[${index}].work_group`),
    path,
  };
}

function parseWorkGroup(value: unknown, cycleId: string, index: number): WorkGroupSnapshot {
  const group = asRecord(value, `cycles.${cycleId}.work_groups[${index}]`);
  const path = asString(group.path, `cycles.${cycleId}.work_groups[${index}].path`);
  requireLocalMarkdownPath(path, cycleId, `cycles.${cycleId}.work_groups[${index}].path`);
  const pr = group.pr;
  if (pr !== null && (typeof pr !== 'string' || !PULL_URL_PATTERN.test(pr))) {
    invalid(`cycles.${cycleId}.work_groups[${index}].pr 必須是本 repository 的正整數 PR URL 或 null。`);
  }
  return {
    id: asString(group.id, `cycles.${cycleId}.work_groups[${index}].id`),
    title: asString(group.title, `cycles.${cycleId}.work_groups[${index}].title`),
    status: asString(group.status, `cycles.${cycleId}.work_groups[${index}].status`),
    workItems: asStringArray(group.work_items, `cycles.${cycleId}.work_groups[${index}].work_items`),
    owner: asString(group.owner, `cycles.${cycleId}.work_groups[${index}].owner`),
    branch: asString(group.branch, `cycles.${cycleId}.work_groups[${index}].branch`),
    worktree: asString(group.worktree, `cycles.${cycleId}.work_groups[${index}].worktree`),
    pr,
    path,
  };
}

function parseCycle(value: unknown, index: number): CycleSnapshot {
  const cycle = asRecord(value, `cycles[${index}]`);
  const id = asString(cycle.id, `cycles[${index}].id`);
  const hub = asRecord(cycle.hub, `cycles.${id}.hub`);
  const hubPath = asString(hub.path, `cycles.${id}.hub.path`);
  requireLocalMarkdownPath(hubPath, id, `cycles.${id}.hub.path`);
  const hubStatus = asString(hub.status, `cycles.${id}.hub.status`);
  if (hubStatus !== 'active') invalid(`cycles.${id}.hub.status 必須是 active。`);
  const workItems = asArray(cycle.work_items, `cycles.${id}.work_items`).map((item, itemIndex) => parseWorkItem(item, id, itemIndex));
  const workGroups = asArray(cycle.work_groups, `cycles.${id}.work_groups`).map((group, groupIndex) => parseWorkGroup(group, id, groupIndex));
  requireUnique(workItems.map((item) => item.id), `cycles.${id} 的 Work Item ID`);
  requireUnique(workGroups.map((group) => group.id), `cycles.${id} 的 Work Group ID`);
  const groupsById = new Map(workGroups.map((group) => [group.id, group]));
  for (const item of workItems) {
    const group = groupsById.get(item.workGroup);
    if (group === undefined) invalid(`cycles.${id} 的 Work Item ${item.id} 指向不存在的 Work Group。`);
    if (!group.workItems.includes(item.id)) invalid(`cycles.${id} 的 Work Group ${group.id} 未列出 Work Item ${item.id}。`);
    for (const dependency of item.dependsOn) {
      if (!workItems.some((candidate) => candidate.id === dependency)) invalid(`cycles.${id} 的 Work Item ${item.id} 依賴不存在的 Work Item ${dependency}。`);
    }
  }
  for (const group of workGroups) {
    requireUnique(group.workItems, `cycles.${id} 的 Work Group ${group.id} work_items`);
    for (const workItemId of group.workItems) {
      const item = workItems.find((candidate) => candidate.id === workItemId);
      if (item === undefined || item.workGroup !== group.id) invalid(`cycles.${id} 的 Work Group ${group.id} 有不一致的 Work Item ${workItemId}。`);
    }
  }
  return { id, hubPath, hubStatus, workItems, workGroups };
}

function parseLink(value: unknown, index: number): LinkSnapshot {
  const link = asRecord(value, `links[${index}]`);
  if (link.target_kind !== 'dev_hub_work_item') invalid(`links[${index}].target_kind 必須是 dev_hub_work_item。`);
  return {
    issueNumber: asInteger(link.issue_number, `links[${index}].issue_number`),
    cycleId: asString(link.cycle_id, `links[${index}].cycle_id`),
    workItemId: asString(link.work_item_id, `links[${index}].work_item_id`),
    workGroupId: asString(link.work_group_id, `links[${index}].work_group_id`),
  };
}

async function readJson(path: string, filename: string): Promise<JsonRecord> {
  let source: string;
  try { source = await readFile(path, 'utf8'); } catch { invalid(`無法讀取 ${filename}。`); }
  try { return asRecord(JSON.parse(source), filename); } catch (error) {
    if (error instanceof Error && error.message.startsWith(INVALID_PREFIX)) throw error;
    invalid(`無法解析 ${filename}。`);
  }
}

function validateOverview(data: DevHubOverview): void {
  const issuesByNumber = new Map(data.issues.map((issue) => [issue.number, issue]));
  const cyclesById = new Map(data.cycles.map((cycle) => [cycle.id, cycle]));
  const activeWorkItemKeys = new Set<string>();
  for (const cycle of data.cycles) for (const item of cycle.workItems) activeWorkItemKeys.add(`${cycle.id}/${item.id}`);
  for (const issue of data.issues) {
    for (const dependency of issue.dependsOn) {
      if (!issuesByNumber.has(dependency)) invalid(`Issue #${issue.number} 依賴的 #${dependency} 不存在於 issues.json。`);
    }
  }
  for (const link of data.links) {
    if (!issuesByNumber.has(link.issueNumber)) invalid(`links 的 Issue #${link.issueNumber} 不存在於 issues.json。`);
    const cycle = cyclesById.get(link.cycleId);
    if (cycle === undefined) invalid(`links 的 Cycle ${link.cycleId} 不存在於 links.json。`);
    const workItem = cycle.workItems.find((item) => item.id === link.workItemId);
    if (workItem === undefined) invalid(`links 的 Work Item ${link.cycleId}/${link.workItemId} 不存在。`);
    const workGroup = cycle.workGroups.find((group) => group.id === link.workGroupId);
    if (workGroup === undefined) invalid(`links 的 Work Group ${link.cycleId}/${link.workGroupId} 不存在。`);
    if (workItem.workGroup !== link.workGroupId) invalid(`links 的 Work Item ${link.cycleId}/${link.workItemId} 與 Work Group 不一致。`);
  }
  if (data.links.length !== activeWorkItemKeys.size) invalid('每個 active Work Item 都必須恰好有一筆 links 記錄。');
  const linkedIssueNumbers = new Set(data.links.map((link) => link.issueNumber));
  const visited = new Set<number>();
  const visit = (number: number): void => {
    if (visited.has(number)) return;
    visited.add(number);
    for (const dependency of issuesByNumber.get(number)?.dependsOn ?? []) visit(dependency);
  };
  for (const number of linkedIssueNumbers) visit(number);
  if (visited.size !== data.issues.length || data.issues.some((issue) => !visited.has(issue.number))) {
    invalid('issues.json 必須剛好涵蓋 linked Issues 的遞迴前置 dependency closure。');
  }
}

export async function loadDevHubOverview(inputDirectory: string): Promise<DevHubOverview> {
  const issuesJson = await readJson(resolve(inputDirectory, 'issues.json'), 'issues.json');
  const linksJson = await readJson(resolve(inputDirectory, 'links.json'), 'links.json');
  requireSchemaVersion(issuesJson.schema_version, 'issues.json');
  requireSchemaVersion(linksJson.schema_version, 'links.json');
  const updatedAt = asString(issuesJson.updated_at, 'issues.json.updated_at');
  if (!UPDATED_AT_PATTERN.test(updatedAt) || updatedAt !== asString(linksJson.updated_at, 'links.json.updated_at')) invalid('issues.json 與 links.json 的 updated_at 必須相同且含 UTC offset。');
  const coverage = asRecord(issuesJson.coverage, 'issues.json.coverage');
  if (coverage.mode !== 'active_dev_hub_with_dependencies' || coverage.complete !== false || coverage.note !== COVERAGE_NOTE) {
    invalid('issues.json.coverage 必須標示固定的 active Dev Hub dependency coverage。');
  }
  const data: DevHubOverview = {
    coverageNote: COVERAGE_NOTE,
    issues: asArray(issuesJson.issues, 'issues.json.issues').map(parseIssue),
    cycles: asArray(linksJson.cycles, 'links.json.cycles').map(parseCycle),
    links: asArray(linksJson.links, 'links.json.links').map(parseLink),
  };
  requireUnique(data.issues.map((issue) => String(issue.number)), 'Issue number');
  requireUnique(data.cycles.map((cycle) => cycle.id), 'Cycle ID');
  requireUnique(data.links.map((link) => String(link.issueNumber)), 'links 的 Issue number');
  requireUnique(data.links.map((link) => `${link.cycleId}/${link.workItemId}`), 'links 的 Cycle ID 與 Work Item ID 組合');
  validateOverview(data);
  buildDevHubDependencyLayout(data);
  return data;
}

export function buildDevHubDependencyLayout(data: DevHubOverview): DevHubDependencyLayout {
  const issueNumbers = data.issues.map((issue) => issue.number).sort((left, right) => left - right);
  const issueByNumber = new Map(data.issues.map((issue) => [issue.number, issue]));
  const dependencySources = new Map<number, Map<number, Set<'issue' | 'work_item'>>>();
  for (const issueNumber of issueNumbers) dependencySources.set(issueNumber, new Map());
  const addDependency = (issueNumber: number, dependencyNumber: number, source: 'issue' | 'work_item'): void => {
    if (!issueByNumber.has(dependencyNumber)) invalid(`Issue #${issueNumber} 的依賴 #${dependencyNumber} 不存在。`);
    const dependencies = dependencySources.get(issueNumber);
    if (dependencies === undefined) invalid(`Issue #${issueNumber} 不存在。`);
    const sources = dependencies.get(dependencyNumber) ?? new Set<'issue' | 'work_item'>();
    sources.add(source);
    dependencies.set(dependencyNumber, sources);
  };
  for (const issue of data.issues) for (const dependency of issue.dependsOn) addDependency(issue.number, dependency, 'issue');
  const linkByWorkItem = new Map<string, LinkSnapshot>();
  for (const link of data.links) linkByWorkItem.set(`${link.cycleId}/${link.workItemId}`, link);
  for (const link of data.links) {
    const cycle = data.cycles.find((candidate) => candidate.id === link.cycleId);
    const workItem = cycle?.workItems.find((candidate) => candidate.id === link.workItemId);
    if (cycle === undefined || workItem === undefined) invalid(`Issue #${link.issueNumber} 缺少對應的 Work Item。`);
    for (const dependencyId of workItem.dependsOn) {
      const dependencyLink = linkByWorkItem.get(`${cycle.id}/${dependencyId}`);
      if (dependencyLink === undefined) invalid(`Work Item ${cycle.id}/${workItem.id} 的依賴 ${dependencyId} 缺少唯一 Issue link。`);
      addDependency(link.issueNumber, dependencyLink.issueNumber, 'work_item');
    }
  }
  const state = new Map<number, 'visiting' | 'done'>();
  const levels = new Map<number, number>();
  const visit = (issueNumber: number): number => {
    const current = state.get(issueNumber);
    if (current === 'visiting') invalid('合併 Issue 與 Work Item dependency graph 不可有 cycle。');
    if (current === 'done') return levels.get(issueNumber)!;
    state.set(issueNumber, 'visiting');
    let level = 1;
    for (const dependency of dependencySources.get(issueNumber)!.keys()) level = Math.max(level, visit(dependency) + 1);
    state.set(issueNumber, 'done');
    levels.set(issueNumber, level);
    return level;
  };
  for (const issueNumber of issueNumbers) visit(issueNumber);
  const dependents = new Set<number>();
  for (const dependencies of dependencySources.values()) for (const dependency of dependencies.keys()) dependents.add(dependency);
  const independentIssueNumbers = issueNumbers.filter((number) => dependencySources.get(number)!.size === 0 && !dependents.has(number));
  const stagesByLevel = new Map<number, number[]>();
  for (const issueNumber of issueNumbers) {
    if (independentIssueNumbers.includes(issueNumber)) continue;
    const level = levels.get(issueNumber)!;
    const stage = stagesByLevel.get(level) ?? [];
    stage.push(issueNumber);
    stagesByLevel.set(level, stage);
  }
  return {
    stages: [...stagesByLevel.entries()].sort(([left], [right]) => left - right).map(([level, numbers]) => ({ level, issueNumbers: numbers.sort((left, right) => left - right) })),
    independentIssueNumbers,
    issues: issueNumbers.map((issueNumber) => ({
      issueNumber,
      dependencies: [...dependencySources.get(issueNumber)!.entries()].sort(([left], [right]) => left - right).map(([dependencyNumber, sources]) => ({
        issueNumber: dependencyNumber,
        source: sources.size === 2 ? 'both' : sources.has('issue') ? 'issue' : 'work_item',
      })),
    })),
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

function statusClass(status: string): string {
  if (status === 'open') return 'open';
  if (status === 'in_progress') return 'in-progress';
  if (status === 'pending') return 'pending';
  if (status === 'blocked') return 'blocked';
  if (status === 'done') return 'done';
  if (status === 'cancelled') return 'cancelled';
  return 'other';
}

function renderStatus(status: string): string {
  return `<span class="status status-${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function sourceLabel(source: DependencySource): string {
  return source === 'both' ? 'Issue＋Work Item' : source === 'issue' ? 'Issue' : 'Work Item';
}

type OverviewRow = {
  issue: IssueSnapshot;
  dependencies: readonly DevHubDependency[];
  local: { cycle: CycleSnapshot; workItem: WorkItemSnapshot; workGroup: WorkGroupSnapshot } | null;
};

function createRows(data: DevHubOverview, layout: DevHubDependencyLayout): OverviewRow[] {
  const dependenciesByIssue = new Map(layout.issues.map((issue) => [issue.issueNumber, issue.dependencies]));
  const cyclesById = new Map(data.cycles.map((cycle) => [cycle.id, cycle]));
  const linksByIssue = new Map(data.links.map((link) => [link.issueNumber, link]));
  return [...data.issues].sort((left, right) => left.number - right.number).map((issue) => {
    const link = linksByIssue.get(issue.number);
    if (link === undefined) return { issue, dependencies: dependenciesByIssue.get(issue.number) ?? [], local: null };
    const cycle = cyclesById.get(link.cycleId);
    const workItem = cycle?.workItems.find((item) => item.id === link.workItemId);
    const workGroup = cycle?.workGroups.find((group) => group.id === link.workGroupId);
    if (cycle === undefined || workItem === undefined || workGroup === undefined) invalid('已驗證 overview 資料缺少 join target。');
    return { issue, dependencies: dependenciesByIssue.get(issue.number) ?? [], local: { cycle, workItem, workGroup } };
  });
}

function renderDependencies(row: OverviewRow, issueByNumber: ReadonlyMap<number, IssueSnapshot>): string {
  if (row.dependencies.length === 0) return '無';
  return row.dependencies.map((dependency) => {
    const target = issueByNumber.get(dependency.issueNumber);
    if (target === undefined) invalid('已驗證 overview 資料缺少 dependency target。');
    return `<span class="dependency-ref"><a href="${escapeHtml(target.url)}">#${target.number}</a><span class="source">${sourceLabel(dependency.source)}</span></span>`;
  }).join(' ');
}

function renderTableRow(row: OverviewRow, issueByNumber: ReadonlyMap<number, IssueSnapshot>): string {
  const local = row.local;
  const optional = ' hidden';
  const pr = local?.workGroup.pr;
  const prNumber = pr === null || pr === undefined ? null : pr.slice(PULL_URL_PREFIX.length);
  return `          <tr data-issue-number="${row.issue.number}"${local === null ? ' hidden' : ''}>
            <td data-column="issue" class="issue-cell"><a href="${escapeHtml(row.issue.url)}">#${row.issue.number} ${escapeHtml(row.issue.title)}</a><br>${renderStatus(row.issue.state)}</td>
            <td data-column="localStatus">${local === null ? '未登錄 Dev Hub' : renderStatus(local.workItem.status)}</td>
            <td data-column="dependencies">${renderDependencies(row, issueByNumber)}</td>
            <td data-column="owner">${local === null ? '—' : escapeHtml(local.workGroup.owner)}</td>
            <td data-column="pr">${prNumber === null ? '尚未建立' : `<a href="${escapeHtml(pr!)}">PR #${prNumber}</a>`}</td>
            <td data-column="parent"${optional}>${row.issue.parentIssue === null ? '—' : `#${row.issue.parentIssue}`}</td>
            <td data-column="cycle"${optional}><code>${local === null ? '—' : escapeHtml(local.cycle.id)}</code></td>
            <td data-column="workItem"${optional}>${local === null ? '—' : `<code>${escapeHtml(local.workItem.id)}</code><br>${escapeHtml(local.workItem.title)}`}</td>
            <td data-column="workGroup"${optional}>${local === null ? '—' : `<code>${escapeHtml(local.workGroup.id)}</code><br>${escapeHtml(local.workGroup.title)}`}</td>
            <td data-column="branch"${optional}><code>${local === null ? '—' : escapeHtml(local.workGroup.branch)}</code></td>
            <td data-column="localPath"${optional}><code>${local === null ? '—' : escapeHtml(local.workItem.path)}</code></td>
          </tr>`;
}

function renderDependencyCard(row: OverviewRow, issueByNumber: ReadonlyMap<number, IssueSnapshot>, independent = false): string {
  const local = row.local;
  return `              <article class="issue-card" data-dependency-card data-issue-number="${row.issue.number}"${independent ? ' data-independent="true"' : ''}>
                <p class="card-kicker">${local === null ? 'dependency-only／未登錄 Dev Hub' : escapeHtml(local.cycle.id)}</p>
                <h4><a href="${escapeHtml(row.issue.url)}">#${row.issue.number} ${escapeHtml(row.issue.title)}</a></h4>
                <p>${renderStatus(row.issue.state)} ${local === null ? '<span class="muted">未登錄 Dev Hub</span>' : renderStatus(local.workItem.status)}</p>
                <p class="dependency-list"><strong>前置依賴：</strong>${renderDependencies(row, issueByNumber)}</p>
              </article>`;
}

function renderCyclePanel(rows: readonly OverviewRow[]): string {
  const groups = new Map<string, OverviewRow[]>();
  for (const row of rows) {
    if (row.local === null) continue;
    const key = `${row.local.cycle.id}/${row.local.workGroup.id}`;
    const entries = groups.get(key) ?? [];
    entries.push(row);
    groups.set(key, entries);
  }
  return [...groups.entries()].map(([key, entries]) => {
    const local = entries[0]!.local!;
    return `        <article class="cycle-card" data-cycle-card="${escapeHtml(key)}">
          <p class="card-kicker">Cycle ID: <code>${escapeHtml(local.cycle.id)}</code> · Work Group: <code>${escapeHtml(local.workGroup.id)}</code></p>
          <h3>${escapeHtml(local.workGroup.title)}</h3>
          <p>Owner：${escapeHtml(local.workGroup.owner)} · <span data-cycle-in-progress>0</span> active · <span data-cycle-pending>0</span> pending</p>
          <ul>${entries.map((row) => `<li data-cycle-row data-issue-number="${row.issue.number}"><a href="${escapeHtml(row.issue.url)}">#${row.issue.number} ${escapeHtml(row.issue.title)}</a> ${renderStatus(row.local!.workItem.status)}</li>`).join('')}</ul>
        </article>`;
  }).join('\n');
}

function renderStatusPanel(rows: readonly OverviewRow[]): string {
  const order = ['in_progress', 'pending', 'blocked', 'done', 'cancelled', 'other'] as const;
  return order.map((status) => {
    const entries = rows.filter((row) => row.local !== null && (status === 'other' ? !['in_progress', 'pending', 'blocked', 'done', 'cancelled'].includes(row.local.workItem.status) : row.local.workItem.status === status));
    if (entries.length === 0) return '';
    return `        <section class="status-lane" data-status-lane="${status}">
          <h3>${status === 'other' ? '其他' : escapeHtml(status)}</h3>
          <ul>${entries.map((row) => `<li data-status-row data-issue-number="${row.issue.number}"><a href="${escapeHtml(row.issue.url)}">#${row.issue.number} ${escapeHtml(row.issue.title)}</a> ${renderStatus(row.local!.workItem.status)}</li>`).join('')}</ul>
        </section>`;
  }).join('\n');
}

function clientModel(rows: readonly OverviewRow[], layout: DevHubDependencyLayout): unknown {
  return {
    rows: rows.map((row) => ({
      issueNumber: row.issue.number,
      title: row.issue.title,
      issueState: row.issue.state,
      dependencies: row.dependencies.map((dependency) => dependency.issueNumber),
      local: row.local === null ? null : {
        cycleId: row.local.cycle.id,
        workItemTitle: row.local.workItem.title,
        localStatus: row.local.workItem.status,
        owner: row.local.workGroup.owner,
      },
    })),
    layout,
  };
}

export function renderDevHubOverviewHtml(data: DevHubOverview): string {
  const layout = buildDevHubDependencyLayout(data);
  const rows = createRows(data, layout);
  const issueByNumber = new Map(data.issues.map((issue) => [issue.number, issue]));
  const rowByNumber = new Map(rows.map((row) => [row.issue.number, row]));
  const activeCount = data.links.length;
  const dependencyCount = data.issues.length - activeCount;
  const cycleOptions = data.cycles.map((cycle) => `<option value="${escapeHtml(cycle.id)}">${escapeHtml(cycle.id)}</option>`).join('');
  const issueStateOptions = [...new Set(rows.map((row) => row.issue.state))].sort().map((state) => `<option value="${escapeHtml(state)}">${escapeHtml(state)}</option>`).join('');
  const localStatusOptions = [...new Set(rows.flatMap((row) => row.local === null ? [] : [row.local.workItem.status]))].sort().map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
  const dependencyStages = layout.stages.map((stage) => `          <li class="stage" data-stage-level="${stage.level}"><section><h3>第 ${stage.level} 階段</h3><div class="stage-cards">${stage.issueNumbers.map((number) => renderDependencyCard(rowByNumber.get(number)!, issueByNumber)).join('')}</div></section></li>`).join('\n');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dev Hub 專案總覽</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --canvas:#f5f7fb; --surface:#fff; --surface-muted:#eef2f7; --text:#172033; --muted:#526075; --border:#cbd5e1; --link:#0759bd; --focus:#b45309; --success:#076241; --warning:#725000; --danger:#9f1239; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --radius:10px; --shadow:0 1px 2px rgb(15 23 42 / .08); color:var(--text); background:var(--canvas); }
    * { box-sizing:border-box; }
    body { margin:0; }
    main { max-inline-size:1440px; margin:0 auto; padding:28px 24px 48px; min-inline-size:0; }
    h1 { margin:0 0 var(--space-2); font-size:2rem; } h2 { margin:28px 0 var(--space-3); font-size:1.25rem; } h3,h4 { margin:0; } p { line-height:1.55; }
    .coverage { margin:var(--space-3) 0; border-inline-start:4px solid var(--warning); background:#fff6d8; padding:var(--space-2) var(--space-3); color:#503600; }
    .summary-chips,.tablist,.toolbar-actions,.column-controls { display:flex; flex-wrap:wrap; gap:var(--space-2); padding:0; margin:var(--space-3) 0; list-style:none; }
    .summary-chips li { border:1px solid var(--border); border-radius:999px; background:var(--surface); padding:6px 10px; box-shadow:var(--shadow); font-size:.92rem; } .summary-chips strong { font-size:1.05rem; }
    button,input,select { font:inherit; } button { min-block-size:40px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text); padding:6px 10px; cursor:pointer; } button[aria-selected="true"] { background:#173b70; border-color:#173b70; color:#fff; } button:disabled { cursor:not-allowed; opacity:.55; }
    a { color:var(--link); font-weight:700; } a,button,input,select,summary,[tabindex="0"] { outline-offset:3px; } a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,[tabindex="0"]:focus-visible { outline:3px solid var(--focus); }
    details { border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0 var(--space-3) var(--space-3); } summary { cursor:pointer; padding:var(--space-3) 0; font-weight:700; }
    .controls-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--space-3); } .controls-grid label,.controls-grid fieldset { min-inline-size:0; display:grid; gap:var(--space-1); } input,select { inline-size:100%; max-inline-size:100%; min-block-size:40px; border:1px solid var(--border); border-radius:6px; padding:6px 8px; background:var(--surface); }
    fieldset { border:1px solid var(--border); border-radius:8px; } legend { font-weight:700; } .column-controls label { display:flex; align-items:center; gap:var(--space-1); } .column-controls input { inline-size:auto; min-block-size:auto; }
    .storage-warning,.form-error,.empty-state { color:var(--danger); margin:var(--space-2) 0 0; } .empty-state { color:var(--muted); } [hidden] { display:none !important; }
    .table-scroll,.stage-scroll { max-inline-size:100%; min-inline-size:0; overflow-x:auto; overscroll-behavior-inline:contain; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); }
    table { inline-size:100%; border-collapse:collapse; } caption { text-align:left; padding:var(--space-3); font-weight:700; } th,td { padding:10px 12px; border-top:1px solid #e2e8f0; text-align:left; vertical-align:top; line-height:1.45; } th { background:var(--surface-muted); white-space:nowrap; } .issue-cell { min-inline-size:310px; } code { overflow-wrap:anywhere; color:#334155; } .status { display:inline-block; border:1px solid currentColor; border-radius:999px; padding:1px 7px; font-size:.85rem; font-weight:700; white-space:nowrap; } .status-open,.status-in-progress { color:var(--success); background:#e8f7ee; } .status-pending { color:var(--warning); background:#fff6d8; } .status-blocked,.status-cancelled { color:var(--danger); background:#fff1f2; } .status-done { color:#1d4ed8; background:#eff6ff; } .status-other { color:var(--muted); background:var(--surface-muted); }
    td[data-column="pr"] { white-space:nowrap; }
    table { min-inline-size:1180px; }
    .dependency-ref { display:inline-flex; align-items:center; gap:3px; margin:0 4px 4px 0; white-space:nowrap; } .source { border-radius:999px; background:var(--surface-muted); color:var(--muted); font-size:.75rem; padding:1px 5px; } .muted,.card-kicker { color:var(--muted); } .card-kicker { margin:0 0 var(--space-1); font-size:.82rem; }
    .stage-board { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(260px,320px); gap:var(--space-3); inline-size:max-content; min-inline-size:100%; padding:var(--space-3); margin:0; list-style:none; } .stage { min-inline-size:0; } .stage > section { block-size:100%; border-inline-start:3px solid #5b7db1; padding-inline-start:var(--space-2); } .stage-cards { display:grid; gap:var(--space-2); margin-top:var(--space-2); } .issue-card,.cycle-card,.status-lane { border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:var(--space-3); box-shadow:var(--shadow); } .issue-card.context { background:#f8fafc; border-color:#aebdcc; } .dependency-list { margin:var(--space-2) 0 0; } .independent { margin-top:var(--space-3); }
    .cycle-grid,.status-board { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:var(--space-3); } .cycle-card ul,.status-lane ul { margin:var(--space-2) 0 0; padding-inline-start:20px; } .status-lane h3 { text-transform:none; }
    @media (max-width:720px) { main { padding:20px 14px 32px; } .controls-grid { grid-template-columns:1fr; } .toolbar-actions button { min-block-size:44px; } .issue-cell { min-inline-size:270px; } .stage-board { grid-auto-columns:minmax(250px,78vw); } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Dev Hub 專案總覽</h1>
      <aside class="coverage" role="note">${escapeHtml(data.coverageNote)}</aside>
      <ul class="summary-chips" aria-label="目前摘要"><li><strong>${activeCount}</strong> active Issues</li><li><strong>${dependencyCount}</strong> upstream dependencies</li><li><strong>${data.cycles.length}</strong> active Cycles</li></ul>
    </header>
    <div class="tablist" role="tablist" aria-label="總覽檢視">
      <button type="button" role="tab" id="tab-table" aria-controls="panel-table" aria-selected="true" tabindex="0" data-view="table">表格</button>
      <button type="button" role="tab" id="tab-dependencies" aria-controls="panel-dependencies" aria-selected="false" tabindex="-1" data-view="dependencies">依賴階段</button>
      <button type="button" role="tab" id="tab-cycles" aria-controls="panel-cycles" aria-selected="false" tabindex="-1" data-view="cycles">Cycle</button>
      <button type="button" role="tab" id="tab-status" aria-controls="panel-status" aria-selected="false" tabindex="-1" data-view="status">狀態</button>
    </div>
    <details id="overview-controls">
      <summary>顯示設定與篩選</summary>
      <div class="controls-grid">
        <label>關鍵字<input id="filter-query" type="search" autocomplete="off"></label>
        <label>Issue state<select id="filter-issue-state"><option value="all">全部</option>${issueStateOptions}</select></label>
        <label>Local status<select id="filter-local-status"><option value="all">全部</option>${localStatusOptions}</select></label>
        <label>Cycle<select id="filter-cycle"><option value="all">全部</option>${cycleOptions}</select></label>
        <label>範圍<select id="filter-scope"><option value="active">active</option><option value="all">active + dependencies</option></select></label>
        <label>Filter 名稱<input id="saved-filter-name" maxlength="40" aria-describedby="saved-filter-error"></label>
        <label>已存 Filter<select id="saved-filter-select"><option value="">選擇 Filter</option></select></label>
      </div>
      <fieldset><legend>欄位</legend><div class="column-controls"><label><input type="checkbox" checked disabled>Issue／Issue state</label><label><input type="checkbox" data-column-toggle="localStatus" checked>Local status</label><label><input type="checkbox" data-column-toggle="dependencies" checked>前置依賴</label><label><input type="checkbox" data-column-toggle="owner" checked>Owner</label><label><input type="checkbox" data-column-toggle="pr" checked>PR</label><label><input type="checkbox" data-column-toggle="parent">Parent</label><label><input type="checkbox" data-column-toggle="cycle">Cycle</label><label><input type="checkbox" data-column-toggle="workItem">Work Item</label><label><input type="checkbox" data-column-toggle="workGroup">Work Group</label><label><input type="checkbox" data-column-toggle="branch">Branch</label><label><input type="checkbox" data-column-toggle="localPath">Local path</label></div></fieldset>
      <div class="toolbar-actions"><button type="button" id="clear-filters">清除 filter</button><button type="button" id="save-filter">儲存</button><button type="button" id="apply-filter" disabled>套用</button><button type="button" id="delete-filter" disabled>刪除</button></div>
      <p id="saved-filter-error" class="form-error" role="status" aria-live="polite"></p>
    </details>
    <p id="storage-warning" class="storage-warning" role="status" aria-live="polite" hidden>設定無法保存</p>
    <section id="panel-table" role="tabpanel" aria-labelledby="tab-table">
      <h2>緊湊表格</h2>
      <div class="table-scroll" tabindex="0" aria-label="Issue 總覽表，可橫向捲動"><table><caption>active Dev Hub 工作與遞迴前置 Issue 的手動 snapshot</caption><thead><tr><th scope="col" data-column="issue">Issue／Issue state</th><th scope="col" data-column="localStatus">Local status</th><th scope="col" data-column="dependencies">前置依賴</th><th scope="col" data-column="owner">Owner</th><th scope="col" data-column="pr">PR</th><th scope="col" data-column="parent" hidden>Parent</th><th scope="col" data-column="cycle" hidden>Cycle</th><th scope="col" data-column="workItem" hidden>Work Item</th><th scope="col" data-column="workGroup" hidden>Work Group</th><th scope="col" data-column="branch" hidden>Branch</th><th scope="col" data-column="localPath" hidden>Local path</th></tr></thead><tbody>
${rows.map((row) => renderTableRow(row, issueByNumber)).join('\n')}
          <tr id="table-empty" hidden><td colspan="5">目前 filter 沒有符合項目；請清除 filter。</td></tr>
      </tbody></table></div>
    </section>
    <section id="panel-dependencies" role="tabpanel" aria-labelledby="tab-dependencies" hidden>
      <h2 id="dependencies-title">依賴階段</h2>
      <p id="dependency-empty" class="empty-state" hidden>目前 filter 沒有符合的 active Issue。</p>
      <div class="stage-scroll" role="region" tabindex="0" aria-labelledby="dependencies-title"><ol class="stage-board">
${dependencyStages}
      </ol></div>
      <section class="independent" id="independent-section"><h3>獨立工作</h3><div class="stage-cards">${layout.independentIssueNumbers.map((number) => renderDependencyCard(rowByNumber.get(number)!, issueByNumber, true)).join('')}</div></section>
    </section>
    <section id="panel-cycles" role="tabpanel" aria-labelledby="tab-cycles" hidden><h2>Cycle／Work Group</h2><p id="cycle-empty" class="empty-state" hidden>目前 filter 沒有符合項目；請清除 filter。</p><div class="cycle-grid">${renderCyclePanel(rows)}</div></section>
    <section id="panel-status" role="tabpanel" aria-labelledby="tab-status" hidden><h2>狀態</h2><p id="status-empty" class="empty-state" hidden>目前 filter 沒有符合項目；請清除 filter。</p><div class="status-board">${renderStatusPanel(rows)}</div></section>
  </main>
  <script id="dev-hub-overview-model" type="application/json">${escapeJsonForScript(clientModel(rows, layout))}</script>
  <script>
(() => {
  'use strict';
  const storageKey = 'dev-hub-overview.preferences.v1';
  const model = JSON.parse(document.getElementById('dev-hub-overview-model').textContent);
  const views = ['table', 'dependencies', 'cycles', 'status'];
  const columnNames = ['issue', 'localStatus', 'dependencies', 'owner', 'pr', 'parent', 'cycle', 'workItem', 'workGroup', 'branch', 'localPath'];
  const defaultFilters = () => ({ query: '', issueState: 'all', localStatus: 'all', cycleId: 'all', scope: 'active' });
  const defaults = () => ({ version: 1, view: 'table', visibleColumns: ['issue', 'localStatus', 'dependencies', 'owner', 'pr'], filters: defaultFilters(), savedFilters: [], selectedSavedFilter: null, controlsOpen: false });
  const warning = document.getElementById('storage-warning');
  const controls = document.getElementById('overview-controls');
  const query = document.getElementById('filter-query');
  const issueState = document.getElementById('filter-issue-state');
  const localStatus = document.getElementById('filter-local-status');
  const cycle = document.getElementById('filter-cycle');
  const scope = document.getElementById('filter-scope');
  const filterName = document.getElementById('saved-filter-name');
  const savedSelect = document.getElementById('saved-filter-select');
  const saveError = document.getElementById('saved-filter-error');
  const applyButton = document.getElementById('apply-filter');
  const deleteButton = document.getElementById('delete-filter');
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const toggleInputs = Array.from(document.querySelectorAll('[data-column-toggle]'));
  const rowsByNumber = new Map(model.rows.map((row) => [row.issueNumber, row]));
  const issueStates = new Set(model.rows.map((row) => row.issueState));
  const localStatuses = new Set(model.rows.flatMap((row) => row.local ? [row.local.localStatus] : []));
  const cycleIds = new Set(model.rows.flatMap((row) => row.local ? [row.local.cycleId] : []));
  const showWarning = () => { warning.hidden = false; };
  const cloneFilters = (filters) => ({ query: filters.query, issueState: filters.issueState, localStatus: filters.localStatus, cycleId: filters.cycleId, scope: filters.scope });
  const normalizeFilters = (value) => {
    const input = value && typeof value === 'object' ? value : {};
    return { query: typeof input.query === 'string' ? input.query : '', issueState: typeof input.issueState === 'string' && (input.issueState === 'all' || issueStates.has(input.issueState)) ? input.issueState : 'all', localStatus: typeof input.localStatus === 'string' && (input.localStatus === 'all' || localStatuses.has(input.localStatus)) ? input.localStatus : 'all', cycleId: typeof input.cycleId === 'string' && (input.cycleId === 'all' || cycleIds.has(input.cycleId)) ? input.cycleId : 'all', scope: input.scope === 'all' ? 'all' : 'active' };
  };
  const normalizePreferences = (value) => {
    if (!value || typeof value !== 'object' || value.version !== 1 || !views.includes(value.view)) return null;
    const storedColumns = Array.isArray(value.visibleColumns) ? value.visibleColumns.filter((column, index, all) => typeof column === 'string' && columnNames.includes(column) && all.indexOf(column) === index) : null;
    const visible = storedColumns && storedColumns.length ? storedColumns : defaults().visibleColumns.slice();
    if (!visible.includes('issue')) visible.unshift('issue');
    const savedFilters = Array.isArray(value.savedFilters) ? value.savedFilters.flatMap((preset) => {
      if (!preset || typeof preset !== 'object' || typeof preset.name !== 'string') return [];
      const name = preset.name.trim();
      return name.length >= 1 && name.length <= 40 ? [{ name, filters: normalizeFilters(preset.filters) }] : [];
    }).filter((preset, index, all) => all.findIndex((candidate) => candidate.name === preset.name) === index) : [];
    const selected = typeof value.selectedSavedFilter === 'string' && savedFilters.some((preset) => preset.name === value.selectedSavedFilter) ? value.selectedSavedFilter : null;
    return { version: 1, view: value.view, visibleColumns: visible, filters: normalizeFilters(value.filters), savedFilters, selectedSavedFilter: selected, controlsOpen: value.controlsOpen === true };
  };
  const loadPreferences = () => {
    try { const parsed = normalizePreferences(JSON.parse(localStorage.getItem(storageKey) || 'null')); if (parsed) return parsed; if (localStorage.getItem(storageKey) !== null) showWarning(); } catch { showWarning(); }
    return defaults();
  };
  let preferences = loadPreferences();
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { showWarning(); } };
  const selectedPreset = () => preferences.savedFilters.find((preset) => preset.name === preferences.selectedSavedFilter) || null;
  const filtersEqual = (left, right) => ['query', 'issueState', 'localStatus', 'cycleId', 'scope'].every((key) => left[key] === right[key]);
  const rowMatches = (row) => {
    const filters = preferences.filters;
    const tokens = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [String(row.issueNumber), row.title, row.local?.workItemTitle || '', row.local?.owner || ''].join(' ').toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token)) && (filters.issueState === 'all' || row.issueState === filters.issueState) && (filters.localStatus === 'all' || row.local?.localStatus === filters.localStatus) && (filters.cycleId === 'all' || row.local?.cycleId === filters.cycleId);
  };
  const syncPresetOptions = () => {
    const previous = savedSelect.value;
    while (savedSelect.options.length > 1) savedSelect.remove(1);
    for (const preset of preferences.savedFilters) { const option = document.createElement('option'); option.value = preset.name; option.textContent = preset.name; savedSelect.append(option); }
    savedSelect.value = preferences.selectedSavedFilter || (preferences.savedFilters.some((preset) => preset.name === previous) ? previous : '');
    applyButton.disabled = !preferences.selectedSavedFilter;
    deleteButton.disabled = !preferences.selectedSavedFilter;
  };
  const syncControls = () => {
    query.value = preferences.filters.query; issueState.value = preferences.filters.issueState; localStatus.value = preferences.filters.localStatus; cycle.value = preferences.filters.cycleId; scope.value = preferences.filters.scope;
    controls.open = preferences.controlsOpen;
    for (const input of toggleInputs) input.checked = preferences.visibleColumns.includes(input.dataset.columnToggle);
    syncPresetOptions();
  };
  const applyColumns = () => {
    for (const column of columnNames) for (const cell of document.querySelectorAll('[data-column="' + column + '"]')) cell.hidden = !preferences.visibleColumns.includes(column);
    document.getElementById('table-empty').firstElementChild.colSpan = preferences.visibleColumns.length;
  };
  const applyTable = () => {
    let visible = 0;
    for (const element of document.querySelectorAll('tr[data-issue-number]')) { const row = rowsByNumber.get(Number(element.dataset.issueNumber)); const matches = rowMatches(row) && (preferences.filters.scope === 'all' || row.local); element.hidden = !matches; if (matches) visible++; }
    document.getElementById('table-empty').hidden = visible !== 0;
  };
  const applyDependencyFocus = () => {
    const hasFocusCriteria = preferences.filters.query.trim() !== '' || preferences.filters.issueState !== 'all' || preferences.filters.localStatus !== 'all' || preferences.filters.cycleId !== 'all';
    const visible = new Set(); const focal = new Set();
    if (hasFocusCriteria) {
      for (const row of model.rows) if (row.local && rowMatches(row)) focal.add(row.issueNumber);
      const include = (number) => { if (visible.has(number)) return; visible.add(number); for (const dependency of rowsByNumber.get(number).dependencies) include(dependency); };
      for (const number of focal) include(number);
    } else for (const row of model.rows) visible.add(row.issueNumber);
    for (const card of document.querySelectorAll('[data-dependency-card]')) { const number = Number(card.dataset.issueNumber); card.hidden = !visible.has(number); card.classList.toggle('context', hasFocusCriteria && visible.has(number) && !focal.has(number)); }
    for (const stage of document.querySelectorAll('[data-stage-level]')) stage.hidden = !Array.from(stage.querySelectorAll('[data-dependency-card]')).some((card) => !card.hidden);
    document.getElementById('independent-section').hidden = !Array.from(document.querySelectorAll('[data-independent="true"]')).some((card) => !card.hidden);
    document.getElementById('dependency-empty').hidden = visible.size !== 0;
  };
  const applyCycles = () => {
    let visible = 0;
    for (const card of document.querySelectorAll('[data-cycle-card]')) { let count = 0, active = 0, pending = 0; for (const item of card.querySelectorAll('[data-cycle-row]')) { const row = rowsByNumber.get(Number(item.dataset.issueNumber)); const matches = rowMatches(row); item.hidden = !matches; if (matches) { count++; visible++; if (row.local.localStatus === 'in_progress') active++; if (row.local.localStatus === 'pending') pending++; } } card.hidden = count === 0; card.querySelector('[data-cycle-in-progress]').textContent = String(active); card.querySelector('[data-cycle-pending]').textContent = String(pending); }
    document.getElementById('cycle-empty').hidden = visible !== 0;
  };
  const applyStatus = () => {
    let visible = 0;
    for (const lane of document.querySelectorAll('[data-status-lane]')) { let count = 0; for (const item of lane.querySelectorAll('[data-status-row]')) { const row = rowsByNumber.get(Number(item.dataset.issueNumber)); const matches = rowMatches(row); item.hidden = !matches; if (matches) { count++; visible++; } } lane.hidden = count === 0; }
    document.getElementById('status-empty').hidden = visible !== 0;
  };
  const setView = (view, save = true) => { preferences.view = view; for (const tab of tabs) { const selected = tab.dataset.view === view; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected; } if (save) persist(); };
  const render = () => { applyColumns(); applyTable(); applyDependencyFocus(); applyCycles(); applyStatus(); setView(preferences.view, false); };
  const updateFilters = () => { preferences.filters = { query: query.value, issueState: issueState.value, localStatus: localStatus.value, cycleId: cycle.value, scope: scope.value }; const preset = selectedPreset(); if (preset && !filtersEqual(preferences.filters, preset.filters)) preferences.selectedSavedFilter = null; syncPresetOptions(); render(); persist(); };
  for (const input of [query, issueState, localStatus, cycle, scope]) input.addEventListener(input === query ? 'input' : 'change', updateFilters);
  for (const input of toggleInputs) input.addEventListener('change', () => { const name = input.dataset.columnToggle; preferences.visibleColumns = columnNames.filter((column) => column === 'issue' || (column === name ? input.checked : preferences.visibleColumns.includes(column))); applyColumns(); persist(); });
  controls.addEventListener('toggle', () => { preferences.controlsOpen = controls.open; persist(); });
  for (const tab of tabs) { tab.addEventListener('click', () => setView(tab.dataset.view)); tab.addEventListener('keydown', (event) => { const index = tabs.indexOf(tab); let target = null; if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = tabs[(index + 1) % tabs.length]; if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = tabs[(index + tabs.length - 1) % tabs.length]; if (event.key === 'Home') target = tabs[0]; if (event.key === 'End') target = tabs[tabs.length - 1]; if (target) { event.preventDefault(); target.focus(); target.click(); } }); }
  document.getElementById('clear-filters').addEventListener('click', () => { preferences.filters = defaultFilters(); preferences.selectedSavedFilter = null; syncControls(); render(); persist(); });
  document.getElementById('save-filter').addEventListener('click', () => { const name = filterName.value.trim(); if (name.length < 1 || name.length > 40) { saveError.textContent = 'Filter 名稱須為 1–40 字。'; return; } saveError.textContent = ''; const preset = { name, filters: cloneFilters(preferences.filters) }; const index = preferences.savedFilters.findIndex((item) => item.name === name); if (index === -1) preferences.savedFilters.push(preset); else preferences.savedFilters[index] = preset; preferences.selectedSavedFilter = name; syncPresetOptions(); persist(); });
  savedSelect.addEventListener('change', () => { preferences.selectedSavedFilter = savedSelect.value || null; syncPresetOptions(); persist(); });
  applyButton.addEventListener('click', () => { const preset = selectedPreset(); if (!preset) return; preferences.filters = cloneFilters(preset.filters); syncControls(); render(); persist(); });
  deleteButton.addEventListener('click', () => { if (!preferences.selectedSavedFilter) return; preferences.savedFilters = preferences.savedFilters.filter((preset) => preset.name !== preferences.selectedSavedFilter); preferences.selectedSavedFilter = null; syncPresetOptions(); persist(); });
  syncControls(); render();
})();
  </script>
</body>
</html>`;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('DEV_HUB_OVERVIEW_USAGE: 只接受可選的 --check。');
  const inputDirectory = resolve(process.cwd(), '.dev-hub/overview');
  const outputPath = resolve(inputDirectory, 'index.html');
  const html = renderDevHubOverviewHtml(await loadDevHubOverview(inputDirectory));
  if (args[0] === '--check') {
    let currentOutput: Buffer;
    try { currentOutput = await readFile(outputPath); } catch { throw new Error('DEV_HUB_OVERVIEW_STALE: 找不到 index.html；請執行 npm run dev-hub:overview。'); }
    if (!currentOutput.equals(Buffer.from(html, 'utf8'))) throw new Error('DEV_HUB_OVERVIEW_STALE: 請執行 npm run dev-hub:overview 重新產生 .dev-hub/overview/index.html。');
    return;
  }
  await writeFile(outputPath, html, 'utf8');
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'DEV_HUB_OVERVIEW_ERROR: 無法產生 overview。'); process.exitCode = 1; });
}
