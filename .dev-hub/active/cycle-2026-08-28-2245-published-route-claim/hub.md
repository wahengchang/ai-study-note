---
id: cycle-2026-08-28-2245-published-route-claim
status: active
created_at: 2026-08-28T22:45:44+08:00
updated_at: 2026-08-28T22:56:47+08:00
---

# Published Route Claim

## Goal

完成 GitHub Issue #225：在既有 current route claim 基礎上建立 published claim，並以公開契約證明兩圖的 collision 與 mutation 完全隔離。

## Scope

- 擴充 SiteDefinition 的 published claim proposal、transaction token 與公開方法。
- 將 current 與 published claim 收斂到同一組 graph-aware 流程。
- 使用真實 Persistence 驗證雙圖 snapshot、digest、collision、stale proposal 與 rollback。
- 更新 SiteDefinition 現況與測試入口。

## Context

#222 已交付 current route claim。本 Cycle 只認領 #225；不實作 ChangeRoute、PublishRevision、Projection 或任何 Plugin 行為，也不修改 Persistence API、SQL migration 或已核准 contract。