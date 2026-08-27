# Dev Hub 大型工作檔案系統導入

- **Cycle ID**：`cycle-2026-08-27-2112-dev-hub-filesystem`
- **完成時間**：2026-08-27 21:20（UTC+08:00，本地時間）
- **狀態**：`completed`（合併前已完成並通過驗證）
- **Work Items**：`WI-001-define-dev-hub-policy`、`WI-002-sync-agent-instructions`
- **Work Group**：`WG-001-dev-hub-adoption`

## 交付

- 將 `.dev-hub/active/` 定義為可提交協作的進行中 Cycle 狀態中心，並建立第一個 Cycle 實際走完流程。
- 將 `.dev-hub/worktrees/` 與 `.dev-hub/runtime/` 定義為不得提交的本機暫態；完成歷史收斂至 `logs/`。
- 將完整流程集中於 `docs/dev-hub-workflow.md`，依 30 秒判斷、最短執行路徑、完成閘門與按需展開的 schema／closeout 細節漸進揭露。
- `MEMORY.md` 與 `.rulesync/rules/CLAUDE.md` 只保留大型工作觸發條件和 `docs/dev-hub-workflow.md` 引用入口；Rulesync 生成逐字一致的 `AGENTS.md` 與 `CLAUDE.md`。
- 以第一個 commit 交付完整變更與可審閱最終狀態，再以第二個且最後一個 commit 建立本完成紀錄並移除 active Cycle。

## 關鍵決策

- 只有既有定義的「大型工作」必須建立 Cycle；純問答、小型修正與唯讀查詢不建立。
- `docs/dev-hub-workflow.md` 是 Dev Hub 操作規則的單一入口；高頻規則先顯示，固定 schema 與 closeout 細節按需展開，避免每次載入完整流程。
- 既有 `dev-hub-*/` 維持唯讀 handoff 歷史；現行 `.dev-hub/` 只管理工作狀態與交付責任。
- Work Item 記錄「要做什麼」；Work Group 綁定單一 Branch、Worktree、PR，並負責一個或多個 Work Item。
- `contracts/README.md` 仍是 CMS／renderer implementation contract 唯一現行 SSOT，Dev Hub 不覆蓋其權威。
- `completed` 表示合併前已完成並通過驗證，不表示 PR 已 merged。

## 實際驗證

- Node `24.20.0`、npm `11.19.0`：`npm run sync:ai` 成功生成規則。
- `npm run check:ai-sync`：exit 0，Rulesync 回報所有檔案已同步。
- `cmp AGENTS.md CLAUDE.md`：exit 0；兩個生成檔的 Dev Hub 區段由九個詳細規則縮減為一個觸發條件與 `docs/dev-hub-workflow.md` 入口。
- 人工檢查 `docs/dev-hub-workflow.md`：包含持久化邊界、最短路徑、完成閘門、固定 schema、兩個 commit 與 closeout 規則。
- `git check-ignore -q .dev-hub/worktrees/probe` 與 `.dev-hub/runtime/probe`：exit 0；`.dev-hub/active/probe`：exit 1。
- 解析四個 Cycle Markdown frontmatter 並檢查固定欄位、允許狀態、WI-001／WI-002 只由 WG-001 認領、Branch／Worktree 與最終狀態：PASS。

## 已知限制／後續

- 無。PR 合併後才可依專案 housekeeping 流程移除本機 branch；本紀錄不宣稱 PR 已 merged。

## 相關變更

- **Branch**：`chore/dev-hub-filesystem`
- **PR**：https://github.com/wahengchang/ai-study-note/pull/244
- **Commits**：`chore(dev-hub): 導入大型工作狀態中心`、`docs(log): 完成 Dev Hub 檔案系統導入`
