---
title: "Claude Code Agent Teams 協作指南"
description: "Multi-agent team coordination in Claude Code — team lead, teammates, shared task lists, and mailbox messaging"
tags:
  - research
  - claude-code
  - agent-architecture
  - guide
---

# Claude Code Agent Teams 協作指南

> Agent Teams 讓你同時啟動多個 Claude Code 實例，組成一支「AI 團隊」。一個 session 當隊長（team lead），負責分工、協調與彙整；其他隊友（teammates）各自獨立運作，擁有自己的 context window，彼此還能直接溝通。

---

## 什麼是 Agent Teams？

Agent Teams 是 Claude Code 的實驗性功能，允許你協調多個 Claude Code session 一起工作。與一般的 [subagents](https://code.claude.com/docs/en/sub-agents) 不同，subagents 只能回報結果給主 agent，而 Agent Teams 的隊友可以**互相溝通**、**共用任務清單**、**自主領取任務**。

### 核心架構

| 元件 | 角色 |
|:-----|:-----|
| **Team Lead** | 主 session，建立團隊、分派任務、協調工作 |
| **Teammates** | 獨立的 Claude Code 實例，各自執行被指派的任務 |
| **Task List** | 共享任務清單，隊友可以認領與完成任務 |
| **Mailbox** | Agent 之間的訊息系統 |

---

## Agent Teams vs Subagents 比較

| | Subagents | Agent Teams |
|:--|:----------|:------------|
| **Context** | 有自己的 context window，結果回傳給呼叫者 | 有自己的 context window，完全獨立 |
| **溝通方式** | 只能回報給主 agent | 隊友之間可以直接傳訊 |
| **協調方式** | 主 agent 管理所有工作 | 共享任務清單 + 自主協調 |
| **適用場景** | 只需要結果的聚焦任務 | 需要討論、挑戰與協作的複雜工作 |
| **Token 成本** | 較低（結果摘要回傳） | 較高（每個隊友都是獨立 Claude 實例） |

**簡單來說：** Subagents 像派人去辦事然後回報，Agent Teams 像開一場多人協作會議。

---

## 如何啟用

Agent Teams 預設關閉，需手動啟用。在 `settings.json` 中加入：

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

> 需要 Claude Code v2.1.32 以上版本。

---

## 啟動你的第一支 Agent Team

直接用自然語言告訴 Claude 你想要什麼團隊：

```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

Claude 會自動建立團隊、產生隊友、分配工作。

---

## 操控團隊

### 顯示模式

| 模式 | 說明 |
|:-----|:-----|
| **In-process** | 所有隊友在同一個 terminal 內運行，用 `Shift+Down` 切換隊友 |
| **Split panes** | 每個隊友有自己的 pane（需要 tmux 或 iTerm2） |

設定方式：

```json
{
  "teammateMode": "in-process"
}
```

或用 flag：

```bash
claude --teammate-mode in-process
```

### 指定隊友數量與模型

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

### 要求隊友先提交計畫

對於高風險任務，可以要求隊友在動手之前先提出方案：

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

隊友提出計畫後，隊長會審核。被拒絕的話，隊友會修改方案重新提交。

### 直接跟隊友對話

- **In-process 模式**：`Shift+Down` 切換隊友，直接輸入訊息
- **Split-pane 模式**：直接點進隊友的 pane

### 任務分配與認領

任務有三種狀態：**pending → in progress → completed**。任務可以設定依賴關係。

- **隊長指派**：告訴隊長把哪個任務給誰
- **自主認領**：隊友完成任務後自動撿下一個未被認領的任務

### 關閉隊友與清理

```text
Ask the researcher teammate to shut down
```

全部完成後：

```text
Clean up the team
```

> 務必用隊長來清理，不要讓隊友執行 cleanup。

---

## 用 Hooks 強化品質管控

- **`TeammateIdle`**：當隊友即將閒置時觸發，exit code 2 可以給回饋讓隊友繼續工作
- **`TaskCompleted`**：當任務標記完成時觸發，exit code 2 可以阻止完成並給回饋

---

## 最佳實踐

1. **給隊友足夠的上下文**：隊友不會繼承隊長的對話歷史，在 spawn prompt 中寫清楚需求細節
2. **團隊規模 3-5 人最佳**：太少沒有平行優勢，太多協調成本太高
3. **每位隊友 5-6 個任務**：保持產出效率又不會過度切換
4. **任務大小要適中**：太小 → 協調成本大於效益；太大 → 隊友埋頭做太久風險高
5. **避免檔案衝突**：兩個隊友編輯同一個檔案會覆蓋，確保每人負責不同檔案
6. **讓隊長等隊友**：如果發現隊長自己開始做事，告訴它「Wait for your teammates to complete」
7. **先從研究/review 開始**：新手建議先用不需要寫 code 的任務體驗

---

## 已知限制

- `/resume` 和 `/rewind` 無法恢復 in-process 隊友
- 任務狀態偶爾會 lag，需手動檢查
- 一個 session 只能帶一支團隊
- 隊友不能再產生子團隊（無巢狀團隊）
- 隊長不可更換
- Split pane 不支援 VS Code 內建 terminal、Windows Terminal、Ghostty

---

## 日常應用情境

### 情境一：多角度 Code Review

**場景：** 你提了一個 PR，想要全面的 review，但一個人容易只看到一類問題。

```text
Create an agent team to review my latest PR.
- Teammate 1: Focus on security (SQL injection, XSS, auth issues)
- Teammate 2: Focus on performance (N+1 queries, memory leaks, slow algorithms)
- Teammate 3: Focus on code quality and test coverage
Synthesize all findings into a summary.
```

**為什麼好用：** 三個隊友同時從不同角度審查，互不干擾，隊長最後彙整出完整報告。比一個人逐一檢查快 3 倍，而且不會遺漏。

---

### 情境二：Bug 偵探 — 競爭假說調查

**場景：** Production 出現一個難以重現的 bug，你不確定根因是什麼。

```text
Users report intermittent 500 errors on the checkout API.
Create an agent team with 3 investigators:
- Teammate 1: Check database connection pool and query timeouts
- Teammate 2: Investigate third-party payment API response patterns
- Teammate 3: Analyze recent deployments and config changes
Have them debate and challenge each other's findings.
```

**為什麼好用：** 單人調查容易陷入第一個看似合理的假說（錨定效應）。多位隊友各自調查不同方向，互相挑戰彼此的結論，最終存活下來的假說更可能是真正的根因。

---

### 情境三：平行開發新功能的不同模組

**場景：** 你要開發一個新功能，涉及 frontend、backend、和測試三個層面。

```text
We're building a new user notification system. Create an agent team:
- Teammate 1: Build the backend API endpoints (src/api/notifications/)
- Teammate 2: Build the frontend notification component (src/components/notifications/)
- Teammate 3: Write integration tests (tests/notifications/)
Each teammate owns their own directory. Coordinate on the API contract first.
```

**為什麼好用：** 三個隊友各自負責不同目錄，不會產生檔案衝突。先在 API contract 上達成共識，然後各自平行開發，大幅縮短開發時間。

---

## 參考連結

- [官方文件：Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Subagents 文件](https://code.claude.com/docs/en/sub-agents)
- [Hooks 文件](https://code.claude.com/docs/en/hooks)
- [Git Worktrees 平行工作](https://code.claude.com/docs/en/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees)

## Related

- [[awesome-agent-skills-guide|Awesome Agent Skills 精選清單]]
- [[gsd-framework-scenarios|GSD 框架實戰情境]]
- [[learn-claude-code-guide|AI Agent 駕駛框架全解析]]
