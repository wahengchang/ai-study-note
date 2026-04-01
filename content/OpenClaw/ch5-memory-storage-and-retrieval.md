---
title: "Ch5: Memory（儲存、搜尋與檢索）"
aliases:
  - OpenClaw/ch5-memory
  - OpenClaw/memory
---

本章說明 OpenClaw Memory 的實際運作方式：哪些資料會寫入磁碟、何時寫入、搜尋如何運作，以及如何安全地調校檢索設定。
![[memory.png]]

概觀：上圖呈現一條完整的 Markdown-first Memory Pipeline，包含四個部分。**Write Cycle** 負責捕捉需要持久化的事實（包括靜默的 pre-compaction flush 與 append-only 的每日日誌），**Source of Truth** 將 Memory 儲存在本機 Workspace 的 Markdown 檔案中（`memory/YYYY-MM-DD.md` 和 `MEMORY.md`），**Indexing & Retrieval Engine** 透過 hybrid retrieval（vector + BM25）搭配 watcher 驅動的背景同步維護可搜尋的索引，**Read Cycle** 則透過 `memory_search`（語意片段）與 `memory_get`（指定檔案讀取）提供召回功能。底部的 Backend 比較凸顯了內建 SQLite 的速度/整合優勢，與實驗性 QMD sidecar 的彈性之間的取捨。

## 分析

在修改 Memory 設定之前，先把以下核心模型弄清楚。

| 發現 | 為什麼重要 |
| --- | --- |
| Memory 的 Source of Truth 是磁碟上的 Markdown | 如果沒有寫入檔案，就不算持久化的 Memory |
| Context 與 Memory 是兩套獨立系統 | Memory 可以存在，但不一定在當前的 model window 裡 |
| 搜尋品質取決於 Backend + Embeddings + 索引新鮮度 | 大多數「Memory 找不到」的問題出在檢索/設定，而非模型本身 |
| Compaction 可能導致未儲存的 Context 遺失 | 在 Compaction 前執行 Memory Flush 可以保護需要持久化的事實 |

核心原則：

- 如果使用者說「記住這個」，就要寫入 Memory 檔案，而不是只留在聊天記錄裡。

## 計畫

本章依照實務上 Operator 的操作順序進行。

1. 定義 Memory 檔案與寫入策略
2. 說明 Compaction 前的自動 Memory Flush
3. 說明 Memory Search Backend 與 Provider 選擇
4. 說明 Retrieval Tool 與索引生命週期
5. 涵蓋進階選項（Hybrid、Cache、Session Memory、sqlite-vec）
6. 提供疑難排解清單

## Memory 檔案（Markdown）

OpenClaw Memory 採用 Workspace-first、以檔案為基礎的設計。

| 檔案 | 角色 | 載入行為 |
| --- | --- | --- |
| `memory/YYYY-MM-DD.md` | 每日 append-only 日誌 | 通常在 Session 啟動時讀取今天 + 昨天的紀錄 |
| `MEMORY.md`（選用） | 精選的長期 Memory | 僅限 Main Private Session；不適用於 Group Context |

Workspace 根目錄：

- `agents.defaults.workspace`（預設 `~/.openclaw/workspace`）

寫入策略：

- 持久化的偏好、決策、穩定事實 -> `MEMORY.md`
- 每日流水紀錄 -> `memory/YYYY-MM-DD.md`

## 自動 Memory Flush（Pre-Compaction）

在 Auto-Compaction 執行前，OpenClaw 可以插入一個靜默的提醒 Turn，讓 Agent 儲存需要持久化的事實。

| 設定 | 意義 |
| --- | --- |
| `agents.defaults.compaction.memoryFlush.enabled` | 啟用 Memory Flush 提醒 |
| `softThresholdTokens` | 當 Session 接近 Compaction Reserve 時觸發 |
| `systemPrompt` + `prompt` | Flush Turn 的提醒文字 |
| 每個週期只 Flush 一次 | 透過 Session State 追蹤每個 Compaction Cycle |

重要行為：

- 預設 Prompt 會引導 `NO_REPLY`，所以使用者通常不會看到這個 Turn。
- 如果 Workspace 是唯讀或無法存取（`workspaceAccess: "ro"` / `"none"`），Flush 會被跳過。

## Memory Search Backend

OpenClaw 支援兩種 Retrieval Engine。

| Backend | 狀態 | 備註 |
| --- | --- | --- |
| 內建（`memory-core`） | 預設 | 基於 SQLite 的索引/搜尋，對象為 Markdown Memory |
| `qmd` | 實驗性 | 本機 Sidecar，BM25 + vector + rerank，Markdown 仍為 Source of Truth |

完全停用 Memory Plugin：

- `plugins.slots.memory = "none"`

## Embedding Provider 選擇（內建搜尋）

如果沒有明確設定 Provider，OpenClaw 會按以下順序自動選擇。

1. `local`（如果本機模型路徑存在）
2. `openai`（如果有可用的 Key）
3. `gemini`（如果有可用的 Key）
4. `voyage`（如果有可用的 Key）
5. 停用，直到設定完成

注意事項：

- 設定路徑在 `agents.defaults.memorySearch`（不是頂層的 `memorySearch`）。
- Codex OAuth 用於 chat/completions，不會自動滿足 Embeddings 的需求。
- Remote Embeddings 需要對應 Provider 的 API Key。

## Memory Tool

以下 Tool 是主要的檢索介面。

| Tool | 回傳內容 |
| --- | --- |
| `memory_search` | Snippet + 路徑 + 行數範圍 + 分數 + Provider/Model Metadata |
| `memory_get` | 允許範圍內的 Memory 路徑之檔案內容 |

安全護欄：

- `memory_get` 會拒絕超出 `MEMORY.md` / `memory/` 範圍的路徑。
- `memory_search` 回傳的是 Snippet，不是完整檔案。

## 什麼會被索引、何時索引

索引生命週期決定了新鮮度與召回率。

| 面向 | 行為 |
| --- | --- |
| 被索引的內容 | Markdown Memory 檔案（`MEMORY.md`、`memory/**/*.md`） |
| 儲存位置 | 每個 Agent 獨立的 SQLite Store（路徑可設定） |
| 新鮮度 | File Watcher 標記索引為 dirty；同步發生在啟動/搜尋/定時間隔 |
| Reindex 觸發條件 | Provider/Model/Endpoint/Chunking fingerprint 變更 |

Chunking 行為（預設意圖）：

- Chunk 目標約 ~400 tokens，並帶有重疊以提升語意連續性。

## QMD Backend（實驗性）

如果你需要 local-first 的 Hybrid Retrieval 加上 Sidecar 管理的索引，可以使用 QMD。

| 主題 | 重點 |
| --- | --- |
| 啟用方式 | `memory.backend = "qmd"` |
| Runtime | Gateway 透過 shell 呼叫 `PATH` 上的 `qmd` Binary |
| 資料目錄 | 隔離在 `~/.openclaw/agents/<agentId>/qmd/` 下 |
| 更新迴圈 | 啟動時 + 定時刷新（`memory.qmd.update.*`） |
| Fallback | 如果 QMD 失敗，OpenClaw 會回退到內建 Manager |

操作上的注意事項：

- 第一次查詢可能較慢，因為需要下載模型/暖機。
- 需要本機前置條件（Bun、SQLite Extension 支援等）。

## 搜尋品質功能

這些選項可以改善檢索相關性和索引成本。

| 功能 | 效益 |
| --- | --- |
| Hybrid Search（BM25 + vector） | 更好的精確 Token + 語意召回平衡 |
| Embedding Cache | 避免對未變更的 Chunk 重複 Embedding |
| sqlite-vec 加速 | SQLite 中更快的向量距離查詢 |
| Session Memory Search（實驗性） | 可選擇性地對 Session Transcript 進行召回 |

Hybrid Scoring 概念：

- 從 vector + BM25 取得候選聯集
- 加權合併（正規化的 vector/text 權重）
- 如果任一方不可用，會優雅降級

## 範圍、引用與安全性

善用這些控制項，避免 Memory 在錯誤的 Channel 中洩漏。

| 控制項 | 用途 |
| --- | --- |
| `memory.qmd.scope` | 依 Chat Type 或 Key Prefix 允許/拒絕檢索 |
| `memory.citations`（`auto`/`on`/`off`） | 控制 Snippet 中的來源路徑 Footer |
| Session Indexing 隔離 | 每個 Agent 的邊界降低跨 Agent 資料外洩風險 |

實務提醒：

- 磁碟存取權限仍然是 Transcript 檔案的信任邊界。

## 最小設定範例

### 內建搜尋搭配 OpenAI Embeddings

```ts
agents: {
  defaults: {
    memorySearch: {
      provider: "openai",
      model: "text-embedding-3-small"
    }
  }
}
```

### 僅使用 Local Embeddings（不使用 Remote Fallback）

```ts
agents: {
  defaults: {
    memorySearch: {
      provider: "local",
      local: { modelPath: "hf:.../model.gguf" },
      fallback: "none"
    }
  }
}
```

### 啟用 QMD Backend

```ts
memory: {
  backend: "qmd",
  qmd: {
    includeDefaultMemory: true,
    update: { interval: "5m", debounceMs: 15000 }
  }
}
```

## Operator 疑難排解清單

1. 確認 Memory Plugin/Backend 已啟用（`memory-core` 或 `qmd`）
2. 確認 Workspace 路徑與 Memory 檔案存在
3. 確認 Embedding Provider/Key 解析正確
4. 執行 `memory_search` 並檢查 Backend/Provider Metadata
5. 檢查索引新鮮度（Watcher/Sync/Reindex 觸發條件）
6. 如果使用 QMD，驗證 `qmd` Binary 與 Sidecar 健康狀態
7. 如果在特定 Channel 結果為空，檢查 Scope Allow/Deny 規則

## 實務建議預設值

- 從內建 Memory Search 搭配 Remote Embeddings 開始。
- 保持 Memory 檔案精簡且經過整理。
- 啟用 Hybrid Search 以應對混合自然語言與精確 Token 的查詢。
- 只有在你確實需要 QMD 的 Retrieval Pipeline 且能管理 Sidecar 相依性時，才引入 QMD。
