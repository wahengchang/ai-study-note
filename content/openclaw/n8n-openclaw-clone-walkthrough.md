---
title: "用 n8n 打造 OpenClaw Clone — 完整架構拆解"
description: "Research notes from n8n official walkthrough on building an OpenClaw clone with RAG memory, MCP skills, and expert agents"
tags:
  - research
  - agent-architecture
  - automation
  - n8n
---

> 來源：[Building an Open Claw Clone in n8n | Full Walkthrough](https://www.youtube.com/watch?v=jPea9Sp9xYQ) — n8n 官方頻道

## TL;DR

- n8n 官方示範如何用低程式碼方式重建 OpenClaw 的核心功能：**多層記憶、MCP 技能系統、專家代理委派、主動任務管理**
- 關鍵架構模式：Telegram 作為使用者介面 → n8n workflow 作為 agent 骨幹 → Supabase/PostgreSQL 作為記憶層 → MCP server 作為技能擴充
- 不需要寫程式即可擁有一套自架、可擴充的 AI agent 系統

## 核心概念

### 三層記憶架構（Tiered Memory）

- **對話歷史（Conversation History）**：session 內的短期記憶
- **長期記憶（Long-term Memory）**：每日凌晨自動摘要 → 產生 embedding → 語意搜尋（非關鍵字比對）
- **知識圖譜（Knowledge Graph）**：自動追蹤實體與關係

> 設計原則：記憶不是「存 log」，而是「可被語意檢索的結構化知識」

### MCP 技能系統（Skills via MCP）

- 技能以 **Model Context Protocol (MCP) server** 形式實作
- 使用者可在 Telegram 中直接輸入 `Install Wikipedia` 觸發安裝
- 技能分兩類：
  - **免 API key**：直接安裝（Weather、Wikipedia、Exchange Rates、Hacker News、Dictionary、IP Geolocation、Website Check）
  - **需 API key**：透過安全表單提交，不在聊天中暴露 credentials
- MCP Builder workflow 可讓 agent 自行建立新的 MCP server

### 專家代理委派（Expert Agent Delegation）

- 主 agent 辨識任務是否需要專業知識
- 委派給對應的專家 agent（coding、data analysis 等）
- 結果整合回主 agent 的回應
- 基礎 3 個 agent，目錄中可選 100+ 個，橫跨 12 個類別

### 主動任務管理（Proactive Task Management）

- **Heartbeat**：每 5 分鐘檢查待辦事項與排程動作
- **Morning Briefing**：可設定時間的每日摘要
- **Reminder Runner**：集中式 workflow，每分鐘檢查資料庫中的提醒
- 任務支援優先級（urgent/high/medium/low）、到期日、子任務

## 可複用的模式

### 多通道輸入標準化

```
Telegram / Slack / Teams / Webhook
         ↓
   Webhook Adapter（正規化）
         ↓
   提取：message, user_id, session_id, source
         ↓
   統一呼叫 /webhook/agent
         ↓
   Route Response → 對應平台回覆
```

- 抽象化讓 agent 同時服務多個平台，對話依 source + session 隔離

### 記憶合併流程（Memory Consolidation）

- 每日凌晨 3:00 自動執行
- 摘要當日對話 → 產生語意單元 → 生成 embedding vector → 存入長期記憶
- 支援 OpenAI / Voyage AI / Ollama 作為 embedding 提供者
- 舊提醒自動清理

### 技能安裝模式

- GitHub repo 存放 MCP template
- 使用者透過自然語言觸發安裝
- agent workflow 自動匯入並註冊
- Dynamic MCP Server 在執行時動態取得已註冊技能

## 工作流程與設計原則

- **Self-hosted 優先**：用 SearXNG 取代 Brave Search，避免 API key 依賴
- **低程式碼擴充**：所有邏輯在 n8n workflow 中，非工程師也能修改
- **安全 credential 管理**：API key 透過表單提交，不經過聊天訊息
- **Docker + 自動化安裝**：一鍵腳本處理 n8n API key、Telegram 憑證、SSL 憑證
- **人格設定**：agent 的名稱、語言、溝通風格在 setup 時可配置

## 下次可以用的地方

- 設計 agent 時採用 **三層記憶模式**（session → 摘要 → 語意向量），而非單純存對話紀錄
- 用 **MCP server 作為技能抽象層**，讓技能可獨立安裝、升級、移除
- **Heartbeat pattern**：agent 不只被動回應，定期巡檢待辦事項主動通知
- **Webhook Adapter pattern**：一個 agent 服務多平台，用標準化層隔離平台差異
- 任務系統加入 **優先級 + 到期日 + 子任務**，讓 agent 能做時間管理

## 快速參考

| 元件 | 用途 | 技術選擇 |
|------|------|----------|
| 主 agent workflow | 訊息路由、工具呼叫、回應 | n8n + Claude |
| 記憶層 | 對話歷史 + 長期語意記憶 | PostgreSQL / Supabase |
| 技能系統 | 可安裝的外部能力 | MCP server templates |
| 搜尋引擎 | 網頁搜尋（自架） | SearXNG |
| 輸入通道 | 使用者介面 | Telegram（主）+ Webhook Adapter |
| 排程服務 | 主動通知、記憶合併 | Heartbeat + Consolidation workflow |
| 專家代理 | 專業任務委派 | Expert Agent sub-workflows |
| Embedding | 語意搜尋向量 | OpenAI / Voyage AI / Ollama |
