# CMS workspace router

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog` / `WG-019`
- **完成時間**：2026-09-07T11:11:30+08:00
- **狀態**：completed

## 交付

- 將 GitHub #257 收斂為 CMS Workspace router，建立八個 surface Issue：#314–#321，並新增 `WI-055`–`WI-062`。
- 固定各 surface 的 canonical UI paths、dependency、browser outcome 與 a11y gate；Entry article-first vertical slice 留給 `WI-056` 後續 Work Group。
- `WI-061`／#320 明確 blocked 至 Owner release/GitHub Pages final-phase 決策。
- `WI-031` 與 `WI-040` 的 Preview／Local Public UI 前置由舊 `WI-028`／`WI-029` umbrella 改為已完成的 `WI-053`／`WI-054`。
- 契約 §6–7 明定 Ajv/Playwright 的 app-only 責任、browser secret response carve-out、fragment/proof/ticket lifecycle、CMS document/assets Fetch Metadata matrix，以及 #289 Preview 的唯一 Projection public-seam exception。

## 關鍵決策

- #280 只交付 browser ticket/session bootstrap；CMS article API/UI 不可混入其 Work Group。
- 未交付 surface 不進 production nav，server history allowlist 只隨已交付 route 擴張。

## 實際驗證

- `gh issue view 257/280/289 --json state,body`：確認 router、API-06 與 Projection owner-seam cross-link。
- `gh issue list --state open --search 'CMS-UI-'`：確認 #314–#321 八個新 CMS surface Issue。
- `git diff --check`：通過。

## 已知限制／後續

- 無 runtime implementation；後續依序由 #280 browser bootstrap 與 article-first vertical slice 的獨立 Work Group 交付。

## 相關 Branch／PR

- Branch：`feature/cms-workspace-router`
- PR：https://github.com/wahengchang/ai-study-note/pull/322
