---
id: WG-016
status: completed
title: Projection & Preview renderer input
work_items: ["WI-028"]
owner: Main
branch: cms/projection-preview
worktree: .dev-hub/worktrees/projection-preview
pr: null
---

# Projection & Preview renderer input

## Delivery

實作 WI-028／GitHub #254 的唯一 immutable `renderer-input/v1` producer 與唯讀 current／published Preview public seam。

## Verification

Node v24.20.0／npm 11.19.0。read snapshot 4/4、verified media 1/1、Plugin Host 16/16、Theme Host 9/9、Projection isolation 1/1 通過；`npm run typecheck`、`npm run check:architecture`、`npm run check` 通過，full suite 187/187。
