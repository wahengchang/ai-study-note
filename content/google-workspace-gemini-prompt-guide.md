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

完整可複用 prompt 已拆分為獨立檔案，詳見 **[Gemini 可複用 Prompt 範本集](./gemini-prompts/index.md)**。

以下為各角色概覽與高頻場景：

| 角色 | 高頻場景 | Prompt 範本 |
|------|----------|-------------|
| **行政支援** | 議程規劃、信箱管理、差旅安排、會議準備 | [admin.md](./gemini-prompts/admin.md) |
| **溝通公關** | 新聞稿、媒體簡報、模擬面試、內部溝通 | [communications.md](./gemini-prompts/communications.md) |
| **客戶服務** | 客訴回覆、FAQ 引用、溝通標準化、回饋分析 | [customer-service.md](./gemini-prompts/customer-service.md) |
| **高階主管** | CEO/COO/CMO/CTO/CIO 場景、策略研究 | [executives.md](./gemini-prompts/executives.md) |
| **人力資源** | 招聘、面試、入職、員工調查、培訓 | [hr.md](./gemini-prompts/hr.md) |
| **行銷** | 品牌策略、SEM、社群媒體、內容行銷 | [marketing.md](./gemini-prompts/marketing.md) |
| **專案管理** | UAT、會議紀錄、狀態更新、回顧、排程 | [project-management.md](./gemini-prompts/project-management.md) |
| **業務銷售** | 客戶研究、簡報準備、關係維護、異議處理 | [sales.md](./gemini-prompts/sales.md) |
| **通用範本** | 跨角色通用模式、Gem 建立、跨工具工作流 | [general.md](./gemini-prompts/general.md) |

## 關鍵原則

1. **AI 是助手，最終輸出由你負責** — 務必在使用前檢查正確性與準確性
2. **你的資料是你的資料** — Workspace 中的內容不會用於訓練模型或廣告投放
3. **Prompting 是人人可學的技能** — 不需要是 prompt engineer 也能使用
4. **迭代是常態** — 第一次就得到完美結果很少見，多試幾種方式是正常的
5. **善用 `@file` 引用** — 讓 AI 存取你自己的檔案是最強大的個人化手段
