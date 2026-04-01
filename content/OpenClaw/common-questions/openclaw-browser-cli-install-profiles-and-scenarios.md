---
title: OpenClaw Browser CLI - 安裝、Profile 管理與常見情境
---

## 安裝（首次設定）

### 前置條件

- OpenClaw Gateway 已在執行，且你有 Gateway Token。
- 已安裝 Chrome（Extension Relay 模式需要）。
- 確認 browser 指令可用：

```bash
openclaw browser --help
```

### 安裝 Chrome Extension（Extension Relay）

```bash
openclaw browser extension install
```

- 複製印出的 extension 資料夾路徑。
- 打開 `chrome://extensions`。
- 啟用 `Developer mode`。
- 點選 `Load unpacked`，選擇剛才印出的資料夾。
- 打開 extension 設定 / popup：
  - 設定 relay port（常用 `18792`）
  - 輸入你的 Gateway Token
- 開啟目標網頁，點擊 extension icon 直到顯示 `ON`。

![[../assets/OpenCLaw/chrome-extension.png]]

### 第一次連線測試

```bash
openclaw browser snapshot
```

- 如果拿到 element ID（`<ref>`），表示 Extension Relay 已連線。
- 如果失敗，請檢查：
  - Extension 是否已安裝並啟用
  - Extension 是否附加到正確的 tab
  - Port / Token 是否與 OpenClaw Gateway 設定一致

## 目標

- 建立一份可重複使用的 OpenClaw browser CLI 參考。
- 涵蓋：
  - Extension Relay 安裝 / 連線流程
  - Profile 的建立與重複使用
  - 常用 CLI 指令
  - 3 個實用的自動化情境（各自獨立的表格）

## 前提 / 驗證狀態

- 以下指令是根據先前的工作筆記與對話範例整理而成。
- 並未在本筆記中實際執行過。
- 實際 flag 可能因 OpenClaw 版本而異，請用以下指令確認：

```bash
openclaw browser --help
```

## 指令速查表（Extension Relay + Page Control）

| 指令                                            | 用途                                                         | 範例                                                               |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `openclaw browser snapshot`                     | 讀取當前頁面結構與互動元素（`<ref>` ID）。                   | `openclaw browser snapshot`                                        |
| `openclaw browser snapshot --labels`            | 產生帶有 element ID 標籤的截圖。                             | `openclaw browser snapshot --labels`                               |
| `openclaw browser highlight <ref>`              | 操作前先視覺化高亮某個元素。                                 | `openclaw browser highlight 15`                                    |
| `openclaw browser click <ref>`                  | 依 reference ID 點擊元素。                                   | `openclaw browser click 15`                                        |
| `openclaw browser type <ref> "text"`            | 在 input / textarea 中輸入文字。                             | `openclaw browser type 3 "Latest AI news"`                         |
| `openclaw browser evaluate --fn "..."`          | 在頁面 context 中執行 JavaScript。                           | `openclaw browser evaluate --fn "return document.title"`           |
| `openclaw browser evaluate and wait --fn "..."` | 執行 JS 並等待頁面變化 / 載入完成。                          | `openclaw browser evaluate and wait --fn "window.scrollBy(0,500)"` |

## 常見問題：如何安裝 Browser Extension（Extension Relay）

### 症狀

- 錯誤訊息顯示 OpenClaw 嘗試使用 **Extension Relay mode**，但 Chrome extension 尚未安裝或未連線。

### 安裝 + 連線步驟

| 步驟 | 動作                           | 指令 / UI                                                   |
| ---- | ------------------------------ | ----------------------------------------------------------- |
| 1    | 在本機產生 extension 檔案      | `openclaw browser extension install`                        |
| 2    | 打開 Chrome extensions 頁面    | `chrome://extensions`                                       |
| 3    | 啟用 Developer Mode            | 右上角的開關                                                |
| 4    | 載入未封裝的 extension         | 點選 `Load unpacked`，選擇產生的資料夾                      |
| 5    | 設定 extension                 | 設定 relay port（常用 `18792`）並輸入 Gateway Token         |
| 6    | 附加到目標 tab                 | 在目標頁面點擊 extension icon，直到狀態顯示 `ON`            |

### 備註

- Extension Relay 控制的是目前附加的 tab（你的即時瀏覽器 session）。
- 操作可能會使用你已登入的 cookies / session。
- 在執行 `click` 或 `type` 之前，先用 `snapshot` 查看頁面 element ID。

## 常見問題：如何建立與重複使用 Profile

### Profile 管理表

| 動作                         | 說明                                                    | CLI 指令                                                 |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| 建立 Profile                 | 建立獨立的瀏覽器狀態（cookies / session storage）       | `openclaw browser create-profile --name my_profile`      |
| 可見模式啟動（首次登入用）   | 開啟專屬瀏覽器視窗，手動登入一次                        | `openclaw browser launch --profile my_profile --visible` |
| 重複使用 Profile             | 後續指令沿用已儲存的 session                            | `openclaw browser snapshot --profile my_profile`         |

### 建議的首次流程

```bash
openclaw browser create-profile --name social_bot
openclaw browser launch --profile social_bot --visible
# Log in manually in the opened browser window

# Later, reuse the same session silently
openclaw browser snapshot --profile social_bot
```

## 情境 1：已登入的社群媒體發文（Profile 重複使用）

- 目標：使用已儲存的 session Profile 在 X / LinkedIn 上發文。

| 步驟 | 動作                      | 指令 / 邏輯                                                   |
| ---- | ------------------------- | -------------------------------------------------------------- |
| 1    | 登入一次並儲存 session    | `openclaw browser launch --profile social_bot --visible`       |
| 2    | 檢視撰寫頁面              | `openclaw browser snapshot --profile social_bot`               |
| 3    | 輸入發文內容              | `openclaw browser type 12 "Hello world!" --profile social_bot` |
| 4    | 發佈                      | `openclaw browser click 15 --profile social_bot`               |

## 情境 2：乾淨狀態的價格追蹤（無 Cookies）

- 目標：在不受個人化 cookies / 瀏覽紀錄影響的情況下查看價格。

| 步驟 | 動作                    | 指令 / 邏輯                                                                           |
| ---- | ----------------------- | ------------------------------------------------------------------------------------- |
| 1    | 使用乾淨的瀏覽器狀態    | 不加 `--profile`                                                                      |
| 2    | 導覽到商品頁面          | `openclaw browser evaluate and wait --fn "window.location='https://store.com/item';"` |
| 3    | 擷取顯示的價格          | `openclaw browser evaluate --fn "return document.querySelector('.price')?.innerText"` |
| 4    | 自動化每日執行          | 包裝成 shell script + 排程器（`cron` 或其他）                                         |

### 最小腳本範本（價格查詢）

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="https://store.com/item"

openclaw browser evaluate and wait --fn "window.location='${URL}'"
openclaw browser evaluate --fn "return document.querySelector('.price')?.innerText"
```

## 情境 3：TL;DR Agent 摘要器（Agent + Browser Tool）

- 目標：將 URL 傳給你的 Agent（例如 Telegram 工作流程），取得簡短摘要。

| 步驟 | 動作                            | 指令 / 邏輯                                                             |
| ---- | ------------------------------- | ----------------------------------------------------------------------- |
| 1    | 為 Agent 啟用 browser tool      | 在 agent tools 設定中加入 `browser`（例如 `agent.json`）                |
| 2    | 從聊天觸發                      | 傳送 URL + prompt（例如：`Read this and give me 3 bullet points: <URL>`）|
| 3    | Agent 讀取頁面                  | Agent 內部使用 browser snapshot / evaluate                              |
| 4    | 收到摘要                        | Agent 回傳摘要後的重點                                                  |

## 實用工作流程建議

- 先用 `snapshot`；當 element ID 不好對應時改用 `snapshot --labels`。
- 在執行破壞性操作（`Delete`、`Submit`、`Buy` 等）之前，先用 `highlight <ref>` 確認。
- 為每個網站 / 帳號建立獨立的 Profile（`social_bot`、`research`、`admin_test`）。
- 做網頁擷取時，優先使用穩定的 selector（ID / data attribute），避免脆弱的 CSS class name。

## 疑難排解速查

| 問題                            | 可能原因                                    | 第一步檢查                                                                 |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Extension Relay 錯誤            | Chrome extension 未安裝或未附加             | 執行 `openclaw browser extension install`，確認 extension 顯示 `ON`       |
| 指令作用在錯誤的頁面            | Extension 附加到了其他 tab                  | 在正確的 tab 上點擊 extension icon                                         |
| 已登入的操作失敗                | 未使用 Profile / session 已過期             | 確認有加 `--profile <name>`，必要時用 `--visible` 重新登入                 |
| `click/type` 點到錯誤的元素     | 選錯了 `<ref>`                              | 使用 `snapshot --labels` + `highlight <ref>`                               |

## 自我檢查指令（自動化之前先跑）

```bash
openclaw browser --help
openclaw browser snapshot
openclaw browser snapshot --labels
```

## 除錯用 CLI 基本檢查（安裝、Relay 附加、健康狀態）

當 Extension Relay 無法附加或 browser control 指令失敗時，依序執行以下檢查。

### 1) Extension 安裝與載入路徑

```bash
openclaw browser extension install
openclaw browser extension path
```

- `install` 會將 MV3 extension 檔案複製到穩定的 OpenClaw 狀態目錄（不是 `node_modules`）。
- `path` 會印出用於 `chrome://extensions` 中 `Load unpacked` 的確切資料夾。

### 2) 確認 browser Profile

```bash
openclaw browser profiles
```

- 確認 Chrome Profile 整合功能可用。

### 3) 檢查 relay 附加的 tab（關鍵驗證）

```bash
openclaw browser --browser-profile chrome tabs
openclaw browser --browser-profile chrome tabs --json
```

- 如果有 tab 已附加（extension badge 顯示 `ON`），它應該會出現在這份清單中。
- `--json` 適合用於機器可讀的診斷與腳本。

### 4) tab 附加後的基本控制測試

```bash
openclaw browser --browser-profile chrome snapshot
openclaw browser --browser-profile chrome screenshot
openclaw browser --browser-profile chrome open https://google.com
```

- 一次驗證讀取（`snapshot`）、畫面擷取（`screenshot`）與導覽（`open`）。

### 5) Gateway 與服務健康狀態

```bash
openclaw status --deep
openclaw gateway status
openclaw gateway restart
openclaw logs --follow
```

- `status --deep` 是最快的全端健康探測指令。
- 當 extension 顯示 `!` 或無法連上 relay 時，使用 `logs --follow`。

### 6) Sandbox 診斷

```bash
openclaw sandbox explain
```

- 當本機 sandboxing 可能阻擋 host browser control 時使用。
