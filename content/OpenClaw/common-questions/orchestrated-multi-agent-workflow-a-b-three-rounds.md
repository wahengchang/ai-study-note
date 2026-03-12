---
title: 一個編排好的 Multi-Agent Workflow（A 主持、B 專家、三回合）
---

## TL;DR

- 在 OpenClaw 裡，`spawn / session` 的核心不是「多開幾個聊天視窗」，而是把任務拆成可追蹤、可隔離、可重放的執行單元。
- 最實用的模式是：**A 當 orchestrator（主 session）+ B 當 specialist（子 session）**，用三回合迭代把品質拉高。
- 如果你要跑大量任務（例如 100 個工作），搭配 `cron` 做節流 dispatch，並用 `sessions` / `logs` / `status` 觀察。

## 1) 先對齊：OpenClaw 的 session / spawn 是什麼

- `session`：一次可持續追蹤的對話與執行脈絡。
- `spawn subagent`：通常等同於建立一個新的 isolated session 來處理子任務。
- 好處：
  - 把「主控決策」與「專家分析」分離。
  - 每個子任務可獨立失敗、重試、觀察 logs。
  - 適合後續做平行化與排程。

## 2) CLI 地圖（和 workflow 最相關）

> 要拿到你當下版本「最完整、最準確」的 CLI，先看本機 help，再對照官方索引。

### 本機自查（第一優先）

```bash
openclaw help
openclaw <command> --help
```

例如：

```bash
openclaw sessions --help
openclaw cron --help
openclaw memory --help
```

### 官方文件索引

- CLI index: `https://docs.openclaw.ai/cli/index.md`
- 全量清單（含 CLI 子命令連結）：`https://docs.openclaw.ai/llms.txt`

### 和本題最常一起用的命令群

- `sessions`: 建立 / 列出 / 查看 session
- `agents` / `agent`: 指定由哪個 agent 執行
- `cron`: 分批派發、定時任務
- `memory`: 讀寫長短期記憶
- `message`: 對外通道回報結果
- `gateway` / `daemon` / `logs` / `status` / `doctor`: 維運與除錯
- `config` / `configure` / `secrets`: 配置與憑證管理

## 3) 推薦實作：A 主持 + B 專家（回合式編排）

```mermaid
flowchart LR
  I[Input Problem] --> A1[A round1: draft v1 + unknowns]
  A1 --> B1[B critique + risks + alternatives]
  B1 --> A2[A round2: revise v2 + focused questions]
  A2 --> B2[B deep dive: evidence / counterexample]
  B2 --> A3[A round3: final decision + action list]

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb;
  class I,A1,B1,A2,B2,A3 main;
```

### Round 設計（實際可落地）

1. **Round 1**
   - A：讀題，輸出方案 v1 + 不確定點。
   - A → B：請 B 針對風險、替代方案做 critique。
2. **Round 2**
   - A：整合 B 的回饋，產出 v2 + 2~3 個聚焦問題。
   - A → B：請 B 提供更深推導、資料點、反例。
3. **Round 3**
   - A：輸出 final（決策、取捨理由、下一步 TODO）。

### B session 有兩種策略

- **每回合都新 spawn B**：上下文乾淨、成本好控，但 B 不帶上一輪細節。
- **固定一個 B session**：更像真對話，有連續短期記憶，但上下文管理更重要。

> 實務上，A 每回合給 B「摘要 + 問題」通常比整段貼歷史更穩定，也更省 token。

## 4) 另一種：A/B 真正辯論三輪，再由 A 定稿

當你要「互相回嘴」而非單向審稿時，維護一個對話狀態（state）：

- 題目
- 目前共識
- 分歧點
- 每輪 A/B 發言摘要

每輪流程：

1. A 基於 state 發言
2. 將 A 發言 + state 交給 B 回應
3. 更新 state

三輪後，把完整 state 回傳 A 產出定稿。

> 優點：洞見更像辯論。缺點：token 成本較高、編排也較複雜。

## 5) 100 個工作時怎麼排（節流 + 可觀察）

推薦把大量任務拆成「批次派發 + 狀態觀察」：

1. `cron` 每分鐘派發固定數量（例如每次 3~5 個）
2. 每個任務用獨立 session（或獨立子 session）
3. 用 `sessions`/`status` 檢查進度，用 `logs` 查失敗原因
4. 失敗任務重試，成功任務回寫 memory 或 message

這種做法可以避免瞬間打滿模型與工具資源，也方便做故障隔離。

## 6) 一份可直接套用的最小模板

### A（orchestrator）system 任務說明

- 你是主持人，目標是在三回合內完成高品質決策。
- 每回合你必須：
  1. 先產生本輪草案
  2. 送給 B 取得反饋
  3. 將反饋整理為下一輪輸入
- 最終輸出需包含：
  - Final decision
  - Trade-offs
  - Next actions（可執行清單）

### B（specialist）system 任務說明

- 你是領域專家，只做批判性評估與補充。
- 每次回覆固定輸出：
  - Risk list
  - Alternative
  - Evidence / assumptions
  - 建議 A 下一輪要補問的 2 個問題

## 7) 實務提醒

- 先定義每輪輸入輸出格式，品質會穩很多。
- A 要控上下文：用摘要，不要無差別貼全部歷史。
- 大量任務一定要做併發上限與重試策略。
- 上線前先做小批量 dry-run，再擴到 100 jobs。
