---
title: How OC Discovers Skills (and Why Agents Are Related)
---

## Key Point (Read First)

- `SKILL.md` defines a **skill**, not an agent.
- OpenClaw scans skill folders and builds an eligible skill set.
- Agents are related because each agent has its own workspace, and workspace skills are per-agent.

One-line model:
- Skill discovery = load `SKILL.md` files.
- Agent routing = pick `agentId` from bindings/config.

## Overview

```mermaid
flowchart LR
  A["Gateway start or refresh"] --> B["Scan skill roots"]
  B --> C["Parse YAML frontmatter"]
  C --> D["Apply precedence and load gates"]
  D --> E["Eligible skills for each agent run"]

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb,font-size:16px;
  class A,B,C,D,E main;
```

## 1) Skill Load Locations and Precedence

| Order | Source | Why it exists |
| --- | --- | --- |
| 1 (highest) | `<workspace>/skills` | Per-agent overrides/custom skills |
| 2 | `~/.openclaw/skills` | Shared local/managed skills |
| 3 | Bundled skills | Built-in baseline shipped with OpenClaw |
| 4 (lowest) | `skills.load.extraDirs` in `~/.openclaw/openclaw.json` | Optional shared external folders |

Operational implication:

- Same skill name conflict is resolved by precedence above (workspace wins).

## 2) Why This Is Related to Agents

| Concept | What it controls |
| --- | --- |
| Skill discovery | Which skills are eligible/loaded |
| Agent routing | Which `agentId` receives inbound message |
| Agent workspace | Which `<workspace>/skills` folder is visible to that agent |

Practical rule:

- One skill can be shared by multiple agents (`~/.openclaw/skills`), while each agent can still override it in its own workspace.

## 3) CLI Commands (Skills)

Use help first, then inspect readiness:

```bash
openclaw --help
openclaw skills --help
openclaw skills list
openclaw skills check --eligible -v
openclaw skills info <skill-name>
```

Cross-check related agents:

```bash
openclaw agents --help
openclaw agents list --bindings
```

## Verification Checklist

1. Confirm skill exists in one of the load locations above.
2. Confirm `SKILL.md` frontmatter is valid (`name`, `description`).
3. Run `openclaw skills list` and verify the skill appears.
4. If missing, run `openclaw skills check -v` and inspect missing requirements.
5. If multiple copies exist, verify precedence (workspace > shared > bundled).

## Quick Troubleshooting

| Symptom | Likely Cause | First Check |
| --- | --- | --- |
| Skill does not show in list | Wrong folder or invalid `SKILL.md` | Verify path + frontmatter |
| Skill shows but not eligible | Missing env/bin/config requirement | `openclaw skills check -v` |
| Different behavior than expected | Name collision and precedence | Check duplicate skill names across roots |
| Shared skill not visible in one agent | Looking in wrong workspace/profile | Check active workspace for that `agentId` |

## Notes

- This note is about skill discovery/loading.
- Agent routing and execution gates are documented in `how-oc-routes-and-triggers-agents.md`.
