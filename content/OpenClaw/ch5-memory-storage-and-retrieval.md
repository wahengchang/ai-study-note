---
title: "Ch5: Memory (Storage, Search, and Retrieval)"
aliases:
  - OpenClaw/ch5-memory
  - OpenClaw/memory
---

This chapter explains how OpenClaw memory works in practice: what is persisted to disk, when memory is written, how search works, and how to tune retrieval safely.
![[memory.png]]

Overview: this diagram shows a full Markdown-first memory pipeline with four parts. **Write Cycle** captures durable facts (including silent pre-compaction flush and append-only daily logs), **Source of Truth** stores memory in local workspace Markdown files (`memory/YYYY-MM-DD.md` and `MEMORY.md`), **Indexing & Retrieval Engine** keeps a searchable index using hybrid retrieval (vector + BM25) with watcher-driven background sync, and **Read Cycle** exposes recall through `memory_search` (semantic snippets) and `memory_get` (targeted file reads). The backend comparison at the bottom highlights the tradeoff between built-in SQLite speed/integration and experimental QMD sidecar flexibility.

## Analysis

Use this as the core model before changing memory settings.

| Finding | Why It Matters |
| --- | --- |
| Memory source of truth is Markdown on disk | If it is not written to files, it is not durable memory |
| Context and memory are separate systems | Memory can exist without being in the active model window |
| Search quality depends on backend + embeddings + indexing freshness | Most "memory misses" are retrieval/config issues, not model issues |
| Compaction can lose unstored context | Memory flush before compaction protects durable facts |

Core rule:

- If the user says "remember this", write to memory files, not just chat history.

## Plan

This chapter follows the same order operators use in production.

1. Define memory files and write policy
2. Explain automatic memory flush before compaction
3. Explain memory search backends and provider selection
4. Explain retrieval tools and index lifecycle
5. Cover advanced options (hybrid, cache, session memory, sqlite-vec)
6. Provide troubleshooting checklist

## Memory Files (Markdown)

OpenClaw memory is workspace-first and file-based.

| File | Role | Load Behavior |
| --- | --- | --- |
| `memory/YYYY-MM-DD.md` | Daily append-only log | Typically reads today + yesterday at session start |
| `MEMORY.md` (optional) | Curated long-term memory | Main private session only; not group contexts |

Workspace root:

- `agents.defaults.workspace` (default `~/.openclaw/workspace`)

Write policy:

- Durable preferences, decisions, stable facts -> `MEMORY.md`
- Day-to-day running notes -> `memory/YYYY-MM-DD.md`

## Automatic Memory Flush (Pre-Compaction)

Before auto-compaction, OpenClaw can run a silent reminder turn so the agent stores durable facts.

| Setting | Meaning |
| --- | --- |
| `agents.defaults.compaction.memoryFlush.enabled` | Enable memory flush reminder |
| `softThresholdTokens` | Trigger when session nears compaction reserve |
| `systemPrompt` + `prompt` | Reminder text for flush turn |
| One flush per cycle | Tracked per compaction cycle in session state |

Important behavior:

- Default prompt encourages `NO_REPLY`, so users usually do not see this turn.
- Flush is skipped if workspace is read-only or inaccessible (`workspaceAccess: "ro"`/`"none"`).

## Memory Search Backends

OpenClaw supports two retrieval engines.

| Backend | Status | Notes |
| --- | --- | --- |
| Built-in (`memory-core`) | Default | SQLite-based index/search over Markdown memory |
| `qmd` | Experimental | Local sidecar, BM25 + vector + rerank, Markdown still source of truth |

Disable memory plugins completely:

- `plugins.slots.memory = "none"`

## Embedding Provider Selection (Built-in Search)

If provider is not explicitly set, OpenClaw auto-selects in this order.

1. `local` (if local model path exists)
2. `openai` (if key available)
3. `gemini` (if key available)
4. `voyage` (if key available)
5. disabled until configured

Notes:

- Configure under `agents.defaults.memorySearch` (not top-level `memorySearch`).
- Codex OAuth for chat/completions does not automatically satisfy embeddings.
- Remote embeddings require provider API keys.

## Memory Tools

These tools are the primary retrieval interface.

| Tool | What It Returns |
| --- | --- |
| `memory_search` | Snippets + path + line range + score + provider/model metadata |
| `memory_get` | File content for allowed memory paths |

Guardrails:

- `memory_get` rejects paths outside `MEMORY.md` / `memory/` scope.
- `memory_search` returns snippets, not full file payloads.

## What Gets Indexed and When

Index lifecycle determines freshness and recall.

| Aspect | Behavior |
| --- | --- |
| Indexed content | Markdown memory files (`MEMORY.md`, `memory/**/*.md`) |
| Store | Per-agent SQLite store (configurable path) |
| Freshness | File watcher marks index dirty; sync happens on start/search/interval |
| Reindex triggers | Provider/model/endpoint/chunking fingerprint changes |

Chunking behavior (default intent):

- Chunk target around ~400 tokens with overlap for better semantic continuity.

## QMD Backend (Experimental)

Use QMD when you want local-first hybrid retrieval and sidecar-managed indexing.

| Topic | Key Point |
| --- | --- |
| Enablement | `memory.backend = "qmd"` |
| Runtime | Gateway shells out to `qmd` binary on `PATH` |
| Data home | Isolated under `~/.openclaw/agents/<agentId>/qmd/` |
| Update loop | Boot + interval refresh (`memory.qmd.update.*`) |
| Fallback | If QMD fails, OpenClaw falls back to built-in manager |

Operational caveats:

- First query may be slow due to model downloads/warmup.
- Requires local prerequisites (Bun, SQLite extension support, etc.).

## Search Quality Features

These options improve retrieval relevance and indexing cost.

| Feature | Benefit |
| --- | --- |
| Hybrid search (BM25 + vector) | Better exact-token + semantic recall balance |
| Embedding cache | Avoid re-embedding unchanged chunks |
| sqlite-vec acceleration | Faster vector distance queries in SQLite |
| Session memory search (experimental) | Optional recall over session transcripts |

Hybrid scoring concept:

- Candidate union from vector + BM25
- Weighted merge (normalized vector/text weights)
- Falls back gracefully if either side is unavailable

## Scope, Citations, and Safety

Use these controls to avoid leaking memory in the wrong channels.

| Control | Purpose |
| --- | --- |
| `memory.qmd.scope` | Allow/deny retrieval by chat type or key prefix |
| `memory.citations` (`auto`/`on`/`off`) | Control source path footer in snippets |
| Session indexing isolation | Per-agent boundaries reduce cross-agent bleed |

Practical note:

- Disk access remains the trust boundary for transcript files.

## Minimal Config Patterns

### Built-in search with OpenAI embeddings

```ts
agents: {
  defaults: {
    memorySearch: {
      provider: "openai",
      model: "text-embedding-3-small"
    }
  }
}
```

### Local embeddings only (no remote fallback)

```ts
agents: {
  defaults: {
    memorySearch: {
      provider: "local",
      local: { modelPath: "hf:.../model.gguf" },
      fallback: "none"
    }
  }
}
```

### QMD backend enabled

```ts
memory: {
  backend: "qmd",
  qmd: {
    includeDefaultMemory: true,
    update: { interval: "5m", debounceMs: 15000 }
  }
}
```

## Operator Troubleshooting Checklist

1. Confirm memory plugin/backend is enabled (`memory-core` or `qmd`)
2. Confirm workspace path and memory files exist
3. Confirm embedding provider/key resolution
4. Run `memory_search` and inspect backend/provider metadata
5. Check index freshness (watcher/sync/reindex triggers)
6. If using QMD, verify `qmd` binary and sidecar health
7. If results are empty in channels, verify scope allow/deny rules

## Practical Defaults Recommendation

- Start with built-in memory search and remote embeddings.
- Keep memory files small and curated.
- Enable hybrid search for mixed natural-language and exact-token queries.
- Introduce QMD only when you need its retrieval pipeline and can operate sidecar dependencies.
