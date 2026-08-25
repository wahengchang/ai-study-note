# 確立 SQL CMS 架構方向並提交網站重設

- **交付**：將 SQL CMS 架構與長期 `site-reset` 工作位置記入 `MEMORY.md`；把既有網站重設差異、專案 agent 路由設定與本次決策紀錄納入單一本機 commit。
- **關鍵決策**：新的 authoring canonical source 採關聯式 SQL database，建立完整 CMS；Post Type 是一級模型，定義各內容類型的欄位、關係、驗證與公開版型，保留後續客製化空間。`project-*` 內的 Keystatic 與 Git-tracked Markdoc/YAML canonical source 假設已被取代。後續數週至一個月持續在 `site-reset` 分支與 `/Volumes/UGREEN 2TB /projects/ai-study-note-reset` worktree 開發；目前不合併至 `main`，也不因 housekeeping 切換或移除此 worktree。
- **公開目標**：網站持續以 `https://wahengchang.github.io/ai-study-note/` 為公開輸出目標；SQL database 不得被視為 GitHub Pages runtime dependency。
- **驗證**：本次只記錄決策落盤與建立 reset commit；提交前執行 `npm run check:ai-sync` 與 staged diff 檢查，提交後確認 branch、worktree 與 housekeeping 邊界。
- **限制／後續**：尚未選定 SQL engine、ORM、資料庫部署位置、schema migration 工具或 admin UI framework；本紀錄不將這些未定項目描述為既定技術。
- **相關變更**：`MEMORY.md`、`.omp/config.yml`、`.gitignore` 與既有網站重設刪除；`project-2026-08-25-1128/`、`draft/` 維持唯讀且不納入 commit。
