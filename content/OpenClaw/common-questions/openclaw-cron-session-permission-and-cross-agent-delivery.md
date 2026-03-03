---
title: OpenClaw Cron: Executor, Session, Permissions, and Cross-Agent Delivery
---

## Summary

| Question                 | Short answer                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| Who executes `cron1`?    | Gateway scheduler triggers it; target agent runtime executes it.    |
| Which session is used?   | A separate background/isolated session (not the user chat session). |
| Whose permissions apply? | The executing agent’s service identity, not the user identity.      |

## Execution Model

| Stage    | Component           | Responsibility                                          |
| -------- | ------------------- | ------------------------------------------------------- |
| Trigger  | Gateway cron module | Watches schedule and fires job at due time.             |
| Dispatch | Gateway router      | Sends run to configured target agent.                   |
| Run      | Agent runtime       | Executes reasoning, skills/tools, file/network actions. |

## Session Model

For cron tasks, use an isolated background session.

Why:

- Keep user chat context clean.
- Allow separate retention/audit policy for scheduled runs.
- Simplify retries and failure handling.

## Permission Model

Cron runs should be evaluated with the target agent identity.

| Permission boundary | Typical rule                                    |
| ------------------- | ----------------------------------------------- |
| Tools/skills        | Only tools allowed for that agent.              |
| Workspace           | Only that agent’s sandbox/workspace scope.      |
| Outbound channels   | Only channels explicitly granted to that agent. |

## Your Scenario

`cron1` runs on `agent1`, then result is sent by `agent2` to `telegramGroup2`.

Yes, this is possible, but `agent1` should not impersonate `agent2`.

### Pattern A (recommended): Gateway event/webhook routing

1. `agent1` finishes cron job.
2. `agent1` sends an internal event/webhook payload to Gateway.
3. Gateway policy routes to `agent2`.
4. `agent2` sends to `telegramGroup2` with its own credentials.

### Pattern B: Shared outbox queue

1. `agent1` writes message payload to shared outbox.
2. `agent2` polls/watches outbox.
3. `agent2` sends message and marks item done.

Use Pattern A for low latency and clearer control-plane routing. Use Pattern B for stronger durability/retry behavior.

## Minimum Security Rules

1. No impersonation: `agent1` cannot use `agent2` token.
2. Policy gate: cross-agent trigger must pass Gateway policy.
3. Least privilege: grant only required tools/channels.
4. Idempotency: use message/run IDs to avoid duplicates.
5. Audit trail: log `cron trigger -> dispatch -> send` chain.

## Verification Checklist

Check these in your own environment:

1. `openclaw.json` for routing and channel permissions.
2. `~/.openclaw/cron/jobs.json` for cron ownership and target agent.
3. Gateway/runtime logs for isolated run/session IDs and dispatch traces.

Note: External web verification was blocked in this execution environment, so this note is based on architecture reasoning and internal project context.
