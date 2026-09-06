---
id: WI-054
status: done
title: Local subpath-safe Public UI
work_group: WG-018
depends_on: ["WI-053"]
---

# Local subpath-safe Public UI

## Outcome

建立可消費 `site-content/v1` 的預設靜態 Theme 與本機 artifact server；頁面以相對 URL 在 repository 子路徑下可直接瀏覽，且 server 只服務已驗證的 immutable artifact。

## Acceptance

預設 Theme 輸出具語意地標、skip link、可見 keyboard focus 與 raw/demo static fallback 的完整 HTML；本機 server 固定 base path、拒絕 traversal 與根路徑洩漏；端對端測試透過 ThemeHost、Projection、Renderer、Delivery 與 HTTP 驗證子路徑首頁／深層頁面。GitHub Pages、release 與 public media bytes 不在本項範圍。

## Notes

GitHub #255 的 local Public UI 切片。WG-017 的 Preview core document 已在本 branch 以 recovered commits 接回並通過 `npm run check`（195 tests）。

**Owner 決策（2026-09-06）**：GitHub Pages 與 release 必須留至整個專案最後階段；本 Work Item 只持續完善與驗證本機 Public UI，不得加入 workflow、deploy 或 remote release 行為。
