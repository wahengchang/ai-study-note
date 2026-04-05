---
title: "Awesome Agent Skills 精選 AI Agent 技能清單"
description: "Curated list of 1000+ reusable agent skills for Claude Code, Codex, Gemini CLI, Cursor, and Copilot"
tags:
  - research
  - claude-code
  - tools
  - reference
---

# Awesome Agent Skills 精選 AI Agent 技能清單

> [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) 是一份由 VoltAgent 社群維護的精選清單，收錄超過 1,030 個來自真實團隊的 Agent Skills。這些 Skill 可用於 Claude Code、Codex、Gemini CLI、Cursor、GitHub Copilot 等多種 AI 編程助手平台。

---

## 什麼是 Agent Skills？

Agent Skills 是預先定義好的指令集或行為模板，讓 AI Agent 在特定任務上表現更專業。你可以把它想成：

- **程式碼的食譜**：告訴 Agent「遇到這類問題時，照這個流程處理」
- **專業知識的封裝**：把特定領域的最佳實踐打包成可重複使用的指令
- **跨平台的能力擴充**：同一個 Skill 可以在 Claude Code、Cursor、Copilot 等不同工具中使用

與一般的 prompt 不同，Skills 通常包含結構化的步驟、錯誤處理邏輯、以及與特定工具鏈的整合方式。

---

## 這份清單收錄了什麼？

awesome-agent-skills 依照**貢獻組織/團隊**分類，涵蓋以下主要類別：

| 類別 | 代表團隊 | 技能數量 | 說明 |
|:---|:---|:---|:---|
| **官方 Claude Skills** | Anthropic | ~17 | 文件生成（Word/Excel/PPT/PDF）、演算法藝術、MCP Server 建構 |
| **框架與開發工具** | VoltAgent, Supabase, Composio | ~30 | 全端框架整合、資料庫操作、第三方 API 串接 |
| **雲端與基礎設施** | Cloudflare, Netlify, HashiCorp | ~30 | 部署、CDN、Terraform 基礎設施即程式碼 |
| **AI/ML 平台** | Hugging Face, Replicate, fal.ai | ~25 | 模型部署、ML 工作流程、影像生成 |
| **企業平台** | Microsoft Azure | 100+ | .NET/Java/Python/Rust/TypeScript SDK 全覆蓋 |
| **Google 生態系** | Google Workspace CLI, Google Labs | ~30 | Drive、Sheets、Gmail、Calendar 完整操作 |
| **前端/行動端** | Vercel, Expo, Figma | ~25 | Next.js 部署、React Native、設計稿轉程式碼 |
| **資安** | Trail of Bits, Sentry | ~30 | 智慧合約審計、Semgrep 規則、漏洞分析 |
| **行銷** | Corey Haines | 37 | A/B 測試、SEO、文案撰寫、定價策略 |
| **產品管理** | Dean Peters, Pawel Huryn | 111 | PRD 撰寫、User Story Mapping、OKR 規劃 |

---

## 重點技能介紹

### Anthropic 官方 Skills

Anthropic 自己提供的 Skills 是入門的好起點：

- **Document Creator**：用 Claude 直接產出 `.docx`、`.xlsx`、`.pptx`、`.pdf` 檔案
- **Web Artifacts Builder**：用 React 建立互動式網頁元件
- **MCP Server Builder**：快速建構 Model Context Protocol Server
- **Playwright Webapp Testing**：用 Playwright 自動測試 Web 應用

### Trail of Bits 資安套件

超過 22 個專業安全技能，適合安全研究員與開發者：

- 智慧合約安全審計（Solidity/Cairo）
- DWARF 除錯資訊分析
- Semgrep 自定義規則產生
- Firebase APK 掃描

### Figma 設計技能

- **Design-to-Code**：將 Figma 設計稿轉換為前端程式碼
- **Design System Rules**：從設計系統產生開發規範
- **Library Generation**：自動產生元件庫

---

## 安全提醒

> 這份清單中的 Skills 是**經過篩選但未經審計**的。安裝前請務必：
> 1. 閱讀 Skill 的原始碼
> 2. 了解它會執行哪些操作
> 3. 可考慮使用 Snyk Skill Security Scanner 進行驗證

---

## 日常使用情境

以下是 3 個你可能每天都會用到的實際場景：

### 情境一：快速產出技術文件

**問題**：主管臨時要一份這週的技術報告，格式要求 Word 檔，包含架構圖說明。

**解法**：使用 Anthropic 官方的 **Document Creator** Skill

```bash
# 在 Claude Code 中安裝 Skill
claude skill install anthropic/document-creator

# 使用 Skill 產出文件
claude "幫我把這週的 git log 整理成技術週報，輸出為 .docx 格式，包含：
1. 本週完成的功能摘要
2. 程式碼變更統計
3. 下週計畫"
```

**效果**：不用開 Word 手動排版，Claude 直接從程式碼庫產出格式化的文件。

---

### 情境二：部署前的安全快速檢查

**問題**：要上線新功能了，想快速掃一下有沒有明顯的安全漏洞。

**解法**：使用 Trail of Bits 的 **Semgrep Rule Creator** + Sentry 的 **Code Review** Skill

```bash
# 安裝安全相關 Skills
claude skill install trailofbits/semgrep-rule-creator
claude skill install sentry/code-reviewer

# 執行安全掃描
claude "掃描 src/ 目錄下的所有程式碼，檢查：
1. SQL injection 風險
2. XSS 漏洞
3. 敏感資訊外洩（API key、密碼硬編碼）
產出報告並標記嚴重程度"
```

**效果**：上線前多一道自動化安全檢查，降低低級安全事故的風險。

---

### 情境三：用 Figma 設計稿直接生成元件程式碼

**問題**：設計師剛交了新的 UI 設計稿，你需要快速實作成 React 元件。

**解法**：使用 Figma 的 **Design-to-Code** Skill

```bash
# 安裝 Figma Skill
claude skill install figma/design-to-code

# 從設計稿產生程式碼
claude "根據 Figma 設計稿，產生對應的 React 元件：
- 使用 Tailwind CSS
- 確保響應式設計
- 加入基本的 accessibility 屬性"
```

**效果**：從設計到程式碼的轉換時間大幅縮短，同時確保與設計稿的一致性。

---

## 延伸閱讀

- [awesome-agent-skills GitHub 倉庫](https://github.com/VoltAgent/awesome-agent-skills)
- [Claude Code 官方文件 — Skills](https://docs.anthropic.com/en/docs/claude-code/skills)
- [VoltAgent Discord 社群](https://discord.gg/voltagent)
- [Snyk Skill Security Scanner](https://snyk.io)

## Related

- [[agent-teams-guide|Claude Code Agent Teams 協作]]
- [[hooks-guide|Claude Code Hooks 入門]]
