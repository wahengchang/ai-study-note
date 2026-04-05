# Content Taxonomy

> Canonical source of truth for folder structure, tag vocabulary, and placement rules in `content/`. The `@content-ops` agent reads this file to classify new notes and audit existing ones.
>
> **If you need a new folder or tag that is not in this file, update this file first.** Adding a tag in a note without updating the taxonomy is drift.

## 1. Folder hierarchy

Every top-level folder under `content/` has a single purpose. A new note belongs in exactly one folder.

| Folder | Purpose | Contains |
|---|---|---|
| `content/claude-code/` | Claude Code as a product — its CLI, config, plugins, hooks, agent teams, frameworks | Product guides, tool deep-dives, plugin usage |
| `content/openclaw/` | OpenClaw agent framework — architecture, operations, skills | Architecture chapters, FAQ deep dives, SOPs, skill definitions |
| `content/prompt-notes/` | Prompt engineering research and reusable prompt templates | Prompting research notes, reusable prompt template sets |
| `content/setup-env/` | Environment and development tooling setup | Install guides, OS setup, dev tool configuration |
| `content/seo-and-geo/` | SEO and Generative Engine Optimization strategy | Strategy playbooks, frameworks, tactic notes |
| `content/assets/` | Static assets — images, PDFs, diagrams | Binary files only; never Markdown notes |

### Approved subfolders

| Subfolder | Purpose |
|---|---|
| `claude-code/tools-and-skills/` | Notes about specific plugins, hooks, channels, and skill frameworks |
| `openclaw/common-questions/` | FAQ-style deep dives answering one specific question |
| `openclaw/instruction-notes/` | Operational SOPs and runbooks |
| `openclaw/skill-notes/<skill>/` | A skill-definition package: `skill.md` + optional `references/`, `scripts/` |
| `prompt-notes/gemini-prompts/` | Reusable Gemini prompt templates organized by business role |

### Rule: when to create a new folder

Do **not** create a new top-level folder unless **all three** conditions are met:

1. The topic is distinct from every existing folder (not a sub-aspect of one)
2. You have **at least 3 notes** to put in it immediately
3. You can write a one-line purpose statement that fits in the table above

Single-note folders are allowed only if the topic is expected to grow and no existing folder fits. `seo-and-geo/` is the only grandfathered single-note folder.

## 2. Tag vocabulary

Tags are **closed vocabulary**. The content-ops agent rejects tags not listed here. Adding a new tag requires updating this file in a separate commit with a rationale.

Tags have three dimensions. **Every note must include one Type tag and one or more Subject tags.** Tech tags are optional.

### Dimension A — Type (pick exactly one)

What kind of document is this?

| Tag | When to use |
|---|---|
| `guide` | Procedural how-to with steps; reader follows along |
| `reference` | Lookup material — cheat sheets, schemas, chapter-style deep dives |
| `research` | Pure summary of an external source (PDF, article, GitHub repo, video) with no step-by-step instructions. If the note has a how-to structure, use `guide` instead and capture the source in `description`. |
| `sop` | Formalized standard operating procedure; process with owners and handoffs |
| `playbook` | Multi-step strategic framework across time |
| `faq` | Single-question deep dive in question → answer format |
| `template` | Reusable snippet, prompt, or config meant to be copy-pasted |
| `skill-definition` | `skill.md` file defining a packaged skill for an agent runtime |

### Dimension B — Subject (pick one or more)

What is the note about?

| Tag | When to use |
|---|---|
| `claude-code` | Claude Code product, CLI, config, plugins, hooks |
| `openclaw` | OpenClaw framework internals and operations |
| `prompt-engineering` | Prompt design, patterns, prompt frameworks |
| `agent-architecture` | Agent system design — loops, memory, routing (tool-agnostic) |
| `multi-agent` | Multi-agent coordination and team patterns |
| `automation` | Workflow automation, schedulers, cron, task orchestration |
| `devops` | Environment setup, installs, OS/shell configuration |
| `seo` | SEO and Generative Engine Optimization strategy |

### Dimension C — Tech (optional, pick zero or more)

Does the note center on a specific product or technology? Only add when the note would be meaningfully harder to find without it.

| Tag | When to use |
|---|---|
| `gemini` | Google Gemini |
| `telegram` | Telegram integration |
| `n8n` | n8n workflow automation |
| `tmux` | tmux terminal multiplexer |
| `mcp` | Model Context Protocol |
| `airtable` | Airtable API |
| `minimax` | MiniMax API |

### Banned tags

These were found in existing notes and must be migrated away from. The agent will normalize them.

| Old tag | Replacement | Reason |
|---|---|---|
| `AI`, `ai` | *(drop)* | Every note is about AI; no signal |
| `prompting` | `prompt-engineering` | Synonym |
| `tutorial` | `guide` | Synonym |
| `Gemini`, `GEMINI` | `gemini` | Casing |
| `HR`, `SEO`, `GEO` | lowercase / drop | Casing; folder already encodes role |
| `admin`, `sales`, `marketing`, `hr`, `executives`, `customer-service`, `communications`, `project-management` | *(drop)* | Folder name already encodes role |
| `數位行銷` | `seo` or drop | Chinese one-off; not in vocabulary |
| `harness-framework`, `agent` | `agent-architecture` | Consolidate |
| `tools` | *(drop, use folder)* | Not discriminating |
| `context-window`, `memory` | `agent-architecture` | Sub-aspect of architecture |
| `workspace` | `openclaw` | OpenClaw-specific concept |
| `google-workspace` | `gemini` | Product facet, already has gemini |
| `plugin` | *(drop, use folder)* | Folder `tools-and-skills/` already encodes it |
| `routing` | `multi-agent` | Sub-aspect |

## 3. Frontmatter schema

Every note requires this frontmatter block:

```yaml
---
title: "Note Title"                    # required, human-readable, may contain non-ASCII
description: "One-line description"    # required, English, under 120 chars
tags:                                  # required, YAML list format (not inline)
  - <type>                             # exactly one from Dimension A
  - <subject>                          # one or more from Dimension B
  - <tech>                             # optional, zero or more from Dimension C
---
```

### Rules
- Use YAML list format (`- item`), not inline (`[a, b]`) — consistency keeps diffs clean
- Indent with exactly 2 spaces
- Tags are lowercase kebab-case, no quotes
- `title` may be Chinese or English; `description` should be English for searchability, max 120 chars
- **Index files** (`index.md`) are navigational and exempt from the Subject tag requirement. They need only `title` and Type tag `reference`. Description is optional.
- **Skill definition files** (`content/openclaw/skill-notes/<skill>/skill.md`) use a hybrid schema: runtime fields (`name`, `metadata.*`) are kept for the agent runtime, AND the Quartz-required `title` field is added alongside them. Their `tags` list contains only `openclaw` + `skill-definition` — runtime config keys are not tags.

## 4. Naming rules

- Files: `kebab-case.md`, no spaces, no underscores, no capitals
- Max 60 chars in filename (including `.md`)
- Prefix chapter series with `ch<N>-` (e.g., `ch1-architecture-four-pillars.md`)
- Prefix setup guides with `setup-` (e.g., `setup-nodejs-macbook.md`)
- Avoid redundant prefixes that duplicate the folder (`claude-code/claude-code-hooks.md` → just `hooks-guide.md`)

## 5. Placement decision tree

When a new note arrives, the content-ops agent follows this tree:

```
Is it primarily about Claude Code (CLI, config, plugins)?
├── yes → claude-code/
│         ├── Is it about a specific plugin/hook/skill framework?
│         │   └── yes → claude-code/tools-and-skills/
│         └── no  → claude-code/
└── no  → Is it about OpenClaw framework internals?
          ├── yes → openclaw/
          │         ├── Architecture chapter (chN-...)? → openclaw/
          │         ├── FAQ / single question deep dive? → openclaw/common-questions/
          │         ├── Operational SOP? → openclaw/instruction-notes/
          │         └── Packaged skill with skill.md? → openclaw/skill-notes/<skill>/
          └── no  → Is it prompt engineering research or a template?
                    ├── yes → prompt-notes/
                    │         └── Reusable role-based Gemini prompt? → prompt-notes/gemini-prompts/
                    └── no  → Is it environment / install / dev tool setup?
                              ├── yes → setup-env/
                              └── no  → Is it SEO / marketing strategy?
                                        ├── yes → seo-and-geo/
                                        └── no  → STOP and ask user — do not guess
```

If the tree yields "STOP and ask," the agent must not invent a new folder. It reports the ambiguity and lets the user decide.

## 6. Index files

Every top-level folder (except `assets/`) has an `index.md` that:
- Has `title` and tag `reference`
- Lists every note in the folder (and immediate subfolders) as wikilinks
- Briefly explains the folder's scope

The content-ops agent regenerates index files when notes are added, moved, or renamed.

## 7. Change control

Updating this taxonomy is itself a deliberate act:
- Add a new tag → update this file in its own commit; `@content-ops` audit is run after
- Add a new folder → all three conditions in §1 must be met; update this file first
- Retire a tag → add it to "Banned tags" with a replacement; run migration audit
