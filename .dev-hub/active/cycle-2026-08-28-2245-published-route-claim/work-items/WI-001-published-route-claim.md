---
id: WI-001
status: done
title: Published route claim 與雙圖隔離
work_group: WG-001-published-route-claim
depends_on: []
---

# Published route claim 與雙圖隔離

## Outcome

SiteDefinition 公開提供 published claim proposal、transaction-bound token 與原子 apply；current/published 的同 normalized route 可並存，mutation 僅更新 target graph，兩圖 digest 全程受 proposal freshness 與 Persistence transaction 保護。

## Acceptance

- published claim 有獨立 proposal contract 與 opaque token，且不改 current API/wire literal。
- 跨圖同 key 不 collision，同圖等價 route 的第二 owner 回傳 `ROUTE_CONFLICT`。
- proposal 同時綁定 current/published baseline digest，任一圖變動即 stale；foreign、改寫或錯 graph token 一律 fail closed。
- published sourceRevisionId 可獨立替換；FK/write failure rollback 後兩圖與 canonical state 不變。
- SiteDefinition 定向測試與 `npm run check` 通過。

## Notes

對應 GitHub Issue #225；先決 Issue #222 已交付。不得新增 Persistence storage path、migration、相容 API，或實作 ChangeRoute、PublishRevision、Projection、Plugin 行為。