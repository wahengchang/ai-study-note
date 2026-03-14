---
title: n8n + OpenClaw update workflow (MCP-ready)
---

## Objective
- **Deploy** an OpenClaw-compatible n8n workflow that can be executed via MCP clients.
- Reuse the ClawHub reference workflow: `https://clawhub.ai/thomasansems/n8n`.
- Standardize three trigger surfaces for the same core logic: **Webhook**, **Chat**, and **Form**.

## Reference flow (observed)
- The workflow shown in the editor uses this execution shape:
  1. Trigger (`Webhook` or manual test trigger)
  2. Input normalization (`normalize input` / `sample input`)
  3. Validation gate (`topic and seeds empty?`)
  4. Error response branch (`Respond 400`) when required fields are missing
  5. Prompt assembly (`build prompt`)
  6. Component call (`Call '[component] text2text'`)
  7. Output normalization (`normalize output`)
  8. Final HTTP response (`Respond keywords`)
- Keep this as the canonical pattern when cloning to Chat/Form variants.

## Create/update workflow pattern

```mermaid
flowchart LR
  T[Trigger: Webhook | Chat | Form] --> N[Normalize input]
  N --> V{Required fields present?}
  V -- No --> E[Respond 400 / validation error]
  V -- Yes --> P[Build prompt]
  P --> C[Call OpenClaw component]
  C --> O[Normalize output]
  O --> R[Respond result]
```

### 1) Clone a reusable base
- Start from the ClawHub template workflow.
- Keep node names stable (`normalize input`, `build prompt`, `normalize output`) to simplify team maintenance.
- Add a short description in workflow settings so it is identifiable in MCP workflow lists.

### 2) Trigger-specific adapters
- **Webhook workflow**
  - Parse request JSON/body params into a unified internal payload.
  - Return HTTP status codes (`400` on validation failure, `200` on success).
- **Chat workflow**
  - Map incoming chat message/context fields to the same internal payload keys used by Webhook.
  - Reuse the same prompt construction and output schema.
- **Form workflow**
  - Map form fields into normalized keys.
  - Apply identical required-field checks before model invocation.

### 3) Validation contract
- Required input should be checked before prompt construction.
- On missing required fields, stop downstream execution and return a deterministic error payload.
- Keep output schema stable across all trigger variants to make MCP client integration idempotent.

## n8n MCP configuration (instance-level)
- Go to `Settings -> Instance-level MCP`.
- In **Workflows**, add/enable the production workflows that should be discoverable by MCP clients.
- Ensure each exposed workflow has:
  - Clear name prefix, e.g. `[webhook]`, `[chat]`, `[form]`
  - Correct project/location assignment
  - Non-empty description (improves client-side discoverability)
- Verify in **Connected clients** that your MCP consumer can connect and execute the enabled workflows.

## Operational checklist
- Workflow is executable manually in n8n editor.
- Webhook path returns expected status and payload.
- Chat/Form variants produce equivalent output shape for equivalent logical input.
- Workflow appears in `Instance-level MCP -> Workflows` list.
- MCP client can discover and run the workflow without additional manual mapping.
