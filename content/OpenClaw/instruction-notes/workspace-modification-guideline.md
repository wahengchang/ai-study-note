# Workspace Modification Guideline (OpenClaw)

## 1. Purpose

This document is a reusable team guideline for safely modifying OpenClaw files in this repository, with focus on:

1. `workspace*` content (agent behavior/context files and workspace-scoped skills)
2. `agents/*/agent` runtime agent settings
3. platform config (`openclaw.json`)
4. scheduled automation (`cron/jobs.json`)

Use this as the default operating procedure for team edits.

---

## 2. High-Level Architecture

### 2.1 Component map

| Layer | Primary Path(s) | Role | Change Frequency |
| --- | --- | --- | --- |
| Control Plane | `openclaw.json` | Global system config (agents, bindings, channels, gateway, plugins) | Medium |
| Agent Runtime Profiles | `agents/*/agent/auth-profiles.json` | Per-agent auth profile mapping and usage state | Low |
| Workspace Persona/Context | `workspace*/AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, etc. | Agent behavior/persona conventions | High |
| Workspace Skills | `workspace*/skills/*/SKILL.md` | Agent capabilities and execution instructions | Medium |
| Scheduler | `cron/jobs.json` | Timed background jobs and delivery policy | Medium |

### 2.2 Runtime relation

| Question | Source of truth |
| --- | --- |
| Which agent exists and where it runs | `openclaw.json > agents.list[]` |
| Which workspace an agent uses | `openclaw.json > agents.list[].workspace` |
| Which channels/messages route to which agent | `openclaw.json > bindings[]` and `channels.*` |
| Agent-specific auth profile availability | `agents/<agent-id>/agent/auth-profiles.json` |
| What the agent should do in that workspace | `workspace*/AGENTS.md`, `SOUL.md`, `HEARTBEAT.md`, `USER.md` |
| Which extra tools/skills agent can use | `workspace*/skills/*/SKILL.md` (plus shared/global skills if present) |
| Periodic tasks | `cron/jobs.json` |

---

## 3. How Workspace / Agents / Skills Work

### 3.1 Workspaces

Each top-level workspace (`workspace/`, `workspace-dev/`, `workspace-gg-helper/`) is a behavioral context package.

| File | Responsibility | Notes |
| --- | --- | --- |
| `AGENTS.md` | Session boot rules, safety, heartbeat policy | Core operating contract |
| `SOUL.md` | Behavior philosophy and boundaries | Persona constitution |
| `USER.md` | Human profile and preferences | Update with care |
| `TOOLS.md` | Environment-specific notes | Keep infra-specific data here |
| `HEARTBEAT.md` | Lightweight periodic checklist | Keep minimal to reduce token burn |
| `.openclaw/workspace-state.json` | Workspace bootstrap state metadata | System state, not narrative content |

### 3.2 Agents

Global agent registration is controlled in `openclaw.json`. Agent runtime auth profile files are under `agents/<id>/agent/`.

| Item | Behavior |
| --- | --- |
| `agents.list[].id` | Agent identity key used by bindings, cron, and routing |
| `agents.list[].workspace` | Selects which workspace files and workspace skills are used |
| `agents.list[].agentDir` | Agent runtime directory (auth/session related) |
| `subagents.allowAgents` | Explicit allowlist for delegating/using sub-agents |
| `groupChat` | Mention patterns/history behavior in group channels |

### 3.3 Skills

Skills are instruction bundles defined by `SKILL.md`.

| Principle | Practical impact |
| --- | --- |
| Skill identity is defined by `SKILL.md` metadata/frontmatter | Folder name alone does not define effective skill identity |
| Workspace skills are per-workspace overrides | A skill in `workspace*/skills/` applies to agents using that workspace |
| Scope precedence matters | Workspace-level skill can override lower-precedence shared/bundled versions with same name |
| Eligibility != discovery | Missing binary/env/config dependencies can make a discovered skill unusable |

---

## 4. Change Policy by File Type

### 4.1 Safe-to-edit matrix

| File Type | Typical Owner | Risk | Validation Required |
| --- | --- | --- | --- |
| `workspace*/**/*.md` | Prompt/agent designers | Low-Medium | Markdown sanity + section intent review |
| `workspace*/skills/*/SKILL.md` | Tooling/automation devs | Medium | Metadata + dependency checks |
| `cron/jobs.json` | Automation owner | Medium-High | JSON validity + schedule correctness + target agent/channel |
| `openclaw.json` | Tech lead/platform owner | High | JSON validity + routing/auth/channel impact review |
| `agents/*/agent/auth-profiles.json` | Platform/auth owner | High | JSON validity + profile key consistency |

### 4.2 Do-not-break rules

1. Never commit or expose secrets/tokens in docs or PR discussion.
2. Do not rename `agents.list[].id` casually; bindings/cron may break.
3. Do not change workspace paths in `openclaw.json` without confirming directory existence.
4. Keep `HEARTBEAT.md` concise; avoid large prompts in heartbeat context.
5. Keep `cron/jobs.json` payload prompts deterministic and explicit about tools/outputs.
6. Treat auth profile files as sensitive runtime config, not general docs.

---

## 5. Standard Workflow for Team Edits

### 5.1 Pre-change checklist

| Step | Action | Command Example |
| --- | --- | --- |
| 1 | Confirm target files and owner | `rg --files workspace* agents cron` |
| 2 | Inspect impacted configs | `rg -n "<agentId|workspace|skill-name>" openclaw.json cron/jobs.json` |
| 3 | Create small scoped change plan | One component at a time |

### 5.2 Edit checklist

| Component | Required checks while editing |
| --- | --- |
| Workspace markdown files | Keep sections consistent with `setup-new-agent.md` structure map |
| Skills (`SKILL.md`) | Verify name/description/dependencies and trigger clarity |
| `openclaw.json` | Validate agent IDs, bindings, channel settings, gateway constraints |
| `cron/jobs.json` | Validate `agentId`, schedule (`expr`, `tz`), payload target channel |
| Auth profile JSON | Preserve key structure (`version`, `lastGood`, `profiles`, `usageStats`) |

### 5.3 Post-change validation

| Check | Command |
| --- | --- |
| JSON syntax | `jq . openclaw.json >/dev/null` |
| Cron syntax file validity | `jq . cron/jobs.json >/dev/null` |
| Agent auth profile syntax | `for f in agents/*/agent/auth-profiles.json; do jq . "$f" >/dev/null; done` |
| Fast diff review | `git diff -- <paths>` |

---

## 6. Change Patterns (Reusable)

### Pattern A: Update agent behavior in one workspace

1. Edit `workspace-<target>/AGENTS.md`, `SOUL.md`, `HEARTBEAT.md` as needed.
2. Keep persona (`IDENTITY.md`) and user profile (`USER.md`) coherent.
3. Validate markdown readability and section consistency.

### Pattern B: Add/modify a workspace skill

1. Create/update `workspace-<target>/skills/<skill-name>/SKILL.md`.
2. Ensure metadata name/description clearly express trigger conditions.
3. Document dependency requirements (bin/env/config).
4. If skill name collides with shared/bundled skill, confirm override is intentional.

### Pattern C: Add/modify an agent in platform config

1. Update `openclaw.json > agents.list[]`.
2. Set `workspace` and `agentDir` paths correctly.
3. Add or update `bindings[]` if routing is needed.
4. Revalidate JSON and impacted cron jobs referencing `agentId`.

### Pattern D: Modify scheduled jobs

1. Edit `cron/jobs.json` target job entry.
2. Confirm `agentId` exists in `openclaw.json`.
3. Confirm schedule timezone and expression match business expectation.
4. Confirm payload prompt references valid skill paths/commands.

---

## 7. Collaboration Rules (Tech Lead Baseline)

| Rule | Why |
| --- | --- |
| Prefer small, atomic PRs by component | Easier rollback and lower blast radius |
| Include “impact scope” in PR description | Makes cross-agent effects explicit |
| Keep config and content changes separate when possible | Simplifies review and incident triage |
| Require at least one platform-aware reviewer for `openclaw.json`, `cron/jobs.json` | Reduces production routing/scheduling risk |
| Record non-obvious decisions in workspace docs | Preserves team context for future edits |

Recommended PR sections:

1. Intent
2. Files changed
3. Runtime impact
4. Validation performed
5. Rollback plan

---

## 8. Common Failure Modes

| Failure | Root Cause | Prevention |
| --- | --- | --- |
| Agent stops receiving expected messages | `bindings` mismatch or `agentId` typo | Validate `agentId` references across files |
| Scheduled job runs on wrong agent | `cron/jobs.json` `agentId` mismatch | Cross-check with `openclaw.json` |
| Skill appears but cannot execute | Missing dependency (bin/env/config) | Declare prerequisites inside `SKILL.md` |
| Sensitive data leakage | Editing/token exposure in config/docs | Redact secrets and restrict file visibility in reviews |
