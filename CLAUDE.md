# AI Study Note Reset — 專案設定

本專案是 JavaScript／TypeScript local-first CMS；公開網站只服務 published projection 產生的 static artifact。

## Authority and records

- `draft/`、`source-drafts/`、`dev-hub-*/`、`project-*/` 是唯讀歷史 handoff；不得修改、刪除、發布或重新抽取需求，除非 Owner 明確決定。
- 規劃、issue、CMS/renderer 實作前先讀 `MEMORY.md` 與 `contracts/README.md`。contract 是核准範圍與跨 owner boundary 的唯一來源；程式與對應測試是已實作行為 SSOT；改核准範圍只改 contract。
- `logs/` 根目錄固定 README 加三份主題摘要；completed Cycle 的跨階段摘要更新至對應主題檔。長期 Owner 決策進 `docs/adr/`；逐次交付、review 與完整驗證從 Git/PR、completed Dev Hub summary 與程式測試追溯。
- 大型工作先依 `docs/dev-hub-workflow.md` 操作 `.dev-hub/active/`；completed Cycle 必須移除 active state。純問答、小型修正與唯讀查詢不建立 Cycle。

## Git

- `site-reset` 是整合分支；只有本機 clean 且與 `origin/site-reset` 同步時，才能自它建立 feature branch/worktree。
- 所有進入 `site-reset` 的變更走 PR/merge；不得 cherry-pick 已合併 feature/integration commit。
- housekeeping 清理已合併分支後，確認 `site-reset` clean 並 `git pull --ff-only origin site-reset`。

## Engineering documentation

- 修改程式碼前讀 `docs/INDEX.md` 的相關路徑、public entry 與測試。
- 行為、邊界、資料流、公開介面或運維程序變更時，同步更新受影響文件與必要的鄰近 flow；文件不可把規劃誤寫為現況。

## AI sources

- 規則只改 `.rulesync/rules/`，技能只改 `.rulesync/skills/`；根目錄 `AGENTS.md`、`CLAUDE.md` 與 agent skill directories 都是 generated output。
- 修改 `.rulesync/` 後執行 `npm run sync:ai`，提交生成輸出，並以 `npm run check:ai-sync` 驗證。

## Collaboration

- 開發溝通、註解、文件與 commit message 使用臺灣繁體中文；識別字與外部 API 名稱除外。
- 有必要委派時，研究用 `scout`/`librarian`、UI 用 `designer`、實作用 `task`、機械工作用 `sonic`、一般審查用 `reviewer`、安全邊界加 `security-reviewer`；遵循 `.omp/config.yml` 的 role model。
- core module 實作前，依 `.rulesync/subagents/` 由兩個不同且非 owner 的專案子代理交叉審查；跨模型第二意見可補充，但不得取代此要求。
