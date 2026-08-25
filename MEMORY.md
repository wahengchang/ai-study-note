# 專案長期記憶

這份檔案保存跨工作階段仍應成立、且會影響後續決策的專案脈絡。它是精選索引，不是工作日誌、待辦清單或聊天紀錄。

## 使用規則

- 開始涉及既有決策、架構或工作方式的工作前，先閱讀本檔。
- 只在資訊具有長期價值時更新：已確認的產品或技術決策、不可違反的約束、穩定的架構事實，以及反覆出現且已驗證的教訓。
- 單次工作的過程、驗證輸出與未定案討論，記在 `logs/YYYY-MM-DD-HHmm-{slug}.md`，不要放在本檔。
- 大型工作完成、準備結束前，檢視是否有長期資訊應更新至本檔，或有交付、驗證、限制、風險應新增一份工作紀錄；兩者皆無時，不建立空白紀錄。

## 已確認的專案脈絡

- **2026-08-25｜專案定位**：此 repository 用於翻新既有的 AI 學習筆記網站，包含 CMS 前端，供重新整理內容呈現與管理流程。
- **2026-08-25｜CMS 架構**：新的 authoring canonical source 採關聯式 SQL database，建立完整 CMS；Post Type 是一級模型，用來定義各內容類型的欄位、關係、驗證與公開版型，保留後續客製化空間。先前的 Keystatic、Git-tracked Markdoc/YAML canonical source 結論不再是實作方向。
- **2026-08-25｜長期工作位置**：後續數週至一個月持續在 `site-reset` 分支與 `ai-study-note-reset` worktree 開發；目前不得合併至 `main`，也不得因 housekeeping 切換或移除此 worktree。

## SQL CMS 長期原則

- **完整架構契約**：系統細節、schema、API 與驗證規則的唯一入口是 [`docs/architecture/2026-08-25-1758-sql-cms/README.md`](docs/architecture/2026-08-25-1758-sql-cms/README.md)；本檔不重複這些細節。
- **canonical source**：authoring state 是本機關聯式 SQL CMS 與 local media，不是 Keystatic、Git-tracked Markdown/YAML 或 remote database；沒有舊 corpus migration。
- **內容完整性**：schema、Entry、Term 歷史不可變；V1 沒有 hard delete 或 history purge。所有內容路徑位於單一 global route domain。
- **發布邊界**：Publish 只改本機 canonical current/published state；不做 Git、build 或 deploy。公開 static output、Theme 與 release artifact 只能消費 published projection，另立規劃。
- **安全與儲存邊界**：V1 是 OS-trusted loopback single owner；repository 確認 private 前，不得提交 canonical DB 或 original media。

## Codex 子代理

- **2026-08-25｜四角色協作設定**：Rulesync source 位於 `.rulesync/subagents/`，產生官方 Codex project-scoped `.codex/agents/` output。固定 custom subagent 為 `architecture_engineer`（application service、API design 與實作）、`cms_engineer`（React/Vite CMS）、`database_engineer`（SQLite/Drizzle/migration），以及待 architecture-engineer 草擬、專案擁有者核定獨立 published projection 架構文件後才可啟動的 `public_page_engineer`。`.codex/config.toml` 的並行上限為 4。OMP 維持 `.omp/config.yml` 的既有標準 agent mapping，沒有自訂 runtime agent type。