---
title: Google Workspace with Gemini Prompt Guide 研究筆記
tags:
  - AI
  - Gemini
  - Google-Workspace
  - prompting
---

# Google Workspace with Gemini Prompt Guide 研究筆記

> 來源：[Google Workspace with Gemini Prompting Guide (PDF)](https://services.google.com/fh/files/misc/workspace_with_gemini_prompting_guide.pdf)

## 核心 Prompt 框架：四大要素

Google 提出撰寫有效 prompt 的四大核心要素：

| 要素 | 說明 | 範例 |
|------|------|------|
| **Persona（角色）** | 指定 AI 扮演的角色 | "You are a program manager in [industry]" |
| **Task（任務）** | 明確的動詞/指令，最重要的部分 | "Draft an executive summary email" |
| **Context（背景）** | 提供相關資訊與限制條件 | "based on [details about relevant program docs]" |
| **Format（格式）** | 指定輸出格式 | "Limit to bullet points" |

> 不需要每次都用到全部四個要素，但至少包含一個「動詞/指令」作為 Task 是必須的。

## 六大快速上手技巧

1. **使用自然語言** — 像跟真人對話一樣，用完整句子表達
2. **具體且迭代** — 明確告訴 Gemini 要做什麼（summarize、write、change tone、create），同時使用 instructions（指導方向）和 constraints（限制邊界）
3. **簡潔避免複雜** — 簡短但具體，避免術語
4. **當作對話** — 如果結果不滿意，用 follow-up prompts 持續修正
5. **使用自己的文件** — 透過 `@file name` 引用 Google Drive 中的檔案，讓輸出更個人化
6. **讓 Gemini 當你的 prompt 助手** — 使用 Gemini 建議的動作和 contextual prompts

## 進階 Prompt 技巧（Leveling Up）

| 技巧 | 說明 |
|------|------|
| **Break it up** | 多個相關任務拆成獨立 prompt |
| **Give constraints** | 加入字數限制、選項數量等具體限制 |
| **Assign a role** | 開頭指定角色以激發創造力，如 "You are the head of a creative department..." |
| **Ask for feedback** | 反向提問："What questions do you have for me that would help you provide the best output?" |
| **Consider tone** | 依目標受眾調整語氣（formal / informal / technical / creative / casual） |
| **Say it another way** | 結果不理想就換個方式說，迭代修正 |

## Gemini 工具生態系（可用的 AI 介面）

| 工具 | 用途 |
|------|------|
| **Gemini App** | 自由腦力激盪、Deep Research 深度研究、Canvas 協作空間、語音輸入 |
| **Gemini in Gmail** | 摘要信件、起草回覆、引用 Drive 檔案 |
| **Gemini in Docs** | Help me write、引用檔案生成內容、摘要文件 |
| **Gemini in Sheets** | 建立追蹤器、公式輔助、數據分析與圖表、`=AI()` 函數 |
| **Gemini in Slides** | 根據檔案生成簡報、AI 生成圖片 |
| **Gemini in Meet** | Take notes for me、即時摘要、會議紀錄 |
| **Gemini in Drive** | 跨檔案搜尋與摘要 |
| **NotebookLM** | 上傳多種檔案建立 notebook、Audio Overview podcast 風格摘要、Briefing doc |
| **Google Vids** | AI 影片製作、腳本規劃、AI 虛擬主播、Veo 生成影片片段 |
| **Gems** | 建立自訂 AI 角色（如 "Skeptical Tech Journalist"、"SEM Ad Copy Generator"） |

## 各角色 Prompt 模式整理

### 1. Administrative Support（行政支援）

**高頻場景：**
- 規劃議程（offsite、會議）→ Gemini App 腦力激盪 → Export to Docs
- 管理多個 email 信箱 → Gmail side panel 摘要 → 引用 Drive 檔案回覆
- 商務旅行規劃 → Gemini App 產出行程表 → Share & export → Draft in Gmail
- 差旅預算追蹤 → Sheets side panel 建立 tracker
- 會議簡報準備 → NotebookLM 上傳資料 → Briefing doc / Video Overview
- 錯過的會議 → Meet 摘要 → NotebookLM Audio Overview

**可複用 Prompt 範例：**
```
I am an executive administrator to a team director. Our newly formed team now
consists of [team members]. We are gathering for the first time at a [N]-day
offsite in [location]. Plan activities for each day that include team bonding
activities and time for deeper strategic work. Create a sample agenda for me.
```

### 2. Communications（溝通公關）

**高頻場景：**
- 撰寫新聞稿 → Docs 引用 `@file` → 迭代補充資訊
- 準備分析師/媒體簡報 → Docs 模板 + Sheets 聯繫人管理 + Slides 簡報
- 模擬面試問題準備 → Gemini App → Export to Docs → 引用檔案寫建議答案
- 內部溝通 → Docs 起草備忘錄 + Vids 製作公告影片

**進階技巧：Gems 壓力測試**
```
建立 Gem 扮演 "Skeptical Tech Journalist" 或 "C-Suite Executive"，
用來審查簡報文件並生成挑戰性問題，幫助發言人準備各種情境。
```

### 3. Customer Service（客服）

**高頻場景：**
- 回覆客訴 → Docs Help me write → 同理心回應 + 替代方案
- 複雜問題 → Drive side panel 搜尋跨文件資訊 → Gmail 引用 FAQ 回覆
- 標準化溝通框架 → 建立 Gem + Docs 模板（道歉/確認/感謝）
- 客戶回饋分析 → Gemini App 上傳試算表 → 趨勢辨識
- 客戶自助服務 → 簡化退貨政策 → 轉為部落格 + Vids 教學影片

### 4. Executives（高階主管）

**各 C-level 角色適用場景：**

| 角色 | 場景 |
|------|------|
| **CEO** | 行動回信、簡報大綱（語音輸入）、每日 Audio Briefing（NotebookLM）、Deep Research 產業追蹤 |
| **COO** | Town hall 開場白、模擬困難 Q&A、行動中快速委派 |
| **CMO** | 目標受眾研究、品牌腦力激盪、競爭分析（Deep Research）、行銷漏斗分析（Sheets） |
| **CTO** | 新興技術摘要、程式碼審查與盡職調查（Gemini App 上傳程式碼） |
| **CIO** | 技術主題非技術化溝通、供應商研究、技術報告摘要、IT 資產追蹤 |
| **CHRO** | 員工滿意度調查、績效趨勢分析、培訓計劃開發 |
| **小型企業主** | 現金流分析（Sheets）、程式碼除錯（Canvas）、原型視覺化 |

### 5. Frontline Management（前線管理）

- 快速查找資訊 → Drive side panel → Docs side panel 提問
- 零售新政策溝通 → Drive 搜尋 → Gmail 引用檔案摘要
- 任務管理 → Sheets 建立 checklist → Gmail 交接未完成事項
- 倉庫庫存管理 → Sheets 查詢 + 公式計算差異
- 技術手冊查詢 → NotebookLM + 精確引用
- 維修摘要 → Docs 語音轉文字 → 格式化報告

### 6. Human Resources（人力資源）

- 新人歡迎簡報 → Docs 引用公司價值觀 → Vids 歡迎影片
- 招聘 → Sheets 統計 + Docs 職位描述 + Gem "Job Description Writer"
- 面試準備 → Gemini App 上傳 JD → 生成問題清單
- 員工入職 → Sheets 第一週行程 + Docs 團隊活動 + Vids 培訓影片
- 員工調查 → Gemini App 清理數據 + Docs 分析摘要

### 7. Marketing（行銷）

- 品牌視覺開發 → Gemini App 生成 logo + 命名 + 標語
- 品牌策略 → Gemini App 定義品牌架構
- 市場研究 → Deep Research + A/B 測試文案
- SEM 關鍵字與廣告文案 → Gemini App + Gem "SEM Ad Copy Generator"
- 內容行銷 → Docs 起草 + Sheets 追蹤 + Slides 圖片 + Vids 產品 demo
- 社群媒體 → Docs 生成貼文 + Gem "Social Media Copywriter"
- 行銷漏斗 → Sheets 分析 + 氣泡圖
- eBook → NotebookLM 整合部落格 → 多章節大綱

### 8. Project Management（專案管理）

- UAT 測試案例 → Gemini App 建立表格 → Sheets
- 會議紀錄 → Meet Take notes → Docs 摘要 → Gmail 回顧信
- 專案狀態更新 → Docs 模板化
- 專案回顧 → Docs 20 題引導問題 → 摘要報告 + Vids 回顧影片
- Issue tracker → Sheets + Docs 標準信件模板
- 工作排程 → Gemini App 建立 workback schedule

### 9. Sales（業務）

- 客戶研究 → Gemini App 研究市場策略 → 摘要新聞/影片 → Docs 客製信
- 客戶成功 → Docs 個人化 onboarding 資料
- 行動辦公 → Gmail 摘要 + 快速回覆
- 客戶關係 → Vids 客製影片邀請 + Docs 調查問卷
- 銷售簡報準備 → Gemini App 腳本 + Docs 電梯簡報 + 異議處理 + Gem "Sales Call Prep"
- 業務開發 → Docs 外展模板 + Gmail 客戶感謝信

## 可複用 Prompt 範本

### 通用研究型
```
I am a [role] at [company]. I need to [research/analyze] [topic].
[Specific context and constraints].
Include [specific output requirements].
```

### 文件引用型
```
Use @[File Name] to [generate/summarize/create] [output type]
about [topic]. Use a [tone] tone.
```

### 迭代修正型
```
[Initial prompt] → [Review output] → [Follow-up with specifics]
→ [Refine tone/format] → [Export to target app]
```

### Gem 建立型
```
建立角色 Gem：指定 persona + 場景規則 + 品牌指南
用途：壓力測試、標準化輸出、批量處理
```

### 跨工具工作流
```
Gemini App（腦力激盪）→ Export to Docs（編輯）→ @file 引用
→ Slides/Sheets（視覺化）→ Gmail（分享）→ Vids（影片化）
```

## 關鍵原則

1. **AI 是助手，最終輸出由你負責** — 務必在使用前檢查正確性與準確性
2. **你的資料是你的資料** — Workspace 中的內容不會用於訓練模型或廣告投放
3. **Prompting 是人人可學的技能** — 不需要是 prompt engineer 也能使用
4. **迭代是常態** — 第一次就得到完美結果很少見，多試幾種方式是正常的
5. **善用 `@file` 引用** — 讓 AI 存取你自己的檔案是最強大的個人化手段
