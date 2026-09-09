---
cycle: cycle-2026-09-07-1024-seo-plugin-happy-path
completed_at: 2026-09-09T16:00:51+08:00
status: completed
---

# SEO Plugin Happy Path

## 交付

- 在 `site-reset` 基線完成 #308 的 seo-basics 外掛、結構化 SEO 內容、CMS 編輯與設定、Theme、published projection、Renderer、Delivery 與 CLI happy path。
- CMS 使用 `apps/cms` 的 React/Vite 工作台與 session bootstrap；durable active Theme 是 CMS、預覽與公開建置的唯一 Theme 選擇來源。
- 公開 projection 僅讀取 published revision；預覽只讀取指定 subject 的 draft。

## 關鍵決策

- 原本的實作分支基於文件生命週期分支；最終交付改以 `site-reset` 作為唯一整站整合基線，避免將新 CMS／公開網站 runtime 疊加於錯誤基底。

## 實際驗證

- `npm run check` 通過：TypeScript、architecture 檢查、CMS Vite build 與 237 個測試。
- production temp root 實跑 Plugin／Theme package、10 個 SQLite migration、Theme activation 與 `site:build`；產物 digest 為 `sha256:3a2ed8d81c19c27e34f4c292192c4f4662e0e1843a3579975bc0b9e0d40fb90f`。

## 已知限制／後續

- Review 修正：Renderer 的頁內 stylesheet 相對 URL 原本以 artifact 檔案路徑（固定為
  `pages/<digest>/index.html`）計算，但公開 URL 是 `<basePath><normalizedRoute>/`。route 深度不是
  兩段、或部署在 GitHub Pages project base path 之下時，`<link rel="stylesheet">` 會指向不存在的
  位置。已改以 route 深度計算並補上 regression test。
- 未處理：`seo-plugin-settings/v1` 的 `indexing`（CMS 預設為「禁止搜尋引擎索引」）目前只被保存與
  驗證，不影響任何公開輸出——`robots.txt` 固定輸出 `Allow: /`，頁面也不會產生 `noindex`。要接上它
  需要擴充 `public-seo-site-contribution/v1` 與 `renderer-input/v1` 的 SEO 欄位（Projection、codec
  strict parse、Renderer），屬於跨 owner 的 contract 變更，另立 Cycle 處理。

## 相關 Branch／PR

- Branch：`feature/site-reset-seo-basics`
- PR：https://github.com/wahengchang/ai-study-note/pull/332（base：`site-reset`）
