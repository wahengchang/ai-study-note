---
title: OpenClaw Five-Component Lifecycle Analysis (Bootstrap, Identity, User, Soul, Tools)
---

## Core Idea

In OpenClaw, these five components are **runtime entities with independent lifecycles**, not just static files:

1. **Bootstrap** (system bootstrap layer)
2. **Identity** (identity and routing layer)
3. **User** (user context layer)
4. **Soul** (reasoning/prompt synthesis layer)
5. **Tools** (tool execution layer)

Understanding how each one initializes, stays active, and reloads/terminates is key for performance tuning and debugging.

## 1) Lifecycle Timeline

```text
Time ------------------------------------------------------------------------------>

[1. Bootstrap] 🟢 start (openclaw gateway start) ==========================> 🔴 process exit
       |
       +--> [2. Identity] 🟢 load + memory-resident (read SKILL.md YAML) ===> 🟡 hot-reload/restart
                  |
                  +--> [3. User] 🟢 session created (channel connected) ====> 💾 JSON persisted state
                             |
                             +--> [4. Soul] 🟢 dynamic prompt synthesis ======> 🔴 destroyed per turn
                             |
                             +--> [5. Tools] ⚙️ invoked on demand ==========> 🔴 process done + heartbeat update
```

## 2) Deep Dive by Component

### 2.1 Bootstrap (System Bootstrap Layer)

- **Lifecycle span:** long-lived daemon process
- **Initialization:** triggered by `openclaw gateway start` (or daemon mode). It reads `~/.openclaw/openclaw.json` and binds a loopback port (for example `18789`).
- **Active state:** acts as a control plane and listens for requests from Pi agent runtime and external channels.
- **Termination / reload:** ends on shutdown, crash, or manual restart (`openclaw gateway restart`). This is the base container for all other component lifecycles.

### 2.2 Identity (Identity Routing Layer)

- **Lifecycle span:** application-level, mostly static in memory
- **Initialization:** after Bootstrap starts, Gateway scans `workspace/skills/`, parses YAML metadata from `SKILL.md` (for example `name`, `plugins`), and builds an in-memory route map.
- **Active state:** persists in Gateway memory and drives request dispatch.
- **Termination / reload:** if SKILL YAML changes, some versions support hot reload; otherwise restart Gateway to rebuild the route map.

### 2.3 User (User Context Layer)

- **Lifecycle span:** session-level, persistent and evolving
- **Initialization:** when a specific user ID (WhatsApp, Telegram, CLI, etc.) sends the first message, Gateway creates a session JSON file under `~/.openclaw/storage/sessions/`.
- **Active state:** grows each turn with conversation history and extracted long-term memory.
- **Termination / reload:** session usually does not auto-expire unless TTL is configured. In practice it sleeps/wakes and is truncated by sliding-window policies when limits are hit.

### 2.4 Soul (Reasoning Layer)

- **Lifecycle span:** request-level, ephemeral
- **Initialization:** for each incoming user message, Gateway dynamically composes the system prompt from `SKILL.md` markdown body + current `HEARTBEAT.md` state.
- **Active state:** exists only during LLM inference (usually seconds).
- **Termination / reload:** once LLM returns, that synthesized Soul context is dropped. This enables a powerful workflow: edit `SKILL.md` markdown and the **next turn** reflects the change immediately, with no Gateway restart.

### 2.5 Tools (Tool Execution Layer)

- **Lifecycle span:** execution-level, on demand
- **Initialization:** only starts when the model emits function/tool calls from Soul reasoning, and runtime activates corresponding plugins (`shell`, `web_search`, etc.).
- **Active state:** runs as OS subprocesses (for example Python scripts, `ffmpeg` commands).
- **Termination / reload:** subprocess exits after execution and returns `STDOUT`/`STDERR` to Gateway. Important outputs may be written into `HEARTBEAT.md` for future turns.

## 3) Troubleshooting by Lifecycle Level

Use a top-down isolation strategy:

| Symptom                                 | Likely Layer | First Action                                              |
| --------------------------------------- | ------------ | --------------------------------------------------------- |
| Tool errors (`Command Not Found`)       | Tools        | Run `openclaw doctor --fix` and verify environment/path   |
| Agent behavior is off / "not following" | Soul         | Edit `SKILL.md` markdown body and retest next turn        |
| Agent cannot be identified/routed       | Identity     | Validate YAML metadata and run `openclaw gateway restart` |
| Gateway refuses connection / crashes    | Bootstrap    | Validate `openclaw.json` syntax and port conflicts        |

## Practical Engineering Takeaway

If you map problems to lifecycle scope first, you avoid blind debugging:

- **Process-level issues** → Bootstrap
- **Routing metadata issues** → Identity
- **Memory/session issues** → User
- **Prompt/behavior issues** → Soul
- **Command/runtime issues** → Tools

That lifecycle-first method is usually the fastest path from symptom to fix.
