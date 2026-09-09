# Housekeeping Base Synchronization

- Cycle：`cycle-2026-09-09-1809-housekeeping-base-sync`
- 完成時間：2026-09-09T18:12:26+08:00
- 狀態：completed

## 交付

- post-merge housekeeping 在清理已合併分支後，必須同步乾淨的 `site-reset` worktree。
- 同步限定 `git pull --ff-only origin site-reset`；若 worktree dirty 或 fast-forward 失敗，阻擋下一個 branch／worktree。
- `AGENTS.md`、`CLAUDE.md` 與 housekeeping skill 使用相同規則。

## 關鍵決策

- `site-reset` 是預設主整合分支；下一個 branch 或 worktree 只能從與 `origin/site-reset` 相同的本機基底建立。

## 實際驗證

- `git diff --check` 通過。
- `AGENTS.md` 與 `CLAUDE.md` 內容一致。
- 已實際執行 `git pull --ff-only origin site-reset`；同步至 `f145340`，工作樹乾淨。

## 已知限制／後續

無。下一次已合併 PR 的 housekeeping 會實際套用此同步流程。

## 相關變更

- Branch：`chore/housekeeping-base-sync`
- PR：[#338](https://github.com/wahengchang/ai-study-note/pull/338)
