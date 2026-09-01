---
title: "終端多工與 Claude Code 效率工作流研究"
description: "Terminal multiplexing for Claude Code — cmux, tmux, zellij comparison and practical multi-pane workflow patterns"
tags:
  - research
  - claude-code
  - devops
  - tmux
---

## TL;DR

- 社群瘋傳「用了這個終端，Claude Code 效率翻 3 倍」，指的是 **cmux** — 一個專為 AI coding agent 打造的 macOS 原生終端
- cmux 不是 tmux 的 fork，而是基於 libghostty 的全新 Swift 應用程式，內建分割面板、嵌入式瀏覽器、socket API 與通知系統
- 另外還有一個同名的 CLI 工具 [craigsc/cmux](https://github.com/craigsc/cmux)，專門管理 Git worktree + Claude Code session
- Claude Code 本身已內建 **Agent Teams**（實驗性功能）與 **Git worktree** 支援，搭配任意終端多工工具即可達成多 agent 並行
- 實務上 **4-6 個並行 session** 是多數開發者的效率甜蜜點，超過反而增加 context-switching 成本

## cmux 是什麼？

社群中提到的「cmux」其實指兩個不同工具：

### 1. cmux 終端應用程式（cmux.com）

- **定位**：macOS 原生終端，專為 AI coding agent 設計
- **技術底層**：Swift + AppKit，使用 libghostty 渲染引擎（非 Ghostty fork）
- **平台**：macOS 14.0+，免費開源
- **核心功能**：
  - 垂直分頁（Vertical Tabs）— sidebar 顯示 git branch、工作目錄、listening ports
  - 分割面板（Split Panes）— 水平/垂直分割
  - 嵌入式瀏覽器 — 可程式化操控，支援 JS 執行、表單填寫、console log 讀取
  - 通知環（Notification Rings）— agent 需要注意時面板會亮起
  - Socket API — CLI 與 socket 介面控制 workspace 建立、面板分割、輸入控制
  - GPU 加速渲染

### 2. craigsc/cmux（CLI 工具）

- **定位**：Git worktree 管理 CLI，讓多個 Claude Code agent 在同一 repo 並行工作
- **技術底層**：純 Bash，僅需 Git + Claude CLI
- **核心指令**：

| 指令 | 用途 |
|------|------|
| `cmux new <branch>` | 建立 worktree + 啟動 Claude session |
| `cmux start <branch>` | 恢復既有 worktree |
| `cmux merge [branch]` | 合併變更到主分支 |
| `cmux rm [branch]` | 刪除 worktree + branch |
| `cmux ls` | 列出所有活躍 worktree |
| `cmux init` | 透過 Claude 產生 setup hooks |

- **工作流範例**：

```bash
cmux new feature-auth       # 開新功能
cmux new fix-payments       # 同時開 hotfix（完全隔離）
cmux merge fix-payments --squash && cmux rm fix-payments  # 合併 + 清理
cmux start feature-auth     # 回去繼續做功能
```

## 工具比較表

| 特性 | cmux (終端) | cmux (CLI) | tmux | zellij | screen | WezTerm |
|------|:-----------:|:----------:|:----:|:------:|:------:|:-------:|
| 平台 | macOS only | 跨平台 | 跨平台 | 跨平台 | 跨平台 | 跨平台 |
| 類型 | GUI 應用程式 | CLI 工具 | 終端多工器 | 終端多工器 | 終端多工器 | GPU 終端 |
| AI agent 優化 | 原生支援 | 原生支援 | 手動設定 | 手動設定 | 手動設定 | 手動設定 |
| 分割面板 | 內建 | N/A | 內建 | 內建 | 有限 | 內建 |
| Session 持久化 | 有 | 有 (worktree) | 有 | 有 | 有 | 無 |
| 通知系統 | 原生桌面通知 | 無 | 需外掛 | 無 | 無 | 無 |
| 嵌入式瀏覽器 | 有 | 無 | 無 | 無 | 無 | 無 |
| Worktree 管理 | 無 | 核心功能 | 無 | 無 | 無 | 無 |
| 學習曲線 | 低 | 低 | 高 | 中 | 高 | 低 |
| 遠端伺服器 | 不支援 | 支援 | 最佳 | 支援 | 支援 | 部分 |
| Plugin 系統 | Socket API | setup hooks | 成熟生態系 | WASM 沙盒 | 無 | Lua |
| Claude Code 整合 | 原生 | 原生 | 官方支援 | 需手動 | 需手動 | 需手動 |

### 選擇建議

- **macOS + 想要零設定**：cmux 終端應用程式
- **多 agent 並行 + worktree 管理**：craigsc/cmux CLI
- **遠端伺服器 / SSH**：tmux（最穩定、最泛用）
- **新手友善 + 現代 UI**：zellij（內建快捷鍵提示）
- **既有 tmux 用戶**：繼續用 tmux，Claude Code 已原生支援 split-pane mode

## 推薦 Claude Code 多面板佈局

### 四面板基礎佈局

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│   Claude Code       │   測試 / 建置       │
│   (主要 agent)      │   (npm test / build)│
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│   Git / PR          │   Logs / 監控       │
│   (git status, gh)  │   (tail -f, htop)   │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

### 各面板職責

| 面板 | 用途 | 常用指令 |
|------|------|----------|
| 主 agent | Claude Code 互動 | `claude`、`claude --resume` |
| 測試/建置 | 持續驗證 agent 產出 | `npm test`、`npm run build`、`npx tsc --noEmit` |
| Git/PR | 版本控制操作 | `git diff`、`git log`、`gh pr view` |
| Logs/監控 | 即時觀察系統狀態 | `tail -f logs/*`、`htop`、`claude --view-logs` |

## 實用工作流（最小可行設定）

### 方案 A：tmux（推薦給大多數人）

```bash
# 建立 session
tmux new-session -s claude-work

# 分割面板
# Ctrl+b % → 垂直分割
# Ctrl+b " → 水平分割

# 面板 1：Claude Code
claude

# 面板 2：測試
npm run test -- --watch

# 面板 3：Git
git log --oneline -20

# 切換面板：Ctrl+b 方向鍵
```

### 方案 B：cmux CLI（多 agent 並行）

```bash
# 安裝
curl -fsSL https://github.com/craigsc/cmux/releases/latest/download/install.sh | sh
echo '.worktrees/' >> .gitignore

# 同時開兩個 agent
cmux new feature-login    # agent 1：做登入功能
cmux new fix-css-bug      # agent 2：修 CSS bug

# 查看所有 agent
cmux ls

# 合併完成的工作
cmux merge fix-css-bug --squash
cmux rm fix-css-bug
```

### 方案 C：Claude Code Agent Teams（內建功能）

```bash
# 啟用實驗性功能
# 在 settings.json 加入：
# { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }

# 啟動 Claude Code，告訴它建立 team
claude

# 在對話中輸入：
# "Create an agent team with 3 teammates:
#  - one for frontend changes
#  - one for backend API
#  - one for test coverage"
```

Agent Teams 特性：

- Team lead 協調工作分配
- 共享 task list，teammate 可自行領取任務
- Teammate 之間可直接通訊（不只是回報給 lead）
- 支援 tmux / iTerm2 split-pane 顯示模式
- 每個 teammate 有獨立的 context window

## 進階模式：Worktree + 多工器

將 Git worktree 與終端多工器結合，是目前社群公認的最佳實踐：

```bash
# 1. 為每個任務建立 worktree
git worktree add -B feature-auth ../project-auth main
git worktree add -B fix-perf ../project-perf main

# 2. 在 tmux 不同 window 開啟各自的 Claude Code
tmux new-window -n auth -c ../project-auth
tmux send-keys -t auth 'claude' Enter

tmux new-window -n perf -c ../project-perf
tmux send-keys -t perf 'claude' Enter

# 3. 切換 window 查看進度
# Ctrl+b n → 下一個 window
# Ctrl+b p → 上一個 window
```

### 為什麼要用 worktree？

- **檔案隔離**：每個 agent 有自己的工作目錄，不會互相覆蓋
- **共享 .git**：所有 worktree 共用同一個 git database，不需要重複 clone
- **Branch 安全**：每個 worktree 綁定獨立 branch，merge 衝突可控
- Claude Code 自 2026 年 2 月起原生支援 `claude --worktree task-name`

### 實務限制

- 並行 session 建議控制在 **4-6 個**，超過後 context-switching 成本 > 效率增益
- Agent Teams 目前仍是實驗性功能，有 session 恢復、關閉行為等已知限制
- 每個 teammate 獨立消耗 token，token 成本隨 teammate 數量線性增長

## Quick Reference

```bash
# tmux 常用快捷鍵
Ctrl+b %        # 垂直分割
Ctrl+b "        # 水平分割
Ctrl+b 方向鍵    # 切換面板
Ctrl+b d        # Detach session
tmux ls         # 列出 session
tmux a -t name  # Attach session

# cmux CLI
cmux new <branch>     # 新建 worktree + Claude session
cmux start <branch>   # 恢復 worktree
cmux ls               # 列出 worktree
cmux merge <branch>   # 合併變更
cmux rm <branch>      # 清除 worktree

# Claude Code worktree（原生）
claude --worktree task-name   # 建立隔離工作目錄

# Claude Code Agent Teams
claude --teammate-mode in-process   # 所有 teammate 在同一終端
claude --teammate-mode tmux         # 每個 teammate 獨立 pane
```

## 延伸閱讀

- [cmux 官網](https://cmux.com)
- [craigsc/cmux GitHub](https://github.com/craigsc/cmux)
- [Claude Code Agent Teams 文件](https://code.claude.com/docs/en/agent-teams)
- [Claude Code + tmux workflow](https://www.devas.life/how-to-run-claude-code-in-a-tmux-popup-window-with-persistent-sessions/)
- [How to Run Multiple Claude Code Sessions](https://willness.dev/blog/run-multiple-claude-code-sessions)
- [Better Stack — cmux Guide](https://betterstack.com/community/guides/ai/cmux-terminal/)
