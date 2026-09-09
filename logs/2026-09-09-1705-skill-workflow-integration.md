# 技能工作流程整併與 rulesync 對齊

- 完成時間：2026-09-09 17:05（UTC+8）
- 相關 PR：https://github.com/wahengchang/ai-study-note/pull/333
- 相關 branch：`chore/do-work-dev-hub`（base `site-reset`）

## 交付

- 新增 `ai-x`、`demo-e2e`、`grill-me`、`writing-for-agents` 技能；`do-work` 改以 Dev Hub Cycle／Work Item／Work Group 取代舊 GitHub Ticket 流程；移除 `grilling`。
- 所有技能的 canonical source 由 `.agents/skills/` 移至 `.rulesync/skills/<name>/SKILL.md`，並提交 `npm run sync:ai` 生成的 `.claude/skills/`、`.agents/skills/`、`.opencode/skills/` 輸出。
- `.rulesync/rules/CLAUDE.md` 新增「AI 指令與技能同步」段落，`docs/INDEX.md` 的 AI 指令列補上技能 canonical source 與生成輸出；`AGENTS.md`／`CLAUDE.md` 依同步重新產生。
- 修正既有技能與本專案的矛盾：`to-tickets` 改寫 Dev Hub Work Item、`to-spec` 改寫 `specs/`、兩者移除不存在的 `/setup-matt-pocock-skills` 與 `.scratch/`；`housekeeping` 補 `.dev-hub/worktrees/` 與 Dev Hub 狀態回報；`handoff` 補回敏感資訊遮蔽與參數處理。

## 關鍵決策

- **技能放 `.rulesync/skills/`，不放 `.agents/skills/`。** `.agents/skills/` 是 rulesync `codexcli` target 的生成輸出，`rulesync.jsonc` 設定 `delete: true`；手寫在該處的技能會被 `npm run sync:ai` 刪除，`npm run check:ai-sync` 也會失敗。
- **user-invoked 技能不得被其他技能呼叫。** `disable-model-invocation: true` 只保留在 `.claude/skills/` 輸出，`.agents/`、`.opencode/` 不帶此欄位；`do-work`、`housekeeping` 原本要求呼叫 `/handoff`（user-invoked）改為自行輸出交接摘要。
- **不重複 `docs/dev-hub-workflow.md`。** `do-work` 只描述單一 Work Item 的執行順序，schema、狀態值、commit 規則一律指回該檔。
- **`.dev-hub/active/` 目前有多個 Cycle**，`do-work` 與 `to-tickets` 因此要求「超過一個 active Cycle 時由使用者指定」，不得自行挑選。
- 新增技能中的英文原稿（`grill-me`、`writing-for-agents`）改寫為 zh-TW，並刪除上游專案殘留的死連結（`grill-with-docs`、`ask-matt`、`/writing-great-skills` 更名說明）。

## 實際驗證

- `rulesync generate --check`（等同 `npm run check:ai-sync`，以 rulesync 16.26.1 執行）：修正前 exit 1，列出會刪除 `.agents/skills/` 全部九個技能；修正後 exit 0，`✓ All files are up to date.`
- 沙箱重現：在 `.agents/skills/` 手寫技能後執行 `rulesync generate`，該目錄確實被刪除；改放 `.rulesync/skills/` 後同時產生 `.claude/skills/`、`.agents/skills/`、`.opencode/skills/`，且同目錄附檔（如 `SKILL-MECHANICS.md`）會一併同步。
- 未執行 `npm run check`：本次沒有 TypeScript／runtime 變更。

## 已知限制／後續

- `to-spec`、`to-tickets`、`handoff`、`housekeeping` 本文仍為英文，與 zh-TW 開發語言規範不一致；本次只改與專案路徑／流程矛盾的部分，全面翻譯留待後續決定。
- 技能為操作指示，尚未以真實 active Cycle 完整演練 `do-work`；首次使用時應對照 Work Item schema 驗證步驟。
- `demo-e2e` 需要可見視窗，遠端／CI 環境無法執行，該技能已要求直接回報 blocker。
