---
title: OpenClaw 主從架構建置標準作業程序（SOP）
---

# OpenClaw 主從架構建置標準作業程序（SOP）

## 目的

本指南旨在協助團隊成員快速建置「老闆－員工」代理架構。主代理（如 `ABC`）作為唯一對外窗口，統籌並管理內部專屬子代理（`agent-1`、`agent-2`、`agent-3`），實現任務分流與安全隔離。

## 1. 預期目錄結構（Workspace Structure）

請確保所有子代理的工作區皆收斂於主代理資料夾內，便於統一控管與備份：

```text
~/.openclaw/workspace-abc/
├── SOUL.md              # 主代理 ABC 的大腦/系統提示詞
├── cron/                # ABC 建立的定時任務存放處
└── agents/              # 專屬子代理的隔離工作區
    ├── agent-1/
    │   └── SOUL.md
    ├── agent-2/
    │   └── SOUL.md
    └── agent-3/
        └── SOUL.md
```

## 2. 實作步驟

### Phase 1：透過 CLI 初始化代理與工作區

為避免手動建置目錄時發生錯誤，請一律使用終端機執行以下指令，將子代理巢狀建立於主工作區內：

```bash
# 1. 建立主代理（ABC）及其主工作區
openclaw agents add ABC --workspace ~/.openclaw/workspace-abc

# 2. 建立子代理，工作區直接指向主代理的 agents 目錄下
openclaw agents add agent-1 --workspace ~/.openclaw/workspace-abc/agents/agent-1
openclaw agents add agent-2 --workspace ~/.openclaw/workspace-abc/agents/agent-2
openclaw agents add agent-3 --workspace ~/.openclaw/workspace-abc/agents/agent-3
```

### Phase 2：配置權限與網路隔離

開啟 Gateway 設定檔 `~/.openclaw/openclaw.json`。

核心原則：**主代理全開，子代理隱藏**。

> 註：在 OpenClaw 中，未設定為 `default` 且未明確綁定通訊頻道的代理，預設即為內部隱藏狀態。

請確保 `agents` 區塊符合以下結構：

```json
{
  "agents": {
    "list": [
      {
        "id": "ABC",
        "default": true,
        "workspace": "~/.openclaw/workspace-abc",
        "subagents": {
          "allowAgents": ["agent-1", "agent-2", "agent-3"]
        }
      },
      {
        "id": "agent-1",
        "workspace": "~/.openclaw/workspace-abc/agents/agent-1"
      },
      {
        "id": "agent-2",
        "workspace": "~/.openclaw/workspace-abc/agents/agent-2"
      },
      {
        "id": "agent-3",
        "workspace": "~/.openclaw/workspace-abc/agents/agent-3"
      }
    ]
  }
}
```

### Phase 3：主代理賦能（設定 SOUL.md）

進入 `~/.openclaw/workspace-abc/SOUL.md`，將子代理使用說明寫入主代理系統提示詞中，讓主代理知道如何扮演「老闆」。

請在 `SOUL.md` 中加入以下區塊：

```md
## 團隊與任務派發

你是本系統的最高決策者，你有三個隱藏的專屬子代理可以呼叫：

- **agent-1**: 專責 [填寫任務 A，例如：網路資料爬蟲與清洗]
- **agent-2**: 專責 [填寫任務 B，例如：數據分析與報表產出]
- **agent-3**: 專責 [填寫任務 C，例如：郵件草稿與發送]

**操作守則：**

1. 遇到上述專精任務時，不要自己處理，必須透過 `sessions_spawn` 工具喚醒對應子代理（參數 `agentId: "agent-X"`）。
2. 你有權限透過 Cron 工具建立定時任務。當定時任務觸發時，亦可透過腳本排程喚醒子代理執行背景作業。
```

## 3. 測試與驗證

設定完成並重啟（或熱重載）OpenClaw 後，在對話框向主代理（`ABC`）發送以下測試指令：

```text
請讓 agent-1 跟我打聲招呼，並回報他的系統狀態。
```

成功標準：若 `ABC` 成功觸發 `sessions_spawn`，並回傳 `agent-1` 的執行結果，即代表主從架構與權限隔離建置成功。
