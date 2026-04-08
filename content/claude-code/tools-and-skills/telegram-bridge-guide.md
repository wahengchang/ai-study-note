---
title: "Telegram Bot 橋接 Claude Code 運作原理"
description: "How Telegram Bot Plugin bridges messages to a persistent Claude Code CLI session for remote file and code operations"
tags:
  - guide
  - claude-code
  - telegram
---

> Telegram Bot Plugin 可以將你的 Telegram 訊息橋接到正在執行的 Claude Code 會話，讓你用手機就能遠端操控 Claude Code——讀寫檔案、執行程式碼、管理專案，全部透過 Telegram 對話完成。

---

## 核心概念：什麼是「橋接」？

「This bot bridges Telegram to a Claude Code session」——這句話的重點是 **session**。

它不是每次呼叫 Anthropic API 重新發問，而是橋接到一個**持續存活的 Claude Code CLI 程序**。這個程序能記住對話上下文、能讀寫你電腦上的真實檔案。

---

## 系統架構總覽

```
┌─────────────────────────────────────────────────────────┐
│                     使用者 (Telegram)                     │
│                    發送訊息 / 接收回應                     │
└──────────────────────┬──────────────────────────────────┘
                       │ MTProto（Telegram 自研加密協定）
                       ▼
┌─────────────────────────────────────────────────────────┐
│               Telegram Bot API Server                    │
│            api.telegram.org/bot<TOKEN>                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS Long Polling
                       │ (你的電腦主動去問 Telegram)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              你的電腦 (macOS / Linux)                     │
│                                                         │
│   Claude Code App                                       │
│   ├── Telegram Plugin (Long Polling 輪詢)               │
│   ├── Session Manager (會話管理)                         │
│   └── Claude Code CLI (實際執行工作)                     │
│                                                         │
│   關鍵目錄：                                             │
│   ~/.claude/plugins/cache/.../telegram/   ← Plugin 程式 │
│   ~/.claude/channels/telegram/            ← 配對資料     │
│   ~/.claude/plugins/data/telegram-inline  ← 執行資料     │
└─────────────────────────────────────────────────────────┘
```

---

## 兩層通訊協定詳解

這個橋接系統有兩條完全不同性質的通道：

### 第一層：你的電腦 ↔ Telegram（HTTP Long Polling）

```
你的電腦                         Telegram 伺服器
    │                                  │
    │── GET /getUpdates?timeout=60 ──►│
    │                                  │
    │      （Telegram 掛住連線，       │
    │        最多等 60 秒）            │
    │                                  │
    │   有新訊息？馬上回傳！           │
    │◄──── JSON Response ─────────────│
    │                                  │
    │── GET /getUpdates?timeout=60 ──►│  ← 立刻再問一次
    │          ...重複...              │
```

**重點：**
- **不是 WebSocket**，不是 SSE，就是普通的 HTTP GET 請求
- Telegram 收到請求後「掛住」不馬上回應，有訊息才回傳
- **不需要固定 IP**——是你主動去問 Telegram，不是 Telegram 推給你
- 適合在家用電腦、筆電上開發

### 第二層：Plugin ↔ Claude Code（OS stdin/stdout Pipe）

```
Telegram Plugin                    Claude Code CLI
    │                                    │
    │── write(stdin, "使用者訊息") ────►│
    │                                    │── 處理中...
    │                                    │── 讀寫檔案、執行程式碼
    │◄── readline(stdout) ──────────────│
    │                                    │
    │   格式化回應                       │
    │── POST /sendMessage ──► Telegram   │
```

**重點：**
- 完全不是網路通訊，是作業系統層級的 pipe（管道）
- 就像你在終端機打字給 Claude Code 一樣
- Claude Code 子程序持續存活，保留完整對話上下文

---

## Long Polling vs Webhook 比較

| 特性 | Long Polling | Webhook |
|------|-------------|---------|
| 需要固定 IP？ | 否 | 是 |
| 需要 HTTPS 憑證？ | 否 | 是 |
| 延遲 | 略高（毫秒級） | 即時 |
| 適合場景 | 開發、家用電腦 | 正式伺服器 |
| 設定難度 | 零設定 | 需設定 ngrok / DNS |

**結論：** 在本機開發階段，Long Polling 是唯一合理的選擇。

---

## 完整資料流時序圖

```
使用者          Telegram API      你的電腦             Claude Code
  │                │            (Plugin)                  │
  │                │                │                     │
  │── 發送訊息 ───►│                │                     │
  │  (MTProto)     │                │                     │
  │                │   Long Poll    │                     │
  │                │◄── GET ────────│                     │
  │                │                │                     │
  │                │── JSON 回傳 ──►│                     │
  │                │                │                     │
  │                │                │── 鑑權檢查          │
  │                │                │   (user_id 白名單)  │
  │                │                │                     │
  │                │                │── write(stdin) ────►│
  │                │                │                     │── 處理中
  │                │                │                     │── 讀寫檔案
  │                │                │                     │── 執行指令
  │                │                │◄── stdout 輸出 ────│
  │                │                │                     │
  │                │                │── 格式化回應        │
  │                │◄── sendMessage─│                     │
  │                │                │                     │
  │◄── 收到回覆 ──│                │                     │
  │  (MTProto)     │                │                     │
```

---

## 配對機制

Telegram Plugin 使用配對碼（6 碼）來建立你的 Telegram 帳號與 Claude Code Session 之間的綁定關係：

1. 啟用 Plugin 後，Claude Code 產生一組 6 碼配對碼
2. 在 Telegram 對 Bot 發送任意訊息，Bot 回覆要求輸入配對碼
3. 輸入配對碼後，Bot 確認配對成功
4. 配對資訊儲存在 `~/.claude/channels/telegram/access.json`

**重要：** 停用 Plugin ≠ 中斷配對。配對資料是獨立儲存的，必須手動清除才能真正斷開。

---

## 安全注意事項

| 威脅 | 說明 |
|------|------|
| 未授權存取 | Plugin 透過 user_id 白名單限制誰能傳訊息 |
| Token 洩露 | Bot Token 存在 `~/.claude/channels/telegram/.env`，不要提交到 Git |
| 指令注入 | Claude Code 有自己的沙箱機制，但仍需謹慎 |
| Session 劫持 | 配對碼是一次性的，配對後即失效 |

---

## 常見問題

### Q：沒有固定 IP 能用嗎？
可以。Plugin 預設使用 Long Polling，你的電腦主動去問 Telegram，不需要公開 IP。

### Q：底層是什麼協定？
兩層：外層是 HTTPS Long Polling（你 ↔ Telegram），內層是 OS Pipe（Plugin ↔ Claude Code CLI）。

### Q：多人能同時用嗎？
可以，Session Manager 會為每個 user_id 維護獨立的 Claude Code 子程序。

### Q：訊息有長度限制嗎？
Telegram 訊息上限 4096 字元。超長回應會被 Plugin 自動分片發送。

## Related

- [[telegram-bridge-work-scenarios|Telegram 橋接實戰應用場景]]
- [[telegram-plugin-uninstall-guide|完整移除 Telegram Plugin]]
- [[channels-guide|Channels 頻道功能入門]]
