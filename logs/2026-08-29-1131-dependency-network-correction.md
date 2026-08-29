---
cycle_id: cycle-2026-08-29-1042-dependency-network-correction
completed_at: 2026-08-29T11:31:38+08:00
status: completed
---

# Dependency Network Correction

## 交付

- 將 Dev Hub overview dependency network 改為 216×64px node、24px 同層 gap、52px layer gap 的由上而下 DAG；保留 deterministic 四輪 barycentric sweeps 與 status-derived active route。
- 加入 right-side long-edge gutter、可見 edge 60% distributed ports、adjacent cubic route 與 deterministic long-edge cubic lanes；secondary edge 先繪製，active edge 後繪製。
- network board 使用 intrinsic size 與 local horizontal scrolling；當 rebase 後 37 個 linked Issues 超過 viewport 時，初始視窗聚焦主 DAG，document 本身不橫向 overflow。
- 補齊 node status dot legend、accessible full title、`data-network-span` metadata、契約測試與 regenerated overview projection。
- 驗證期間將 #260 的唯一 Work Item link 移至本 Cycle 並移除 backlog 的重複 WI-032；closeout 後依 active projection 規則移除已完成 Cycle、#260 link 與 #260 snapshot。

## 關鍵決策

- 使用者在 rebase 後確認保留擴大的 37 Issue／3 Cycle projection；fixed-width layer、independent row 或 long-edge gutter 超過 container 時，只允許 `.network-scroll` 局部捲動。
- 無 duration、start、end、preferred route 或最長鏈推測；red route 仍僅表示 `in_progress` Work Item 的遞迴 prerequisite traversal。

## 實際驗證

- `node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`：19/19 通過。
- `npm run dev-hub:overview`、`npm run dev-hub:overview:check`：通過，generated HTML 與 renderer 同步。
- Chrome：desktop 初始主 DAG 中心位於 network viewport 中央、node 無重疊、四項圖例可見；filter `229` 僅保留 `239, 219, 220, 221, 222, 223, 228, 229` 與 endpoint-complete edges；清除後 37 nodes 與原座標恢復；390px mobile emulation 的 document width 等於 viewport，只有 `.network-scroll` 有水平 overflow，console 無 error。
- `npm run typecheck`：僅有未觸及的 `core/plugin-host/module-loader.ts`（`es-module-lexer`）與 `core/site-definition/normalization.ts`（`unicode-case-folding`）module-resolution diagnostics；未修改 unrelated core。

## 已知限制／後續

- rebase 後最寬固定 node layer 為 1176px、獨立列為 2136px；這些尺寸超出窄 viewport 時依本次 Owner 決策由 `.network-scroll` 局部捲動，而非縮小 node 或改寫 layer level。

## 相關 Branch／PR

- Branch：`site-reset`
- PR：https://github.com/wahengchang/ai-study-note/pull/213
