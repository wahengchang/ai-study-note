---
title: "OpenClaw Cron：執行者、Session、權限與跨 Agent 遞送"
tags:
  - openclaw
  - automation
  - reference
description: "Cron execution model — Gateway scheduler triggers, isolated background sessions, and service identity permissions"
---

## 摘要

| 問題 | 簡短回答 |
| --- | --- |
| 誰執行 `cron1`？ | Gateway Scheduler 觸發；目標 Agent Runtime 執行。 |
| 使用哪個 Session？ | 獨立的背景 / 隔離 Session（不是使用者的聊天 Session）。 |
| 套用誰的權限？ | 執行端 Agent 的 Service Identity，不是使用者身分。 |

## 執行模型

| 階段 | 元件 | 職責 |
| --- | --- | --- |
| Trigger | Gateway cron module | 監控排程，到期時觸發 Job。 |
| Dispatch | Gateway router | 將執行送往設定的目標 Agent。 |
| Run | Agent runtime | 執行推理、Skill / Tool、檔案 / 網路操作。 |

## Session 模型

Cron 任務使用獨立的背景 Session。

原因：

- 保持使用者聊天上下文的乾淨。
- 排程執行可以有獨立的保留 / 稽核政策。
- 簡化重試與失敗處理。

## 權限模型

Cron 執行應以目標 Agent Identity 來評估權限。

| 權限邊界 | 典型規則 |
| --- | --- |
| Tools / Skills | 只能使用該 Agent 被允許的 Tool。 |
| Workspace | 只能存取該 Agent 的 Sandbox / Workspace 範圍。 |
| Outbound channels | 只能使用明確授權給該 Agent 的 Channel。 |

## 你的情境

`cron1` 在 `agent1` 上執行，然後由 `agent2` 將結果送到 `telegramGroup2`。

這是可行的，但 `agent1` 不應該假冒 `agent2`。

### Pattern A（建議）：Gateway event / webhook 路由

1. `agent1` 完成 Cron Job。
2. `agent1` 送出內部 event / webhook payload 給 Gateway。
3. Gateway 政策將請求路由到 `agent2`。
4. `agent2` 用自己的 credentials 發送到 `telegramGroup2`。

### Pattern B：共享 Outbox Queue

1. `agent1` 將訊息 payload 寫入共享 Outbox。
2. `agent2` 輪詢 / 監看 Outbox。
3. `agent2` 發送訊息並標記完成。

低延遲且希望清楚的 control-plane 路由時用 Pattern A；需要更強的持久性 / 重試機制時用 Pattern B。

## 最低安全規則

1. 禁止假冒：`agent1` 不能使用 `agent2` 的 Token。
2. Policy gate：跨 Agent 觸發必須通過 Gateway Policy。
3. 最小權限：只授予需要的 Tool / Channel。
4. 冪等性：使用 message / run ID 避免重複處理。
5. 稽核軌跡：記錄 `cron trigger -> dispatch -> send` 完整鏈路。

## 驗證清單

請在你自己的環境中檢查：

1. `openclaw.json` 中的路由與 Channel 權限設定。
2. `~/.openclaw/cron/jobs.json` 中的 Cron 擁有者與目標 Agent。
3. Gateway / Runtime Log 中的隔離 Run / Session ID 與 Dispatch 軌跡。

注意：本筆記是基於架構推理與專案內部脈絡所撰寫，外部網頁驗證在此執行環境中被阻擋。
