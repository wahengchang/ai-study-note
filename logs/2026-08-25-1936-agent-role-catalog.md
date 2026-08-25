# Agent role catalog

- 日期：2026-08-25 19:36（本機時間）

## 交付

- 建立 `agent/` 角色目錄與使用索引。
- 定義 9 個 SQL CMS 角色：架構守門、平台基礎、資料完整性、domain lifecycle、API 契約、媒體可靠性、CMS 體驗、驗證可靠性、安全邊界審查。
- 每個角色均定義 OMP built-in agent mapping、Codex prompt 使用方式、權威輸入、交付、不可違反約束、責任邊界與完成條件。

## 關鍵決策

- 以 durable ownership、公開契約與失敗模型分工，不使用跨越資料庫、服務、HTTP、UI 的泛用全端角色。
- 7 個角色可交付設計／實作；驗證與安全為獨立保證角色，安全維持唯讀以避免自審。
- OMP 僅使用現有的 `task`、`designer`、`reviewer`、`security-reviewer` 類別；角色檔是派發 prompt contract，未虛構不存在的 OMP runtime agent type。

## 實際驗證

- `agent/` 僅保留 1 份索引與 9 份角色定義；無 AppleDouble 中繼檔。
- 角色檔均含 OMP/Codex 派發區段，且 OMP mapping 全部存在於 `.omp/config.yml`。
- `npm run check:ai-sync` 通過：`✓ All files are up to date.`

## 已知限制／後續

- 角色目錄不會自動向 OMP 註冊新 agent type。每次派發必須要求子代理先讀取對應 `agent/<role>.md`；`agent/README.md` 已提供模板與依賴圖。
