---
id: cycle-2026-08-28-1801-project-progress-roadmap
status: active
created_at: 2026-08-28T18:01:26+08:00
updated_at: 2026-08-28T21:56:10+08:00
---

# Goal

建立 repository 內可手動維護、可由預設 Chrome 直接開啟的 active Dev Hub 工作總覽；以 active Issues 的完整遞迴前置 closure 呈現執行順序與個人化工作檢視。

# Scope

- 建立 11-issue closure 與本地 Cycle／Work Item／Work Group 關聯的兩份 JSON。
- 由 JSON 產生不依賴網路的單檔 HTML，提供緊湊表格、依賴階段、Cycle、狀態四個 View，以及 localStorage named filter／欄位 preference。
- 記錄手動同步規則、coverage 邊界與實際 Chrome 驗證。

# Context

GitHub Issue 保存 requirement／acceptance；active Cycle、Work Item 與 Work Group 保存執行現況。兩份 JSON 與衍生 HTML 只是在 repository 內可重建的手動 overview projection，第一版僅涵蓋明確選定的 active Dev Hub 工作，不代表全部 open GitHub Issues。