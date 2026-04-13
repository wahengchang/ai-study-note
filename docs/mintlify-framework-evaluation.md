---
title: "Mintlify 作為 ai-study-note 文件站框架的評估"
description: "Decision-ready evaluation of Mintlify as the documentation framework for ai-study-note — scope, trade-offs vs current Quartz setup, and migration considerations."
tags:
  - research
  - framework
  - infrastructure
---

## Context

評估 `ai-study-note` 是否採用 Mintlify 取代目前的 Quartz v4 作為公開文件站框架，對齊 [agentskills.io](https://agentskills.io/home) 的文件體驗。本文只做技術分析與決策依據，不包含實際遷移。

> [!note]
> 本評估僅基於公開文件與對照站點觀察，未實際建置 PoC。若採納方向，下一步應先做一個單 section 的 PoC 再決定全量遷移。

## Key Findings

- **Mintlify 是 hosted documentation platform**，不是可自架的開源框架。核心內容用 MDX + `docs.json` 設定檔，由 Mintlify 的 SaaS 負責建置與託管。
- **核心價值在於體驗，不在於框架**：內建 AI 搜尋、版本切換、API 文件、元件庫、SEO/OG 預設，這些在 Quartz 需要自己實作或整合多個 plugin。
- **托管模式 ≠ 開源自由**：目前 Quartz + GitHub Pages 為完全自託管、零雲端依賴；改用 Mintlify 等於把 build 與 host 轉移到廠商。
- **內容改寫成本不高**：Obsidian 風格的 Markdown 可直接轉 MDX；主要調整在 frontmatter schema、wikilinks、自訂語法（`:::col`）、Mermaid 設定。
- **對 `ai-study-note` 現況而言，收益與成本不對稱**：大部分 Mintlify 的旗艦功能（API 文件、版本切換、團隊協作）目前不是這個 repo 的需求。

## 技術框架盤點

| 技術組件 | 角色 | Quartz 現況對照 |
|---|---|---|
| **Mintlify** | Hosted platform：將 repo 中的 MDX 自動 build 成文件站 | Quartz（Preact + esbuild）自架 |
| **Next.js / React** | 底層 SSR/SSG 渲染 | Preact（較輕量，bundle 較小） |
| **MDX** | Markdown 中嵌入 React 元件，支援互動式內容 | 標準 Markdown + Obsidian wikilinks + 自訂 `:::col` |
| **Tailwind CSS** | Utility-first styling、RWD | Quartz 內建 SCSS 設計系統 + 專案 design tokens |

## Mintlify vs Quartz 對照

:::col{.is-2}
### Mintlify

- **建置/託管**：SaaS，push 即部署
- **搜尋**：AI 語意搜尋內建
- **API 文件**：OpenAPI → 互動頁面
- **互動元件**：原生 MDX 元件庫（`<Card>`、`<CodeGroup>` 等）
- **版本管理**：內建多版本切換
- **成本**：免費方案有限制，進階功能需訂閱
- **供應商綁定**：高
- **離線/自架**：不支援

### Quartz（現況）

- **建置/託管**：GitHub Actions → GitHub Pages
- **搜尋**：FlexSearch（本地全文索引）
- **API 文件**：需自行撰寫
- **互動元件**：Quartz plugin + 自訂 SCSS
- **版本管理**：git 分支/tag
- **成本**：零，僅 GitHub 免費額度
- **供應商綁定**：低
- **離線/自架**：原生支援
:::

## 決策依據

### 採用 Mintlify 的觸發條件

- 需要**互動式 API 文件**或 SDK 使用頁面
- 需要**多版本切換**（v1/v2 文件分流）
- 有**團隊協作者**在寫文件，需要 editor 介面
- 願意接受**廠商託管**與訂閱成本

### 維持 Quartz 的觸發條件

- 內容是**個人學習筆記**、以長文與研究為主（`ai-study-note` 目前屬此類）
- 重視**零託管成本**與 GitHub Pages 自架
- 已投資在 Obsidian → Quartz 寫作流程（wikilinks、smart columns、design tokens）
- 不需要 API 文件、版本切換等 Mintlify 旗艦功能

## Recommendation

**現階段維持 Quartz**，不啟動 Mintlify 遷移。

理由：
1. `ai-study-note` 的核心需求是**研究型長文與筆記**，Quartz 已完整支撐
2. Mintlify 的差異化功能（API 文件、版本切換）對目前內容結構沒有即時價值
3. 遷移成本（frontmatter、wikilinks、自訂語法、Mermaid、design tokens 重建）高於目前可見的體驗提升
4. Quartz 的零託管 + GitHub Pages 部署，對個人 repo 的長期維護負擔最小

### 未來重新評估的觸發點

- 當 repo 開始發布**公開 API / SDK** 文件
- 當需要**多語系（zh-tw / en）版本切換**且 Quartz plugin 無法滿足
- 當搜尋體驗（目前 FlexSearch）成為明顯瓶頸
- 當有第二位以上協作者加入，需要 editor workflow

## 若日後決定遷移 Mintlify 的最小步驟

1. 申請 Mintlify 帳號並接上 `ai-study-note` repo
2. 建立 `docs.json`（navigation、theme、search 設定）
3. 選一個 section（例如 `content/prompt-notes/`）做 PoC，評估：
   - wikilinks 是否能自動解析，或需手動改成相對路徑
   - Mermaid `direction LR` 是否渲染正常
   - 自訂 `:::col` Smart Columns 是否需要替代元件
   - design tokens（`#050505` bg、`#FF4F00` brand）對應 Mintlify theme 的可行性
4. PoC 上線後對比：首頁 LCP、搜尋延遲、寫作摩擦
5. 評估通過再全量遷移；否則維持 Quartz

## 參考資料

- Mintlify 官方：https://mintlify.com
- 參考站點：https://agentskills.io/home
- Quartz v4：https://quartz.jzhao.xyz
- 本 repo：https://github.com/wahengchang/ai-study-note
- 發布頁：https://wahengchang.github.io/ai-study-note/

## Related Issue

- Closes #63
