# 確立 SQL CMS 架構方向並提交網站重設

- **交付**：將 SQL CMS 架構與長期 `site-reset` 工作位置記入 `MEMORY.md`；把既有網站重設差異、專案 agent 路由設定與本次決策紀錄納入單一本機 commit。
- **關鍵決策**：新的 authoring canonical source 採關聯式 SQL database，建立完整 CMS；Post Type 是一級模型，定義各內容類型的欄位、關係、驗證與公開版型，保留後續客製化空間。`project-*` 內的 Keystatic 與 Git-tracked Markdoc/YAML canonical source 假設已被取代。
- **本機邊界**：database 使用本機檔案；媒體與其他 binary storage 也在本機檔案系統。SQL engine、ORM、schema migration 工具、admin UI framework、local database 的精確檔案位置與對外 API contract 尚未選定。
- **公開邊界**：網站持續以 `https://wahengchang.github.io/ai-study-note/` 為公開輸出目標；GitHub Pages 只提供 build 產生的 static artifact，SQL database 不是 production runtime dependency。
- **遷移決策**：沒有 canonical 舊文章 corpus；不匯入舊內容、不建立 legacy redirects 或舊 sitemap。既有內容、schema 與 API 只可參考 `owlchi-site` 的 CMS 結構，不能直接繼承其架構或實作。
- **長期工作位置**：後續數週至一個月持續在 `site-reset` 分支與 `ai-study-note-reset` worktree 開發；目前不得合併至 `main`，也不得因 housekeeping 切換或移除此 worktree。
- **驗證**：本次只記錄決策落盤與建立 reset commit；提交前執行 `npm run check:ai-sync` 與 staged diff 檢查，提交後確認 branch、worktree 與 housekeeping 邊界。

## 已消化的舊 handoff

- `project-2026-08-25-1128/` 的立項、Keystatic Spike、Markdoc/YAML canonical source、Keystatic-specific CMS 客製化與 `article|skill` static template 內容已不再是有效實作規格。
- 其中仍有效的高層邊界已併入本 log：本機 authoring、local file storage、GitHub Pages static public output、project-site URL、無舊 corpus、顯式 Git publish。
- 該 handoff 不保留為 active specification；下一輪規劃必須從本 log 的 SQL CMS 決策開始，重新定義 database schema、Post Type、CMS、媒體 storage、migration、公開 build 與外部 API。
