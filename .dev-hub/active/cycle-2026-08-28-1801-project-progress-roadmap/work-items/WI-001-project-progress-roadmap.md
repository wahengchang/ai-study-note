---
id: WI-001
status: in_progress
title: Project progress roadmap governance
work_group: WG-001-project-progress-roadmap
depends_on: []
github_issue: 252
---

# Outcome

交付 repository 內手動 active Dev Hub 總覽：11 張 active + recursive dependency Issue snapshot、Cycle／Work Item／Work Group join，以及可直接開啟的單檔 HTML 四視圖。

# Acceptance

- `issues.json` 與 `links.json` 使用 schema v2，保存四張 linked active Issues 與其完整七張遞迴前置 dependency-only snapshots；兩份資料的 timestamp 同步。
- renderer 對 closure、join、合併 dependency cycle、PR URL、local path 與輸出一致性 fail closed，能直接產生無外部依賴的 HTML。
- 預設緊湊表格只顯示五欄；依賴階段、Cycle、狀態 View、named filters 與同一份 localStorage preference 均可在 `file://` 使用。
- Dev Hub workflow 記錄唯一的手動 closure 更新規則、驗證指令與 localStorage 非 SSOT 邊界。

# Notes

對應 GitHub #252 的既有 Issue identity；本工作不讀寫 GitHub Project、Project API 或 GitHub Issue。