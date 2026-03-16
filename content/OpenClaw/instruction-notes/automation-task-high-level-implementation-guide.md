---
title: Automation Task — High-level Implementation Guide
---

## Purpose

This note defines the high-level design principles for **automation workflow scripts**.

A typical run should:

1. Discover candidate content from external sources
2. Use AI services for analysis
3. Produce structured outputs and a human-readable report

The script should stay **lightweight, clear, and easy to maintain**.

## Core Workflow Model

Each execution should complete **one full workflow cycle**:

1. Get input signal (`keyword` / `topic` / `seed`)
2. Discover candidates via external tools
3. Filter already-processed items
4. Analyze a small batch of new items with AI
5. Save outputs and update state

This keeps execution predictable, debuggable, and safe to re-run.

## Tool Ecosystem and Role Boundaries

Node.js script is the **orchestrator**, not the implementation center for every function.

| Type | Interface | Primary Purpose | Backing Service |
| --- | --- | --- | --- |
| Discovery | `yt-dlp` | Search YouTube and fetch candidate metadata | YouTube |
| Discovery | `webhook Text2Text` | Generate keywords / run web search | Gemini Web Search |
| Analysis | `webhook Text2Text` | Analyze items, summarize, extract insights | Gemini AI |
| Template Rewrite | `webhook Text2Text` | Rewrite analysis into target template | Gemini AI |

Design intent:
- Keep AI orchestration external (e.g., n8n)
- Keep Node.js workflow code simple
- Allow AI backend upgrades without script rewrites

## Prompt Template Strategy

Use a **centralized fixed prompt template** for analysis.

Typical variables:

```text
title
source
date
url
context
```

Prompt template should define:
- What is being analyzed
- Which metadata is available
- Required output format
- Output language
- Analysis focus

### Why this matters

A clear prompt structure improves:
- Output stability
- Consistency across runs
- Maintainability of future prompt changes

> Principle: **Prompt structure must exist in one place only.**

## Local State as Dedup Core

Use a local state file to preserve run memory and prevent duplicate processing.

State usually stores:
- Processed item IDs / URLs
- Execution timestamps
- Last keyword/topic
- Last run summaries/results

State is the core of reliable deduplication.

## Output Separation Principle

Store machine state and human report separately:
- **Machine state**: JSON (for workflow memory and dedup)
- **Human report**: Markdown (for review and sharing)

## Architecture Principles

| Responsibility | Owner |
| --- | --- |
| Content discovery | `yt-dlp` / web search |
| AI analysis | Gemini AI / webhook |
| Flow control | Node.js script |
| State memory | State file |
| Human-readable output | Markdown report |

The orchestrator should coordinate steps, not accumulate heavy business logic.

## Optimization Philosophy

Prioritize:
- Readability
- Predictability
- Dedup safety
- Maintainability
- Clear outputs

Do not over-prioritize:
- High concurrency
- Over-abstraction
- Premature micro-optimizations
- Complex architecture for simple workflows

These scripts are **workflow drivers**, not high-performance backends.

## Recommended Script Layout

1. Config and constants
2. Prompt template(s)
3. Helper functions
4. Main flow in `main()`

`main()` should read like a workflow checklist.

## Main Workflow Checklist

```javascript
async function main() {
  // Step 1 — load state
  const state = loadState()

  // Step 2 — resolve external services
  const services = resolveServices()

  // Step 3 — fetch input signal
  const signal = await fetchInputSignal(services)

  // Step 4 — discover candidate items
  const discoveredItems = await discoverItems(signal)

  // Step 5 — normalize data
  const normalizedItems = normalizeItems(discoveredItems)

  // Step 6 — filter seen items
  const newItems = filterSeen(normalizedItems, state)

  // Step 7 — select items to analyze
  const selectedItems = selectItems(newItems)

  // Step 8 — build prompts
  const prompts = buildPrompts(selectedItems)

  // Step 9 — call AI analysis
  const analyzedResults = await analyze(prompts, services)

  // Step 10 — build human report
  const report = buildReport(signal, analyzedResults)

  // Step 11 — persist report and state
  saveReport(report)
  saveState(state, analyzedResults)

  // Step 12 — print run summary
  printRunSummary(signal, analyzedResults)
}
```

## Maintenance Rule of Thumb

If an engineer cannot understand the workflow by reading `main()`, the design is too complex.

Good design:
- `main()` tells the workflow story
- helper functions hide details
- prompt templates are centralized

Bad design:
- workflow logic scattered across files
- deep nested control flow
- fragmented prompt construction
- unclear execution order

## Team Development Standard

When building automation tasks, align on:
- Simple orchestration
- Right tool for each job
- Centralized prompt templates
- State-based dedup
- Human-readable reporting
- Workflow visibility at a glance

The code structure itself should explain the process.

## Suggested Workflow Pattern

1. Define task config
2. Resolve external services
3. Load state
4. Fetch input signal
5. Discover candidates
6. Normalize data
7. Filter seen items
8. Select analysis targets
9. Build prompts
10. Execute AI analysis
11. Build report
12. Save report and state
13. Print run summary
