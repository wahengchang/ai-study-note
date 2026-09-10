---
id: WG-030
status: completed
title: DEC-TAXONOMY-01 Taxonomy contract
work_items: ["WI-051"]
owner: Main
branch: feature/taxonomy-contract
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/taxonomy-contract
pr: null
---

# DEC-TAXONOMY-01 Taxonomy contract

## Delivery

只更新 `contracts/README.md`，定義 flat Taxonomy、immutable revision binding、term lifecycle、migration 與 published projection fail-closed 邊界；不建立 owner、持久化 schema、transport、stub 或 CMS UI。

## Verification

已完成 reviewer 對 immutable/lifecycle/migration 的審閱與 security-reviewer 對 fail-closed/projection 的審閱；兩者結論已納入 contract。`npm run check:architecture` 通過；已逐條檢查 flat boundary、immutable identity/evidence/digest、label/slug/order、rename/retire/delete、current/published impact、explicit migration，以及 projection hard-failure/no-current-catalog-fallback。僅有 `contracts/README.md` 的產品 contract 變更；Dev Hub tracking 為流程必要紀錄。
