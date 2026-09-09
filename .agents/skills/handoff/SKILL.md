---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a concise handoff in the response message so a fresh team memeber agent can continue the work.

Only write a handoff document to the temporary directory of the user's OS—not the current workspace—when the user explicitly requests a file.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.
