---
title: "Ch6: Agent Workspace (Quick Recap)"
aliases:
  - OpenClaw/ch6-workspace
  - OpenClaw/workspace-recap
---

Purpose: quick understanding of the OpenClaw workspace as the agent's home, memory surface, and daily operating directory.
![[workspace.png]]

Overview: this diagram presents the workspace as one operating hub with three internal file groups: **Identity & Behavior** (`AGENTS.md`, `SOUL.md`, `IDENTITY.md`), **Context & Operations** (`USER.md`, `TOOLS.md`, `BOOT.md/HEARTBEAT.md`), and **Memory** (`memory/YYYY-MM-DD.md`, `MEMORY.md`). It also emphasizes hard exclusions (secrets, `openclaw.json`, session transcripts), clarifies that workspace is default `cwd` rather than a strict sandbox unless `agents.defaults.sandbox` is enabled, and shows backup flow via a private Git repo plus migration cleanup.

## One-Screen Summary

| Topic | Recap |
| --- | --- |
| What is Workspace | Agent home for file tools, context files, and memory files |
| Default path | `~/.openclaw/workspace` |
| Profile path | `~/.openclaw/workspace-<profile>` |
| Sandbox default | Not a hard sandbox by default; primarily default `cwd` |
| Critical boundary | Workspace is not config/secrets storage |

## 1. Core Concept and Location

The workspace is where the agent reads/writes working files and memory.

- Default: `~/.openclaw/workspace`
- Profile mode: `~/.openclaw/workspace-<profile>`

Sandboxing reminder:

- Without `agents.defaults.sandbox`, workspace acts as default working directory, not strict containment.
- Relative paths are workspace-oriented, but absolute paths may still escape workspace unless sandboxing is enabled.

## 2. Workspace File Map (The "Brain" Files)

Use this as the practical map of what each file does.

| Group | File | Purpose |
| --- | --- | --- |
| Identity and behavior | `AGENTS.md` | Operating instructions, rules, priorities |
| Identity and behavior | `SOUL.md` | Persona, tone, boundaries |
| Identity and behavior | `IDENTITY.md` | Agent name and baseline identity |
| Context and operations | `USER.md` | User profile and interaction preferences |
| Context and operations | `TOOLS.md` | Tool usage guidance and conventions |
| Context and operations | `BOOT.md` / `HEARTBEAT.md` | Optional startup/heartbeat checklists |
| Memory | `memory/YYYY-MM-DD.md` | Daily append-only memory log |
| Memory | `MEMORY.md` (optional) | Curated long-term memory (private sessions) |

Practical reading behavior:

- Agent commonly reads "today + yesterday" from daily memory logs at startup.

## 3. Security and Exclusions (Critical)

Do not treat workspace as secret storage.

| Keep OUT of workspace | Why |
| --- | --- |
| API keys, OAuth tokens, passwords | Workspace is often backed up/versioned |
| `openclaw.json` | Config belongs in state/config area, not memory workspace |
| Session transcripts (`~/.openclaw/agents/...`) | Operational logs, separate lifecycle and sensitivity |

Rule:

- If it is a secret or runtime control file, do not put it in workspace Markdown.

## 4. Backup and Maintenance

Treat workspace as private memory state you can move across machines.

| Task | Recommended Action |
| --- | --- |
| Backup | Initialize a private Git repo for workspace |
| Migration | Clone repo on new machine and point `agents.defaults.workspace` to it |
| Hygiene | Avoid extra duplicate workspace folders that create active-state confusion |

## Quick Operator Checklist

1. Confirm active workspace path in config/profile
2. Confirm key brain files exist (`AGENTS.md`, `SOUL.md`, `USER.md`)
3. Confirm memory files are being appended (`memory/YYYY-MM-DD.md`)
4. Confirm secrets are not stored in workspace
5. Confirm backup/migration path is tested

## Fast Mental Model

- Workspace = editable memory + operating instructions
- Config = gateway/runtime settings
- Sessions = conversation logs

Keep these three surfaces separate to avoid most operational mistakes.
