---
title: "Channels 頻道功能入門指南"
description: "Push external messages from Telegram and Discord into a running Claude Code session via MCP channels"
tags:
  - research
  - claude-code
  - plugin
  - telegram
  - guide
---

# Channels 頻道功能入門指南

> Channels（頻道）可以將外部訊息（如 Telegram、Discord）推送到正在執行的 Claude Code 會話中，讓 Claude 即時回應你的指令，即使你不在終端機前也能操作。

---

## 什麼是 Channels？

Channel 是一種 MCP 伺服器，會將事件**推送**到你正在執行的 Claude Code 會話。你可以透過 Telegram 或 Discord 傳訊息給 Claude，Claude 會在本機處理後直接回覆到聊天平台上。

**適用情境：**
- 用手機透過 Telegram / Discord 遠端向 Claude 下達指令
- 接收 CI/CD、監控系統等 Webhook 事件，讓 Claude 即時處理

---

## 前置需求

- Claude Code **v2.1.80** 以上
- 使用 **claude.ai 帳號**登入（不支援 Console 或 API Key）
- 安裝 [Bun](https://bun.sh)（執行 `bun --version` 確認）
- **Team / Enterprise 用戶**：管理員需先啟用 Channels 功能

---

## 快速體驗：fakechat 本機 Demo

fakechat 是官方提供的本機 Demo 頻道，不需要外部帳號，適合第一次體驗。

### 步驟 1：安裝 fakechat 外掛

在 Claude Code 中執行：

```
/plugin install fakechat@claude-plugins-official
```

> 如果找不到外掛，先執行：
> `/plugin marketplace update claude-plugins-official`

### 步驟 2：啟用頻道並重啟

退出 Claude Code，加上 `--channels` 參數重新啟動：

```bash
claude --channels plugin:fakechat@claude-plugins-official
```

### 步驟 3：傳送訊息

打開瀏覽器前往 http://localhost:8787，在 UI 中輸入訊息，例如：

```
嘿，我的工作目錄裡有什麼？
```

訊息會出現在 Claude Code 會話中，Claude 處理完後回覆會顯示在瀏覽器 UI 上。

---

## 設定 Telegram 頻道

### 步驟 1：建立 Telegram Bot

1. 在 Telegram 開啟 [BotFather](https://t.me/BotFather)
2. 傳送 `/newbot`，設定名稱和使用者名稱（結尾須為 `bot`）
3. 複製 BotFather 回傳的 **Token**

### 步驟 2：安裝外掛

```
/plugin install telegram@claude-plugins-official
```

安裝完成後執行 `/reload-plugins`。

### 步驟 3：設定 Token

```
/telegram:configure <你的 Token>
```

Token 會儲存在 `~/.claude/channels/telegram/.env`。

### 步驟 4：啟用頻道並重啟

```bash
claude --channels plugin:telegram@claude-plugins-official
```

### 步驟 5：配對帳號

1. 在 Telegram 傳送任意訊息給你的 Bot
2. Bot 會回覆一組**配對碼**
3. 回到 Claude Code 執行：

```
/telegram:access pair <配對碼>
```

4. 鎖定存取權限，只允許你的帳號：

```
/telegram:access policy allowlist
```

完成！現在你可以透過 Telegram 與 Claude Code 互動了。

---

## 設定 Discord 頻道

### 步驟 1：建立 Discord Bot

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 點擊 **New Application**，命名後進入 **Bot** 區域
3. 點擊 **Reset Token**，複製 Token
4. 啟用 **Privileged Gateway Intents** 中的 **Message Content Intent**

### 步驟 2：邀請 Bot 到伺服器

前往 **OAuth2 > URL Generator**，勾選 `bot` scope，並啟用以下權限：

- View Channels
- Send Messages
- Send Messages in Threads
- Read Message History
- Attach Files
- Add Reactions

開啟產生的 URL，將 Bot 加入伺服器。

### 步驟 3：安裝外掛

```
/plugin install discord@claude-plugins-official
```

安裝完成後執行 `/reload-plugins`。

### 步驟 4：設定 Token

```
/discord:configure <你的 Token>
```

### 步驟 5：啟用頻道並重啟

```bash
claude --channels plugin:discord@claude-plugins-official
```

### 步驟 6：配對帳號

1. 在 Discord 私訊你的 Bot
2. Bot 回覆**配對碼**
3. 回到 Claude Code 執行：

```
/discord:access pair <配對碼>
```

4. 鎖定存取：

```
/discord:access policy allowlist
```

---

## 安全機制

- **白名單機制**：只有通過配對的使用者 ID 才能推送訊息，其他人會被靜默忽略
- **每次啟動選擇**：透過 `--channels` 參數控制哪些頻道伺服器被啟用
- **Team / Enterprise 控管**：管理員可在 claude.ai 管理設定中啟用或停用

---

## Enterprise 啟用方式

| 方案類型           | 預設行為                                |
| :----------------- | :-------------------------------------- |
| Pro / Max（無組織） | 可用，使用者透過 `--channels` 自行啟用  |
| Team / Enterprise  | 預設停用，需管理員明確啟用              |

管理員啟用路徑：**claude.ai → Admin settings → Claude Code → Channels**

---

## Channels 與其他功能比較

| 功能            | 用途                               | 適合場景                     |
| :-------------- | :--------------------------------- | :--------------------------- |
| Channels        | 將外部事件推送到本機會話           | 用手機傳訊、接收 Webhook     |
| Web 版 Claude   | 在雲端沙盒中執行任務               | 分派獨立的非同步工作         |
| Slack 整合      | 從 Slack 中啟動 Web 會話           | 從團隊對話中觸發任務         |
| MCP Server      | Claude 主動查詢外部系統            | 讓 Claude 按需讀取或查詢資料 |
| Remote Control  | 從 claude.ai 或手機控制本機會話    | 遠端操控進行中的會話         |

---

## 延伸閱讀

- [自建 Channel](https://code.claude.com/docs/en/channels-reference)：為沒有外掛的系統打造專屬頻道
- [Remote Control](https://code.claude.com/docs/en/remote-control)：從手機直接操控本機會話
- [Scheduled Tasks](https://code.claude.com/docs/en/scheduled-tasks)：用定時輪詢取代事件推送

## Related

- [[telegram-bridge-guide|Telegram Bot 橋接運作原理]]
- [[hooks-guide|Claude Code Hooks 入門]]
- [[research-notes/index|Research Notes]]
