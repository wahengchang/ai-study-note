---
title: n8n + OpenClaw 更新 Workflow（MCP-ready）
---

## 目標
- 部署一個與 OpenClaw 相容的 n8n Workflow，讓 MCP 客戶端可以直接執行。
- 重用 ClawHub 的參考 Workflow：`https://clawhub.ai/thomasansems/n8n`。
- 將同一套核心邏輯標準化為三種觸發介面：**Webhook**、**Chat** 和 **Form**。

## 參考流程（觀察所得）
- 在編輯器中看到的 Workflow 執行流程如下：
  1. Trigger（`Webhook` 或手動測試觸發）
  2. 輸入正規化（`normalize input` / `sample input`）
  3. 驗證閘門（`topic and seeds empty?`）
  4. 錯誤回應分支（`Respond 400`）——當必填欄位缺失時
  5. Prompt 組裝（`build prompt`）
  6. 元件呼叫（`Call '[component] text2text'`）
  7. 輸出正規化（`normalize output`）
  8. 最終 HTTP 回應（`Respond keywords`）
- 在建立 Chat/Form 變體時，以此作為標準模式。

## 建立 / 更新 Workflow 模式

```mermaid
flowchart LR
  T[Trigger: Webhook | Chat | Form] --> N[Normalize input]
  N --> V{Required fields present?}
  V -- No --> E[Respond 400 / validation error]
  V -- Yes --> P[Build prompt]
  P --> C[Call OpenClaw component]
  C --> O[Normalize output]
  O --> R[Respond result]
```

### 1) 從可重用的基礎模板複製
- 以 ClawHub 範本 Workflow 為起點。
- 保持 Node 名稱穩定（`normalize input`、`build prompt`、`normalize output`），方便團隊維護。
- 在 Workflow 設定中加入簡短說明，讓它在 MCP Workflow 清單中容易辨識。

### 2) 依 Trigger 類型做適配
- **Webhook Workflow**
  - 解析 request 的 JSON / body 參數，轉換成統一的內部 payload。
  - 回傳 HTTP status code（驗證失敗回 `400`，成功回 `200`）。
- **Chat Workflow**
  - 將傳入的 chat 訊息 / context 欄位對應到 Webhook 使用的相同內部 payload key。
  - 重用相同的 Prompt 建構邏輯和輸出 schema。
- **Form Workflow**
  - 將表單欄位映射為正規化的 key。
  - 在呼叫模型之前套用相同的必填欄位檢查。

### 3) 驗證契約
- 必填輸入應在 Prompt 建構之前檢查。
- 若缺少必填欄位，應中斷下游執行並回傳確定性的錯誤 payload。
- 輸出 schema 在所有 Trigger 變體間保持一致，讓 MCP 客戶端整合具備冪等性。

## n8n MCP 設定（Instance 層級）
- 前往 `Settings -> Instance-level MCP`。
- 在 **Workflows** 中，新增或啟用要讓 MCP 客戶端發現的正式 Workflow。
- 確保每個公開的 Workflow 具備：
  - 清楚的名稱前綴，例如 `[webhook]`、`[chat]`、`[form]`
  - 正確的專案 / 位置指派
  - 非空的 description（提升客戶端的可發現性）
- 在 **Connected clients** 中確認你的 MCP 消費端可以連線並執行已啟用的 Workflow。

## 操作檢查清單
- Workflow 可在 n8n 編輯器中手動執行。
- Webhook 路徑回傳預期的 status 和 payload。
- Chat / Form 變體在邏輯等價的輸入下產出相同的輸出結構。
- Workflow 出現在 `Instance-level MCP -> Workflows` 清單中。
- MCP 客戶端可以發現並執行該 Workflow，不需額外的手動映射。
