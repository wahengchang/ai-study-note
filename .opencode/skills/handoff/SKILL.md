---
name: handoff
description: >-
  Compact the current conversation into a handoff document for another agent to
  pick up.
---
Write a concise handoff in the response message so a fresh team member agent can continue the work.

Only write a handoff document to the temporary directory of the user's OS—not the current workspace—when the user explicitly requests a file.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead. In this repository that includes the active Dev Hub Cycle under `.dev-hub/active/` and completed work logs under `logs/`.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the handoff accordingly.
