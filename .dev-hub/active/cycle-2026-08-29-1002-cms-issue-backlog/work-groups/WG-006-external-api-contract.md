---
id: WG-006-external-api-contract
status: completed
title: 核准 External Authoring API v1 contract
work_items:
  - WI-025
owner: Main
branch: cms/external-api-contract
worktree: .dev-hub/worktrees/external-api-contract
pr: https://github.com/wahengchang/ai-study-note/pull/293
---

# 核准 External Authoring API v1 contract

## Delivery

將 External Authoring API v1 的 listener、credential lifecycle、route classes、proof/ticket/browser session、CSP/redaction 與 fixed status contract 寫入唯一 contract；建立 API-01 至 API-13（含 07A/07B、09A/09B、10A/10B）、DEC-TAXONOMY-01 與 CONTENT-01 的 GitHub Issue／planned Work Item。未建立 API/server stub。

## Verification

確認 #241 parent 指向完整 contract 與 16 API children、DEC-TAXONOMY-01、CONTENT-01；每個 runtime Work Item 都是 pending、無 Work Group，CONTENT-01 無 parent 且唯一 owner 為 Content。`npm run check`（112 pass）通過。
