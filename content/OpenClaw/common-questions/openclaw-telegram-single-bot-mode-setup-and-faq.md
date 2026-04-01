---
title: OpenClaw Telegram 模式 1（單 Bot）部署教學與高頻故障排查
---

## Objective

- **Objective**: Deploy + Debug
- 目標讀者：需要把 OpenClaw 接到 Telegram 群組的工程師/維運。
- 範圍：`模式 1：單 Bot（所有群組共用同一智能體身份）`。

## 1) 模式定義（先對齊語義）

- 單 Bot 模式：一個 `botToken`（例如 `111:aaa`）服務多個群組。
- 該模式下，所有群共享同一 Bot 身份與同一行為策略（如 `requireMention`）。
- 適合：統一助手、統一規則的團隊場景。
- 不適合：需要「每個群不同人格/不同模型/不同策略」的場景。

## 2) 最小可用流程（MVP）

### Step 1: 設定 Bot Token

- 在 OpenClaw 的 Telegram 整合設定中填入：

```yaml
telegram:
  mode: single-bot
  botToken: "111:aaa"
  requireMention: true
```

### Step 2: 啟動服務

```bash
openclaw start
```

### Step 3: 完成私訊配對（關鍵動作）

> **這是最容易漏掉的步驟。**

- Bot 不會「啟動即自動回覆所有人」。
- 使用者在 Telegram 側發起配對後，伺服器端必須執行：

```bash
openclaw pairing approve
```

- 配對碼有效期通常為 **1 小時**；過期必須重新發起配對流程。

### Step 4: 關閉 BotFather 隱私模式（群聊必做）

- 在 BotFather 對該 Bot 執行 `/setprivacy` 並關閉隱私模式。
- **修改後必須將 Bot 從群組移除再重新加入**，否則新設定通常不會生效。

## 3) requireMention 的工程含義

| 設定           | 行為                            | 適用場景           | 風險                     |
| -------------- | ------------------------------- | ------------------ | ------------------------ |
| `true`（預設） | 僅當訊息包含 `@bot_name` 時回應 | 大群、雜訊高的群   | 低雜訊、低誤觸發         |
| `false`        | 監聽並回應群內每則訊息          | 小型私密群、測試群 | 高雜訊、成本上升、易洗版 |

建議：

- 正式環境群預設 `requireMention: true`。
- 若測試 `false`，先在小群驗證，再評估 token 消耗與誤觸發率。

## 4)「命令列開關」vs「設定檔」的選擇原則

- `activation` 類指令（例如 `/activation always`）適合 **測試階段快速驗證**。
- 行為確認後，應固化到設定檔並納入版本管理。
- 不要長期依賴臨時指令維持正式環境行為（不可稽核、不可複現、易漂移）。

## 5) 高頻故障與定位（按命中率排序）

### 症狀 A：私聊完全不回覆

- **高機率原因**：未執行配對批准。
- **驗證**：檢查是否執行過 `openclaw pairing approve`，以及配對碼是否過期。
- **修復**：重新發起配對 -> 在有效期內 approve。

### 症狀 B：群聊裡看不到 Bot 回應

- **高機率原因**：隱私模式未關閉，或關閉後未「移除並重加 Bot」。
- **驗證**：BotFather 目前隱私設定 + 群成員列表中的 Bot 是否為新加入狀態。
- **修復**：`/setprivacy` 關閉 -> 移除 Bot -> 重新拉入群。

### 症狀 C：只有 @ 才回覆 / 或回覆過於頻繁

- **高機率原因**：`requireMention` 設定與預期不一致。
- **驗證**：讀取實際生效的設定。
- **修復**：根據群規模調整為 `true` 或 `false`，重啟/熱載入設定。

## 6) 工程化上線清單（Critical Actions）

- [ ] Bot Token 已設定且來源安全（密鑰管理）。
- [ ] 服務已啟動且日誌無初始化錯誤。
- [ ] 私訊配對流程已跑通（含過期重試演練）。
- [ ] BotFather 隱私模式已關閉。
- [ ] Bot 已從目標群移除並重新加入。
- [ ] `requireMention` 與群規模匹配。
- [ ] 最終策略已寫入設定檔並提交版本庫。

## 7) 可直接複製的 Prompt 範本（給工程師）

### Prompt A：上線前檢查

```text
請作為 OpenClaw 維運稽核員，按「單 Bot 模式」輸出上線檢查結果：
1) 配對狀態是否完成（含有效期風險）
2) BotFather 隱私模式狀態
3) requireMention 目前值與風險
4) 是否存在僅靠臨時指令維持行為的問題
最後用 P0/P1/P2 標記風險並給出修復順序。
```

### Prompt B：故障排查

```text
你是值班工程師。已知現象：Telegram 群訊息 Bot 不回應。
請按以下順序輸出：
- 最可能的 3 個根因（按機率排序）
- 每個根因的可執行驗證步驟
- 每個根因的修復動作
- 修復後回歸測試案例（至少 3 條）
限制：結論必須可操作，不要泛泛而談。
```

### Prompt C：設定審查

```text
請審查以下 Telegram 單 Bot 設定是否適合正式環境：
- 重點評估 requireMention、啟動策略、可稽核性、誤觸發成本
- 給出「保守方案」和「積極方案」兩套設定建議
- 輸出變更影響與回滾步驟
```

## 8) 最小回歸案例

```text
案例 1：私訊使用者已配對，發送普通問題，Bot 應答。
案例 2：群聊內不 @Bot（requireMention=true），Bot 不應答。
案例 3：群聊內 @Bot（requireMention=true），Bot 應答。
案例 4：切換 requireMention=false 後，群內普通訊息 Bot 應答。
```
