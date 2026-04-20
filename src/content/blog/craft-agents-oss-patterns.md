---
title: 'Craft Agents OSS — Workspace, Session, Permission & Agent Workflow Patterns'
description: >-
  Craft Agents OSS patterns — workspace isolation, permission pipeline, session
  lifecycle, and event-bus automations
pubDate: '2026-04-08'
category: claude-code
tags:
  - research
  - claude-code
  - agent-architecture
draft: false
---

## TL;DR

Craft Agents is an open-source, Electron-based desktop app (+ headless server + CLI) for working with AI agents. Built by Craft.do with TypeScript/Bun, it wraps the Claude Agent SDK and Pi SDK behind a provider-agnostic layer. The codebase is a monorepo with clean separation: `packages/shared` (domain logic), `packages/server-core` (headless runtime), `apps/electron` (desktop UI), `apps/cli` (terminal client). Key patterns worth reusing: **workspace-scoped isolation**, **three-tier permission modes with pre-tool-use pipeline**, **source/integration abstraction via folder-based config**, **event-bus-driven automations**, and **session lifecycle with abort-reason state machine**.

---

## 1. Product / Architecture Overview

### What It Is

Craft Agents is an "Agent Native" desktop application for AI agent collaboration. Users chat with agents that can call tools, connect to external services (Linear, Gmail, Slack, GitHub via MCP or REST), manage files, browse the web, and execute shell commands -- all within a permission-controlled environment.

### Monorepo Structure

```
craft-agents-oss/
  packages/
    shared/           -- Domain logic, types, agent core, config, sources, skills, automations
    server-core/      -- Headless server runtime, session manager, transport, bootstrap
    server/           -- Entry point: bun run packages/server/src/index.ts
  apps/
    electron/         -- Electron + React desktop app (renderer, main process, preload)
    cli/              -- Terminal client connecting via WebSocket
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| AI Backend | Claude Agent SDK + Pi SDK (provider-agnostic via `backend/factory.ts`) |
| Desktop | Electron + React + shadcn/ui + Tailwind CSS v4 |
| Transport | WebSocket RPC (custom `WsRpcServer`) |
| Build | esbuild + Vite |
| Security | AES-256-GCM encrypted credentials at rest |

### Key Architectural Decisions

- **Server-first**: Even the desktop app runs a server process; the Electron renderer is a thin client connecting over WebSocket RPC
- **Provider-agnostic**: `BaseAgent` abstract class with `ClaudeAgent` and `CodexAgent` (Pi SDK) implementations, chosen by `backend/factory.ts`
- **Config as filesystem**: Everything stored under `~/.craft-agent/` as JSON files, no database
- **Workspace-scoped**: Every resource (sessions, sources, skills, automations, permissions) is scoped to a workspace directory

---

## 2. Workspace Patterns

### Workspace Model

A workspace maps to a directory on disk. Each workspace has an ID, name, slug, root path, and optional remote server connection.

```typescript
// packages/shared/src/config/storage.ts
interface Workspace {
  id: string;          // UUID generated via crypto.getRandomValues
  name: string;        // From workspace config or directory basename
  slug: string;        // Derived from rootPath via extractWorkspaceSlugFromPath()
  rootPath: string;    // Absolute path to workspace directory
  iconUrl?: string;    // file:// URL or https:// URL
  remoteServer?: {     // Optional: connect to remote Craft Agent server
    url: string;
    token: string;
    remoteWorkspaceId: string;
  };
  createdAt: number;
  lastAccessedAt?: number;
}
```

### Filesystem Layout

```
~/.craft-agent/
  config.json                -- Global config: workspaces[], activeWorkspaceId, llmConnections[]
  drafts.json                -- Session input drafts (keyed by sessionId)
  provider-domains.json      -- Favicon domain cache
  workspaces/
    {workspaceId}/
      conversation.json      -- Persisted messages + token usage
      plan.json              -- Session-scoped plan state
      sources/
        {sourceSlug}/
          config.json         -- Source configuration
          guide.md            -- Usage docs for Claude
          permissions.json    -- Source-level permission overrides
          icon.svg            -- Auto-downloaded or manual icon
      skills/
        {skillSlug}/
          SKILL.md            -- Frontmatter + instructions
          icon.{ext}          -- Optional icon
      automations.json        -- Event-driven automation rules
      permissions.json        -- Workspace-level permission overrides
```

### Workspace Lifecycle

```typescript
// Key operations from packages/shared/src/config/storage.ts
addWorkspace(workspace)        -- Create or re-register workspace
removeWorkspace(workspaceId)   -- Delete + cleanup credentials + data dir
setActiveWorkspace(workspaceId)
switchWorkspaceAtomic(workspaceId)  -- Switch + get/create latest session atomically
syncWorkspaces()               -- Auto-discover workspaces in default location
```

### Design Pattern: Atomic Workspace Switching

`switchWorkspaceAtomic()` combines workspace activation with session retrieval in a single operation, preventing race conditions where the UI switches workspace but has no session ready:

```typescript
async function switchWorkspaceAtomic(workspaceId: string) {
  const workspace = config.workspaces.find(w => w.id === workspaceId);
  const session = await getOrCreateLatestSession(workspace.rootPath);
  config.activeWorkspaceId = workspaceId;
  workspace.lastAccessedAt = Date.now();
  saveConfig(config);
  return { workspace, session };
}
```

### Design Pattern: Slug-Based Identity

Workspaces, sources, skills, and LLM connections all use slug-based identity alongside UUID. This gives human-readable references in prompts (`@linear`, `@gmail`) while maintaining stable IDs for storage.

---

## 3. Session / Context Patterns

### Session State Machine

Sessions track lifecycle state via `SessionLifecycleManager` (`packages/shared/src/agent/core/session-lifecycle.ts`):

```typescript
enum AbortReason {
  UserStop = 'user_stop',
  PlanSubmitted = 'plan_submitted',
  AuthRequest = 'auth_request',
  Redirect = 'redirect',              // New message sent while processing
  SourceActivated = 'source_activated', // Need to restart with new tools
  Timeout = 'timeout',
  InternalError = 'internal_error',
}

interface SessionState {
  sessionId: string;
  isActive: boolean;
  messageCount: number;
  startedAt: number;
  lastActivityAt: number;
  hasReceivedContent: boolean;
}
```

Key lifecycle methods:
- `recordMessageStart()` / `recordMessageComplete()` -- Track turn boundaries
- `recordContentReceived()` -- Track whether any assistant output was produced
- `setAbortReason()` / `consumeAbortReason()` -- One-shot abort reason (consumed on read)
- `shouldClearSessionOnAbort()` -- Only clears if no content received AND first message (prevents broken resume states)

### Session Persistence

Conversations are persisted as JSON with full message history and token accounting:

```typescript
interface WorkspaceConversation {
  messages: StoredMessage[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextTokens: number;
    costUsd: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  savedAt: number;
}
```

Serialization handles cyclic structures gracefully -- if `JSON.stringify` fails on `toolInput`, it retries with sanitized `{ error: '[non-serializable input]' }`.

### Session Branching

Sessions support branching (forking a conversation at a specific point). The `SessionManager` creates branch sessions with provider-aware fork strategies. Test files reveal the branching model:

- `session-branch-cleanup.ts` -- Cleans up orphaned branch sessions
- `session-branching-validation.test.ts` -- Validates branch integrity
- `session-branch-rollback.isolated.ts` -- Rollback mechanics

### Context Building (PromptBuilder)

`PromptBuilder` (`packages/shared/src/agent/core/prompt-builder.ts`) assembles the system context from multiple parts:

```typescript
buildContextParts(options, sourceStateBlock): string[] {
  parts.push(getDateTimeContext());           // Current date/time
  parts.push(formatSessionState(...));         // Mode, plans folder, data folder
  parts.push(sourceStateBlock);                // Active/inactive sources as XML
  parts.push(formatWorkspaceCapabilities());   // local-mcp enabled/disabled
  parts.push(getWorkingDirectoryContext());     // Current working directory
  return parts;
}
```

### Session Recovery

When a session is interrupted and restored, `buildRecoveryContext()` formats previous messages into a `<conversation_recovery>` XML block, truncating individual messages to 1000 chars to stay within token budgets.

### Response Summarization

Tool responses exceeding ~60KB are automatically summarized using Claude Haiku. An `_intent` field injected into MCP tool schemas provides context-aware summarization focus.

### Draft Persistence

Unsent user input is persisted per-session in `drafts.json`, enabling cross-restart recovery of in-progress messages.

---

## 4. Permission / Approval Patterns

### Three-Tier Permission Model

```
Explore  -->  Ask to Edit  -->  Auto
(read-only)   (approval needed)  (unrestricted)
```

Cycled via `SHIFT+TAB` in the UI. Each mode is workspace-scoped and can be changed mid-session.

### Explore Mode (Read-Only)

Defined by `permissions/default.json` -- a comprehensive allowlist:

- **~180 allowed bash patterns**: `ls`, `cat`, `find`, `grep`, `git status/log/diff/show`, `npm ls`, `docker ps`, etc.
- **Blocked shell constructs**: Background (`&`), redirects (`>`), command substitution (`$()`), control characters
- **Allowed MCP patterns**: `search`, `list`, `get`, `query`, `inspect`, `fetch`
- **Empty write allowlists**: No API mutations, no filesystem writes (except plans folder)
- **Blocked command hints**: User-friendly guidance when a command is rejected (e.g., "use echo instead of printf")

Compound commands (`&&`, `||`, `|`) are allowed only when ALL parts pass validation independently.

### Permission Cascading

Rules cascade: **workspace** -> **source** -> **agent level**. Rules are **additive only** -- they can grant more permissions, never restrict further.

Source-level permissions in `permissions.json` are auto-scoped: a simple pattern like `list` becomes `mcp__<sourceSlug>__.*list` internally. This prevents accidental cross-source permission leaks.

### PermissionManager

`packages/shared/src/agent/core/permission-manager.ts` centralizes all permission evaluation:

- `evaluateToolCall()` -- Primary entry, considers tool type, input, custom rules
- `checkBashCommand()` -- Validates against read-only patterns, returns rejection reason
- `isDangerousCommand()` -- Checks against predefined dangerous command set (rm, chmod, sudo, curl, wget, ssh...)
- Session-scoped whitelists: `whitelistCommand()`, `whitelistDomain()` -- Users can approve specific commands for the session

### Pre-Tool-Use Pipeline

`packages/shared/src/agent/core/pre-tool-use.ts` runs 6 sequential checks before every tool call:

```
1. Permission mode validation        -- Is this tool allowed in current mode?
2. MCP source activation blocking    -- Is the source active?
3. Prerequisite verification          -- Has the agent read guide.md first?
4. LLM/session call interception      -- Intercept spawn/call-LLM tools
5. Input transformations              -- Expand ~, qualify skill names, strip metadata
6. Ask-mode prompt decisions          -- Should we ask the user?
```

Returns a discriminated union:
```typescript
type PreToolUseCheckResult =
  | { action: 'allow' }
  | { action: 'modify', modifiedInput: Record<string, unknown> }
  | { action: 'block', reason: string }
  | { action: 'prompt', description: string }
  | { action: 'source_activation_needed', slug: string }
  | { action: 'call_llm_intercept', ... }
  | { action: 'spawn_session_intercept', ... }
```

### Prerequisite Manager

Before using a source's tools, the agent must read that source's `guide.md`. The `PrerequisiteManager` tracks this and blocks tool calls until the prerequisite is satisfied.

### Planning in Explore Mode

Users can create implementation plans in Explore mode. Plans are written as markdown to a session-scoped plans folder, then submitted via `SubmitPlan`. Workflow: **Explore -> Plan -> Submit -> Accept -> Execute**.

---

## 5. Source / Integration Patterns

### Source Types

```typescript
type SourceType = 'mcp' | 'api' | 'local';
```

Each source is a folder under `~/.craft-agent/workspaces/{id}/sources/{slug}/` containing `config.json`, optional `guide.md`, optional `permissions.json`, and optional icon.

### MCP Sources

Model Context Protocol servers connected via HTTP/SSE or stdio subprocess:

```typescript
interface McpSourceConfig {
  transport: 'http' | 'sse' | 'stdio';
  url?: string;                    // For http/sse
  command?: string;                // For stdio
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  authType?: 'oauth' | 'bearer' | 'none';
}
```

Stdio MCP servers run as child processes. Environment variable filtering prevents credential leakage -- sensitive vars (API keys, tokens) are stripped unless explicitly whitelisted in the source config.

### API Sources

REST APIs with flexible authentication:

```typescript
interface ApiSourceConfig {
  baseUrl: string;                          // Must have trailing slash
  authType: 'bearer' | 'header' | 'query' | 'basic' | 'oauth' | 'none';
  headerName?: string;                      // For single header auth
  headerNames?: Record<string, string>;     // For multi-header auth
  queryParam?: string;                      // For query param auth
  testEndpoint?: ApiTestEndpoint;           // Required for credential validation
  googleOAuth?: { ... };                    // Provider-specific OAuth config
  slackOAuth?: { ... };
  microsoftOAuth?: { ... };
}
```

URL inference functions (`inferGoogleServiceFromUrl`, `inferSlackServiceFromUrl`, `inferMicrosoftServiceFromUrl`) automatically detect which service a URL belongs to.

### Source Manager

`packages/shared/src/agent/core/source-manager.ts` tracks source state:

- **Active vs. Intended**: Active = tools are working; Intended = UI shows source as desired
- **Session visibility**: `markSourceSeen()` / `markSourceUnseen()` for first-time introductions
- **Context injection**: `formatSourceState()` generates XML blocks for system prompt
- **Error detection**: `detectInactiveSourceToolError()` identifies MCP failures from disconnected sources
- **Auth routing**: `getAuthToolName()` maps sources to correct auth trigger tools

### Source Credential Manager

Separate from main credential manager. Handles workspace-scoped OAuth tokens with automatic refresh via `token-refresh-manager.ts`.

### Source Activation Flow

1. User mentions `@linear` in chat
2. Agent attempts to use Linear tools
3. Pre-tool-use pipeline detects inactive source
4. Returns `{ action: 'source_activation_needed', slug: 'linear' }`
5. System discovers API/MCP server, configures credentials
6. Agent restarts with new tools via `AbortReason.SourceActivated`

### Skill System

Skills are SKILL.md files with YAML frontmatter, stored per-workspace or globally under `~/.agents/`:

```typescript
interface SkillMetadata {
  name: string;
  description: string;
  globs?: string[];           // File patterns that auto-trigger this skill
  alwaysAllow?: string[];     // Tools auto-allowed when skill is active
  requiredSources?: string[]; // Sources auto-enabled on skill invocation
  icon?: string;              // Emoji or URL
}

type SkillSource = 'global' | 'workspace' | 'project';
```

Skills are invoked via `@mention` mid-conversation without restart. The `extractSkillPaths()` method in `BaseAgent` resolves skill mentions to SKILL.md file paths.

---

## 6. Workflow / Execution Patterns

### Agent Backend Abstraction

`BaseAgent` (`packages/shared/src/agent/base-agent.ts`) is the abstract base class with 7 abstract methods:

```typescript
abstract chatImpl()              // Message streaming
abstract abort()                 // Graceful stop
abstract forceAbort()            // Hard stop
abstract isProcessing()          // State check
abstract respondToPermission()   // Handle permission decisions
abstract runMiniCompletion()     // Small LLM calls (title generation, summaries)
abstract queryLlm()              // Full LLM queries
```

Concrete implementations:
- `packages/shared/src/agent/backend/claude/` -- Claude Agent SDK
- `packages/shared/src/agent/backend/pi/` -- Pi SDK

### RPC Handler Architecture

The server registers handlers by domain, each receiving typed `HandlerDeps`:

```typescript
// packages/server-core/src/handlers/rpc/index.ts
function registerCoreRpcHandlers(server, deps, serverCtx) {
  registerAuthHandlers(server, deps);
  registerAutomationsHandlers(server, deps);
  registerFilesHandlers(server, deps);
  registerLabelsHandlers(server, deps);
  registerLlmConnectionsHandlers(server, deps);
  registerOAuthHandlers(server, deps);
  registerSessionsHandlers(server, deps);
  registerSettingsHandlers(server, deps);
  registerSkillsHandlers(server, deps);
  registerSourcesHandlers(server, deps);
  registerStatusesHandlers(server, deps);
  registerWorkspaceCoreHandlers(server, deps);
  // ...
}
```

### Automation System (Event-Driven)

`packages/shared/src/automations/` implements a full event-driven automation framework:

**Events** (two categories):

```typescript
type AppEvent =
  | 'LabelAdd' | 'LabelRemove' | 'LabelConfigChange'
  | 'PermissionModeChange' | 'FlagChange'
  | 'SessionStatusChange' | 'SchedulerTick';

type AgentEvent =
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'SessionStart' | 'SessionEnd' | 'Stop'
  | 'SubagentStart' | 'SubagentStop'
  | 'UserPromptSubmit' | 'PermissionRequest'
  | 'PreCompact' | 'Notification' | 'Setup';
```

**Actions**: Prompt injection or webhook calls:

```typescript
type AutomationAction = PromptAction | WebhookAction;

interface PromptAction {
  type: 'prompt';
  prompt: string;          // Supports @mentions and env var expansion
  llmConnection?: string;
  model?: string;
}

interface WebhookAction {
  type: 'webhook';
  url: string;
  method?: WebhookHttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  auth?: WebhookAuth;       // basic or bearer
  captureResponse?: boolean;
}
```

**Conditions**: Time-based, state-based, or logical (AND/OR/NOT):

```typescript
type AutomationCondition = TimeCondition | StateCondition | LogicalCondition;

interface TimeCondition {
  condition: 'time';
  after?: string; before?: string;
  weekday?: string[];
  timezone?: string;
}
```

**Event Bus**: `WorkspaceEventBus` with rate limiting (10/min default, 60/min for scheduler), parallel handler execution, error isolation per handler.

**Configuration**: JSON file with cron expressions:

```json
{
  "automations": {
    "SchedulerTick": [{
      "cron": "0 9 * * 1-5",
      "timezone": "America/New_York",
      "actions": [{ "type": "prompt", "prompt": "Generate daily standup briefing using @linear" }]
    }],
    "PreToolUse": [{
      "matcher": "bash",
      "actions": [{ "type": "prompt", "prompt": "Log this command" }]
    }]
  }
}
```

### Server Bootstrap Pattern

`bootstrapServer()` (`packages/server-core/src/bootstrap/headless-start.ts`) uses a generic, injectable pattern:

```typescript
interface ServerBootstrapOptions<TSessionManager, THandlerDeps> {
  createSessionManager: () => TSessionManager;
  createHandlerDeps: (ctx) => THandlerDeps;
  registerAllRpcHandlers: (server, deps, ctx) => void;
  setSessionEventSink: (sm, sink) => void;
  initializeSessionManager: (sm) => Promise<void>;
  cleanupSessionManager?: (sm) => Promise<void>;
  applyPlatformToSubsystems?: (platform) => void;
  initModelRefreshService: () => ModelRefreshServiceLike;
  // ...
}
```

This enables the same bootstrap logic to work for both the Electron app and the headless server, with different implementations injected for session management, platform services, and handler registration.

### Security: Token Entropy Validation

Server startup validates token quality:
- Minimum 16 characters
- Rejects single-character repetition (zero entropy)
- Warns on fewer than 8 unique characters

### Security: TLS Enforcement

Non-localhost binding without TLS is blocked by default (tokens would be sent in cleartext). Override requires explicit `--allow-insecure-bind` flag.

### Server Lock File

`~/.craft-agent/.server.lock` prevents multiple server instances. Detects stale locks by checking if the PID is still alive via `process.kill(pid, 0)`.

### Remote Execution

Desktop app can connect to a remote server (pass `CRAFT_SERVER_URL` + `CRAFT_SERVER_TOKEN`). This enables:
- Persistent sessions surviving client disconnects
- Multi-machine access to the same workspace
- Compute-intensive work on remote hardware
- Docker deployment for team use

### Deep Linking

`craftagents://` protocol for navigating to sessions, settings, sources, or triggering actions from external apps.

---

## 7. What I Can Reuse Next Time

### Pattern: Workspace-Scoped Isolation

Everything (sessions, sources, skills, automations, permissions) is scoped to a workspace directory. This is a clean isolation boundary that scales from single-user to team use. Reuse: any multi-tenant or multi-project agent system.

### Pattern: Three-Tier Permission Model

`Explore -> Ask -> Auto` with a pre-tool-use pipeline of 6 sequential checks. The key insight: permissions are **additive cascade** (workspace -> source -> agent), and the pipeline returns a **discriminated union** of outcomes rather than a boolean. Reuse: any agent system that needs safety gates.

### Pattern: Folder-Based Source Configuration

Each integration is a folder with `config.json` + `guide.md` + `permissions.json`. The `guide.md` becomes part of the agent's system prompt. This is dramatically simpler than database-backed integration management and easy to version control. Reuse: any system integrating with external APIs/MCP servers.

### Pattern: Abort Reason State Machine

`AbortReason` enum with `consumeAbortReason()` (read-once) cleanly handles the many reasons an agent turn can stop: user stop, auth needed, source activation, plan submission, timeout. The `shouldClearSessionOnAbort()` logic prevents broken resume states. Reuse: any agent with interruptible execution.

### Pattern: Event Bus Automations

Typed event bus with rate limiting, error isolation, cron scheduling, and webhook/prompt actions. Events cover both app-level (label change, status change) and agent-level (pre/post tool use, session start/end). Reuse: any agent system needing user-defined automation rules.

### Pattern: Injectable Bootstrap

`bootstrapServer<TSessionManager, THandlerDeps>()` accepts factory functions for all major subsystems. Same bootstrap works for Electron and headless. Reuse: any system that needs to run in multiple deployment modes.

### Pattern: Prerequisite Enforcement

Sources can require the agent to read `guide.md` before using tools. The prerequisite manager blocks tool calls until this is satisfied. Reuse: ensuring agents have context before using unfamiliar tools.

### Pattern: Response Summarization with Intent

Large tool responses (>60KB) are summarized by a fast model, with an `_intent` field in the tool schema guiding summarization focus. Reuse: any agent dealing with large API responses.

### Pattern: Config Watcher for Live Reload

`ConfigWatcherManager` watches workspace config files and reloads settings without restart. Combined with `@mention` for skills/sources, this enables mid-conversation capability expansion. Reuse: long-running agent sessions.

---

## Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/agent/base-agent.ts` | Abstract agent base class (14 callbacks, 7 abstract methods) |
| `packages/shared/src/agent/core/permission-manager.ts` | Centralized permission evaluation |
| `packages/shared/src/agent/core/pre-tool-use.ts` | 6-check pre-tool-use pipeline |
| `packages/shared/src/agent/core/session-lifecycle.ts` | Session state machine + abort reasons |
| `packages/shared/src/agent/core/source-manager.ts` | Source state tracking + context injection |
| `packages/shared/src/agent/core/prompt-builder.ts` | System prompt assembly |
| `packages/shared/src/config/storage.ts` | Workspace CRUD, conversation persistence, LLM connections |
| `packages/shared/src/sources/types.ts` | Source type definitions (MCP, API, Local) |
| `packages/shared/src/skills/types.ts` | Skill metadata + SKILL.md structure |
| `packages/shared/src/automations/types.ts` | Automation events, actions, conditions |
| `packages/shared/src/automations/event-bus.ts` | WorkspaceEventBus with rate limiting |
| `packages/shared/src/automations/automation-system.ts` | AutomationSystem facade |
| `packages/shared/src/credentials/manager.ts` | Encrypted credential storage |
| `packages/server-core/src/bootstrap/headless-start.ts` | Generic server bootstrap with DI |
| `packages/server-core/src/sessions/SessionManager.ts` | Session lifecycle, lazy-loading, OAuth refresh |
| `packages/server-core/src/handlers/rpc/index.ts` | RPC handler registration by domain |
| `packages/server/src/index.ts` | Server entry point, TLS, WebUI, health checks |
| `apps/electron/resources/permissions/default.json` | Explore mode allowlist (~180 bash patterns) |
| `apps/electron/resources/docs/permissions.md` | Permission system documentation |
| `apps/electron/resources/docs/sources.md` | Source configuration guide |

### Core Types Cheat Sheet

```typescript
// Permission modes
type PermissionMode = 'explore' | 'ask' | 'auto';

// Source types
type SourceType = 'mcp' | 'api' | 'local';
type McpTransport = 'http' | 'sse' | 'stdio';
type SourceConnectionStatus = 'connected' | 'needs_auth' | 'failed' | 'untested' | 'local_disabled';

// Skill tiers
type SkillSource = 'global' | 'workspace' | 'project';

// Session abort reasons
enum AbortReason { UserStop, PlanSubmitted, AuthRequest, Redirect, SourceActivated, Timeout, InternalError }

// Automation events
type AutomationEvent = AppEvent | AgentEvent;  // 20+ event types
type AutomationAction = PromptAction | WebhookAction;
type AutomationCondition = TimeCondition | StateCondition | LogicalCondition;

// Pre-tool-use outcomes
type PreToolUseCheckResult = { action: 'allow' | 'modify' | 'block' | 'prompt' | 'source_activation_needed' | ... }
```

### Architecture Diagram (Conceptual)

```
                    +------------------+
                    |   Desktop App    |   (Electron + React)
                    |   or CLI Client  |
                    +--------+---------+
                             |  WebSocket RPC
                    +--------+---------+
                    |   WsRpcServer    |   (packages/server-core/transport)
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------+----------+      +-----------+-----------+
    |  SessionManager    |      |  RPC Handlers         |
    |  (session lifecycle|      |  (auth, sessions,     |
    |   lazy-load, flush)|      |   sources, skills,    |
    +--------+-----------+      |   automations, ...)   |
             |                  +-----------+-----------+
    +--------+-----------+                  |
    |  BaseAgent         |      +-----------+-----------+
    |  (ClaudeAgent /    |      |  AutomationSystem     |
    |   CodexAgent)      |      |  (EventBus, cron,     |
    +--------+-----------+      |   handlers)           |
             |                  +-----------------------+
    +--------+-----------+
    |  Core Modules      |
    |  - PermissionMgr   |
    |  - SourceManager   |
    |  - PromptBuilder   |
    |  - PreToolUse      |
    |  - SessionLifecycle|
    +--------------------+
```
