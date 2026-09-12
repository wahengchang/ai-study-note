---
id: cycle-2026-09-13-0050-integrate-local-cms-prs
status: completed
created_at: 2026-09-13T00:50:03+08:00
updated_at: 2026-09-13T01:02:47+08:00
---

# Local CMS PR integration

## Goal
將仍有效的 local CMS PR 功能整合為一個可審閱的 `site-reset` PR。

## Scope
審查 #361、#364、#366、#368；只整合未被 `site-reset` 取代的 local CMS 功能，並修復 stacked branch 的過期測試與 contract drift。

## Context
#366 的 route graph 功能已由 WG-045 以不同公開 DTO 實作於 `site-reset`，不得重複合併。#364 疊於 #361，#368 疊於 #364；直接合併有 stale base 與未完成驗證問題。