---
title: GSD 框架實戰情境指南
description: >-
  Get Stuff Done framework scenarios — from greenfield projects to legacy
  refactors using Claude Code
pubDate: '2026-04-01'
category: claude-code
tags:
  - playbook
  - claude-code
  - automation
draft: false
---

# GSD 框架實戰情境指南

> GSD (Get Stuff Done) 是一套 AI 輔助開發框架，將大型任務拆解為可執行的階段，並透過指令驅動 Claude Code 完成規劃、開發、驗證的完整循環。

---

## 核心概念

GSD 在不同情境下扮演不同角色：
- **架構師**：幫你收斂想法、制定路線圖
- **工程團隊**：拆解任務、撰寫程式碼、自動 Git commit
- **驗證者**：確保功能正確、風格一致

---

## 情境 1：從零開始的全新專案 (New Project)

**思考邏輯**：空白畫布。GSD 先透過問答收斂想法，制定 V1/V2 路線圖，再拆解成多個可執行階段。

**操作步驟**：

```bash
mkdir my-app && cd my-app
# 啟動 Claude Code
```

1. `/gsd:new-project` — GSD 問答收集需求，產生 `REQUIREMENTS.md` 與 `ROADMAP.md`
2. 針對每個階段執行開發迴圈：
   ```
   /gsd:discuss-phase 1   # 討論實作細節（UI 偏好等）
   /gsd:plan-phase 1      # 產生結構化任務計畫
   /gsd:execute-phase 1   # 寫程式碼 + 自動 Git commit
   /gsd:verify-work 1     # 測試功能，有 Bug 自動修復
   ```
3. `/gsd:next` — 推進到下一個階段

---

## 情境 2：既有專案，全面導入 GSD 開發新里程碑 (Old Project, Full Integration)

**思考邏輯**：GSD 必須先「讀懂」現有程式碼、架構與寫法習慣，才能寫出風格一致的程式碼。**分析現有專案是第一步。**

**操作步驟**：

```bash
cd your-existing-project
```

1. `/gsd:map-codebase` — 派出 agents 掃描目錄結構、套件、程式碼慣例（**非常重要**）
2. `/gsd:new-milestone` — 告訴 GSD 要開發的大型功能，結合已學的專案知識規劃 `ROADMAP.md`
3. 執行標準開發迴圈（同情境 1）：
   ```
   /gsd:discuss-phase N → /gsd:plan-phase N → /gsd:execute-phase N → /gsd:verify-work N
   ```

---

## 情境 3：既有專案，只完成單一小任務 (Old Project, Single Task)

**思考邏輯**：不需要龐大路線圖，只想快速完成一件事。使用 **Quick Mode** — 保有上下文記憶，略過繁瑣計畫流程。

**操作步驟**：

1. （建議）`/gsd:map-codebase` — 讓 GSD 了解環境，只需做一次
2. Quick Mode 執行：
   ```
   /gsd:quick "在設定頁面新增一個深色模式切換按鈕"
   ```
3. 進階用法（任務稍複雜時加標籤）：
   ```
   /gsd:quick "任務描述" --discuss --research
   # --discuss：動手前先確認細節
   # --research：先研究實作方法
   ```
4. GSD 自動建立計畫、執行、產生乾淨的 Git commit

---

## 情境 4：重構義大利麵條程式碼 (Refactoring Spaghetti Code)

**思考邏輯**：高風險操作，GSD 的計畫與驗證機制確保重構後功能不壞。

```bash
/gsd:quick "重構 [檔案名稱]，將其拆分為獨立的 UI 元件並維持現有邏輯" --full
```

> `--full` 標籤：強制 GSD 在執行後進行嚴格驗證 (Verification)

---

## 情境 5：全域除錯 / 抓蟲大師 (Global Bug Squashing)

**思考邏輯**：跨越多個檔案的深層 Bug，先讓 Research Agents 找蟲、提出計畫，確認後再執行。

```bash
/gsd:quick "調查為什麼結帳時購物車總金額計算錯誤，找出問題根源並提出修復計畫" --research
```

> 先看計畫再決定是否執行，避免盲目修改。

---

## 指令速查表

| 指令 | 用途 |
|------|------|
| `/gsd:new-project` | 從零建立新專案，產生需求與路線圖 |
| `/gsd:map-codebase` | 分析現有專案結構與慣例 |
| `/gsd:new-milestone` | 為既有專案規劃新的大型功能 |
| `/gsd:discuss-phase N` | 討論第 N 階段實作細節 |
| `/gsd:plan-phase N` | 產生第 N 階段結構化任務計畫 |
| `/gsd:execute-phase N` | 執行第 N 階段並自動 commit |
| `/gsd:verify-work N` | 驗證第 N 階段，自動修復 Bug |
| `/gsd:next` | 推進到下一階段 |
| `/gsd:quick "任務"` | 快速模式，處理單一小任務 |
| `/gsd:quick "任務" --discuss` | 快速模式 + 事先確認細節 |
| `/gsd:quick "任務" --research` | 快速模式 + 事先研究實作方法 |
| `/gsd:quick "任務" --full` | 快速模式 + 嚴格驗證（適合重構） |

---

## 選擇情境的決策樹

```
你的任務是什麼？
├── 全新專案 → 情境 1 (/gsd:new-project)
└── 既有專案
    ├── 大型新功能/里程碑 → 情境 2 (/gsd:map-codebase + /gsd:new-milestone)
    ├── 單一小任務 → 情境 3 (/gsd:quick)
    ├── 重構大型檔案 → 情境 4 (/gsd:quick --full)
    └── 神秘 Bug → 情境 5 (/gsd:quick --research)
```

