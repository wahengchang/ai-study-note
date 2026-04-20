---
title: Gemini Prompt：通用範本與工作流
description: >-
  Universal Gemini prompt patterns — research, analysis, and structured output
  workflows
pubDate: '2026-04-05'
category: prompt-notes
tags:
  - template
  - prompt-engineering
  - gemini
draft: false
---

# 通用 Prompt 範本與工作流

> 回到 [Prompt 範本集索引](./index.md) | [研究筆記](../google-workspace-gemini-prompt-guide.md)

## 通用研究型 Prompt

```
I am a [role] at [company]. I need to [research/analyze] [topic].
[Specific context and constraints].
Include [specific output requirements].
```

## 文件引用型 Prompt

```
Use @[File Name] to [generate/summarize/create] [output type]
about [topic]. Use a [tone] tone.
```

## 迭代修正流程

```
Step 1: [Initial prompt — 明確角色 + 任務 + 背景]
Step 2: [Review output — 檢視結果]
Step 3: [Follow-up — 補充具體需求或修正方向]
Step 4: [Refine — 調整語氣/格式/長度]
Step 5: [Export — 輸出到目標 app（Docs/Gmail/Sheets）]
```

## 反向提問技巧

當不確定如何下 prompt 時，讓 AI 先提問：

```
I'm giving you a project: [describe project and desired output].
What questions do you have for me that would help you provide the
best output?
```

## Gem 建立模式

```
用途：建立可重複使用的自訂 AI 角色
步驟：
1. 在 Gemini App side panel 建立 Gem
2. 指定 persona（如 "Skeptical Tech Journalist"）
3. 加入場景規則與品牌指南
4. 上傳參考文件作為 grounding

已驗證的 Gem 類型：
- "Job Description Writer" — HR 職位描述一致性
- "SEM Ad Copy Generator" — 廣告文案批量產出
- "Social Media Copywriter" — 品牌語調一致性
- "Sales Call Prep" — 銷售方法論標準化
- "Customer Communications" — 客服語調標準化
```

## 跨工具工作流

### 標準流程

```
Gemini App（腦力激盪/研究）
  → Share & export → Export to Docs
    → @file 引用補充細節
      → Slides/Sheets（視覺化/數據化）
        → Gmail（分享/通知）
          → Vids（影片化）
```

### Deep Research 流程

```
Gemini App → Deep Research（深度搜尋數十個網站）
  → 產出完整報告
    → Audio Overview（通勤收聽）
      → Export to Docs（進一步編輯）
```

### NotebookLM 流程

```
上傳多種檔案/媒體至 NotebookLM
  → Briefing doc / Study guide / Mind map
    → Audio Overview（podcast 風格摘要）
      → Video Overview（影片摘要）
```

### Sheets 數據分析流程

```
開啟含數據的 Sheet
  → Gemini side panel 分析數據
    → 產出圖表/公式
      → =AI() 函數批量處理（如回覆評論）
```

## 語氣調整參考

| 語氣 | 適用場景 |
|------|----------|
| **Formal** | 高階主管溝通、對外公告、法務文件 |
| **Professional** | 客戶信件、合作提案 |
| **Friendly** | 客戶感謝、團隊溝通 |
| **Empathetic** | 客訴回覆、婉拒信 |
| **Motivating** | Town hall 開場、團隊激勵 |
| **Technical** | 技術文件、工程簡報 |
| **Creative** | 品牌文案、行銷素材 |
| **Casual** | 內部非正式溝通 |
