---
title: "Claude Code Hooks 入門指南"
description: "Deterministic automation hooks for Claude Code — auto-format, block dangerous commands, send notifications"
tags:
  - guide
  - claude-code
  - automation
---

# Claude Code Hooks 入門指南

> Hooks（鉤子）是 Claude Code 的自動化機制，讓你在特定時機自動執行 shell 指令、呼叫 API 或觸發 AI 判斷。你可以用它來格式化程式碼、阻擋危險操作、發送通知等，不再依賴 Claude 自己「記得」要做什麼。

---

## 什麼是 Hooks？

Hooks 是你自己定義的指令，會在 Claude Code 生命週期的特定時間點自動執行。例如：

- Claude **編輯檔案後** → 自動跑 formatter
- Claude **要執行指令前** → 檢查是否有危險操作
- Claude **等待你輸入時** → 發送桌面通知

核心概念：**確定性控制**。不是「拜託 Claude 記得做」，而是「系統保證一定會執行」。

---

## 基本架構

Hook 設定寫在 JSON 設定檔中，結構如下：

```json
{
  "hooks": {
    "事件名稱": [
      {
        "matcher": "過濾條件（regex）",
        "hooks": [
          {
            "type": "command",
            "command": "要執行的指令"
          }
        ]
      }
    ]
  }
}
```

三層結構：
1. **事件（Event）**：什麼時候觸發？（如 `PostToolUse`）
2. **Matcher**：哪些工具或情境才觸發？（如 `Edit|Write`）
3. **Hook 本體**：要做什麼？（如跑 `prettier`）

---

## 設定檔位置

| 位置 | 作用範圍 | 可以共享？ |
|------|---------|-----------|
| `~/.claude/settings.json` | 所有專案（全域） | 否，只在本機 |
| `.claude/settings.json` | 單一專案 | 可以，能 commit 到 repo |
| `.claude/settings.local.json` | 單一專案 | 否，被 gitignore |

---

## Hook 類型

| 類型 | 說明 | 適用場景 |
|------|------|---------|
| `command` | 執行 shell 指令 | 跑 linter、formatter、寫 log |
| `http` | POST 到 HTTP endpoint | 送到外部服務、webhook |
| `prompt` | 用 AI 做 yes/no 判斷 | 需要「判斷力」的決策 |
| `agent` | 啟動子 agent 做複雜驗證 | 需要讀檔案、跑測試才能決定 |

---

## 主要事件一覽

| 事件 | 觸發時機 | 常見用途 |
|------|---------|---------|
| `SessionStart` | 會話開始或恢復 | 注入環境變數、提醒重要資訊 |
| `PreToolUse` | 工具執行**前** | 阻擋危險操作、保護檔案 |
| `PostToolUse` | 工具執行**後** | 自動格式化、記錄 log |
| `Notification` | Claude 等待你的輸入 | 桌面通知 |
| `Stop` | Claude 完成回應 | 檢查任務是否真的完成 |
| `UserPromptSubmit` | 你送出 prompt 後 | 注入額外 context |
| `ConfigChange` | 設定檔變更 | 稽核記錄 |
| `SubagentStart/Stop` | 子 agent 啟動/結束 | 監控子 agent 行為 |

---

## 運作原理：輸入與輸出

### 輸入（stdin）

每次觸發時，Claude Code 會將事件資訊以 JSON 傳入你的腳本的 stdin：

```json
{
  "session_id": "abc123",
  "cwd": "/Users/you/myproject",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  }
}
```

### 輸出（exit code）

| Exit Code | 意義 | 效果 |
|-----------|------|------|
| `0` | 成功 | 動作繼續執行 |
| `2` | 阻擋 | 動作被取消，stderr 訊息回饋給 Claude |
| 其他 | 非阻擋錯誤 | 記錄到 log，不影響執行 |

也可以 exit 0 後輸出結構化 JSON 到 stdout，做更細緻的控制（如 `allow`、`deny`、`ask`）。

---

## 日常實用情境

### 情境一：編輯檔案後自動格式化

**問題**：Claude 改完程式碼，格式不一定符合團隊規範。
**解法**：用 `PostToolUse` hook，在每次 `Edit` 或 `Write` 後自動跑 Prettier。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

**放在**：`.claude/settings.json`（專案層級，可以 commit 共享給團隊）

---

### 情境二：Claude 完成工作時發通知

**問題**：Claude 在跑長任務，你切去做其他事，不知道它什麼時候做完。
**解法**：用 `Notification` hook，Claude 需要你注意時自動發桌面通知。

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Claude Code 需要你的注意'"
          }
        ]
      }
    ]
  }
}
```

**放在**：`~/.claude/settings.json`（全域，所有專案通用）

> macOS 用戶改用：`osascript -e 'display notification \"Claude Code 需要你的注意\" with title \"Claude Code\"'`

---

### 情境三：阻擋危險的 shell 指令

**問題**：Claude 可能不小心跑出 `rm -rf` 等破壞性指令。
**解法**：用 `PreToolUse` hook，在 Bash 指令執行前檢查。

建立腳本 `.claude/hooks/block-dangerous.sh`：

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE '(rm -rf|drop table|truncate)'; then
  echo "已阻擋：偵測到危險指令 - $COMMAND" >&2
  exit 2
fi

exit 0
```

記得執行 `chmod +x .claude/hooks/block-dangerous.sh`，然後加入設定：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous.sh"
          }
        ]
      }
    ]
  }
}
```

**放在**：`.claude/settings.json`（專案層級）

---

## 除錯技巧

- 輸入 `/hooks` 瀏覽目前所有已設定的 hooks
- 按 `Ctrl+O` 開啟 verbose 模式，可以在 transcript 中看到 hook 的輸出
- 用 `claude --debug` 啟動，可看到完整的 hook 執行細節
- 手動測試腳本：`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./my-hook.sh`

---

## 常見問題

**Q：Hook 沒有被觸發？**
- 用 `/hooks` 確認 hook 出現在正確的事件下
- Matcher 是 case-sensitive，檢查大小寫
- 確認事件類型正確（`PreToolUse` 是執行前，`PostToolUse` 是執行後）

**Q：JSON 解析失敗？**
- 你的 `~/.zshrc` 或 `~/.bashrc` 可能有 `echo` 輸出，會干擾 JSON。用 `[[ $- == *i* ]]` 包起來，確保只在互動式 shell 才輸出。

**Q：Stop hook 進入無限循環？**
- 在腳本中檢查 `stop_hook_active` 欄位，若為 `true` 直接 `exit 0`。

---

## 延伸閱讀

- [Hooks 完整參考文件](https://code.claude.com/docs/en/hooks)：所有事件的完整 schema、JSON 格式、進階功能
- [Hooks 實用指南](https://code.claude.com/docs/en/hooks-guide)：更多使用範例與最佳實踐
- [官方範例：Bash 指令驗證器](https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py)

## Related

- [[gsd-framework-scenarios|GSD 框架實戰情境]]
- [[claude-folder-anatomy-guide|.claude/ 資料夾完全解析]]